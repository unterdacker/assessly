"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AuditDiffViewer } from "@/components/admin/audit-diff-viewer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertCircle,
  BrainCircuit,
  Eye,
  Hash,
  Info,
  MapPin,
  Smartphone,
  UserCheck,
  ShieldCheck,
  Link2,
} from "lucide-react";

type AuditLogRow = {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  complianceCategory?: string | null;
  reason?: string | null;
  requestId?: string | null;
  previousLogHash?: string | null;
  eventHash?: string | null;
  aiModelId?: string | null;
  aiProviderName?: string | null;
  inputContextHash?: string | null;
  hitlVerifiedBy?: string | null;
};

type IntegrityResponse = {
  status: "VALID" | "INVALID";
  hashMatches: boolean;
  previousLinkMatches: boolean;
  expectedHash: string;
  computedAt: string;
};

type RelatedEvent = {
  id: string;
  timestamp: string;
  action: string;
  entity: string;
  requestId: string | null;
  eventHash: string | null;
};

type DetailsPayload = {
  ok: boolean;
  integrity: IntegrityResponse;
  traceId: string | null;
  forensic: {
    ipAddress: string | null;
    userAgent: string | null;
  };
  privacy: {
    legalBasisKey: string;
  };
  relatedEvents: RelatedEvent[];
  entry: AuditLogRow;
};

type AuditDetailsModalProps = {
  log: AuditLogRow;
};

