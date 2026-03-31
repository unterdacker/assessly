import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

export default async function Home() {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = hasLocale(routing.locales, localeCookie)
    ? localeCookie
    : routing.defaultLocale;

  redirect(`/${locale}/dashboard`);
}
