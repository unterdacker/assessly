"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Clipboard,
  Loader2,
  Mail,
  Send,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type RemediationGap = {
  answerId: string;
  questionId: string;
  questionText: string;
  status: string;
  score: number;
  evidenceSnippet: string | null;
  findings: string | null;
  recommendedCorrection: string;
};

type RemediationModalProps = {
  vendorId: string;
  trigger?: React.ReactNode;
};

const TYPEWRITER_SPEED_MS = 12;
const TYPEWRITER_STEP = 3;

export function RemediationModal({ vendorId, trigger }: RemediationModalProps) {
  const tGlobal = useTranslations();
  const t = useTranslations("remediationModal");
  const locale = useLocale();

  const localizeStatus = React.useCallback(
    (status: string) => {
      const normalized = status.trim().toUpperCase();
      const key = `status.${normalized}`;
      return tGlobal.has(key) ? tGlobal(key) : normalized;
    },
    [tGlobal],
  );

  const [open, setOpen] = React.useState(false);
  const [loadingGaps, setLoadingGaps] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [isStreaming, setIsStreaming] = React.useState(false);

  const [vendorName, setVendorName] = React.useState<string>("");
  const [securityContactEmail, setSecurityContactEmail] = React.useState<string | null>(null);
  const [recipientEmail, setRecipientEmail] = React.useState("");
  const [gaps, setGaps] = React.useState<RemediationGap[]>([]);
  const [draftText, setDraftText] = React.useState("");
  const [deadlineDate, setDeadlineDate] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [sentMessage, setSentMessage] = React.useState<string | null>(null);

  const typewriterTimerRef = React.useRef<number | null>(null);

  const hasDefaultSecurityContactEmail = Boolean(securityContactEmail?.trim());
  const isRecipientEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim());

  const stopTypewriter = React.useCallback(() => {
    if (typewriterTimerRef.current !== null) {
      window.clearTimeout(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const runTypewriter = React.useCallback(
    (fullText: string) => {
      stopTypewriter();
      setDraftText("");
      setIsStreaming(true);
      let cursor = 0;

      const tick = () => {
        cursor = Math.min(cursor + TYPEWRITER_STEP, fullText.length);
        setDraftText(fullText.slice(0, cursor));

        if (cursor >= fullText.length) {
          setIsStreaming(false);
          typewriterTimerRef.current = null;
          return;
        }

        typewriterTimerRef.current = window.setTimeout(tick, TYPEWRITER_SPEED_MS);
      };

      tick();
    },
    [stopTypewriter],
  );

  const fetchGaps = React.useCallback(async () => {
    setLoadingGaps(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/remediation?vendorId=${encodeURIComponent(vendorId)}&locale=${encodeURIComponent(locale)}`,
        {
        method: "GET",
        cache: "no-store",
        },
      );
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        gaps?: RemediationGap[];
        vendorName?: string;
        securityContactEmail?: string | null;
        vendorEmail?: string | null;
      };

      if (!res.ok || !data.ok) {
        setError(data.error || t("errors.fetchFailed"));
        return;
      }

      setGaps(data.gaps || []);
      setVendorName(data.vendorName || "");
      const nextSecurityContactEmail =
        data.securityContactEmail?.trim() || data.vendorEmail?.trim() || "";
      setSecurityContactEmail(nextSecurityContactEmail || null);
      setRecipientEmail((prev) => prev.trim() || nextSecurityContactEmail);
    } catch {
      setError(t("errors.fetchFailed"));
    } finally {
      setLoadingGaps(false);
    }
  }, [locale, t, vendorId]);

  React.useEffect(() => {
    if (!open) return;
    void fetchGaps();
  }, [fetchGaps, open]);

  React.useEffect(() => {
    return () => {
      stopTypewriter();
    };
  }, [stopTypewriter]);

  async function handleGeneratePlan() {
    setError(null);
    setSentMessage(null);
    setCopied(false);
    setGenerating(true);

    try {
      const res = await fetch("/api/remediation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vendorId,
          locale,
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        draft?: string;
        deadlineDate?: string;
        gaps?: RemediationGap[];
        vendorName?: string;
        securityContactEmail?: string | null;
        vendorEmail?: string | null;
      };

      if (!res.ok || !data.ok || !data.draft) {
        setError(data.error || t("errors.generateFailed"));
        return;
      }

      setDeadlineDate(data.deadlineDate || "");
      setVendorName(data.vendorName || vendorName);
      setGaps(data.gaps || gaps);
      const nextSecurityContactEmail =
        data.securityContactEmail?.trim() || data.vendorEmail?.trim() || "";
      setSecurityContactEmail(nextSecurityContactEmail || securityContactEmail);
      if (!recipientEmail.trim()) {
        setRecipientEmail(nextSecurityContactEmail);
      }
      runTypewriter(data.draft);
    } catch {
      setError(t("errors.generateFailed"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!draftText.trim() || !isRecipientEmailValid) return;

    try {
      await navigator.clipboard.writeText(draftText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t("errors.copyFailed"));
    }
  }

  async function handleSendMock() {
    if (!draftText.trim()) return;

    setSending(true);
    setSentMessage(null);

    await new Promise((resolve) => window.setTimeout(resolve, 900));

    setSending(false);
    const successMessage = t("sendSuccess", { vendorName: vendorName || t("vendorFallback") });
    setSentMessage(successMessage);
    toast.success(`${successMessage} (${recipientEmail.trim()})`);
  }

  function resetModalState(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) return;

    stopTypewriter();
    setError(null);
    setCopied(false);
    setSentMessage(null);
    setRecipientEmail(securityContactEmail?.trim() || "");
  }

  return (
    <Dialog open={open} onOpenChange={resetModalState}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" className="gap-2">
            <WandSparkles className="h-4 w-4" aria-hidden />
            {t("openButton")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-border bg-background text-foreground">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" aria-hidden />
              {t("title")}
            </DialogTitle>
            <DialogDescription>
              {t("description")}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t("gapsTitle")}
              </p>
              <div className="text-xs text-muted-foreground">
                {loadingGaps ? t("loadingGaps") : t("gapsCount", { count: gaps.length })}
              </div>
            </div>

            {loadingGaps ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("loadingGaps")}
              </div>
            ) : gaps.length === 0 ? (
              <div className="rounded-md border border-border bg-muted p-3 text-sm text-foreground">
                {t("noGaps")}
              </div>
            ) : (
              <motion.ul
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: {
                      staggerChildren: 0.06,
                    },
                  },
                }}
                className="space-y-2"
              >
                {gaps.slice(0, 6).map((gap) => (
                  <motion.li
                    key={gap.answerId}
                    variants={{
                      hidden: { opacity: 0, y: 6 },
                      visible: { opacity: 1, y: 0 },
                    }}
                    className="rounded-md border border-border bg-background p-3"
                  >
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{gap.questionText}</p>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            gap.status.toUpperCase() === "COMPLIANT"
                              ? "bg-emerald-500/15 text-emerald-700"
                              : gap.status.toUpperCase() === "FLAGGED"
                                ? "bg-destructive/15 text-destructive"
                                : "bg-amber-500/15 text-amber-700",
                          )}
                        >
                          {localizeStatus(gap.status)}
                        </span>
                        <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("scoreLabel", { score: gap.score })}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{gap.recommendedCorrection}</p>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleGeneratePlan}
              disabled={generating || loadingGaps}
              className="gap-2 bg-cyan-600 text-white hover:bg-cyan-500"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              {generating ? t("generating") : t("generateButton")}
            </Button>

            {deadlineDate ? (
              <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
                {t("deadlineLabel", { date: deadlineDate })}
              </span>
            ) : null}
          </div>

          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden />
                <span>{error}</span>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="space-y-2">
            <label htmlFor="remediation-draft" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("draftLabel")}
            </label>
            <textarea
              id="remediation-draft"
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              rows={14}
              className={cn(
                "w-full rounded-lg border border-input bg-background px-3 py-3 text-sm leading-relaxed text-foreground",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary",
              )}
              placeholder={isStreaming ? t("typing") : t("draftPlaceholder")}
            />
          </div>

          <AnimatePresence mode="wait">
            {hasDefaultSecurityContactEmail ? (
              <motion.div
                key="default-recipient"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="font-medium text-foreground">{t("sendingToLabel")}</span>
                <span>{securityContactEmail}</span>
              </motion.div>
            ) : (
              <motion.div
                key="fallback-recipient"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="space-y-2"
              >
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                  {t("missingEmailWarning")}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="recipient-email" className="text-sm font-medium text-foreground">
                    {t("recipientEmailLabel")}
                  </label>
                  <Input
                    id="recipient-email"
                    type="email"
                    value={recipientEmail}
                    onChange={(event) => setRecipientEmail(event.target.value)}
                    placeholder="security@vendor.example"
                    className="border-border bg-background"
                  />
                  {recipientEmail.trim() && !isRecipientEmailValid ? (
                    <p className="text-xs text-destructive">{t("invalidEmail")}</p>
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={handleCopy} disabled={!draftText.trim()} className="gap-2">
              <Clipboard className="h-4 w-4" aria-hidden />
              {copied ? t("copied") : t("copyButton")}
            </Button>

            <Button
              type="button"
              onClick={handleSendMock}
              disabled={!draftText.trim() || sending || !isRecipientEmailValid}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {sending ? t("sending") : t("sendButton")}
            </Button>

            <AnimatePresence>
              {sentMessage ? (
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-sm text-emerald-700"
                >
                  {sentMessage}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}