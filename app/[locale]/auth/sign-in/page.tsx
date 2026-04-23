import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InternalSignInForm } from "@/components/internal-sign-in-form";
import { getOptionalAuthSession } from "@/lib/auth/server";
import { getRoleLandingPath } from "@/lib/auth/permissions";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import Image from "next/image";

type SignInPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function SignInPage({ params, searchParams }: SignInPageProps) {
  const [{ locale }, { next, error }] = await Promise.all([params, searchParams]);
  const session = await getOptionalAuthSession();

  if (session && session.role !== "VENDOR") {
    redirect(`/${locale}${getRoleLandingPath(session.role)}`);
  }

  const nextPath = typeof next === "string" && next.startsWith("/") ? next : "";
  const t = await getTranslations("SignIn");

  return (
    <>
      <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
        <ThemeToggle />
        <LanguageToggle />
      </div>
      <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl items-center px-8 py-12">
        <div className="grid w-full gap-16 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div className="space-y-4">
            <Image
              src="/logo.png"
              alt="Venshield"
              width={56}
              height={56}
              className="rounded-xl"
              priority
            />
            <p className="font-display text-[0.625rem] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              {t("badge")}
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              {t("headline")}
            </h1>
            <p className="max-w-xl text-[0.8125rem] leading-relaxed text-[var(--muted-foreground)]">
              {t("isolationNotice")}
            </p>
          </div>
          <InternalSignInForm
            locale={locale}
            nextPath={nextPath}
            initialError={typeof error === "string" ? error : null}
          />
        </div>
      </main>
    </>
  );
}