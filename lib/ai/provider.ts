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

export async function runNis2Analysis(
  companyId: string,
  questions: any[],
  documentExcerpt: string
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

      const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
      const cleanContent = contentStr.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanContent);
      return Array.isArray(parsed) ? parsed : (parsed.results || parsed);

    } catch (error: any) {
      logMistralError(error);
      throw new Error(`Mistral inference failed: ${error?.message ?? "Unknown error"}`);
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

    const cleanContent = content.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanContent);
    return Array.isArray(parsed) ? parsed : (parsed.results || parsed);

  } catch (error: any) {
    if (error.cause?.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
      throw new Error("On-premise AI offline");
    }
    throw new Error(`Local inference failed: ${error.message}`);
  }
}
