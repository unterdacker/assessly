import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VendorsTableSection } from "@/components/vendors-table-section";
import { listVendorAssessments } from "@/lib/queries/vendor-assessments";
import { requirePageRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("vendors");
  return {
    title: t("metaTitle"),
    description: t("metaDesc"),
  };
}

type VendorsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function VendorsPage({ params }: VendorsPageProps) {
  const { locale } = await params;
  const session = await requirePageRole(["ADMIN", "AUDITOR"], locale);
  const vendorAssessments = await listVendorAssessments();
  return <VendorsTableSection vendorAssessments={vendorAssessments} role={session.role} />;
}
