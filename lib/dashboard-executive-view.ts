import type { VendorAssessment } from "@/lib/vendor-assessment";

export type ExecutiveMetric = {
  label: string;
  value: string;
};

type ExecutiveMetricParams = {
  openRemediationCount: number;
  completedAssessments: number;
  overdueAssessmentsCount: number;
  isPremium: boolean;
  slaComplianceRate: number;
  labels: {
    openRemediations: string;
    completedAssessments: string;
    overdueAssessments: string;
    slaComplianceRate: string;
  };
};

export function countCompletedAssessments(vendorAssessments: VendorAssessment[]): number {
  return vendorAssessments.filter(
    (assessment) => String(assessment.status).toUpperCase() === "COMPLETED",
  ).length;
}

export function buildExecutiveMetrics({
  openRemediationCount,
  completedAssessments,
  overdueAssessmentsCount,
  isPremium,
  slaComplianceRate,
  labels,
}: ExecutiveMetricParams): ExecutiveMetric[] {
  const metrics: Array<ExecutiveMetric & { show: boolean }> = [
    {
      label: labels.openRemediations,
      value: String(openRemediationCount),
      show: true,
    },
    {
      label: labels.completedAssessments,
      value: String(completedAssessments),
      show: true,
    },
    {
      label: labels.overdueAssessments,
      value: String(overdueAssessmentsCount),
      show: isPremium,
    },
    {
      label: labels.slaComplianceRate,
      value: `${slaComplianceRate.toFixed(1)}%`,
      show: isPremium && slaComplianceRate > 0,
    },
  ];

  return metrics.filter((metric) => metric.show).map(({ label, value }) => ({ label, value }));
}
