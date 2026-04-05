"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forceResetVendorPasswordAction } from "@/app/actions/vendor-force-reset-password";
import { initialPortalActionState } from "@/lib/types/vendor-auth";

export default function ForcePasswordChangePage() {
  const t = useTranslations();
  const locale = useLocale();
  const [state, formAction, isPending] = React.useActionState(
    forceResetVendorPasswordAction,
    initialPortalActionState,
  );
  const [newPassword, setNewPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  const tooShort = newPassword.length > 0 && newPassword.length < 12;
  const clientMismatch = confirm.length > 0 && newPassword !== confirm;
  const canSubmit = !isPending && !tooShort && !clientMismatch && newPassword.length >= 12 && confirm.length > 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-white">
          <Lock className="h-7 w-7" />
        </div>

        <div className="space-y-2 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
            {t("OneTimeSetup")}
          </p>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t("SetPrivatePassword")}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("ForcePasswordDesc")}
          </p>
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
          {t("ForcePasswordHint")}
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <div className="space-y-2">
            <label htmlFor="newPassword" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("NewPassword")}
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder={t("AtLeast12Chars")}
                className="pl-9"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            {tooShort && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{t("Minimum12Chars")}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("ConfirmPassword")}
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder={t("RepeatNewPassword")}
                className="pl-9"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {clientMismatch && (
              <p className="text-xs text-red-600 dark:text-red-400">{t("PasswordsDoNotMatch")}</p>
            )}
          </div>

          {state.error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {state.error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {isPending ? t("Securing") : t("SetPasswordContinue")}
          </Button>
        </form>
      </div>
    </main>
  );
}
