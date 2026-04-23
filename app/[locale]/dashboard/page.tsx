import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardOverview } from "@/components/dashboard-overview";
import { DashboardAnalyticsSection } from "@/components/dashboard-analytics-section";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { PortfolioComplianceWidget } from "@/components/portfolio-compliance-widget";
import { ComplianceTimelineChartLazy } from "@/components/compliance-timeline-chart-lazy";
import { DashboardCountsRow } from "@/modules/analytics/components/dashboard-counts-row";
import { StatusBreakdownBar } from "@/modules/analytics/components/status-breakdown-bar";
import { getDashboardRiskPostureOverview } from "@/lib/queries/dashboard-risk-posture";
import { listVendorAssessments } from "@/lib/queries/vendor-assessments";
import { requirePageRole } from "@/lib/auth/server";
import { countOpenRemediationTasks } from "@/lib/queries/remediation-tasks";
import { listOverdueAssessments, getSlaComplianceRate } from "@/modules/sla-tracking/lib/sla-queries";
import { getComplianceTimeline } from "@/modules/continuous-monitoring/actions/schedule-actions";
import { queryDashboardCounts } from "@/modules/analytics/lib/queries";
import { isPremiumFeatureEnabled } from "@/lib/enterprise-bridge";
import type { ComplianceSnapshotItem } from "@/modules/continuous-monitoring/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: DashboardPageProps): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return {
    title: t("Dashboard"),
    description: t("DashboardDesc"),
  };
}

type DashboardPageProps = {
  params: Promise<{ locale: string }>;
};

type DashboardContentProps = {
  session: Awaited<ReturnType<typeof requirePageRole>>;
  locale: "en" | "de";
};

