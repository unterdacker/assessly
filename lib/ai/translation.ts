import { createHash } from "crypto";
import { Mistral } from "@mistralai/mistralai";
import { z } from "zod";
import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { AuditLogger, AuditCategory, LogLevel } from "@/lib/structured-logger";

const OutputSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  guidance: z.string().trim().max(2000).nullable().optional(),
});

const LANG_NAME: Record<"de" | "en", string> = {
  de: "German",
  en: "English",
};

function logMistralError(error: unknown) {
  const err = error instanceof Error ? error : undefined;
  AuditLogger.systemHealth("ai.mistral.translation", "failure", {
    level: LogLevel.ERROR,
    message: err?.message ?? String(error),
    error: err,
  });
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

function parseModelJson(rawContent: unknown): unknown {
  const normalized = stripCodeFences(toModelContentString(rawContent));

  try {
    return JSON.parse(normalized);
  } catch {
    // Last-resort parse when the model wraps JSON with extra prose.
    const match = normalized.match(/[\[{][\s\S]*[\]}]/);
    if (!match) {
      throw new SyntaxError("Unable to parse model response as valid JSON.");
    }
    return JSON.parse(match[0]);
  }
}

export async function runTranslation(
  companyId: string,
  sourceText: string,
  sourceGuidance: string | null,
  targetLang: "de" | "en"
): Promise<{ text: string; guidance: string | null }> {
  const config = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!config) {
    throw new Error("Company configuration not found.");
  }

  if (config.aiDisabled) {
    throw new Error("AI_DISABLED");
  }

  const provider = (process.env.AI_PROVIDER || config.aiProvider).toLowerCase();
  const targetLanguageName = LANG_NAME[targetLang];

  const systemPrompt = [
    "You are a precise compliance translator.",
    `Translate the input into ${targetLanguageName}.`,
    "Return strict JSON with this shape:",
    '{"text":"...","guidance":"..."}',
    "Use guidance=null when guidance is not provided.",
    "Preserve meaning, legal/compliance intent, and professional tone.",
    "Do not add commentary, markdown, or extra keys.",
  ].join("\n");

  const userPayload = JSON.stringify(
    {
      text: sourceText,
      guidance: sourceGuidance,
      targetLanguage: targetLanguageName,
    },
    null,
    2,
  );

  const inputContextHash = createHash("sha256").update(sourceText).digest("hex");

  if (provider === "mistral") {
    let dbMistralKey: string | null = null;
    if (config.mistralApiKey) {
      try {
        dbMistralKey = decrypt(config.mistralApiKey);
      } catch (err) {
        AuditLogger.systemHealth("ai.key-decrypt", "failure", {
          level: LogLevel.WARN,
          message: "Failed to decrypt stored AI API key; falling back to env var.",
          error: err instanceof Error ? err : undefined,
        });
        dbMistralKey = null;
      }
    }

    const cleanKey = (process.env.MISTRAL_API_KEY || dbMistralKey)?.trim();
    if (!cleanKey) {
      throw new Error("Mistral API key not found in environment or database for this workspace.");
    }

    const client = new Mistral({ apiKey: cleanKey });

    try {
      const response = await client.chat.complete({
        model: "mistral-large-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload },
        ],
        temperature: 0.1,
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Received empty content from Mistral API");
      }

      const parsed = parseModelJson(content);
      const validated = OutputSchema.parse(parsed);

      AuditLogger.log({
        category: AuditCategory.AI_ACT,
        action: "question.translation",
        status: "success",
        details: {
          companyId,
          targetLang,
          modelId: "mistral-large-latest",
          inputContextHash,
        },
      });

      return { text: validated.text, guidance: validated.guidance ?? null };
    } catch (error: unknown) {
      logMistralError(error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Mistral inference failed: ${msg}`);
    }
  }

  const rawEndpoint =
    (process.env.LOCAL_AI_ENDPOINT || config.localAiEndpoint)?.trim() || "http://localhost:11434";
  const endpointBase = rawEndpoint.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  const modelId = process.env.LOCAL_AI_MODEL || config.localAiModel?.trim() || "ministral-3:8b";

  try {
    const response = await fetch(`${endpointBase}/v1/chat/completions`, {
      signal: AbortSignal.timeout(30_000),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const errBody = await response.json();
        if (errBody?.error) {
          detail = String(errBody.error);
        }
      } catch {
        // ignore parse failures
      }
      throw new Error(`Failed to fetch from local AI: ${response.status} — ${detail}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Received empty content from local AI");
    }

    const parsed = parseModelJson(content);
    const validated = OutputSchema.parse(parsed);

    AuditLogger.log({
      category: AuditCategory.AI_ACT,
      action: "question.translation",
      status: "success",
      details: {
        companyId,
        targetLang,
        modelId,
        inputContextHash,
      },
    });

    return { text: validated.text, guidance: validated.guidance ?? null };
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
