import { redirect } from "next/navigation";
import { MfaVerifyForm } from "@/components/mfa-verify-form";
import { getMfaPendingClaims } from "@/lib/auth/mfa-pending";
import { getOptionalAuthSession } from "@/lib/auth/server";
import { getRoleLandingPath } from "@/lib/auth/permissions";

type MfaVerifyPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function MfaVerifyPage({ params }: MfaVerifyPageProps) {
  const { locale } = await params;

  // If the user has a full session already, redirect to their dashboard.
  const session = await getOptionalAuthSession();
  if (session) {
    redirect(`/${locale}${getRoleLandingPath(session.role)}`);
  }

  // If there is no valid pending MFA cookie, the user hasn't completed
  // password auth — send them back to sign-in.
  const claims = await getMfaPendingClaims();
  if (!claims) {
    redirect(`/${locale}/auth/sign-in`);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl items-center px-6 py-12">
      <div className="grid w-full gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Two-Factor Authentication
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Verify your identity
          </h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Open your authenticator app and enter the 6-digit verification code to continue.
          </p>
        </div>
        <MfaVerifyForm locale={locale} />
      </div>
    </main>
  );
}
