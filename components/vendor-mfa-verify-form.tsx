"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { verifyVendorMfaAndAuthenticate } from "@/app/actions/mfa";
import type { VendorMfaVerifyState } from "@/app/actions/mfa";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const errorKeyMap: Record<string, string> = {
  INVALID_MFA_TOKEN: "errorInvalidToken",
  MFA_SESSION_EXPIRED: "errorSessionExpired",
  MFA_NOT_CONFIGURED: "errorNotConfigured",
  RECOVERY_CODE_INVALID: "errorRecoveryCodeInvalid",
};

const initialState: VendorMfaVerifyState = { error: null };

export function VendorMfaVerifyForm({ locale }: { locale: string }) {
  const t = useTranslations("VendorMfaVerify");
  const [state, formAction, isPending] = useActionState(
    verifyVendorMfaAndAuthenticate,
    initialState,
  );
  
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [inputValue, setInputValue] = useState("");

  const toggleMode = () => {
    setMode((prev) => (prev === "totp" ? "recovery" : "totp"));
    setInputValue("");
  };

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
          <input type="hidden" name="mode" value={mode} />
          
          <div className="space-y-2">
            <Label htmlFor="vendor-mfa-input">
              {t(mode === "totp" ? "tokenLabel" : "recoveryCodeLabel")}
            </Label>
            {mode === "totp" ? (
              <Input
                id="vendor-mfa-input"
                name="token"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                required
                disabled={isPending}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="text-center text-xl tracking-[0.4em] font-mono"
              />
            ) : (
              <Input
                id="vendor-mfa-input"
                name="token"
                type="text"
                inputMode="text"
                pattern="[A-Fa-f0-9]{8}-[A-Fa-f0-9]{8}-[A-Fa-f0-9]{8}-[A-Fa-f0-9]{8}"
                autoComplete="off"
                maxLength={35}
                placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                required
                disabled={isPending}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="text-center font-mono tracking-wider"
              />
            )}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                className="text-xs text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                onClick={toggleMode}
                disabled={isPending}
              >
                {t(mode === "totp" ? "useRecoveryCode" : "useTotp")}
              </button>
            </div>
          </div>

          {state.error ? (
            <div role="alert" aria-live="polite" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t(errorKeyMap[state.error] as Parameters<typeof t>[0] ?? state.error)}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? t("verifying") : t("submitButton")}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {t("backHint")}{" "}
            <a
              href={`/${locale}/external/portal`}
              className="text-[var(--primary)] underline-offset-4 hover:underline"
            >
              {t("backLink")}
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}