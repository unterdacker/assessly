"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck, KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticateVendorAccessCode } from "@/app/actions/vendor-auth";
import { initialPortalActionState } from "@/lib/types/vendor-auth";
import { LanguageToggle } from "@/components/language-toggle";

export default function ExternalPortalPage() {
  const t = useTranslations();
  const [state, formAction, isPending] = React.useActionState(
    authenticateVendorAccessCode,
    initialPortalActionState,
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="fixed right-4 top-4 z-50">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white">
          <ShieldCheck className="h-7 w-7" />
        </div>

        <div className="space-y-2 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            {t("AvraVendorPortal")}
          </p>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t("SecureAssessmentAccess")}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("ExternalPortalDesc")}
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="accessCode" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("EnterAccessCode")}
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="accessCode"
                name="accessCode"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="A8X9-B2M4"
                className="pl-9 uppercase tracking-widest"
                maxLength={9}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("Password")}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder={t("EnterYourPassword")}
                className="pl-9"
                required
              />
            </div>
          </div>

          {state.error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {state.error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? t("Checking") : t("SecureAccess")}
          </Button>
        </form>
      </div>
    </main>
  );
}
