import type { VendorAssessment } from "@/lib/vendor-assessment";

/**
 * Placeholder insight lines for the workspace. Replace with server-backed summaries in production.
 */
export function buildVendorAssessmentInsightLines(
  vendorAssessment: VendorAssessment,
): string[] {
  const s = vendorAssessment.complianceScore;
  const base = [
    `Automated scan of submitted documentation suggests ${vendorAssessment.name} aligns partially with logging and retention expectations under NIS2 Article 21.`,
    "AI summary: incident notification timelines are mentioned but lack measurable SLAs in the provided excerpt.",
  ];
  if (s < 40) {
    return [
      ...base,
      "Elevated concern: MFA coverage for administrative access is not clearly evidenced.",
      "Recommendation: request SOC 2 Type II or equivalent independent assurance before production data sharing.",
    ];
  }
  if (s <= 70) {
    return [
      ...base,
      "Moderate gap: subprocessors are listed without a formal reassessment cadence.",
    ];
  }
  return [
    ...base,
    "Posture appears consistent with baseline NIS2 technical measures; validate annually and on material change.",
  ];
}
