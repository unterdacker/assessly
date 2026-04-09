"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { initiateOidcLogin } from "@/app/actions/oidc-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SsoSignInFormProps {
  locale: string;
  nextPath: string;
}

const errorKeyMap: Record<string, string> = {
  INVALID_EMAIL: "errorInvalidEmail",
  SSO_NOT_CONFIGURED: "errorSsoNotConfigured",
  RATE_LIMITED: "errorRateLimited",
  IDP_UNAVAILABLE: "errorIdpUnavailable",
};

export function SsoSignInForm({ locale, nextPath }: SsoSignInFormProps) {
  const t = useTranslations("SsoSignIn");
  const [state, formAction, isPending] = useActionState(initiateOidcLogin, { error: null });

  useEffect(() => {
    if (state.redirectTo) {
      window.location.href = state.redirectTo;
    }
  }, [state.redirectTo]);

  const isRedirecting = Boolean(state.redirectTo);

  return (
    <Card className="mx-auto w-full max-w-md border-border bg-card shadow-sm">
      <CardHeader className="space-y-3">
        <Image src="/logo.png" alt="Assessly logo" width={40} height={40} className="rounded-full" priority />
        <div>
          <CardTitle className="text-foreground">{t("heading")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="next" value={nextPath} />

          <div className="space-y-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              required
            />
          </div>

          {state.error ? (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {t(errorKeyMap[state.error] ?? "errorIdpUnavailable")}
            </div>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={isPending || isRedirecting}
            aria-disabled={isPending || isRedirecting}
          >
            {isPending ? t("signingIn") : t("submitButton")}
          </Button>

          <Link
            href={`/${locale}/auth/sign-in`}
            className="inline-flex text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("backToSignIn")}
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
