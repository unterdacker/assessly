"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { syncAssessmentComplianceToDatabase } from "@/lib/assessment-compliance";

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
    // 1. Fetch related assessment to get companyId and vendor info
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { vendor: true }
    });

    if (!assessment) throw new Error("Assessment not found");

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
          createdBy: "isb-user", // Hardcoded manual user for prototype
        },
      });
    }

    const allAnswers = await prisma.assessmentAnswer.findMany({
      where: { assessmentId },
      select: { status: true },
    });
    const totalQuestions = await prisma.question.count();
    const { score: newScore } = await syncAssessmentComplianceToDatabase(
      assessmentId,
      allAnswers,
      totalQuestions,
      assessment.complianceScore,
      assessment.riskLevel,
    );

    // 4. Create Audit Log
    await prisma.auditLog.create({
      data: {
        companyId: assessment.companyId,
        action: `Manual override: Question ${questionId} status changed to ${status} by ISB`,
        entityType: "vendor_assessment",
        entityId: assessmentId,
        actorId: "isb-user",
        createdBy: "isb-user",
        metadata: { questionId, status, newScore }
      }
    });

    // 5. Revalidate paths
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${assessment.vendorId}/assessment`);

    return { success: true, data: answer };
  } catch {
    return { success: false, error: "Failed to save answer" };
  }
}
