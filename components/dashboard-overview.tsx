import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UserRole } from "@prisma/client";
import { ClipboardList, Mail, Radar, ShieldAlert, Sparkles, UserCheck } from "lucide-react";
import {
  countByStatus,
  supplyChainRiskScore,
  type VendorAssessment,
} from "@/lib/vendor-assessment";
import type { DashboardRiskPostureOverview } from "@/lib/queries/dashboard-risk-posture";
import { scoreGaugeColor } from "@/lib/score-colors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskGauge } from "@/components/risk-gauge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CategoryComplianceRadarChartLazy } from "@/components/category-compliance-radar-chart-lazy";
import { VendorsByRiskBarChartLazy } from "@/components/vendors-by-risk-bar-chart-lazy";
import { ComplianceTrustWidget } from "@/components/compliance-trust-widget";
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
    TrustAndCompliance: string;
    TrustComplianceDesc: string;
    RiskColoring: string;
    AssessmentWorkspace: string;
    InviteNewVendors: string;
    RiskPostureOverview: string;
    RiskPostureOverviewDesc: string;
    CategoryComplianceRadarTitle: string;
    CategoryComplianceRadarDesc: string;
    VendorsByRiskLevelTitle: string;
    VendorsByRiskLevelDesc: string;
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
  role,
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
    },
  ] as const;

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
    color:
      bucket.level === "low"
        ? "#2f9e44"
        : bucket.level === "medium"
          ? "#d97706"
          : "#dc2626",
  }));

  const summarySourceLabel =
    riskPosture.executiveSummary.source === "ai"
      ? translations.AIAnalysisLive
      : translations.AIAnalysisFallback;

  const recommendedCategory = riskPosture.executiveSummary.recommendedCategoryKey
    ? translations.categoryLabels[riskPosture.executiveSummary.recommendedCategoryKey]
    : translations.NoVendorData;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {translations.Dashboard}
          </h1>
          <p className="text-sm text-muted-foreground">
            {translations.DashboardDesc}
          </p>
        </div>
        <Button variant="secondary" asChild className="w-full sm:w-auto">
          <Link href={`/${locale}/vendors`}>{translations.ManageVendors}</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">{translations.SupplyChainRiskScore}</CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              {translations.SupplyChainRiskScoreDesc}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center pb-8">
            <RiskGauge value={score} />
            <p
              className={cn(
                "mt-2 text-center text-xs font-medium",
                scoreGaugeColor(score),
              )}
            >
              {score < 40 && translations.ElevatedAttentionRecommended}
              {score >= 40 && score <= 70 && translations.MonitorAndRemediateGaps}
              {score > 70 && translations.WithinAcceptableBand}
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-2">
          {tiles.map(({ label, value, icon: Icon, hint }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {label}
                </CardTitle>
                <Icon className="h-4 w-4 text-indigo-600 opacity-80 dark:text-indigo-400" aria-hidden />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-300/80 bg-slate-100/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <Radar className="h-3.5 w-3.5" aria-hidden />
              {translations.RiskPostureOverview}
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">
              {translations.RiskPostureOverview}
            </h2>
            <p className="text-sm text-muted-foreground">
              {translations.RiskPostureOverviewDesc}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
              {summarySourceLabel}
            </div>
            <RefreshAiSummaryButton
              labels={{ idle: translations.RefreshAISummary, pending: translations.RefreshAISummaryPending }}
            />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
          <Card className="overflow-hidden border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.38)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
            <CardHeader className="border-b border-slate-200/80 bg-white/60 pb-4 dark:border-slate-800 dark:bg-slate-950/40">
              <CardTitle className="text-base">{translations.CategoryComplianceRadarTitle}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {translations.CategoryComplianceRadarDesc}
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="min-h-[320px]">
                <CategoryComplianceRadarChartLazy
                  data={radarData}
                  legendLabel={translations.AverageComplianceLegend}
                  emptyLabel={translations.NoVendorData}
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card className="overflow-hidden border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.38)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
              <CardHeader className="border-b border-slate-200/80 bg-white/60 pb-4 dark:border-slate-800 dark:bg-slate-950/40">
                <CardTitle className="text-base">{translations.VendorsByRiskLevelTitle}</CardTitle>
                <p className="text-sm text-muted-foreground">
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

            <Card className="overflow-hidden border-border bg-card text-card-foreground shadow-[0_18px_50px_-28px_rgba(15,23,42,0.38)]">
              <CardHeader className="border-b border-border pb-4">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  <CardTitle className="text-base text-card-foreground">
                    {translations.AIExecutiveSummary}
                  </CardTitle>
                </div>
                <p className="text-sm text-muted-foreground">
                  {translations.AIExecutiveSummaryDesc}
                </p>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-3 text-sm leading-6 text-foreground">
                  <li className="flex gap-3 rounded-xl border border-border bg-muted p-3">
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
                  <li className="flex gap-3 rounded-xl border border-border bg-muted p-3">
                    <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="font-semibold">{translations.AverageRemediationTime}</span>{" "}
                      {riskPosture.executiveSummary.averageRemediationTimeDays} {translations.Days}
                    </span>
                  </li>
                  <li className="flex gap-3 rounded-xl border border-border bg-muted p-3">
                    <Radar className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="font-semibold">{translations.RecommendedNextStep}</span>{" "}
                      {recommendedCategory}
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{translations.TrustAndCompliance}</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            {translations.TrustComplianceDesc}
          </p>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>{translations.RiskColoring}</li>
            <li>{translations.AssessmentWorkspace}</li>
            {role === "ADMIN" ? <li>{translations.InviteNewVendors}</li> : null}
          </ul>
        </CardContent>
      </Card>

      {isPremium && (overdueAssessments.length > 0 || slaComplianceRate > 0) && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">
              SLA Tracking
            </h2>
            <p className="text-sm text-muted-foreground">
              Monitor assessment SLA compliance and overdue vendors
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">SLA Compliance Rate</CardTitle>
                <p className="text-sm font-normal text-muted-foreground">
                  Percentage of assessments meeting SLA targets
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">
                  {Math.round(slaComplianceRate)}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Based on completed assessments in last 90 days
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Overdue Assessments</CardTitle>
                <p className="text-sm font-normal text-muted-foreground">
                  Vendors requiring immediate attention
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums text-destructive">
                  {overdueAssessments.length}
                </p>
                {overdueAssessments.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-xs">
                    {overdueAssessments.slice(0, 3).map((a) => (
                      <li key={a.id} className="text-muted-foreground">
                        • {a.vendor?.name ?? "Unknown vendor"} ({a.daysOverdue} days overdue)
                      </li>
                    ))}
                    {overdueAssessments.length > 3 && (
                      <li className="text-muted-foreground">
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

      <ComplianceTrustWidget
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
