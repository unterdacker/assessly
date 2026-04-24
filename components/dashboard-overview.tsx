"use client";

import Link from "next/link";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UserRole } from "@prisma/client";
import {
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Info,
  Mail,
  Radar,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import {
  countByStatus,
  supplyChainRiskScore,
  type VendorAssessment,
} from "@/lib/vendor-assessment";
import type { DashboardRiskPostureOverview } from "@/lib/queries/dashboard-risk-posture";
import { scoreGaugeColor } from "@/lib/score-colors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RiskGauge } from "@/components/risk-gauge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CategoryComplianceRadarChartLazy } from "@/components/category-compliance-radar-chart-lazy";
import { VendorsByRiskBarChartLazy } from "@/components/vendors-by-risk-bar-chart-lazy";
import { ComplianceTrustWidgetLazy } from "@/components/compliance-trust-widget-lazy";
import { RefreshAiSummaryButton } from "@/components/refresh-ai-summary-button";

type OverdueAssessment = {
  id: string;
  vendor?: { name: string };
  daysOverdue: number;
};

export type DashboardOverviewProps = {
  vendorAssessments: VendorAssessment[];
  riskPosture: DashboardRiskPostureOverview;
  role: UserRole;
  locale: string;
  openRemediationCount: number;
  isPremium?: boolean;
  overdueAssessments?: OverdueAssessment[];
  slaComplianceRate?: number;
  translations: {
    Dashboard: string;
    DashboardDesc: string;
    SupplyChainRiskScore: string;
    SupplyChainRiskScoreDesc: string;
    Pending: string;
    AwaitingVendorResponse: string;
    Incomplete: string;
    QuestionnaireUnderway: string;
    Completed: string;
    AssessmentsClosed: string;
    OpenRemediations: string;
    OpenRemediationsHint: string;
    ManageVendors: string;
    ElevatedAttentionRecommended: string;
    MonitorAndRemediateGaps: string;
    WithinAcceptableBand: string;
    PostureAcceptable?: string;
    /** @deprecated The Trust & Compliance explanatory card was removed. These keys remain for API compatibility. */
    TrustAndCompliance: string;
    TrustComplianceDesc: string;
    RiskColoring: string;
    AssessmentWorkspace: string;
    InviteNewVendors: string;
    RiskPostureLabel: string;
    RiskPostureOverview: string;
    RiskPostureOverviewDesc: string;
    RiskPostureOverviewTooltip?: string;
    CategoryComplianceRadarTitle: string;
    CategoryComplianceRadarDesc: string;
    CategoryComplianceRadarTooltip?: string;
    CategoryComplianceRadarHoverHint?: string;
    VendorsByRiskLevelTitle: string;
    VendorsByRiskLevelDesc: string;
    VendorsByRiskLevelTooltip?: string;
    AIExecutiveSummary: string;
    AIExecutiveSummaryDesc: string;
    BiggestSystemicRisk: string;
    AverageRemediationTime: string;
    RecommendedNextStep: string;
    Days: string;
    AverageComplianceLegend: string;
    VendorCountLegend: string;
    NoVendorData: string;
    AIAnalysisLive: string;
    AIAnalysisFallback: string;
    RefreshAISummary: string;
    RefreshAISummaryPending: string;
    HidePostureAnalytics: string;
    ShowPostureAnalytics: string;
    categoryLabels: Record<
      | "governanceRisk"
      | "accessIdentity"
      | "dataProtectionPrivacy"
      | "encryption"
      | "operationsMonitoring"
      | "incidentManagement"
      | "supplyChainSecurity",
      string
    >;
    categoryShortLabels: Record<
      | "governanceRisk"
      | "accessIdentity"
      | "dataProtectionPrivacy"
      | "encryption"
      | "operationsMonitoring"
      | "incidentManagement"
      | "supplyChainSecurity",
      string
    >;
    riskLevelLabels: Record<"low" | "medium" | "high", string>;
    ComplianceTrustWidgetTitle: string;
    ComplianceTrustWidgetDesc: string;
    AITransparencyMetric: string;
    HumanOversightMetric: string;
    SystemIntegrityMetric: string;
    AIGenerationLabel: string;
    VerifiedBadge: string;
    VerifiedValue: string;
    UnverifiedValue: string;
    RecordedActionsLabel: string;
    DownloadForensicAuditSummary: string;
    DownloadForensicAuditHint: string;
    DownloadForensicAuditFailed: string;
  };
};

