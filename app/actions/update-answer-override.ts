"use server";

import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logErrorReport } from "@/lib/logger";
import { syncAssessmentComplianceToDatabase } from "@/lib/assessment-compliance";
import { logAuditEvent } from "@/lib/audit-log";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";

const STORAGE_DIR = path.join(process.cwd(), ".avra-storage");

/** Persist a supplemental evidence PDF for a specific AssessmentAnswer. */
async function saveAnswerEvidencePdf(
  answerId: string,
  originalFilename: string,
  buffer: Buffer,
): Promise<string> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `answer__${answerId}__${safeName}`;
  await fs.writeFile(path.join(STORAGE_DIR, storedName), buffer);
  return `/api/documents/answer/${encodeURIComponent(answerId)}?filename=${encodeURIComponent(safeName)}`;
}

export type OverrideAnswerInput = {
  assessmentId: string;
  questionId: string;
  /** New status to record. */
  status: "COMPLIANT" | "NON_COMPLIANT";
  /** Mandatory justification text — enforced here on the server. */
  manualNotes: string;
  /** Optional supplemental PDF as a Base64 string (sent from the client). */
  evidencePdfBase64?: string | null;
  evidencePdfFilename?: string | null;
};

export type OverrideAnswerResult =
  | { success: true; newScore: number }
  | { success: false; error: string };

/**
 * Dedicated server action for ISB manual overrides.
 * Validates the mandatory justification, persists the answer with a full
 * audit trail, and revalidates the relevant pages.
 */
export async function overrideAssessmentAnswer(
  input: OverrideAnswerInput,
): Promise<OverrideAnswerResult> {
  const { assessmentId, questionId, status, manualNotes, evidencePdfBase64, evidencePdfFilename } =
    input;

  // Server-side guard: justification is mandatory
  if (!manualNotes.trim()) {
    return { success: false, error: "Justification is required to override an answer." };
  }

  try {
    const session = await requireAdminUser();
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { vendor: true },
    });
    if (!assessment || assessment.companyId !== session.companyId) {
      return { success: false, error: "Assessment not found." };
    }

    // Upsert the answer
    const existing = await prisma.assessmentAnswer.findFirst({
      where: { assessmentId, questionId },
    });

    let evidenceUrl: string | null = null;

    // Build the audited findings line that appends to any existing AI reasoning
    const auditPrefix = `[ISB Override — ${new Date().toISOString()}]\nReason: ${manualNotes.trim()}`;
    const auditedFindings = existing?.findings
      ? `${auditPrefix}\n\n--- Previous AI reasoning ---\n${existing.findings}`
      : auditPrefix;

    let answerId: string;
    let updatedAnswer: { id: string };

    if (existing) {
      updatedAnswer = await prisma.assessmentAnswer.update({
        where: { id: existing.id },
        data: {
          status,
          findings: auditedFindings,
          manualNotes: manualNotes.trim(),
        },
        select: { id: true },
      });
      answerId = updatedAnswer.id;
    } else {
      updatedAnswer = await prisma.assessmentAnswer.create({
        data: {
          assessmentId,
          questionId,
          status,
          findings: auditedFindings,
          manualNotes: manualNotes.trim(),
          createdBy: session.userId,
        },
        select: { id: true },
      });
      answerId = updatedAnswer.id;
    }

    // Persist optional supplemental PDF
    if (evidencePdfBase64 && evidencePdfFilename) {
      try {
        const buffer = Buffer.from(evidencePdfBase64, "base64");
        evidenceUrl = await saveAnswerEvidencePdf(answerId, evidencePdfFilename, buffer);
        await prisma.assessmentAnswer.update({
          where: { id: answerId },
          data: { evidenceUrl },
        });
      } catch (pdfErr) {
        logErrorReport("Answer Evidence PDF Persistence", pdfErr);
        // Non-fatal: answer is already saved
      }
    }

    const [allAnswers, totalQuestions] = await Promise.all([
      prisma.assessmentAnswer.findMany({
        where: { assessmentId },
        select: { status: true },
      }),
      prisma.question.count(),
    ]);
    const { score: newScore } = await syncAssessmentComplianceToDatabase(
      assessmentId,
      allAnswers,
      totalQuestions,
      assessment.complianceScore,
      assessment.riskLevel,
    );

    // Safely construct audit payload — no undefined or non-serializable values
    const previousValuePayload = existing
      ? {
          status: existing.status || null,
          findings: existing.findings || null,
          manualNotes: existing.manualNotes || null,
          evidenceUrl: existing.evidenceUrl || null,
        }
      : null;

    const newValuePayload = {
      questionId,
      status,
      manualNotes: manualNotes.trim(),
      hasSupplementalEvidence: !!evidenceUrl,
      evidenceUrl: evidenceUrl || null,
      complianceScore: newScore || 0,
    };

    try {
      await logAuditEvent(
        {
          companyId: assessment.companyId,
          userId: session.userId,
          action: "ASSESSMENT_OVERRIDE",
          entityType: "assessment_answer",
          entityId: answerId,
          previousValue: previousValuePayload,
          newValue: newValuePayload,
        },
        { captureHeaders: false }, // Disable header capture to avoid async context issues
      );
    } catch (auditErr) {
      logErrorReport("Audit Log Creation Failed", auditErr);
      // Non-fatal: continue even if audit logging fails
    }

    revalidatePath("/vendors");
    revalidatePath(`/vendors/${assessment.vendorId}/assessment`);

    return { success: true, newScore };
  } catch (err) {
    if (isAccessControlError(err)) {
      return { success: false, error: "Unauthorized." };
    }
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[overrideAssessmentAnswer] Error:", errorMessage);
    logErrorReport("overrideAssessmentAnswer", err);
    return { success: false, error: "Failed to save override. Please try again." };
  }
}
