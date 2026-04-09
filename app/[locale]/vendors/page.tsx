import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VendorsTableSection } from "@/components/vendors-table-section";
import { listVendorAssessmentsPaginated, VENDORS_PAGE_SIZE } from "@/lib/queries/vendor-assessments";
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
  searchParams: Promise<{ page?: string }>;
};

export default async function VendorsPage({ params, searchParams }: VendorsPageProps) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  const session = await requirePageRole(["SUPER_ADMIN", "ADMIN", "RISK_REVIEWER", "AUDITOR"], locale);

  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const { items: vendorAssessments, total, pageCount } = await listVendorAssessmentsPaginated(
    page,
    VENDORS_PAGE_SIZE,
  );

  return (
    <VendorsTableSection
      vendorAssessments={vendorAssessments}
      role={session.role}
      pagination={{ page, pageCount, total, pageSize: VENDORS_PAGE_SIZE }}
    />
  );
}
