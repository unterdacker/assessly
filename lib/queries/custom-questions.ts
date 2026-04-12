import { prisma } from "@/lib/prisma";
import type { Question } from "@prisma/client";

/**
 * Returns all custom questions for a company, ordered by sortOrder ascending.
 * Global NIS2 questions (companyId = null) are excluded.
 */
export async function getCustomQuestions(companyId: string): Promise<Question[]> {
  return prisma.question.findMany({
    where: { companyId, isCustom: true },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * Returns the full question set for a company:
 * global NIS2 questions (sorted by sortOrder) followed by custom questions.
 *
 * Used by server pages / actions to populate questions for assessments.
 */
export async function getVendorAssessmentQuestions(companyId: string): Promise<Question[]> {
  return prisma.question.findMany({
    where: {
      OR: [
        { companyId: null },
        { companyId },
      ],
    },
    orderBy: [
      { isCustom: "asc" },   // false (0) before true (1) — NIS2 first
      { sortOrder: "asc" },
    ],
  });
}

/**
 * Returns the total question count for a company (NIS2 + custom).
 * Used for compliance score calculation.
 */
export async function countVendorAssessmentQuestions(companyId: string): Promise<number> {
  return prisma.question.count({
    where: {
      OR: [
        { companyId: null },
        { companyId },
      ],
    },
  });
}