function formatTimestamp(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function HashDisplay({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-normal text-muted-foreground">{label}</p>
      <code className="block break-all font-mono text-[11px] text-foreground/80">{value}</code>
    </div>
  );
}

function parseUserAgent(
  ua: string | null | undefined,
  labels: {
    unknownBrowser: string;
    unknownOs: string;
    on: string;
    edge: string;
    chrome: string;
    firefox: string;
    safari: string;
    windows: string;
    macOs: string;
    android: string;
    ios: string;
    linux: string;
  },
): string | null {
  if (!ua) return null;
  if (ua.startsWith("[REDACTED")) return ua;

  const browser =
    /Edg\/(\d+)/.exec(ua)?.[1]
      ? `${labels.edge} ${/Edg\/(\d+)/.exec(ua)?.[1]}`
      : /Chrome\/(\d+)/.exec(ua)?.[1]
        ? `${labels.chrome} ${/Chrome\/(\d+)/.exec(ua)?.[1]}`
        : /Firefox\/(\d+)/.exec(ua)?.[1]
          ? `${labels.firefox} ${/Firefox\/(\d+)/.exec(ua)?.[1]}`
          : /Version\/(\d+).+Safari\//.exec(ua)?.[1]
            ? `${labels.safari} ${/Version\/(\d+).+Safari\//.exec(ua)?.[1]}`
            : labels.unknownBrowser;

  const os =
    ua.includes("Windows NT 10.0")
      ? labels.windows
      : ua.includes("Windows NT 6.3")
        ? labels.windows
        : ua.includes("Mac OS X")
          ? labels.macOs
          : ua.includes("Android")
            ? labels.android
            : ua.includes("iPhone") || ua.includes("iPad")
              ? labels.ios
              : ua.includes("Linux")
                ? labels.linux
                : labels.unknownOs;

  return `${browser} ${labels.on} ${os}`;
}

export function AuditDetailsModal({ log }: AuditDetailsModalProps) {
  const t = useTranslations("AuditDetails");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [details, setDetails] = useState<DetailsPayload | null>(null);
  const [loading, startLoading] = useTransition();
  const [verifying, startVerifying] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selected = details?.entry ?? log;
  const integrity = details?.integrity;

  const aiProvenance = useMemo(() => {
    if (!selected.metadata || typeof selected.metadata !== "object") return null;

    const metadata = selected.metadata as Record<string, unknown>;
    const newValue = metadata.newValue;
    if (!newValue || typeof newValue !== "object") return null;

    const ai = newValue as Record<string, unknown>;
    const modelInfo = ai.model_info;
    const promptSnapshot = ai.prompt_snapshot;
    const linkedGenerationId = ai.ai_generation_event_id;

    const modelRecord =
      modelInfo && typeof modelInfo === "object"
        ? (modelInfo as Record<string, unknown>)
        : null;

    return {
      provider:
        modelRecord && typeof modelRecord.provider === "string" ? modelRecord.provider : null,
      modelId: modelRecord && typeof modelRecord.modelId === "string" ? modelRecord.modelId : null,
      promptSnapshot: typeof promptSnapshot === "string" ? promptSnapshot : null,
      linkedGenerationId:
        typeof linkedGenerationId === "string" ? linkedGenerationId : null,
    };
  }, [selected]);

  const parsedUserAgent = parseUserAgent(details?.forensic.userAgent ?? selected.userAgent ?? null, {
    unknownBrowser: t("userAgent.unknownBrowser"),
    unknownOs: t("userAgent.unknownOs"),
    on: t("userAgent.on"),
    edge: t("userAgent.edge"),
    chrome: t("userAgent.chrome"),
    firefox: t("userAgent.firefox"),
    safari: t("userAgent.safari"),
    windows: t("userAgent.windows"),
    macOs: t("userAgent.macOs"),
    android: t("userAgent.android"),
    ios: t("userAgent.ios"),
    linux: t("userAgent.linux"),
  });
  const hasRedactedPayload = JSON.stringify(selected.previousValue ?? "").includes("[REDACTED") ||
    JSON.stringify(selected.newValue ?? "").includes("[REDACTED");

  function loadDetails() {
    startLoading(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/audit-logs/${encodeURIComponent(log.id)}/details`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError((body as { error?: string }).error ?? `HTTP ${res.status}`);
          return;
        }
        const body = (await res.json()) as DetailsPayload;
        setDetails(body);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load details");
      }
    });
  }

  function verifyIntegrity() {
    startVerifying(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/audit-logs/${encodeURIComponent(log.id)}/details?verify=1`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError((body as { error?: string }).error ?? `HTTP ${res.status}`);
          return;
        }
        const body = (await res.json()) as { ok: boolean; integrity: IntegrityResponse };
        setDetails((prev) => {
          if (!prev) return prev;
          return { ...prev, integrity: body.integrity };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Integrity verification failed");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setShowPrompt(false);
          loadDetails();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Eye className="h-4 w-4" aria-hidden />
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audit Event Details</DialogTitle>
          <DialogDescription>
            Complete forensic record - NIS2 · DORA · EU AI Act · ISO 27001 · GDPR
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {loading && !details && (
            <p className="text-xs text-muted-foreground">Loading enriched event details...</p>
          )}
          {error && (
            <p className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              {error}
            </p>
          )}

          <div className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--secondary)] p-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-normal text-muted-foreground">Timestamp</p>
              <p className="font-mono">{formatTimestamp(selected.timestamp, locale)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-normal text-muted-foreground">User ID</p>
              <p className="break-all font-mono text-xs">{selected.userId}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-normal text-muted-foreground">Action</p>
              <p className="font-semibold">{selected.action}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-normal text-muted-foreground">Entity</p>
              <p className="font-mono text-xs">
                {selected.entityType}/{selected.entityId}
              </p>
            </div>
          </div>

          {(details?.forensic.ipAddress || parsedUserAgent || details?.traceId || selected.requestId) && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--accent)] p-4">
              <h3 className="mb-3 text-sm font-semibold text-[var(--accent-foreground)]">
                Forensic Metadata (BSI Grundschutz / ISO 27001 A.12.4)
              </h3>
              <div className="space-y-2 text-sm">
                {(details?.traceId || selected.requestId) && (
                  <div className="flex items-start gap-2">
                    <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
                    <div>
                      <p className="text-xs font-semibold text-[var(--foreground)]">
                        Trace ID / Correlation
                      </p>
                      <code className="block break-all text-xs text-[var(--foreground)] opacity-80">
                        {details?.traceId ?? selected.requestId}
                      </code>
                    </div>
                  </div>
                )}
                {details?.forensic.ipAddress && (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
                    <div>
                      <p className="text-xs font-semibold text-[var(--foreground)]">
                        IP Address
                      </p>
                      <code className="block text-xs text-[var(--foreground)] opacity-80">
                        {details.forensic.ipAddress}
                      </code>
                    </div>
                  </div>
                )}
                {parsedUserAgent && (
                  <div className="flex items-start gap-2">
                    <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
                    <div>
                      <p className="text-xs font-semibold text-[var(--foreground)]">{t("userAgent.normalized")}</p>
                      <p className="text-xs text-[var(--foreground)] opacity-80">{parsedUserAgent}</p>
                      {(details?.forensic.userAgent ?? selected.userAgent)?.startsWith("[REDACTED") && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--primary)] underline">
                                <Info className="h-3.5 w-3.5" aria-hidden />
                                {t("gdprWhyRedacted")}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {details?.privacy.legalBasisKey
                                ? t(`privacy.${details.privacy.legalBasisKey}`)
                                : t("privacy.gdprArt5Minimization")}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(selected.eventHash || selected.previousLogHash) && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  <Hash className="h-4 w-4" aria-hidden />
                  Hash-Chain Integrity (NIS2 / DORA Art. 9)
                </h3>
                <div className="flex items-center gap-2">
                  {integrity && (
                    <span
                      className={`inline-flex items-center rounded px-2 py-1 text-[11px] font-semibold ${
                        integrity.status === "VALID"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200"
                      }`}
                    >
                      {integrity.status === "VALID" ? "Integrity: VALID" : "Integrity: INVALID"}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={verifyIntegrity}
                    disabled={verifying || !details}
                    className="gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    {verifying ? "Verifying..." : "Verify Integrity"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <HashDisplay label="Event Hash (SHA-256)" value={selected.eventHash} />
                <HashDisplay label="Previous Log Hash" value={selected.previousLogHash ?? "GENESIS"} />
                {integrity && integrity.status === "INVALID" && (
                  <p className="text-xs text-rose-700 dark:text-rose-300">
                    Verification failed. Expected hash: <code className="font-mono">{integrity.expectedHash}</code>
                  </p>
                )}
              </div>
            </div>
          )}

          {details?.traceId && details.relatedEvents.length > 0 && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                <Link2 className="h-4 w-4" aria-hidden />
                Related Events (shared Trace ID)
              </h3>
              <ul className="space-y-2 text-xs">
                {details.relatedEvents.map((event) => (
                  <li key={event.id} className="rounded border border-[var(--border)] bg-[var(--background)] p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[var(--foreground)]">{formatTimestamp(event.timestamp, locale)}</span>
                      <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 font-semibold text-[var(--accent-foreground)]">
                        {event.action}
                      </span>
                      <span className="text-[var(--muted-foreground)]">{event.entity}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {details?.traceId && details.relatedEvents.length === 0 && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-4 text-xs text-[var(--muted-foreground)]">
              No related events found for this trace ID.
            </div>
          )}

          {(selected.aiModelId ||
            selected.aiProviderName ||
            selected.inputContextHash ||
            selected.hitlVerifiedBy ||
            aiProvenance) && (
            <div className="rounded-md border border-cyan-200 bg-cyan-50/40 p-4 dark:border-cyan-900 dark:bg-cyan-950/20">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-900 dark:text-cyan-200">
                <BrainCircuit className="h-4 w-4" aria-hidden />
                AI Traceability (EU AI Act Art. 12/14)
              </h3>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {selected.aiModelId && (
                  <div>
                    <p className="text-xs uppercase tracking-normal text-cyan-700 dark:text-cyan-300">
                      Model Identity
                    </p>
                    <code className="font-mono text-xs text-cyan-900 dark:text-cyan-100">
                      {selected.aiModelId}
                      {selected.aiProviderName ? ` / ${selected.aiProviderName}` : ""}
                    </code>
                  </div>
                )}
                {selected.inputContextHash && (
                  <div className="col-span-full">
                    <p className="text-xs uppercase tracking-normal text-cyan-700 dark:text-cyan-300">
                      Input Context Hash (SHA-256)
                    </p>
                    <code className="block break-all font-mono text-xs text-cyan-900 dark:text-cyan-100">
                      {selected.inputContextHash}
                    </code>
                  </div>
                )}
                {selected.hitlVerifiedBy && (
                  <div className="col-span-full">
                    <p className="text-xs uppercase tracking-normal text-cyan-700 dark:text-cyan-300">
                      Human-in-the-Loop Reviewer
                    </p>
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="h-4 w-4 text-cyan-600 dark:text-cyan-400" aria-hidden />
                      <code className="font-mono text-xs text-cyan-900 dark:text-cyan-100">
                        {selected.hitlVerifiedBy}
                      </code>
                    </div>
                  </div>
                )}
                {aiProvenance?.linkedGenerationId && (
                  <div>
                    <p className="text-xs uppercase tracking-normal text-cyan-700 dark:text-cyan-300">
                      Linked Generation Event
                    </p>
                    <code className="font-mono text-xs text-cyan-900 dark:text-cyan-100">
                      {aiProvenance.linkedGenerationId}
                    </code>
                  </div>
                )}
                {aiProvenance?.promptSnapshot && (
                  <div className="col-span-full">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPrompt((prev) => !prev)}
                    >
                      {showPrompt ? "Hide Prompt Snapshot" : "View Prompt Snapshot"}
                    </Button>
                    {showPrompt && (
                      <pre className="mt-2 max-h-52 overflow-auto rounded bg-white/80 p-2 text-xs leading-relaxed text-cyan-950 dark:bg-slate-950 dark:text-cyan-100">
                        {aiProvenance.promptSnapshot}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
              Field Changes (ISO 27001 A.12.4 / SOC2 CC7)
              </h3>
              {hasRedactedPayload && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                  <Info className="h-3.5 w-3.5" aria-hidden />
                  {t("privacy.gdprArt5Minimization")}
                </span>
              )}
            </div>
            <AuditDiffViewer previousValue={selected.previousValue} newValue={selected.newValue} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
