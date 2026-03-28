import type { AssessmentStatus, RiskLevel as PrismaRiskLevel } from "@prisma/client";
import type {
  VendorAssessment,
  VendorStatus,
  RiskLevel,
} from "@/lib/vendor-assessment";
import type { Vendor, Assessment } from "@prisma/client";

export function deriveVendorStatus(
  answerCount: number,
  totalQuestions: number
): VendorStatus {
  if (answerCount === 0) return "pending";
  if (answerCount >= totalQuestions && totalQuestions > 0) return "completed";
  return "incomplete";
}

export function riskLevelFromPrisma(level: PrismaRiskLevel): RiskLevel {
  switch (level) {
    case "LOW":
      return "low";
    case "MEDIUM":
      return "medium";
    case "HIGH":
      return "high";
    default:
      return "not_calculated";
  }
}

export function riskLevelToPrisma(level: RiskLevel): PrismaRiskLevel {
  switch (level) {
    case "low":
      return "LOW";
    case "high":
      return "HIGH";
    default:
      return "MEDIUM";
  }
}

/** Join row for list/detail views: one Assessment per Vendor. */
export function toVendorAssessment(
  vendor: Vendor, 
  assessment: Assessment,
  answerCount: number = 0,
  totalQuestions: number = 20
): VendorAssessment {
  const derivedStatus = deriveVendorStatus(answerCount, totalQuestions);
  return {
    id: vendor.id,
    name: vendor.name,
    email: vendor.email,
    serviceType: vendor.serviceType,
    lastAssessmentDate: assessment.lastAssessmentDate
      ? assessment.lastAssessmentDate.toISOString().slice(0, 10)
      : null,
    riskLevel: derivedStatus === "completed" ? riskLevelFromPrisma(assessment.riskLevel) : "not_calculated",
    status: derivedStatus,
    complianceScore: assessment.complianceScore,
    documentUrl: (assessment as any).documentUrl ?? null,
    documentFilename: (assessment as any).documentFilename ?? null,
    createdAt: vendor.createdAt.toISOString(),
    updatedAt: vendor.updatedAt.toISOString(),
    createdBy: vendor.createdBy,
  };
}
