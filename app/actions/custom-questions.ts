"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminUser, isAccessControlError } from "@/lib/auth/server";
import { AuditLogger } from "@/lib/structured-logger";
import { logErrorReport } from "@/lib/logger";
import type { Question } from "@prisma/client";

// ---------------------------------------------------------------------------
// Constants & Schemas
// ---------------------------------------------------------------------------

const MAX_CUSTOM_QUESTIONS = 50;

const CreateSchema = z.object({
  text: z.string().min(1).max(1000),
  guidance: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
});

const UpdateSchema = z.object({
  text: z.string().min(1).max(1000).optional(),
  guidance: z.string().max(2000).nullable().optional(),
  category: z.string().max(100).optional(),
});

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// createCustomQuestion
// Security: count + create in a single $transaction to prevent TOCTOU race
// ---------------------------------------------------------------------------

export async function createCustomQuestion(
  input: z.infer<typeof CreateSchema>,
): Promise<ActionResult<{ id: string; question: Question }>> {
  let session;
  try {
    session = await requireAdminUser();
  } catch (err) {
    if (isAccessControlError(err)) return { success: false, error: "Unauthorized." };
    logErrorReport("createCustomQuestion", err);
    return { success: false, error: "An unexpected error occurred." };
  }

  const { companyId, userId } = session;
  if (!companyId) return { success: false, error: "Unauthorized." };

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input." };

  const { text, guidance, category } = parsed.data;

  try {
    const question = await prisma.$transaction(async (tx) => {
      const count = await tx.question.count({ where: { companyId, isCustom: true } });
      if (count >= MAX_CUSTOM_QUESTIONS) throw new Error("CAP_EXCEEDED");
      return tx.question.create({
        data: {
          companyId,
          text,
          guidance: guidance ?? null,
          category: category ?? "Custom",
          isCustom: true,
          createdBy: userId,
          sortOrder: count,
        },
      });
    });

    // Audit: log only entityId + companyId — no PII proxies (text/guidance excluded)
    AuditLogger.configuration("custom_question.created", "success", {
      userId,
      entityType: "custom_question",
      entityId: question.id,
      details: { companyId },
    });

    revalidatePath("/settings");
    return { success: true, data: { id: question.id, question } };
  } catch (err) {
    if (err instanceof Error && err.message === "CAP_EXCEEDED") {
      return {
        success: false,
        error: `Maximum of ${MAX_CUSTOM_QUESTIONS} custom questions per company.`,
      };
    }
    logErrorReport("createCustomQuestion", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// updateCustomQuestion
// Security: ownership scope embedded in the Prisma write call via updateMany
// ---------------------------------------------------------------------------

export async function updateCustomQuestion(
  id: string,
  input: z.infer<typeof UpdateSchema>,
): Promise<ActionResult<{ id: string; question: Question | null }>> {
  let session;
  try {
    session = await requireAdminUser();
  } catch (err) {
    if (isAccessControlError(err)) return { success: false, error: "Unauthorized." };
    logErrorReport("updateCustomQuestion", err);
    return { success: false, error: "An unexpected error occurred." };
  }

  const { companyId, userId } = session;
  if (!companyId) return { success: false, error: "Unauthorized." };

  if (!id || typeof id !== "string") return { success: false, error: "Invalid request." };

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input." };

  const data = parsed.data;
  if (Object.keys(data).length === 0) return { success: false, error: "No fields to update." };

  try {
    // Ownership + type scope enforced atomically inside the write call
    const result = await prisma.question.updateMany({
      where: { id, companyId, isCustom: true },
      data,
    });

    if (result.count === 0) return { success: false, error: "Question not found." };

    const updated = await prisma.question.findFirst({
      where: { id, companyId, isCustom: true },
    });

    // Audit: log only entityId + companyId — no PII proxies
    AuditLogger.configuration("custom_question.updated", "success", {
      userId,
      entityType: "custom_question",
      entityId: id,
      details: { companyId },
    });

    revalidatePath("/settings");
    return { success: true, data: { id, question: updated } };
  } catch (err) {
    logErrorReport("updateCustomQuestion", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// deleteCustomQuestion
// Security: IDOR-safe single atomic deleteMany — ownership in the predicate
// Note: AssessmentAnswer rows with this questionId are retained (no FK —
// intentional for audit trail preservation).
// ---------------------------------------------------------------------------

export async function deleteCustomQuestion(
  id: string,
): Promise<ActionResult> {
  let session;
  try {
    session = await requireAdminUser();
  } catch (err) {
    if (isAccessControlError(err)) return { success: false, error: "Unauthorized." };
    logErrorReport("deleteCustomQuestion", err);
    return { success: false, error: "An unexpected error occurred." };
  }

  const { companyId, userId } = session;
  if (!companyId) return { success: false, error: "Unauthorized." };

  if (!id || typeof id !== "string") return { success: false, error: "Invalid request." };

  try {
    const result = await prisma.question.deleteMany({
      where: { id, companyId, isCustom: true },
    });

    if (result.count === 0) return { success: false, error: "Question not found." };

    // Audit: entityId only — no text/guidance content logged
    AuditLogger.configuration("custom_question.deleted", "success", {
      userId,
      entityType: "custom_question",
      entityId: id,
      details: { companyId },
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    logErrorReport("deleteCustomQuestion", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// reorderCustomQuestions
// Security: ids.length capped at 50; updateMany scoped to companyId on each op
// ---------------------------------------------------------------------------

export async function reorderCustomQuestions(
  ids: string[],
): Promise<ActionResult> {
  let session;
  try {
    session = await requireAdminUser();
  } catch (err) {
    if (isAccessControlError(err)) return { success: false, error: "Unauthorized." };
    logErrorReport("reorderCustomQuestions", err);
    return { success: false, error: "An unexpected error occurred." };
  }

  const { companyId, userId } = session;
  if (!companyId) return { success: false, error: "Unauthorized." };

  if (!Array.isArray(ids)) return { success: false, error: "Invalid request." };
  if (ids.length > MAX_CUSTOM_QUESTIONS) return { success: false, error: "Invalid request." };
  if (ids.some((id) => typeof id !== "string" || id.length === 0)) {
    return { success: false, error: "Invalid request." };
  }

  try {
    // Each updateMany carries the full ownership predicate —
    // cross-tenant IDs silently return count:0 (no write, no error).
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.question.updateMany({
          where: { id, companyId, isCustom: true },
          data: { sortOrder: index },
        }),
      ),
    );

    AuditLogger.configuration("custom_question.reordered", "success", {
      userId,
      details: { companyId, count: ids.length },
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    logErrorReport("reorderCustomQuestions", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}
