"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Mail, SendHorizonal, CheckCircle2, ShieldCheck } from "lucide-react";
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
import type { SendInviteState } from "@/lib/types/vendor-auth";

type Props = {
  vendorId: string;
  vendorName: string;
  /** Pre-fill the email field from the vendor's security contact. */
  prefillEmail?: string;
  /** When true, injects a hidden forceRefresh=true field so the server bypasses the valid-token guard. */
  forceRefresh?: boolean;
  trigger: React.ReactNode;
};

export function InviteVendorModal({ vendorId, vendorName, prefillEmail = "", forceRefresh, trigger }: Props) {
  const t = useTranslations();
  const tr = (key: string, fallback: string, values?: Record<string, string | number>) => {
    const fullKey = `inviteVendorModal.${key}`;
    return t.has(fullKey) ? t(fullKey, values) : fallback;
  };
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<SendInviteState>({ status: "idle", error: null });
  const [isPending, setIsPending] = React.useState(false);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setState({ status: "idle", error: null });
    }
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/vendors/send-invite", {
        method: "POST",
        body: formData,
      });
      const result = (await res.json()) as SendInviteState;
      setState(result);
    } catch {
      setState({ status: "error", error: "Could not send invite. Try again." });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-md">
        {state.status === "sent" ? (
          /* ── Success state ─────────────────────────────────────────────── */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-5 w-5" />
                {tr("success.title", "Invite delivered")}
              </DialogTitle>
              <DialogDescription>
                {t.has("inviteVendorModal.success.description")
                  ? t.rich("inviteVendorModal.success.description", {
                      vendorName,
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })
                  : <>A secure setup email has been sent to <strong>{vendorName}</strong>.</>}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex items-start gap-3 rounded-md border border-success-border bg-success-muted px-4 py-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <p className="text-sm text-success-muted-fg">
                  {t.has("inviteVendorModal.success.emailStatus")
                    ? t.rich("inviteVendorModal.success.emailStatus", {
                        strong: (chunks) => <span className="font-semibold">{chunks}</span>,
                      })
                    : <><span className="font-semibold">Email sent</span> - portal link and access code delivered.</>}
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-md border border-success-border bg-success-muted px-4 py-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <p className="text-sm text-success-muted-fg">
                  {t.has("inviteVendorModal.success.setupStatus")
                    ? t.rich("inviteVendorModal.success.setupStatus", {
                        strong: (chunks) => <span className="font-semibold">{chunks}</span>,
                      })
                    : <><span className="font-semibold">Setup link sent</span> - vendor must set a password from the invite email before first login.</>}
                </p>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tr("success.securityHint", "The invite link is one-time and expires after 48 hours. Passwords are set by the vendor and never emailed in plain text.")}
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
                  : <>Send an <strong>email invite link</strong> so the vendor can set their password securely before using the access code.</>}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="hidden" name="vendorId" value={vendorId} />
              {forceRefresh && (
                <input type="hidden" name="forceRefresh" value="true" />
              )}

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
