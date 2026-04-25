import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ForgotPasswordPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
  const { locale } = await params;
  let title = "Reset your password";
  let description = "Password resets are managed by your administrator. Contact your IT admin or use SSO to sign in.";
  let backToSignIn = "\u2190 Back to sign in";

  try {
    const t = await getTranslations("ForgotPassword");
    title = t("title");
    description = t("description");
    backToSignIn = t("backToSignIn");
  } catch {
    // Fallback strings keep the page render-safe if i18n context fails.
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
        <ThemeToggle />
        <LanguageToggle />
      </div>
      <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl items-center justify-center px-8 py-12">
        <Card className="mx-auto w-full max-w-md border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="font-semibold tracking-tight text-foreground">{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-[0.8125rem] text-muted-foreground">{description}</p>
            <Link
              href={`/${locale}/auth/sign-in`}
              className="inline-flex text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {backToSignIn}
            </Link>
          </CardContent>
        </Card>
      </main>
    </>
  );
}