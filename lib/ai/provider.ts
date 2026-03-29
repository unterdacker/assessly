import { Mistral } from '@mistralai/mistralai';
import { buildNis2DocumentAnalysisSystemPrompt, buildNis2DocumentAnalysisUserPayload } from "../nis2-document-analysis-prompt";
import type { Nis2QuestionAnalysis } from "../nis2-question-analysis";
import { prisma } from "../prisma";

function logMistralError(error: unknown) {
  if (error instanceof Error) {
    console.error("MISTRAL ERROR:", {
      message: error.message,
      stack: error.stack,
    });
  } else {
    console.error("MISTRAL ERROR (non-Error):", error);
  }
}

function toModelContentString(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return JSON.stringify(item);
      })
      .join("");
  }

  if (content && typeof content === "object" && "text" in content) {
    const text = (content as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }

  return JSON.stringify(content);
}

function stripCodeFences(input: string): string {
  return input.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function stripTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, "$1");
}

function extractBalancedJson(input: string): string | null {
  const starts = [input.indexOf("["), input.indexOf("{")]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);

  if (!starts.length) return null;

  const start = starts[0];
  const open = input[start];
  const close = open === "[" ? "]" : "}";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === open) depth++;
    if (ch === close) depth--;

    if (depth === 0) {
      return input.slice(start, i + 1).trim();
    }
  }

  return null;
}

function parseLlmJson(rawContent: unknown): unknown {
  const normalized = stripCodeFences(toModelContentString(rawContent));

  const candidates = [normalized];
  const balanced = extractBalancedJson(normalized);
  if (balanced && balanced !== normalized) {
    candidates.push(balanced);
  }

  for (const candidate of candidates) {
    const variants = [candidate, stripTrailingCommas(candidate)];
    for (const variant of variants) {
      try {
        return JSON.parse(variant);
      } catch {
        // continue trying fallback variants
      }
    }
  }

  throw new SyntaxError("Unable to parse model response as valid JSON.");
}

function normalizeAnalysisResult(parsed: unknown): Nis2QuestionAnalysis[] {
  if (Array.isArray(parsed)) {
    return parsed as Nis2QuestionAnalysis[];
  }

  if (parsed && typeof parsed === "object") {
    const maybeResults = (parsed as { results?: unknown }).results;
    if (Array.isArray(maybeResults)) {
      return maybeResults as Nis2QuestionAnalysis[];
    }
  }

  throw new Error("Model response was not an analysis array.");
}

export type Nis2QuestionPromptItem = {
  id: string;
  category: string;
  text: string;
  guidance?: string;
};

export async function runNis2Analysis(
  companyId: string,
  questions: Nis2QuestionPromptItem[],
  documentExcerpt: string,
): Promise<Nis2QuestionAnalysis[]> {
  const config = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!config) {
    throw new Error("Company configuration not found.");
  }

  // Requirement: toggle between 'Mistral' and 'Local LLM' via process.env.AI_PROVIDER
  // This satisfies Step 3 of Sovereign Compliance Engine Global Rule
  const provider = (process.env.AI_PROVIDER || config.aiProvider).toLowerCase();
  
  const systemPrompt = buildNis2DocumentAnalysisSystemPrompt();
  const userPayload = buildNis2DocumentAnalysisUserPayload({ questions, documentExcerpt });

  if (provider === "mistral") {
    const cleanKey = (process.env.MISTRAL_API_KEY || config.mistralApiKey)?.trim();
    if (!cleanKey) {
      throw new Error("Mistral API key not found in environment or database for this workspace.");
    }

    const client = new Mistral({ apiKey: cleanKey });
    
    try {
      const response = await client.chat.complete({
        model: "mistral-large-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload }
        ]
      });
      
      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new Error("Received empty content from Mistral API");

      const parsed = parseLlmJson(content);
      return normalizeAnalysisResult(parsed);

    } catch (error: unknown) {
      logMistralError(error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Mistral inference failed: ${msg}`);
    }
  } 
  
  // Local Provider Context (Ollama / vLLM)
  const endpoint = (process.env.LOCAL_AI_ENDPOINT || config.localAiEndpoint)?.trim() || "http://localhost:11434/v1";
  
  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // For Local LLMs, we typically pass the model string, or Ollama handles it if single model loaded
        model: process.env.LOCAL_AI_MODEL || "mistral", 
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload }
        ],
        temperature: 0.1,
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch from local AI: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Received empty content from local AI");

    const parsed = parseLlmJson(content);
    return normalizeAnalysisResult(parsed);

  } catch (error: unknown) {
    const maybe = error as {
      cause?: { code?: string };
      message?: string;
    };
    if (
      maybe.cause?.code === "ECONNREFUSED" ||
      (typeof maybe.message === "string" && maybe.message.includes("fetch failed"))
    ) {
      throw new Error("On-premise AI offline");
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Local inference failed: ${msg}`);
  }
}
