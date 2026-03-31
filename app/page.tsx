import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getOptionalAuthSession } from "@/lib/auth/server";
import { getRoleLandingPath } from "@/lib/auth/permissions";

export default async function Home() {
  const cookieStore = await cookies();
  const session = await getOptionalAuthSession();
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = hasLocale(routing.locales, localeCookie)
    ? localeCookie
    : routing.defaultLocale;

  if (!session) {
    redirect(`/${locale}/auth/sign-in`);
  }

  redirect(`/${locale}${getRoleLandingPath(session.role)}`);
}
