import { redirect } from "next/navigation";

type LocaleHomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LocaleHomePage({ params }: LocaleHomePageProps) {
  const { locale } = await params;
  redirect(`/${locale}/auth/sign-in`);
}
