import type { Metadata } from "next";
import { VendorsTableSection } from "@/components/vendors-table-section";
import { listVendorAssessments } from "@/lib/queries/vendor-assessments";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vendors",
  description:
    "Vendor assessments and NIS2-aligned workspaces. Data is served from the AVRA database.",
};

export default async function VendorsPage() {
  const vendorAssessments = await listVendorAssessments();

  return <VendorsTableSection vendorAssessments={vendorAssessments} />;
}
