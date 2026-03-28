import { Mistral } from '@mistralai/mistralai';
import { buildNis2DocumentAnalysisSystemPrompt, buildNis2DocumentAnalysisUserPayload } from "./nis2-document-analysis-prompt";
import type { Nis2QuestionAnalysis } from "./nis2-question-analysis";
import { prisma } from "./prisma";

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

  const provider = config.aiProvider;
  
  const systemPrompt = buildNis2DocumentAnalysisSystemPrompt();
  const userPayload = buildNis2DocumentAnalysisUserPayload({ questions, documentExcerpt });

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


  if (provider === "mistral") {
    const cleanKey = config.mistralApiKey?.trim();
    if (!cleanKey) {
      throw new Error("Mistral API key not found in database for this workspace.");
    }

    console.log("MISTRAL KEY PRE-FLIGHT CHECK:", cleanKey ? "Key exists (Length: " + cleanKey.length + ")" : "KEY IS EMPTY");

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

      const cleanContent = content.replace(/```json/gi, "").replace(/```/g, "").trim();

      // We expect the LLM to return an array of Analysis objects (or a `{ "results": [...] }` hash since we forced json_object)
      // Mistral's JSON mode usually requires an object. Our prompt asks for an array.
      // Mistral JSON mode might wrap it in markdown fences, so we clean and parse.
      const parsed = JSON.parse(cleanContent);
      return Array.isArray(parsed) ? parsed : (parsed.results || parsed);

    } catch (error: any) {
      logMistralError(error);
      throw new Error(`Mistral inference failed: ${error?.message ?? "Unknown error"}`);
    }
  } 
  
  // Local Provider Context
  const endpoint = config.localAiEndpoint?.trim();
  if (!endpoint) {
    throw new Error("AI URI missing. Please configure your local endpoint in the web console settings.");
  }
  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "local-model-placeholder", // Ollama doesn't typically enforce this if single model is loaded, or requires it
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
