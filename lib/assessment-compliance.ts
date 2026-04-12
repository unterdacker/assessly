import type { RiskLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateRiskLevel } from "@/lib/risk-level";
import { DEMO_DATA_ACTOR } from "@/lib/ensure-demo-data";

/**
 * Strict NIS2-style scoring: only rows with status exactly "COMPLIANT" earn points.
 * Missing answers, NON_COMPLIANT, PENDING, or unknown statuses → 0 points for that slot.
 * Denominator is always the full catalogue size (active questions in DB).
 */
export function countStrictlyCompliantAnswers(
  answers: Pick<{ status: string }, "status">[],
): number {
  return answers.filter((a) => a.status === "COMPLIANT").length;
}

export function computeComplianceScorePercent(
  compliantCount: number,
  totalQuestions: number,
): number {
  if (totalQuestions <= 0) return 0;
  return Math.round((compliantCount / totalQuestions) * 100);
}

export function strictComplianceFromAnswers(
  answers: Pick<{ status: string }, "status">[],
  totalQuestions: number,
): { compliantCount: number; score: number; riskLevel: RiskLevel } {
  const compliantCount = countStrictlyCompliantAnswers(answers);
  const score = computeComplianceScorePercent(compliantCount, totalQuestions);
  const riskLevel = calculateRiskLevel(score);
  return { compliantCount, score, riskLevel };
}

/** Persist score + risk when they diverge from strict catalogue-based rules. */
export async function syncAssessmentComplianceToDatabase(
  assessmentId: string,
  answers: Pick<{ status: string }, "status">[],
  totalQuestions: number,
  storedScore?: number,
  storedRiskLevel?: RiskLevel,
  createdBy?: string,
): Promise<{ score: number; riskLevel: RiskLevel }> {
  if (
    answers.length === 0 &&
    (createdBy === DEMO_DATA_ACTOR || createdBy === "system-seed") &&
    storedScore !== undefined &&
    storedRiskLevel !== undefined
  ) {
    return { score: storedScore, riskLevel: storedRiskLevel };
  }

  const { score, riskLevel } = strictComplianceFromAnswers(answers, totalQuestions);
  const needsWrite =
    storedScore === undefined ||
    storedRiskLevel === undefined ||
    storedScore !== score ||
    storedRiskLevel !== riskLevel;
  if (needsWrite) {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { complianceScore: score, riskLevel },
    });
  }
  return { score, riskLevel };
}
