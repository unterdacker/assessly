"use client";

import { LayoutGrid } from "lucide-react";
import { supplyChainRiskScore } from "@/lib/vendor-assessment";
import { buildExecutiveMetrics, countCompletedAssessments } from "@/lib/dashboard-executive-view";
import { Card, CardContent } from "@/components/ui/card";
import { RiskGauge } from "@/components/risk-gauge";
import type { DashboardOverviewProps } from "@/components/dashboard-overview";

type DashboardOverviewTranslationSubset = {
  executiveSummaryLabel: string;
  switchToFullDashboard: string;
  openRemediations: string;
  completedAssessments: string;
  overdueAssessments: string;
  slaComplianceRate: string;
  aiSummaryNotAvailable: string;
};

type OverdueAssessment = NonNullable<DashboardOverviewProps["overdueAssessments"]>[number];

interface DashboardExecutiveViewProps extends Pick<
  DashboardOverviewProps,
  "riskPosture" | "vendorAssessments" | "openRemediationCount" | "isPremium" | "slaComplianceRate"
> {
  overdueAssessments: OverdueAssessment[];
  translations: DashboardOverviewTranslationSubset;
  onViewModeChange: (mode: "full") => void;
}

export function DashboardExecutiveView({
  riskPosture,
  vendorAssessments,
  openRemediationCount,
  isPremium,
  overdueAssessments,
  slaComplianceRate,
  translations,
  onViewModeChange,
}: DashboardExecutiveViewProps) {
  const score = supplyChainRiskScore(vendorAssessments);
  const completedAssessments = countCompletedAssessments(vendorAssessments);

  const summaryText = riskPosture.executiveSummary.systemicRisk?.trim().length
    ? riskPosture.executiveSummary.systemicRisk
    : translations.aiSummaryNotAvailable;

  const metrics = buildExecutiveMetrics({
    openRemediationCount,
    completedAssessments,
    overdueAssessmentsCount: overdueAssessments.length,
    isPremium,
    slaComplianceRate,
    labels: {
      openRemediations: translations.openRemediations,
      completedAssessments: translations.completedAssessments,
      overdueAssessments: translations.overdueAssessments,
      slaComplianceRate: translations.slaComplianceRate,
    },
  });

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex flex-row items-center justify-between gap-4 border-b border-border/50 pb-2">
        <p className="text-[0.6875rem] uppercase tracking-[0.15em] text-muted-foreground">
          {translations.executiveSummaryLabel}
        </p>
        <button
          type="button"
          onClick={() => onViewModeChange("full")}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
          {translations.switchToFullDashboard}
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-[300px_1fr] md:divide-x md:divide-y-0">
            <div className="flex flex-col items-center justify-center p-6 md:p-8">
              <RiskGauge value={score} />
            </div>
            <div className="flex flex-col justify-center gap-4 p-6 md:p-8">
              <p className="text-sm leading-relaxed text-foreground">{summaryText}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 divide-y divide-border border-y border-border bg-card sm:grid-cols-2 sm:divide-x sm:divide-y-0 md:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex flex-col gap-1 p-4 md:p-5">
            <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
              {metric.label}
            </p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground md:text-3xl">
              {metric.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
