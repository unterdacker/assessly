import type { AssessmentStatus, RiskLevel as PrismaRiskLevel } from "@prisma/client";
import type {
  VendorAssessment,
  VendorStatus,
  RiskLevel,
} from "@/lib/vendor-assessment";
import type { Vendor, Assessment } from "@prisma/client";

export function vendorStatusFromAssessmentStatus(
  status: AssessmentStatus,
): VendorStatus {
  switch (status) {
    case "PENDING":
      return "invited";
    case "IN_REVIEW":
      return "in_progress";
    case "COMPLETED":
      return "completed";
  }
}

export function riskLevelFromPrisma(level: PrismaRiskLevel): RiskLevel {
  switch (level) {
    case "LOW":
      return "low";
    case "MEDIUM":
      return "medium";
    case "HIGH":
      return "high";
  }
}

export function riskLevelToPrisma(level: RiskLevel): PrismaRiskLevel {
  switch (level) {
    case "low":
      return "LOW";
    case "medium":
      return "MEDIUM";
    case "high":
      return "HIGH";
  }
}

/** Join row for list/detail views: one Assessment per Vendor. */
export function toVendorAssessment(vendor: Vendor, assessment: Assessment): VendorAssessment {
  return {
    id: vendor.id,
    name: vendor.name,
    email: vendor.email,
    serviceType: vendor.serviceType,
    lastAssessmentDate: assessment.lastAssessmentDate
      ? assessment.lastAssessmentDate.toISOString().slice(0, 10)
      : null,
    riskLevel: riskLevelFromPrisma(assessment.riskLevel),
    status: vendorStatusFromAssessmentStatus(assessment.status),
    complianceScore: assessment.complianceScore,
    createdAt: vendor.createdAt.toISOString(),
    updatedAt: vendor.updatedAt.toISOString(),
    createdBy: vendor.createdBy,
  };
}
