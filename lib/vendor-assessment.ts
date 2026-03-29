/**
 * Vendor assessment records: third parties under NIS2-style review.
 * PII (e.g. security contact email) is shown in UI only — do not log raw values.
 */

export type VendorStatus = "pending" | "incomplete" | "completed";
export type RiskLevel = "low" | "medium" | "high" | "not_calculated";

export type VendorAssessment = {
  id: string;
  name: string;
  /** Access portal fields */
  accessCode: string | null;
  codeExpiresAt: string | null;
  isCodeActive: boolean;
  /** ISO timestamp of the last out-of-band invite send, or null if never sent. */
  inviteSentAt: string | null;
  /** True until the vendor completes the forced password-change on first login. */
  isFirstLogin: boolean;
  /** Business security contact — minimize exposure in logs and exports. */
  email: string;
  serviceType: string;
  lastAssessmentDate: string | null;
  riskLevel: RiskLevel;
  status: VendorStatus;
  /** 0–100; used for workspace placeholder insights */
  complianceScore: number;
  /** API URL to retrieve the stored evidence PDF, if uploaded. */
  documentUrl: string | null;
  documentFilename: string | null;
  createdAt: string;
  updatedAt: string;
  /** Opaque user/service id when authenticated; placeholder in this prototype. */
  createdBy: string;
  /** Completeness of the vendor profile master data (0–100). */
  dossierCompletion: number;
  /** Progress of the NIS2 security questionnaire (0–100). */
  questionnaireProgress: number;
  /** Absolute number of questions filled (0–20). */
  questionsFilled: number;
  /** Full vendor object for profile editing */
  vendor?: {
    officialName?: string | null;
    registrationId?: string | null;
    /** Plain string; user-typed value from the learn-as-you-go combobox. */
    vendorServiceType?: string | null;
    securityOfficerName?: string | null;
    securityOfficerEmail?: string | null;
    dpoName?: string | null;
    dpoEmail?: string | null;
    headquartersLocation?: string | null;
    sizeClassification?: string | null;
  };
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

/**
 * Calculates the completion percentage (0-100) of a vendor's master data dossier.
 * Based on 6 specific audit-relevant fields.
 */
export function calculateDossierCompletion(vendor?: VendorAssessment["vendor"]): number {
  if (!vendor) return 0;
  const fields = [
    vendor.registrationId,
    vendor.headquartersLocation,
    vendor.securityOfficerName,
    vendor.securityOfficerEmail,
    vendor.dpoName,
    vendor.dpoEmail,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / 6) * 100);
}
