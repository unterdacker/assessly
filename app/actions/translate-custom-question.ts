"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionRateLimitError, checkActionRateLimit } from "@/lib/action-rate-limit";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";
import { runTranslation } from "@/lib/ai/translation";
import { prisma } from "@/lib/prisma";
import { AuditLogger } from "@/lib/structured-logger";
import { logAuditEvent } from "@/lib/audit-log";

type TranslateResult =
  | { success: true; data: { text: string; guidance: string | null } }
  | { success: false; error: string };

const InputSchemaAi = z.object({
  id: z.string().min(1).max(200),
  targetLang: z.enum(["de", "en"]),
});

const InputSchemaManual = z.object({
  id: z.string().min(1).max(200),
  targetLang: z.enum(["de", "en"]),
  text: z.string().trim().min(1).max(1000),
  guidance: z.string().trim().max(2000).nullable(),
});

export async function aiTranslateCustomQuestion(
  id: string,
  targetLang: "de" | "en"
): Promise<TranslateResult> {
  let session;
  try {
    session = await requireAdminUser();
  } catch (error) {
    console.error("aiTranslateCustomQuestion auth error", error);
    if (isAccessControlError(error)) {
      return { success: false, error: "Unauthorized." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  const { companyId, userId } = session;
  if (!companyId) {
    return { success: false, error: "Unauthorized." };
  }

  let parsed: z.infer<typeof InputSchemaAi>;
  try {
    parsed = InputSchemaAi.parse({ id, targetLang });
  } catch (error) {
    console.error("aiTranslateCustomQuestion invalid input", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  try {
    await checkActionRateLimit(`translation:${companyId}`, {
      maxAttempts: 20,
      windowMs: 60_000,
    });
  } catch (error) {
    console.error("aiTranslateCustomQuestion rate limit", error);
    if (error instanceof ActionRateLimitError) {
      return { success: false, error: "Too many requests." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  try {
    const q = await prisma.question.findFirst({
      where: { id: parsed.id, companyId, isCustom: true },
      select: { text: true, guidance: true },
    });

    if (!q) {
      return { success: false, error: "Question not found." };
    }

    let result: { text: string; guidance: string | null };
    try {
      result = await runTranslation(companyId, q.text, q.guidance, parsed.targetLang);
    } catch (error) {
      console.error("aiTranslateCustomQuestion translation failed", error);
      if (error instanceof Error && error.message === "AI_DISABLED") {
        return { success: false, error: "AI is disabled." };
      }
      return { success: false, error: "AI translation failed." };
    }

    AuditLogger.configuration("custom_question.translation_generated", "success", {
      userId,
      entityType: "custom_question",
      entityId: parsed.id,
      details: { companyId, targetLang: parsed.targetLang, mode: "ai" },
    });

    return {
      success: true,
      data: { text: result.text, guidance: result.guidance },
    };
  } catch (error) {
    console.error("aiTranslateCustomQuestion error", error);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function manualTranslateCustomQuestion(
  id: string,
  targetLang: "de" | "en",
  text: string,
  guidance: string | null,
  aiGenerated = false
): Promise<TranslateResult> {
  let session;
  try {
    session = await requireAdminUser();
  } catch (error) {
    console.error("manualTranslateCustomQuestion auth error", error);
    if (isAccessControlError(error)) {
      return { success: false, error: "Unauthorized." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  const { companyId, userId } = session;
  if (!companyId) {
    return { success: false, error: "Unauthorized." };
  }

  let parsed: z.infer<typeof InputSchemaManual>;
  try {
    parsed = InputSchemaManual.parse({ id, targetLang, text, guidance });
  } catch (error) {
    console.error("manualTranslateCustomQuestion invalid input", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  try {
    await checkActionRateLimit(`manual-translation:${companyId}`, {
      maxAttempts: 60,
      windowMs: 60_000,
    });
  } catch (error) {
    console.error("manualTranslateCustomQuestion rate limit", error);
    if (error instanceof ActionRateLimitError) {
      return { success: false, error: "Too many requests." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  try {
    const translationData =
      parsed.targetLang === "de"
        ? { textDe: parsed.text, guidanceDe: parsed.guidance }
        : { textEn: parsed.text, guidanceEn: parsed.guidance };

    const result = await prisma.question.updateMany({
      where: { id: parsed.id, companyId, isCustom: true },
      data: translationData,
    });

    if (result.count === 0) {
      return { success: false, error: "Question not found." };
    }

    AuditLogger.configuration("custom_question.translated_manual", "success", {
      userId,
      entityType: "custom_question",
      entityId: parsed.id,
      details: { companyId, targetLang: parsed.targetLang, mode: "manual" },
    });

    if (aiGenerated) {
      try {
        await logAuditEvent({
          companyId,
          userId,
          action: "AI_TRANSLATION_ACCEPTED",
          entityType: "custom_question",
          entityId: parsed.id,
          hitlVerifiedBy: userId,
          newValue: { targetLang: parsed.targetLang },
        });
      } catch (auditErr) {
        console.error("manualTranslateCustomQuestion HITL audit failed:", auditErr);
      }
    }

    revalidatePath("/settings");
    return {
      success: true,
      data: { text: parsed.text, guidance: parsed.guidance },
    };
  } catch (error) {
    console.error("manualTranslateCustomQuestion error", error);
    return { success: false, error: "An unexpected error occurred." };
  }
}
