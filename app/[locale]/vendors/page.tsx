import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VendorsTableSection } from "@/components/vendors-table-section";
import { listVendorAssessments } from "@/lib/queries/vendor-assessments";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("vendors");
  return {
    title: t("metaTitle"),
    description: t("metaDesc"),
  };
}

export default async function VendorsPage() {
  const vendorAssessments = await listVendorAssessments();
  return <VendorsTableSection vendorAssessments={vendorAssessments} />;
}
