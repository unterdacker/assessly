"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Mail, Phone, SendHorizonal, CheckCircle2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  sendOutOfBandInviteAction,
} from "@/app/actions/send-invite";
import {
  initialSendInviteState,
} from "@/lib/types/vendor-auth";

type Props = {
  vendorId: string;
  vendorName: string;
  /** Pre-fill the email field from the vendor's security contact. */
  prefillEmail?: string;
  trigger: React.ReactNode;
};

export function InviteVendorModal({ vendorId, vendorName, prefillEmail = "", trigger }: Props) {
  const t = useTranslations("inviteVendorModal");
  const [open, setOpen] = React.useState(false);
  const [state, formAction, isPending] = React.useActionState(
    sendOutOfBandInviteAction,
    initialSendInviteState,
  );

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-md">
        {state.status === "sent" ? (
          /* ── Success state ─────────────────────────────────────────────── */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                {t("success.title")}
              </DialogTitle>
              <DialogDescription>
                {t.rich("success.description", {
                  vendorName,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  {t.rich("success.emailStatus", {
                    strong: (chunks) => <span className="font-semibold">{chunks}</span>,
                  })}
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  {t.rich("success.smsStatus", {
                    strong: (chunks) => <span className="font-semibold">{chunks}</span>,
                    phone: state.maskedPhone ?? "",
                    mono: (chunks) => <span className="font-mono">{chunks}</span>,
                  })}
                </p>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("success.securityHint")}
              </p>
            </div>

            <DialogFooter>
              <Button onClick={() => setOpen(false)}>{t("actions.close")}</Button>
            </DialogFooter>
          </>
        ) : (
          /* ── Form state ────────────────────────────────────────────────── */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-600" />
                {t("form.title")}
              </DialogTitle>
              <DialogDescription>
                {t.rich("form.description", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="vendorId" value={vendorId} />

              <div className="space-y-2">
                <label
                  htmlFor="inv-email"
                  className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  {t("form.emailLabel")}
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="inv-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    defaultValue={prefillEmail}
                    placeholder={t("form.emailPlaceholder")}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="inv-phone"
                  className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  {t("form.mobileLabel")}
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="inv-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder={t("form.mobilePlaceholder")}
                    className="pl-9"
                    required
                  />
                </div>
                <p className="text-xs text-slate-400">{t("form.mobileHint")}</p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="inv-duration"
                  className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  {t("form.codeValidityLabel")}
                </label>
                <select
                  id="inv-duration"
                  name="duration"
                  defaultValue="24h"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="1h">{t("form.duration1h")}</option>
                  <option value="24h">{t("form.duration24h")}</option>
                  <option value="7d">{t("form.duration7d")}</option>
                  <option value="30d">{t("form.duration30d")}</option>
                </select>
              </div>

              {state.status === "error" && state.error && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                  {state.error}
                </p>
              )}

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  {t("actions.cancel")}
                </Button>
                <Button type="submit" disabled={isPending} className="gap-2">
                  <SendHorizonal className="h-4 w-4" />
                  {isPending ? t("actions.sending") : t("actions.sendSecureInvite")}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
