import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import ReportDetailPage from "@/modules/advanced-reporting/pages/report-detail-page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; reportId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  return { title: "Report Details | Assessly" };
}

export default async function Page({ params }: Props) {
  const { locale, reportId } = await params;
  setRequestLocale(locale);
  return <ReportDetailPage locale={locale} reportId={reportId} />;
}
