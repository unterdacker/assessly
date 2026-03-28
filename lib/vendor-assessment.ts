/**
 * Vendor assessment records: third parties under NIS2-style review.
 * PII (e.g. security contact email) is shown in UI only — do not log raw values.
 */

export type VendorStatus = "invited" | "in_progress" | "completed";
export type RiskLevel = "low" | "medium" | "high";

export type VendorAssessment = {
  id: string;
  name: string;
  /** Business security contact — minimize exposure in logs and exports. */
  email: string;
  serviceType: string;
  lastAssessmentDate: string | null;
  riskLevel: RiskLevel;
  status: VendorStatus;
  /** 0–100; used for workspace placeholder insights */
  complianceScore: number;
  createdAt: string;
  updatedAt: string;
  /** Opaque user/service id when authenticated; placeholder in this prototype. */
  createdBy: string;
};

export function riskLevelFromScore(score: number): RiskLevel {
  if (score < 40) return "high";
  if (score <= 70) return "medium";
  return "low";
}

export function supplyChainRiskScore(
  vendorAssessments: VendorAssessment[],
): number {
  if (vendorAssessments.length === 0) return 100;
  const avg =
    vendorAssessments.reduce((s, v) => s + v.complianceScore, 0) /
    vendorAssessments.length;
  return Math.round(avg);
}

export function countByStatus(
  vendorAssessments: VendorAssessment[],
  status: VendorStatus,
): number {
  return vendorAssessments.filter((v) => v.status === status).length;
}
