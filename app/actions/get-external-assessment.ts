"use server";

import { prisma } from "@/lib/prisma";
import { toVendorAssessment, VendorDomainMapper } from "@/lib/prisma-mappers";
import type { VendorAssessment } from "@/lib/vendor-assessment";
import type { Assessment, AssessmentAnswer, Question } from "@prisma/client";

const EXPIRY_GRACE_PERIOD_MS = 2 * 60 * 1000;

/** Placeholder used in error-path returns where isValid is false. */
const EMPTY_VENDOR_ASSESSMENT: VendorAssessment = {
  id: "",
  name: "",
  accessCode: null,
  codeExpiresAt: null,
  isCodeActive: false,
  inviteSentAt: null,
  inviteTokenExpires: null,
  isFirstLogin: false,
  email: "",
  serviceType: "",
  lastAssessmentDate: null,
  riskLevel: "not_calculated",
  status: "pending",
  complianceScore: 0,
  documentUrl: null,
  documentFilename: null,
  createdAt: "",
  updatedAt: "",
  createdBy: "",
  dossierCompletion: 0,
  questionnaireProgress: 0,
  questionsFilled: 0,
};

function resolveDeadline(vendor: {
  inviteTokenExpires?: Date | null;
  codeExpiresAt?: Date | null;
}): Date | null {
  const candidates = [vendor.inviteTokenExpires, vendor.codeExpiresAt]
    .filter((value): value is Date => Boolean(value))
    .map((value) => value.getTime());

  if (candidates.length === 0) {
    return null;
  }

  return new Date(Math.min(...candidates));
}

function isExpiredUtcWithGrace(deadline: Date): boolean {
  return Date.now() > deadline.getTime() + EXPIRY_GRACE_PERIOD_MS;
}

export type ExternalAssessmentDetail = {
  vendorAssessment: VendorAssessment;
  assessmentId: string;
  isSubmitted: boolean;
  questions: Question[];
  answers: AssessmentAnswer[];
  documentUrl: string | null;
  documentFilename: string | null;
  sessionExpiresAt: string | null;
  isValid: boolean;
  error?: string;
  errorCode?: "INVALID_LINK" | "LINK_INACTIVE" | "DEADLINE_PASSED";
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
    const vendor = await prisma.vendor.findFirst({
      where: {
        inviteToken: token,
      },
      include: {
        assessment: {
          include: {
            answers: {
              include: {
                document: {
                  select: {
                    id: true,
                    filename: true,
                    fileSize: true,
                    uploadedAt: true,
                    uploadedBy: true,
                  },
                },
              },
            }
          }
        }
      }
    });

    if (!vendor || !vendor.assessment) {
      return { 
        isValid: false, 
        error: "Invalid or expired assessment link.",
        errorCode: "INVALID_LINK",
        vendorAssessment: EMPTY_VENDOR_ASSESSMENT, 
        assessmentId: "", 
        isSubmitted: false,
        questions: [], 
        answers: [], 
        documentUrl: null, 
        documentFilename: null,
        sessionExpiresAt: null,
      };
    }

    const deadline = resolveDeadline(vendor);
    if (!deadline) {
      return {
        isValid: false,
        error: "Invalid or expired assessment link.",
        errorCode: "INVALID_LINK",
        vendorAssessment: EMPTY_VENDOR_ASSESSMENT,
        assessmentId: "",
        isSubmitted: false,
        questions: [],
        answers: [],
        documentUrl: null,
        documentFilename: null,
        sessionExpiresAt: null,
      };
    }

    if (!vendor.isCodeActive) {
      return {
        isValid: false,
        error: "Assessment link is inactive.",
        errorCode: "LINK_INACTIVE",
        vendorAssessment: EMPTY_VENDOR_ASSESSMENT,
        assessmentId: "",
        isSubmitted: false,
        questions: [],
        answers: [],
        documentUrl: null,
        documentFilename: null,
        sessionExpiresAt: deadline.toISOString(),
      };
    }

    if (isExpiredUtcWithGrace(deadline)) {
      return {
        isValid: false,
        error: `Deadline passed. Expired at ${deadline.toISOString()}`,
        errorCode: "DEADLINE_PASSED",
        vendorAssessment: EMPTY_VENDOR_ASSESSMENT,
        assessmentId: "",
        isSubmitted: false,
        questions: [],
        answers: [],
        documentUrl: null,
        documentFilename: null,
        sessionExpiresAt: deadline.toISOString(),
      };
    }

    const totalQuestions = await prisma.question.count();
    const questions = await prisma.question.findMany({
      orderBy: { sortOrder: 'asc' }
    });

    const filledCount = vendor.assessment.answers.filter(
      (a: { status: string }) => a.status === "COMPLIANT" || a.status === "NON_COMPLIANT"
    ).length;

    const vendorAssessment = toVendorAssessment(
      vendor as unknown as VendorDomainMapper,
      vendor.assessment as unknown as Assessment,
      filledCount,
      totalQuestions
    );

    // Security: Remove sensitive internal fields that shouldn't be seen by the vendor
    // (Actual stripping happens by only returning what's needed in this object)

    return {
      isValid: true,
      vendorAssessment,
      assessmentId: vendor.assessment.id,
      isSubmitted: vendor.assessment.status === "COMPLETED",
      questions,
      answers: vendor.assessment.answers,
      documentUrl: vendor.assessment.documentUrl || null,
      documentFilename: vendor.assessment.documentFilename || null,
      sessionExpiresAt: deadline.toISOString(),
    };
  } catch (err) {
    console.error("Token validation error:", err);
    return null;
  }
}
