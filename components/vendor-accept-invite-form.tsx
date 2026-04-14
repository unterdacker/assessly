"use client";

import { useActionState, useEffect } from "react";
import { acceptVendorSetupAction } from "@/app/actions/vendor-setup-password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface VendorAcceptInviteFormProps {
  token?: string;
}

export function VendorAcceptInviteForm({ token }: VendorAcceptInviteFormProps) {
  const t = useTranslations("vendorAcceptInvite");
  const [state, formAction, isPending] = useActionState(acceptVendorSetupAction, null);

  useEffect(() => {
    if (typeof window !== "undefined" && token) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [token]);

  if (!token) {
    return (
      <div
        className="flex flex-col items-center justify-center space-y-4 rounded-md border border-destructive/50 bg-destructive/10 p-6 text-center"
        role="alert"
        aria-live="polite"
      >
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {t("tokenInvalid", { defaultMessage: "Invalid or Expired Link" })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("tokenInvalid", {
              defaultMessage: "This invite link is invalid or has expired. Please contact the assessment team for a new invite.",
            })}
          </p>
        </div>
      </div>
    );
  }

  if (state?.status === "success") {
    return (
      <div 
        className="flex flex-col items-center justify-center space-y-6 rounded-md border border-emerald-500/50 bg-emerald-500/10 p-8 text-center"
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden="true" />
        <div className="space-y-2">
          <p className="text-base font-semibold text-emerald-800 dark:text-emerald-400">
            {t("successTitle", { defaultMessage: "Password Set Successfully" })}
          </p>
          <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">
            {t("successMessage", { defaultMessage: "Your password has been set. You can now log in with your Access Code." })}
          </p>
        </div>
        <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
          <Link href="/vendor/auth/sign-in">
            {t("loginLink", { defaultMessage: "Go to Login" })}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      {state?.error && (
        <div
          className="flex items-start space-x-3 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{state.error}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="new-password">
          {t("newPasswordLabel", { defaultMessage: "New Password" })}
        </Label>
        <Input
          id="new-password"
          name="newPassword"
          type="password"
          required
          autoComplete="new-password"
          aria-describedby="password-hint"
          aria-invalid={!!state?.error}
          className="focus-visible:ring-indigo-500"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          {t("passwordHint", { defaultMessage: "Min 12 characters · uppercase · lowercase · number · special character" })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">
          {t("confirmPasswordLabel", { defaultMessage: "Confirm Password" })}
        </Label>
        <Input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          aria-invalid={!!state?.error}
          className="focus-visible:ring-indigo-500"
        />
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
        aria-disabled={isPending}
      >
        {isPending
          ? t("submitting", { defaultMessage: "Setting Password..." })
          : t("submitButton", { defaultMessage: "Set Password" })}
      </Button>
    </form>
  );
}