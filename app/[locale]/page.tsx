import { getTranslations } from "next-intl/server";

type LocaleHomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LocaleHomePage({ params }: LocaleHomePageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <h1 className="text-2xl font-semibold">{t("Welcome")}</h1>
      <p className="text-sm text-muted-foreground">{t("LocaleLandingReady")}</p>
    </main>
  );
}