export function DashboardOverview({
  vendorAssessments,
  riskPosture,
  locale,
  openRemediationCount,
  isPremium = false,
  overdueAssessments = [],
  slaComplianceRate = 0,
  translations,
}: DashboardOverviewProps) {
  const score = supplyChainRiskScore(vendorAssessments);
  const pending = countByStatus(vendorAssessments, "pending");
  const inProgress = countByStatus(vendorAssessments, "incomplete");
  const completed = countByStatus(vendorAssessments, "completed");
  const [showCharts, setShowCharts] = useState(true);

  const tiles = [
    {
      label: translations.Pending,
      value: pending,
      icon: Mail,
      hint: translations.AwaitingVendorResponse,
    },
    {
      label: translations.Incomplete,
      value: inProgress,
      icon: ClipboardList,
      hint: translations.QuestionnaireUnderway,
    },
    {
      label: translations.Completed,
      value: completed,
      icon: UserCheck,
      hint: translations.AssessmentsClosed,
    },
    {
      label: translations.OpenRemediations,
      value: openRemediationCount,
      icon: ShieldAlert,
      hint: translations.OpenRemediationsHint,
      isRisk: true,
    },
  ];

  const radarData = riskPosture.categoryMetrics
    .filter((metric) => metric.questionCount > 0)
    .map((metric) => ({
      label: translations.categoryLabels[metric.key],
      shortLabel: translations.categoryShortLabels[metric.key],
      value: metric.averageScore,
    }));

  const barData = riskPosture.riskBuckets.map((bucket) => ({
    label: translations.riskLevelLabels[bucket.level],
    count: bucket.count,
    level: bucket.level,
  }));

  const summarySourceLabel =
    riskPosture.executiveSummary.source === "ai"
      ? translations.AIAnalysisLive
      : translations.AIAnalysisFallback;

  const recommendedCategory = riskPosture.executiveSummary.recommendedCategoryKey
    ? translations.categoryLabels[riskPosture.executiveSummary.recommendedCategoryKey]
    : translations.NoVendorData;

  const riskLabel =
    score > 70
      ? translations.riskLevelLabels.low
      : score >= 40
        ? translations.riskLevelLabels.medium
        : translations.riskLevelLabels.high;
  const isAllClear = score >= 80 && openRemediationCount === 0;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">
            {translations.Dashboard}
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {translations.DashboardDesc}
          </p>
        </div>
        <Button variant="secondary" asChild className="w-full sm:w-auto">
          <Link href={`/${locale}/vendors`}>{translations.ManageVendors}</Link>
        </Button>
      </div>

      <div>
        <p className="mb-3 text-[0.6875rem] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          {translations.RiskPostureLabel}
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6 lg:items-start">
          <Card className="col-span-1 lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">{translations.SupplyChainRiskScore}</CardTitle>
            <p className="text-sm font-normal text-[var(--muted-foreground)]">
              {translations.SupplyChainRiskScoreDesc}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center pb-8">
            <RiskGauge value={score} label={riskLabel} />
            <p
              className={cn(
                "mt-2 text-center text-xs font-medium",
                isAllClear ? "text-[var(--risk-low-fg)]" : scoreGaugeColor(score),
              )}
            >
              {!isAllClear && score < 40 && translations.ElevatedAttentionRecommended}
              {!isAllClear && score >= 40 && score <= 70 && translations.MonitorAndRemediateGaps}
              {!isAllClear && score > 70 && translations.WithinAcceptableBand}
              {isAllClear && (translations.PostureAcceptable ?? translations.WithinAcceptableBand)}
            </p>
          </CardContent>
          </Card>

          <div className="col-span-1 grid grid-cols-2 gap-4 lg:col-span-5">
            {tiles.map(({ label, value, icon: Icon, hint, isRisk }) => (
              <Card key={label}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                    {label}
                  </p>
                  <Icon className="h-4 w-4 text-[var(--primary)]" aria-hidden />
                </CardHeader>
                <CardContent>
                  <p
                    className={cn(
                      "text-xl font-semibold tabular-nums",
                        isRisk && value > 0 ? "text-[var(--risk-high)]" : undefined,
                    )}
                  >
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <hr className="border-t border-[var(--border)]" />

      <section className="space-y-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-[var(--foreground)]">
                <Radar className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
                {translations.RiskPostureOverview}
              </h2>
              {translations.RiskPostureOverviewTooltip ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      aria-label="More information about Risk Posture Overview"
                      tabIndex={0}
                      className="inline-flex cursor-help mt-0.5"
                    >
                      <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[280px]">
                    <p>{translations.RiskPostureOverviewTooltip}</p>
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            <p className="text-sm text-[var(--muted-foreground)]">
              {translations.RiskPostureOverviewDesc}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCharts((prev) => !prev)}
              aria-expanded={showCharts}
              aria-controls="risk-posture-charts"
              className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]/50 hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            >
              {showCharts ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                  {translations.HidePostureAnalytics}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  {translations.ShowPostureAnalytics}
                </>
              )}
            </button>
            <div className="rounded-[var(--radius-badge)] border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
              {summarySourceLabel}
            </div>
            <RefreshAiSummaryButton
              labels={{ idle: translations.RefreshAISummary, pending: translations.RefreshAISummaryPending }}
            />
          </div>
        </div>

        <div
          id="risk-posture-charts"
          className={showCharts ? undefined : "hidden"}
          aria-hidden={!showCharts}
        >
            <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
              <Card className="overflow-hidden border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card-featured)]">
                <CardHeader className="border-b border-[var(--border)] pb-4">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{translations.CategoryComplianceRadarTitle}</CardTitle>
                    {translations.CategoryComplianceRadarTooltip ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            aria-label="More information about Compliance by Category"
                            tabIndex={0}
                            className="inline-flex cursor-help mt-0.5"
                          >
                            <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[280px]">
                          <p>{translations.CategoryComplianceRadarTooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {translations.CategoryComplianceRadarDesc}
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="min-h-[320px]">
                    <CategoryComplianceRadarChartLazy
                      data={radarData}
                      legendLabel={translations.AverageComplianceLegend}
                      emptyLabel={translations.NoVendorData}
                      hoverHint={translations.CategoryComplianceRadarHoverHint}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4">
                <Card className="overflow-hidden border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card-featured)]">
                  <CardHeader className="border-b border-[var(--border)] pb-4">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{translations.VendorsByRiskLevelTitle}</CardTitle>
                      {translations.VendorsByRiskLevelTooltip ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              aria-label="More information about Vendors by Risk Level"
                              tabIndex={0}
                              className="inline-flex cursor-help mt-0.5"
                            >
                              <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[280px]">
                            <p>{translations.VendorsByRiskLevelTooltip}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {translations.VendorsByRiskLevelDesc}
                    </p>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="min-h-[320px]">
                      <VendorsByRiskBarChartLazy
                        data={barData}
                        legendLabel={translations.VendorCountLegend}
                        emptyLabel={translations.NoVendorData}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

        <Card className="overflow-hidden border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-[var(--shadow-card-featured)]">
          <CardHeader className="border-b border-[var(--border)] pb-4">
            <div className="flex items-center gap-2 text-[var(--primary)]">
              <BrainCircuit className="h-4 w-4" aria-hidden />
              <CardTitle className="text-base text-card-foreground">
                {translations.AIExecutiveSummary}
              </CardTitle>
            </div>
            <p className="text-sm text-[var(--muted-foreground)]">
              {translations.AIExecutiveSummaryDesc}
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            <ul className="divide-y divide-border text-sm leading-6 text-foreground">
              <li className="flex gap-3 py-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="font-semibold">{translations.BiggestSystemicRisk}</span>{" "}
                  <span className="prose prose-sm dark:prose-invert max-w-none [&_p]:inline [&_p]:m-0">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {riskPosture.executiveSummary.systemicRisk}
                    </ReactMarkdown>
                  </span>
                </span>
              </li>
              <li className="flex gap-3 py-3">
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="font-semibold">{translations.AverageRemediationTime}</span>{" "}
                  {riskPosture.executiveSummary.averageRemediationTimeDays} {translations.Days}
                </span>
              </li>
              <li className="flex gap-3 py-3">
                <Radar className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="font-semibold">{translations.RecommendedNextStep}</span>{" "}
                  {recommendedCategory}
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* TODO: i18n - SLA strings not yet in translations system */}
      {isPremium && (overdueAssessments.length > 0 || slaComplianceRate > 0) && (
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--foreground)]">
              SLA Tracking
            </h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Monitor assessment SLA compliance and overdue vendors
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">SLA Compliance Rate</CardTitle>
                <p className="text-sm font-normal text-[var(--muted-foreground)]">
                  Percentage of assessments meeting SLA targets
                </p>
              </CardHeader>
              <CardContent>
                <p className="font-display text-3xl font-semibold tabular-nums">
                  {Math.round(slaComplianceRate)}%
                </p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Based on completed assessments in last 90 days
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Overdue Assessments</CardTitle>
                <p className="text-sm font-normal text-[var(--muted-foreground)]">
                  Vendors requiring immediate attention
                </p>
              </CardHeader>
              <CardContent>
                <p className="font-display text-3xl font-semibold tabular-nums text-[var(--risk-high-fg)]">
                  {overdueAssessments.length}
                </p>
                {overdueAssessments.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-xs list-none">
                    {overdueAssessments.slice(0, 3).map((a) => (
                      <li key={a.id} className="text-[var(--muted-foreground)]">
                        <Link
                          href={`/${locale}/vendors`}
                          className="font-medium underline-offset-2 hover:underline hover:text-[var(--foreground)] transition-colors"
                        >
                          {a.vendor?.name ?? "Unknown vendor"}
                        </Link>
                        {" "}({a.daysOverdue} days overdue)
                      </li>
                    ))}
                    {overdueAssessments.length > 3 && (
                      <li className="text-[var(--muted-foreground)]">
                        + {overdueAssessments.length - 3} more
                      </li>
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      <ComplianceTrustWidgetLazy
        metrics={riskPosture.complianceTrust}
        translations={{
          title: translations.ComplianceTrustWidgetTitle,
          description: translations.ComplianceTrustWidgetDesc,
          aiDecisionTransparency: translations.AITransparencyMetric,
          humanOversightRate: translations.HumanOversightMetric,
          systemIntegrity: translations.SystemIntegrityMetric,
          aiGenerationLabel: translations.AIGenerationLabel,
          verifiedBadge: translations.VerifiedBadge,
          verifiedValue: translations.VerifiedValue,
          unverifiedValue: translations.UnverifiedValue,
          recordedActionsLabel: translations.RecordedActionsLabel,
          downloadButton: translations.DownloadForensicAuditSummary,
          downloadHint: translations.DownloadForensicAuditHint,
          downloadFailed: translations.DownloadForensicAuditFailed,
        }}
      />
    </div>
  );
}
