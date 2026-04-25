"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type FocusEvent } from "react";
import { useTranslations } from "next-intl";
import { LockKeyhole } from "lucide-react";
import { authenticateInternalUser } from "@/app/actions/internal-auth";
import type { InternalSignInState } from "@/app/actions/internal-auth.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const errorKeyMap: Record<string, string> = {
  REQUIRED: "errorRequired",
  INVALID_CREDENTIALS: "errorInvalidCredentials",
  ACCOUNT_NOT_ACTIVATED: "errorInvalidCredentials",
  TOO_MANY_REQUESTS: "errorTooManyRequests",
};

const ssoErrorKeyMap: Record<string, string> = {
  SSO_STATE_EXPIRED: "errorSsoSessionExpired",
  SSO_INVALID_CALLBACK: "errorSsoSessionExpired",
  SSO_CSRF_MISMATCH: "errorSsoSessionExpired",
  SSO_IDP_UNAVAILABLE: "errorSsoIdpUnavailable",
  SSO_TOKEN_FAILED: "errorSsoTokenFailed",
  SSO_ACCOUNT_NOT_LINKED: "errorSsoAccountNotLinked",
  SSO_FORBIDDEN: "errorSsoForbidden",
  SSO_NOT_CONFIGURED: "errorSsoNotConfigured",
  SSO_INTERNAL_ERROR: "errorSsoInternalError",
};

const initialState: InternalSignInState = { error: null };

export function InternalSignInForm({
  locale,
  nextPath,
  initialError,
}: {
  locale: string;
  nextPath: string;
  initialError: string | null;
}) {
  const t = useTranslations("SignIn");
  const [state, formAction, isPending] = useActionState(
    authenticateInternalUser,
    initialState,
  );
  const [emailError, setEmailError] = useState<string | null>(null);
  const errorMessageKey = state.error
    ? (errorKeyMap[state.error] ?? state.error)
    : (initialError ? ssoErrorKeyMap[initialError] : null);

  const handleEmailBlur = (e: FocusEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      setEmailError(t("errorEmailFormat"));
    } else {
      setEmailError(null);
    }
  };

  // Fix: perform a hard navigation on success to bust the Next.js RSC router
  // cache. A soft redirect() from the server action leaves the root layout
  // stale, causing the sidebar to linger while the login form re-appears.
  useEffect(() => {
    if (state.redirectTo) {
      window.location.href = state.redirectTo;
    }
  }, [state.redirectTo]);

  const isRedirecting = Boolean(state.redirectTo);

  return (
    <Card className="mx-auto w-full max-w-md border-border bg-card shadow-sm">
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="font-semibold tracking-tight text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="next" value={nextPath} />

          <div className="space-y-2">
            <Label htmlFor="email" className="text-[0.8125rem] font-medium">{t("emailLabel")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              onBlur={handleEmailBlur}
              aria-invalid={Boolean(emailError)}
              required
            />
            {emailError && (
              <p role="alert" aria-live="polite" className="mt-1 text-[0.8125rem] text-destructive">
                {emailError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-[0.8125rem] font-medium">{t("passwordLabel")}</Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="password" name="password" type="password" autoComplete="current-password" className="pl-9" required />
            </div>
          </div>

          {errorMessageKey ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[0.8125rem] text-destructive">
              {t(errorMessageKey)}
            </p>
          ) : null}

          {(state.error === "INVALID_CREDENTIALS" || state.error === "ACCOUNT_NOT_ACTIVATED") && (
            <div className="mt-2 flex items-center gap-x-4">
              <Link
                href={`/${locale}/auth/forgot-password`}
                className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                {t("forgotPasswordLink")}
              </Link>
              <Link
                href={`/${locale}/auth/sso`}
                className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                {t("trySsoInstead")}
              </Link>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending || isRedirecting}>
            {isPending ? t("signingIn") : t("submitButton")}
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button asChild variant="outline" className="w-full">
            <Link href={`/${locale}/auth/sso`}>{t("ssoButton")}</Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}