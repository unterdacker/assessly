import type { Metadata } from "next";
import { DashboardOverview } from "@/components/dashboard-overview";
import { listVendorAssessments } from "@/lib/queries/vendor-assessments";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Third-party and supply-chain risk overview for NIS2 Article 21 oversight. Vendor and assessment data are loaded from the application database; host in EU regions with privacy-preserving logs and EU-bound AI in production.",
};

export default async function DashboardPage() {
  const vendorAssessments = await listVendorAssessments();

  return <DashboardOverview vendorAssessments={vendorAssessments} />;
}
