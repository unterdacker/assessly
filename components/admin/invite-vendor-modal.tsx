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
  const t = useTranslations();
  const tr = (key: string, fallback: string, values?: Record<string, string | number>) => {
    const fullKey = `inviteVendorModal.${key}`;
    return t.has(fullKey) ? t(fullKey, values) : fallback;
  };
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
                {tr("success.title", "Invite delivered")}
              </DialogTitle>
              <DialogDescription>
                {t.has("inviteVendorModal.success.description")
                  ? t.rich("inviteVendorModal.success.description", {
                      vendorName,
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })
                  : <>Credentials split across two channels for <strong>{vendorName}</strong>.</>}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  {t.has("inviteVendorModal.success.emailStatus")
                    ? t.rich("inviteVendorModal.success.emailStatus", {
                        strong: (chunks) => <span className="font-semibold">{chunks}</span>,
                      })
                    : <><span className="font-semibold">Email sent</span> - portal link and access code delivered.</>}
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  {t.has("inviteVendorModal.success.smsStatus")
                    ? t.rich("inviteVendorModal.success.smsStatus", {
                        strong: (chunks) => <span className="font-semibold">{chunks}</span>,
                        phone: state.maskedPhone ?? "",
                        mono: (chunks) => <span className="font-mono">{chunks}</span>,
                      })
                    : <><span className="font-semibold">SMS sent</span> - temporary password delivered to <span className="font-mono">{state.maskedPhone}</span>.</>}
                </p>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tr("success.securityHint", "The vendor must change their password immediately on first login. The temporary password is never stored in plain text and cannot be retrieved.")}
              </p>
            </div>

            <DialogFooter>
              <Button onClick={() => setOpen(false)}>{tr("actions.close", "Close")}</Button>
            </DialogFooter>
          </>
        ) : (
          /* ── Form state ────────────────────────────────────────────────── */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-600" />
                {tr("form.title", "Send Secure Invite")}
              </DialogTitle>
              <DialogDescription>
                {t.has("inviteVendorModal.form.description")
                  ? t.rich("inviteVendorModal.form.description", {
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })
                  : <>The access code goes by <strong>email</strong>; the temporary password goes by <strong>SMS</strong>. The two credentials never travel together.</>}
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="vendorId" value={vendorId} />

              <div className="space-y-2">
                <label
                  htmlFor="inv-email"
                  className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  {tr("form.emailLabel", "Email Address")}
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="inv-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    defaultValue={prefillEmail}
                    placeholder={tr("form.emailPlaceholder", "security@vendor.com")}
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
                  {tr("form.mobileLabel", "Mobile Number")}
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="inv-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder={tr("form.mobilePlaceholder", "+49 151 12345678")}
                    className="pl-9"
                    required
                  />
                </div>
                <p className="text-xs text-slate-400">{tr("form.mobileHint", "International format required, e.g. +49 151 12345678")}</p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="inv-duration"
                  className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  {tr("form.codeValidityLabel", "Code Validity")}
                </label>
                <select
                  id="inv-duration"
                  name="duration"
                  defaultValue="24h"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="1h">{tr("form.duration1h", "1 hour")}</option>
                  <option value="24h">{tr("form.duration24h", "24 hours")}</option>
                  <option value="7d">{tr("form.duration7d", "7 days")}</option>
                  <option value="30d">{tr("form.duration30d", "30 days")}</option>
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
                  {tr("actions.cancel", "Cancel")}
                </Button>
                <Button type="submit" disabled={isPending} className="gap-2">
                  <SendHorizonal className="h-4 w-4" />
                  {isPending ? tr("actions.sending", "Sending...") : tr("actions.sendSecureInvite", "Send Secure Invite")}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
