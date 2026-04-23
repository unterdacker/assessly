import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { DashboardOverview } from "@/components/dashboard-overview";
import { getDashboardRiskPostureOverview } from "@/lib/queries/dashboard-risk-posture";
import { listVendorAssessments } from "@/lib/queries/vendor-assessments";
import { requirePageRole } from "@/lib/auth/server";
import { countOpenRemediationTasks } from "@/lib/queries/remediation-tasks";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("Dashboard"),
    description: t("DashboardDesc"),
  };
}

type DashboardPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale: routeLocale } = await params;
  const session = await requirePageRole(["ADMIN", "RISK_REVIEWER", "AUDITOR"], routeLocale);
  const t = await getTranslations();
  const locale = (await getLocale()) as "en" | "de";
  const [vendorAssessments, riskPosture, openRemediationCount] = await Promise.all([
    listVendorAssessments(),
    getDashboardRiskPostureOverview(locale),
    countOpenRemediationTasks(session.companyId ?? ""),
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
    CategoryComplianceRadarTitle: t("CategoryComplianceRadarTitle"),
    CategoryComplianceRadarDesc: t("CategoryComplianceRadarDesc"),
    CategoryComplianceRadarHoverHint: t("CategoryComplianceRadarHoverHint"),
    VendorsByRiskLevelTitle: t("VendorsByRiskLevelTitle"),
    VendorsByRiskLevelDesc: t("VendorsByRiskLevelDesc"),
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

  return (
    <DashboardOverview
      vendorAssessments={vendorAssessments}
      riskPosture={riskPosture}
      role={session.role}
      locale={locale}
      openRemediationCount={openRemediationCount}
      translations={translations}
    />
  );
}
