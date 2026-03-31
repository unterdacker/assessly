"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { verifyMfaAndAuthenticate } from "@/app/actions/mfa";
import type { MfaVerifyState } from "@/app/actions/mfa";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const errorKeyMap: Record<string, string> = {
  INVALID_MFA_TOKEN: "errorInvalidToken",
  MFA_SESSION_EXPIRED: "errorSessionExpired",
  MFA_NOT_CONFIGURED: "errorNotConfigured",
};

const initialState: MfaVerifyState = { error: null };

export function MfaVerifyForm({ locale }: { locale: string }) {
  const t = useTranslations("MfaVerify");
  const [state, formAction, isPending] = useActionState(
    verifyMfaAndAuthenticate,
    initialState,
  );

  return (
    <Card className="mx-auto w-full max-w-md border-border bg-card shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <CardTitle className="text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <div className="space-y-2">
            <Label htmlFor="mfa-token">{t("tokenLabel")}</Label>
            <Input
              id="mfa-token"
              name="token"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              required
              disabled={isPending}
              className="text-center text-xl tracking-[0.4em] font-mono"
            />
          </div>

          {state.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t(errorKeyMap[state.error] as Parameters<typeof t>[0] ?? state.error)}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? t("verifying") : t("submitButton")}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {t("backHint")}{" "}
            <a
              href={`/${locale}/auth/sign-in`}
              className="text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-400"
            >
              {t("backLink")}
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
