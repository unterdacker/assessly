import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InternalSignInForm } from "@/components/internal-sign-in-form";
import { getOptionalAuthSession } from "@/lib/auth/server";
import { getRoleLandingPath } from "@/lib/auth/permissions";

type SignInPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
};

export default async function SignInPage({ params, searchParams }: SignInPageProps) {
  const [{ locale }, { next }] = await Promise.all([params, searchParams]);
  const session = await getOptionalAuthSession();

  if (session && session.role !== "VENDOR") {
    redirect(`/${locale}${getRoleLandingPath(session.role)}`);
  }

  const nextPath = typeof next === "string" && next.startsWith("/") ? next : "";
  const t = await getTranslations("SignIn");

  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl items-center px-6 py-12">
      <div className="grid w-full gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("badge")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {t("headline")}
          </h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            {t("isolationNotice")}
          </p>
        </div>
        <InternalSignInForm locale={locale} nextPath={nextPath} />
      </div>
    </main>
  );
}