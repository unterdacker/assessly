"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runTranslation } from "@/lib/ai/translation";
import { ActionRateLimitError, checkActionRateLimit } from "@/lib/action-rate-limit";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";
import { PremiumGateError, requirePremiumPlan } from "@/lib/enterprise-bridge";
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
  helpText: z.string().trim().max(2000).nullable(),
});

export async function aiTranslateTemplateQuestion(
  id: string,
  targetLang: "de" | "en"
): Promise<TranslateResult> {
  let session;
  try {
    session = await requireAdminUser();
  } catch (error) {
    console.error("aiTranslateTemplateQuestion auth error", error);
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
    console.error("aiTranslateTemplateQuestion invalid input", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  try {
    await requirePremiumPlan(companyId);
  } catch (error) {
    console.error("aiTranslateTemplateQuestion premium gate", error);
    if (error instanceof PremiumGateError) {
      return { success: false, error: "Premium plan required." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  try {
    await checkActionRateLimit(`template-translation:${companyId}`, {
      maxAttempts: 20,
      windowMs: 60_000,
    });
  } catch (error) {
    console.error("aiTranslateTemplateQuestion rate limit", error);
    if (error instanceof ActionRateLimitError) {
      return { success: false, error: "Too many requests." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  try {
    const q = await prisma.templateQuestion.findFirst({
      where: {
        id: parsed.id,
        section: { template: { companyId } },
      },
      select: { text: true, helpText: true },
    });

    if (!q) {
      return { success: false, error: "Question not found." };
    }

    const translated = await runTranslation(companyId, q.text, q.helpText ?? null, parsed.targetLang);

    AuditLogger.configuration("template_question.translation_generated", "success", {
      userId,
      entityType: "template_question",
      entityId: parsed.id,
      details: { companyId, targetLang: parsed.targetLang, mode: "ai" },
    });

    return {
      success: true,
      data: { text: translated.text, guidance: translated.guidance },
    };
  } catch (error) {
    console.error("aiTranslateTemplateQuestion error", error);
    if (error instanceof Error && error.message === "AI_DISABLED") {
      return { success: false, error: "AI is disabled." };
    }
    return { success: false, error: "AI translation failed." };
  }
}

export async function manualTranslateTemplateQuestion(
  id: string,
  targetLang: "de" | "en",
  text: string,
  helpText: string | null,
  aiGenerated = false
): Promise<TranslateResult> {
  let session;
  try {
    session = await requireAdminUser();
  } catch (error) {
    console.error("manualTranslateTemplateQuestion auth error", error);
    if (isAccessControlError(error)) {
      return { success: false, error: "Unauthorized." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  const { companyId, userId } = session;
  if (!companyId) {
    return { success: false, error: "Unauthorized." };
  }

  try {
    await requirePremiumPlan(companyId);
  } catch (error) {
    console.error("manualTranslateTemplateQuestion premium gate", error);
    if (error instanceof PremiumGateError) {
      return { success: false, error: "Premium plan required." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  let parsed: z.infer<typeof InputSchemaManual>;
  try {
    parsed = InputSchemaManual.parse({ id, targetLang, text, helpText });
  } catch (error) {
    console.error("manualTranslateTemplateQuestion invalid input", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: "Invalid input." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  try {
    await checkActionRateLimit(`manual-template-translation:${companyId}`, {
      maxAttempts: 60,
      windowMs: 60_000,
    });
  } catch (error) {
    console.error("manualTranslateTemplateQuestion rate limit", error);
    if (error instanceof ActionRateLimitError) {
      return { success: false, error: "Too many requests." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const q = await tx.templateQuestion.findFirst({
        where: {
          id: parsed.id,
          section: { template: { companyId } },
        },
        select: { id: true },
      });

      if (!q) {
        return false;
      }

      const translationData =
        parsed.targetLang === "de"
          ? { textDe: parsed.text, helpTextDe: parsed.helpText }
          : { textEn: parsed.text, helpTextEn: parsed.helpText };

      await tx.templateQuestion.update({
        where: { id: parsed.id },
        data: translationData,
      });

      return true;
    });

    if (!result) {
      return { success: false, error: "Question not found." };
    }

    AuditLogger.configuration("template_question.translated_manual", "success", {
      userId,
      entityType: "template_question",
      entityId: parsed.id,
      details: { companyId, targetLang: parsed.targetLang, mode: "manual" },
    });

    if (aiGenerated) {
      try {
        await logAuditEvent({
          companyId,
          userId,
          action: "AI_TRANSLATION_ACCEPTED",
          entityType: "template_question",
          entityId: parsed.id,
          hitlVerifiedBy: userId,
          newValue: { targetLang: parsed.targetLang },
        });
      } catch (auditErr) {
        console.error("manualTranslateTemplateQuestion HITL audit failed:", auditErr);
      }
    }

    revalidatePath("/settings/questionnaires");
    return {
      success: true,
      data: { text: parsed.text, guidance: parsed.helpText },
    };
  } catch (error) {
    console.error("manualTranslateTemplateQuestion error", error);
    return { success: false, error: "An unexpected error occurred." };
  }
}
