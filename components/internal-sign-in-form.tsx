"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { authenticateInternalUser } from "@/app/actions/internal-auth";
import type { InternalSignInState } from "@/app/actions/internal-auth.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const errorKeyMap: Record<string, string> = {
  REQUIRED: "errorRequired",
  INVALID_CREDENTIALS: "errorInvalidCredentials",
  TOO_MANY_REQUESTS: "errorTooManyRequests",
};

const initialState: InternalSignInState = { error: null };

export function InternalSignInForm({ locale, nextPath }: { locale: string; nextPath: string }) {
  const t = useTranslations("SignIn");
  const [state, formAction, isPending] = useActionState(
    authenticateInternalUser,
    initialState,
  );

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
          <input type="hidden" name="next" value={nextPath} />

          <div className="space-y-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("passwordLabel")}</Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="password" name="password" type="password" autoComplete="current-password" className="pl-9" required />
            </div>
          </div>

          {state.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t(errorKeyMap[state.error] ?? state.error)}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isPending || isRedirecting}>
            {isPending ? t("signingIn") : t("submitButton")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}