async function DashboardContent({ session, locale }: DashboardContentProps) {
  setRequestLocale(locale);
  const t = await getTranslations();
  const isPremium = await isPremiumFeatureEnabled(session.companyId ?? "");

  // Fetch compliance data for Premium users
  let portfolioScore = 0;
  let portfolioTrend: "up" | "down" | "stable" = "stable";
  let complianceSnapshots: ComplianceSnapshotItem[] = [];

  if (isPremium) {
    const result = await getComplianceTimeline(2);
    if (result.success && result.data.length > 0) {
      portfolioScore = result.data[0].overallScore;
      complianceSnapshots = result.data;
      if (result.data.length >= 2) {
        const diff = result.data[0].overallScore - result.data[1].overallScore;
        portfolioTrend = diff > 1 ? "up" : diff < -1 ? "down" : "stable";
      }
    }
  }

  const [vendorAssessments, riskPosture, openRemediationCount, overdueAssessments, slaComplianceRate, dashboardCounts] = await Promise.all([
    listVendorAssessments(),
    getDashboardRiskPostureOverview(locale),
    countOpenRemediationTasks(session.companyId ?? ""),
    isPremium ? listOverdueAssessments(session.companyId ?? "", 100).catch(() => []) : Promise.resolve([]),
    isPremium ? getSlaComplianceRate(session.companyId ?? "").catch(() => 0) : Promise.resolve(0),
    queryDashboardCounts(session.companyId ?? ""),
  ]);

  const translations = {
    Dashboard: t("Dashboard"),
    DashboardDesc: t("DashboardDesc"),
    SupplyChainRiskScore: t("SupplyChainRiskScore"),
    SupplyChainRiskScoreDesc: t("SupplyChainRiskScoreDesc"),
    Pending: t("Pending"),
    AwaitingVendorResponse: t("AwaitingVendorResponse"),
    Incomplete: t("Incomplete"),
    QuestionnaireUnderway: t("QuestionnaireUnderway"),
    Completed: t("Completed"),
    AssessmentsClosed: t("AssessmentsClosed"),
    OpenRemediations: t("OpenRemediations"),
    OpenRemediationsHint: t("OpenRemediationsHint"),
    ManageVendors: t("ManageVendors"),
    ElevatedAttentionRecommended: t("ElevatedAttentionRecommended"),
    MonitorAndRemediateGaps: t("MonitorAndRemediateGaps"),
    WithinAcceptableBand: t("WithinAcceptableBand"),
    PostureAcceptable: t("PostureAcceptable"),
    TrustAndCompliance: t("TrustAndCompliance"),
    TrustComplianceDesc: t("TrustComplianceDesc"),
    RiskColoring: t("RiskColoring"),
    AssessmentWorkspace: t("AssessmentWorkspace"),
    InviteNewVendors: t("InviteNewVendors"),
    RiskPostureLabel: t("RiskPostureLabel"),
    RiskPostureOverview: t("RiskPostureOverview"),
    RiskPostureOverviewDesc: t("RiskPostureOverviewDesc"),
    RiskPostureOverviewTooltip: t("RiskPostureOverviewTooltip"),
    CategoryComplianceRadarTitle: t("CategoryComplianceRadarTitle"),
    CategoryComplianceRadarDesc: t("CategoryComplianceRadarDesc"),
    CategoryComplianceRadarTooltip: t("CategoryComplianceRadarTooltip"),
    CategoryComplianceRadarHoverHint: t("CategoryComplianceRadarHoverHint"),
    VendorsByRiskLevelTitle: t("VendorsByRiskLevelTitle"),
    VendorsByRiskLevelDesc: t("VendorsByRiskLevelDesc"),
    VendorsByRiskLevelTooltip: t("VendorsByRiskLevelTooltip"),
    AIExecutiveSummary: t("AIExecutiveSummary"),
    AIExecutiveSummaryDesc: t("AIExecutiveSummaryDesc"),
    BiggestSystemicRisk: t("BiggestSystemicRisk"),
    AverageRemediationTime: t("AverageRemediationTime"),
    RecommendedNextStep: t("RecommendedNextStep"),
    Days: t("Days"),
    AverageComplianceLegend: t("AverageComplianceLegend"),
    VendorCountLegend: t("VendorCountLegend"),
    NoVendorData: t("NoVendorData"),
    AIAnalysisLive: t("AIAnalysisLive"),
    AIAnalysisFallback: t("AIAnalysisFallback"),
    RefreshAISummary: t("RefreshAISummary"),
    RefreshAISummaryPending: t("RefreshAISummaryPending"),
    HidePostureAnalytics: t("HidePostureAnalytics"),
    ShowPostureAnalytics: t("ShowPostureAnalytics"),
    categoryLabels: {
      governanceRisk: t("DashboardCategoryGovernanceRisk"),
      accessIdentity: t("DashboardCategoryAccessIdentity"),
      dataProtectionPrivacy: t("DashboardCategoryDataProtectionPrivacy"),
      encryption: t("DashboardCategoryEncryption"),
      operationsMonitoring: t("DashboardCategoryOperationsMonitoring"),
      incidentManagement: t("DashboardCategoryIncidentManagement"),
      supplyChainSecurity: t("DashboardCategorySupplyChainSecurity"),
    },
    categoryShortLabels: {
      governanceRisk: t("DashboardCategoryGovernanceRiskShort"),
      accessIdentity: t("DashboardCategoryAccessIdentityShort"),
      dataProtectionPrivacy: t("DashboardCategoryDataProtectionPrivacyShort"),
      encryption: t("DashboardCategoryEncryptionShort"),
      operationsMonitoring: t("DashboardCategoryOperationsMonitoringShort"),
      incidentManagement: t("DashboardCategoryIncidentManagementShort"),
      supplyChainSecurity: t("DashboardCategorySupplyChainSecurityShort"),
    },
    riskLevelLabels: {
      low: t("DashboardRiskLow"),
      medium: t("DashboardRiskMedium"),
      high: t("DashboardRiskHigh"),
    },
    ComplianceTrustWidgetTitle: t("ComplianceTrustWidgetTitle"),
    ComplianceTrustWidgetDesc: t("ComplianceTrustWidgetDesc"),
    AITransparencyMetric: t("AITransparencyMetric"),
    HumanOversightMetric: t("HumanOversightMetric"),
    SystemIntegrityMetric: t("SystemIntegrityMetric"),
    AIGenerationLabel: t("AIGenerationLabel"),
    VerifiedBadge: t("VerifiedBadge"),
    VerifiedValue: t("VerifiedValue"),
    UnverifiedValue: t("UnverifiedValue"),
    RecordedActionsLabel: t("RecordedActionsLabel"),
    DownloadForensicAuditSummary: t("DownloadForensicAuditSummary"),
    DownloadForensicAuditHint: t("DownloadForensicAuditHint"),
    DownloadForensicAuditFailed: t("DownloadForensicAuditFailed"),
  };

  const analyticsCountsLabels = {
    title: t("Analytics.overview.counts.title"),
    vendors: t("Analytics.overview.counts.vendors"),
    assessmentsSent: t("Analytics.overview.counts.assessmentsSent"),
    completed: t("Analytics.overview.counts.completed"),
    overdue: t("Analytics.overview.counts.overdue"),
  };

  const analyticsStatusLabels = {
    title: t("Analytics.overview.statusBreakdown.title"),
    noData: t("Analytics.overview.statusBreakdown.noData"),
    statuses: {
      PENDING: t("Analytics.statuses.PENDING"),
      UNDER_REVIEW: t("Analytics.statuses.UNDER_REVIEW"),
      SUBMITTED: t("Analytics.statuses.SUBMITTED"),
      REVIEWER_APPROVED: t("Analytics.statuses.REVIEWER_APPROVED"),
      SIGN_OFF: t("Analytics.statuses.SIGN_OFF"),
      COMPLETED: t("Analytics.statuses.COMPLETED"),
      REJECTED: t("Analytics.statuses.REJECTED"),
      ARCHIVED: t("Analytics.statuses.ARCHIVED"),
    },
  };

  const cmTranslations = isPremium ? {
    widget: {
      title: t("ContinuousMonitoring.widget.title"),
      trendUp: t("ContinuousMonitoring.widget.trendUp"),
      trendDown: t("ContinuousMonitoring.widget.trendDown"),
      trendStable: t("ContinuousMonitoring.widget.trendStable"),
      scoreLabel: t("ContinuousMonitoring.widget.scoreLabel"),
      widgetTooltip: t("PortfolioComplianceWidgetTooltip"),
      riskLabel:
        portfolioScore > 70
          ? t("DashboardRiskLow")
          : portfolioScore >= 40
            ? t("DashboardRiskMedium")
            : t("DashboardRiskHigh"),
      vendors: t("ContinuousMonitoring.widget.vendors"),
      noData: t("ContinuousMonitoring.widget.noData"),
      noDataCta: t("ContinuousMonitoring.widget.noDataCta"),
      noDataExplanation: t("ContinuousMonitoring.widget.noDataExplanation"),
    },
    chart: {
      title: t("ContinuousMonitoring.timeline.title"),
      noData: t("ContinuousMonitoring.timeline.noData"),
      xAxisLabel: t("ContinuousMonitoring.timeline.xAxis"),
      yAxisLabel: t("ContinuousMonitoring.timeline.yAxis"),
    },
  } : null;

  return (
    <>
      <DashboardOverview
        isPremium={isPremium}
        overdueAssessments={overdueAssessments}
        slaComplianceRate={slaComplianceRate}
        vendorAssessments={vendorAssessments}
        riskPosture={riskPosture}
        role={session.role}
        locale={locale}
        openRemediationCount={openRemediationCount}
        translations={translations}
      />

      <DashboardAnalyticsSection
        label={t("AnalyticsSectionTitle")}
        toggleOpenLabel={t("AnalyticsSectionShow")}
        toggleCloseLabel={t("AnalyticsSectionHide")}
      >
        {/* Analytics Overview */}
        <div className="space-y-6 pb-8">
          <DashboardCountsRow
            counts={dashboardCounts}
            labels={analyticsCountsLabels}
          />
          <StatusBreakdownBar
            byStatus={dashboardCounts.byStatus}
            labels={analyticsStatusLabels}
          />
          {isPremium && cmTranslations && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <div className="lg:col-span-1">
                <PortfolioComplianceWidget
                  score={portfolioScore}
                  trend={portfolioTrend}
                  vendorCount={vendorAssessments.length}
                  translations={cmTranslations.widget}
                />
              </div>
              <div className="lg:col-span-2">
                <ComplianceTimelineChartLazy
                  snapshots={complianceSnapshots}
                  translations={cmTranslations.chart}
                />
              </div>
            </div>
          )}
        </div>
      </DashboardAnalyticsSection>
    </>
  );
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale: routeLocale } = await params;
  setRequestLocale(routeLocale);
  const session = await requirePageRole(["ADMIN", "RISK_REVIEWER", "AUDITOR"], routeLocale);
  const locale = routeLocale as "en" | "de";

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent session={session} locale={locale} />
    </Suspense>
  );
}
