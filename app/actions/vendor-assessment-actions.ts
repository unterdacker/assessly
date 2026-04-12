"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { syncAssessmentComplianceToDatabase } from "@/lib/assessment-compliance";
import { logAuditEvent } from "@/lib/audit-log";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";
import { countVendorAssessmentQuestions } from "@/lib/queries/custom-questions";

export async function saveAssessmentAnswer({
  assessmentId,
  questionId,
  status,
  findings,
  evidenceSnippet,
  overrideReason,
}: {
  assessmentId: string;
  questionId: string;
  status: string;
  findings?: string | null;
  evidenceSnippet?: string | null;
  /** Required when updating an existing answer; must be non-empty. */
  overrideReason?: string | null;
}) {
  try {
    const session = await requireAdminUser();
    // 1. Fetch related assessment to get companyId and vendor info
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { vendor: true }
    });

    if (!assessment || assessment.companyId !== session.companyId) throw new Error("Assessment not found");

    // 2. Fetch existing answer
    const existing = await prisma.assessmentAnswer.findFirst({
      where: { assessmentId, questionId },
    });

    let answer;
    if (existing) {
      if (!overrideReason?.trim()) {
        return { success: false, error: "A reason is required to change an existing answer." };
      }
      const auditedFindings = `[Override reason: ${overrideReason.trim()}]\n\n${findings ?? existing.findings ?? ""}`.trim();
      answer = await prisma.assessmentAnswer.update({
        where: { id: existing.id },
        data: { status, findings: auditedFindings, evidenceSnippet },
      });
    } else {
      answer = await prisma.assessmentAnswer.create({
        data: {
          assessmentId,
          questionId,
          status,
          findings,
          evidenceSnippet,
          createdBy: session.userId,
        },
      });
    }

    const allAnswers = await prisma.assessmentAnswer.findMany({
      where: { assessmentId },
      select: { status: true },
    });
    const totalQuestions = await countVendorAssessmentQuestions(assessment.companyId);
    const { score: newScore } = await syncAssessmentComplianceToDatabase(
      assessmentId,
      allAnswers,
      totalQuestions,
      assessment.complianceScore,
      assessment.riskLevel,
    );

    // 4. Create Audit Log (with safe JSON serialization)
    try {
      const previousValuePayload = existing
        ? {
            status: existing.status || null,
            findings: existing.findings || null,
            evidenceSnippet: existing.evidenceSnippet || null,
          }
        : null;

      const newValuePayload = {
        questionId,
        status,
        findings: answer.findings || null,
        evidenceSnippet: answer.evidenceSnippet || null,
        overrideReason: overrideReason?.trim() || null,
        complianceScore: newScore || 0,
      };

      await logAuditEvent(
        {
          companyId: assessment.companyId,
          userId: session.userId,
          action: existing ? "ASSESSMENT_OVERRIDE" : "ASSESSMENT_UPDATED",
          entityType: "assessment_answer",
          entityId: answer.id,
          previousValue: previousValuePayload,
          newValue: newValuePayload,
        },
        { captureHeaders: false }, // Disable header capture to avoid async context issues
      );
    } catch (auditErr) {
      console.error("[saveAssessmentAnswer] Audit log failed:", auditErr);
      // Non-fatal: continue even if audit logging fails
    }

    // 5. Revalidate paths
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${assessment.vendorId}/assessment`);

    return { success: true, data: answer };
  } catch (err) {
    if (isAccessControlError(err)) {
      return { success: false, error: "Unauthorized." };
    }
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[saveAssessmentAnswer] Error:", errorMessage);
    return { success: false, error: "Failed to save answer" };
  }
}
