import { redirect } from "next/navigation";
import { getOptionalAuthSession } from "@/lib/auth/server";
import { getRoleLandingPath } from "@/lib/auth/permissions";

type LocaleHomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LocaleHomePage({ params }: LocaleHomePageProps) {
  const { locale } = await params;
  const session = await getOptionalAuthSession();

  if (!session) {
    redirect(`/${locale}/auth/sign-in`);
  }

  redirect(`/${locale}${getRoleLandingPath(session.role)}`);
}
