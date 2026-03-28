import { Mistral } from '@mistralai/mistralai';
import { buildNis2DocumentAnalysisSystemPrompt, buildNis2DocumentAnalysisUserPayload } from "./nis2-document-analysis-prompt";
import type { Nis2QuestionAnalysis } from "./nis2-question-analysis";

export async function runNis2Analysis(
  questions: any[],
  documentExcerpt: string
): Promise<Nis2QuestionAnalysis[]> {
  const provider = process.env.AI_PROVIDER || "local";
  
  const systemPrompt = buildNis2DocumentAnalysisSystemPrompt();
  const userPayload = buildNis2DocumentAnalysisUserPayload({ questions, documentExcerpt });

  if (provider === "mistral") {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) throw new Error("AI_API_KEY is required for Mistral provider.");
    
    const client = new Mistral({ apiKey });
    
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
      
      // We expect the LLM to return an array of Analysis objects (or a `{ "results": [...] }` hash since we forced json_object)
      // Mistral's JSON mode usually requires an object. Our prompt asks for an array. 
      // Mistral JSON mode might wrap it if we strictly specify object, but array is typically fine if parsed.
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : (parsed.results || parsed);

    } catch (error: any) {
      console.error("Mistral API Error:", error);
      throw new Error(`Mistral inference failed: ${error.message}`);
    }
  } 
  
  // Local Provider Context
  const endpoint = process.env.AI_ENDPOINT || "http://localhost:11434/v1";
  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.AI_API_KEY ? { "Authorization": `Bearer ${process.env.AI_API_KEY}` } : {})
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

    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : (parsed.results || parsed);

  } catch (error: any) {
    if (error.cause?.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
      throw new Error("On-premise AI offline");
    }
    console.error("Local API Error:", error);
    throw new Error(`Local inference failed: ${error.message}`);
  }
}
