import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DashboardOverview } from "@/components/dashboard-overview";
import { listVendorAssessments } from "@/lib/queries/vendor-assessments";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("Dashboard"),
    description: t("DashboardDesc"),
  };
}

export default async function DashboardPage() {
  const t = await getTranslations();
  const vendorAssessments = await listVendorAssessments();

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
    ManageVendors: t("ManageVendors"),
    ElevatedAttentionRecommended: t("ElevatedAttentionRecommended"),
    MonitorAndRemediateGaps: t("MonitorAndRemediateGaps"),
    WithinAcceptableBand: t("WithinAcceptableBand"),
    TrustAndCompliance: t("TrustAndCompliance"),
    TrustComplianceDesc: t("TrustComplianceDesc"),
    RiskColoring: t("RiskColoring"),
    AssessmentWorkspace: t("AssessmentWorkspace"),
    InviteNewVendors: t("InviteNewVendors"),
  };

  return <DashboardOverview vendorAssessments={vendorAssessments} translations={translations} />;
}
