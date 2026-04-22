import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function ExternalExitPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
          <ShieldCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{t("ExternalExitTitle")}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t("ExternalExitDesc")}
        </p>
        <Button asChild className="w-full">
          <Link href="/external/portal">{t("ReturnToAccessPortal")}</Link>
        </Button>
      </div>
    </main>
  );
}
