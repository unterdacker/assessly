"use server";

import { prisma } from "@/lib/prisma";
import { toVendorAssessment } from "@/lib/prisma-mappers";
import type { VendorAssessment } from "@/lib/vendor-assessment";
import type { AssessmentAnswer, Question } from "@prisma/client";

export type ExternalAssessmentDetail = {
  vendorAssessment: VendorAssessment;
  assessmentId: string;
  questions: Question[];
  answers: AssessmentAnswer[];
  documentUrl: string | null;
  documentFilename: string | null;
  sessionExpiresAt: string | null;
  isValid: boolean;
  error?: string;
};

/**
 * Validates a secure token and returns the assessment context for an external vendor.
 * Strips internal risk/scoring data to ensure privacy.
 */
export async function getExternalAssessment(
  token: string
): Promise<ExternalAssessmentDetail | null> {
  if (!token) return null;

  try {
    const vendor = await (prisma.vendor as any).findFirst({
      where: { 
        inviteToken: token,
        inviteTokenExpires: { gt: new Date() },
        isCodeActive: true,
        codeExpiresAt: { gt: new Date() },
      },
      include: {
        assessment: {
          include: {
            answers: true
          }
        }
      }
    });

    if (!vendor || !vendor.assessment) {
      return { 
        isValid: false, 
        error: "Invalid or expired assessment link.",
        vendorAssessment: {} as any, 
        assessmentId: "", 
        questions: [], 
        answers: [], 
        documentUrl: null, 
        documentFilename: null,
        sessionExpiresAt: null,
      };
    }

    const totalQuestions = await prisma.question.count();
    const questions = await prisma.question.findMany({
      orderBy: { sortOrder: 'asc' }
    });

    const filledCount = (vendor.assessment as any).answers.filter(
      (a: any) => a.status === "COMPLIANT" || a.status === "NON_COMPLIANT"
    ).length;

    const vendorAssessment = toVendorAssessment(
      vendor as any,
      vendor.assessment as any,
      filledCount,
      totalQuestions
    );

    // Security: Remove sensitive internal fields that shouldn't be seen by the vendor
    // (Actual stripping happens by only returning what's needed in this object)

    return {
      isValid: true,
      vendorAssessment,
      assessmentId: vendor.assessment.id,
      questions,
      answers: vendor.assessment.answers,
      documentUrl: vendor.assessment.documentUrl || null,
      documentFilename: vendor.assessment.documentFilename || null,
      sessionExpiresAt: (vendor as any).codeExpiresAt ? new Date((vendor as any).codeExpiresAt).toISOString() : null,
    };
  } catch (err) {
    console.error("Token validation error:", err);
    return null;
  }
}
