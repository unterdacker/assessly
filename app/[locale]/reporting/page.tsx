import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import ReportingPage from "@/modules/advanced-reporting/pages/reporting-page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  return { title: "Executive Reporting | Venshield" };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReportingPage locale={locale} />;
}
