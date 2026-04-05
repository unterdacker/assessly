"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Eye,
  Activity,
  Cpu,
  UserRound,
  Clock3,
  Database,
  MapPin,
  Smartphone,
  Download,
  BrainCircuit,
  KeyRound,
  Settings2,
  ShieldAlert,
  Users,
  Hash,
  UserCheck,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AuditDiffViewer } from "@/components/admin/audit-diff-viewer";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  // Compliance fields
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

type AuditLogsTableProps = {
  logs: AuditLogRow[];
  isAdmin: boolean;
  activeCategory?: string;
  total: number;
};

// ---------------------------------------------------------------------------
// Compliance category display config (keyed by DB complianceCategory values)
// Used by ComplianceBadge for per-row display.
// ---------------------------------------------------------------------------

type CategoryConfig = {
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  color: string;
  badge: string;
};

const COMPLIANCE_CATEGORIES: Record<string, CategoryConfig> = {
  AI_ACT: {
    label: "EU AI Act",
    description: "AI generation, document analysis, human-in-the-loop",
    Icon: BrainCircuit,
    color: "text-cyan-700 dark:text-cyan-400",
    badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-200",
  },
  AUTH: {
    label: "Auth Events",
    description: "Login failures, MFA events, access control",
    Icon: KeyRound,
    color: "text-rose-700 dark:text-rose-400",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200",
  },
  CONFIG: {
    label: "Configuration",
    description: "System settings changes",
    Icon: Settings2,
    color: "text-amber-700 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  },
  NIS2_DORA: {
    label: "NIS2 / DORA",
    description: "Vendor, assessment, and access code lifecycle",
    Icon: ShieldAlert,
    color: "text-indigo-700 dark:text-indigo-400",
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200",
  },
  ISO27001_SOC2: {
    label: "ISO 27001 / SOC2",
    description: "User lifecycle and access governance",
    Icon: Users,
    color: "text-violet-700 dark:text-violet-400",
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200",
  },
  SYSTEM_HEALTH: {
    label: "System Health",
    description: "Health checks and system monitoring",
    Icon: Activity,
    color: "text-emerald-700 dark:text-emerald-400",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
  },
  OTHER: {
    label: "Other",
    description: "Uncategorized events",
    Icon: Activity,
    color: "text-slate-600 dark:text-slate-400",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
};

// ---------------------------------------------------------------------------
// Filter dropdown config (keyed by UI filter values sent as ?category= param)
// ---------------------------------------------------------------------------

type FilterConfig = {
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  color: string;
};

const FILTER_CATEGORIES: Record<string, FilterConfig> = {
  all:    { Icon: Activity,    color: "text-slate-600 dark:text-slate-400" },
  auth:   { Icon: KeyRound,    color: "text-rose-700 dark:text-rose-400" },
  access: { Icon: Users,       color: "text-violet-700 dark:text-violet-400" },
  config: { Icon: Settings2,   color: "text-amber-700 dark:text-amber-400" },
  data:   { Icon: Database,    color: "text-indigo-700 dark:text-indigo-400" },
  health: { Icon: Activity,    color: "text-emerald-700 dark:text-emerald-400" },
  AI_GOVERNANCE: { Icon: Cpu, color: "text-cyan-700 dark:text-cyan-400" },
  HUMAN_OVERSIGHT: { Icon: UserCheck, color: "text-teal-700 dark:text-teal-400" },
};

function ComplianceBadge({ category }: { category: string | null | undefined }) {
  const cfg = COMPLIANCE_CATEGORIES[category ?? "OTHER"] ?? COMPLIANCE_CATEGORIES.OTHER;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${cfg.badge}`}
    >
      <cfg.Icon className="h-3 w-3" aria-hidden />
      {cfg.label}
    </span>
  );
}

function HashDisplay({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <code className="block break-all font-mono text-[11px] text-foreground/80">{value}</code>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function AuditLogsTable({ logs, isAdmin, activeCategory, total }: AuditLogsTableProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Audit");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [downloading, startDownload] = useTransition();
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const selected = useMemo(
    () => logs.find((entry) => entry.id === selectedId) ?? null,
    [logs, selectedId],
  );

  const aiProvenance = useMemo(() => {
    if (!selected?.metadata || typeof selected.metadata !== "object") return null;

    const metadata = selected.metadata as Record<string, unknown>;
    const newValue = metadata.newValue;
    if (!newValue || typeof newValue !== "object") return null;

    const ai = newValue as Record<string, unknown>;
    const modelInfo = ai.model_info;
    const promptSnapshot = ai.prompt_snapshot;
    const rawAiOutput = ai.raw_ai_output;
    const linkedGenerationId = ai.ai_generation_event_id;

    const hasAiPayload =
      typeof modelInfo === "object" ||
      typeof promptSnapshot === "string" ||
      typeof rawAiOutput === "string" ||
      typeof linkedGenerationId === "string";

    if (!hasAiPayload) return null;

    const modelRecord =
      modelInfo && typeof modelInfo === "object"
        ? (modelInfo as Record<string, unknown>)
        : null;

    const provider =
      modelRecord && typeof modelRecord.provider === "string" ? modelRecord.provider : null;
    const modelId =
      modelRecord && typeof modelRecord.modelId === "string" ? modelRecord.modelId : null;

    return {
      provider,
      modelId,
      promptSnapshot: typeof promptSnapshot === "string" ? promptSnapshot : null,
      rawAiOutput: typeof rawAiOutput === "string" ? rawAiOutput : null,
      linkedGenerationId:
        typeof linkedGenerationId === "string" ? linkedGenerationId : null,
    };
  }, [selected]);

  function handleCategoryChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page"); // reset to page 1 on filter change
    if (value === "all") {
      params.delete("category");
    } else {
      params.set("category", value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleDownloadBundle() {
    startDownload(async () => {
      setDownloadError(null);
      try {
        const url = activeCategory
          ? `/api/audit-logs/forensic-bundle?category=${encodeURIComponent(activeCategory)}`
          : `/api/audit-logs/forensic-bundle`;
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setDownloadError((body as { error?: string }).error ?? `HTTP ${res.status}`);
          return;
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `avra-forensic-bundle-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : "Download failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Toolbar: Category Filter + Forensic Download ── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex items-center gap-2">
          <label htmlFor="category-filter" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            {t("filter.label")}
          </label>
          <Select value={activeCategory ?? "all"} onValueChange={handleCategoryChange}>
            <SelectTrigger id="category-filter" className="w-[220px] [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&>span]:truncate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FILTER_CATEGORIES).map(([key, cfg]) => {
                const label = t(`filter.${key}`);
                return (
                  <SelectItem key={key} value={key} textValue={label}>
                    <span className="flex items-center gap-1.5">
                      <cfg.Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} aria-hidden />
                      <span className="truncate">{label}</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {isAdmin && (
          <div className="flex flex-col items-end gap-1 sm:ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadBundle}
              disabled={downloading}
              aria-label="Download signed forensic bundle for external auditors"
              className="gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            >
              <Download className="h-4 w-4" aria-hidden />
              {downloading ? t("downloadPreparing") : t("downloadBundle")}
            </Button>
            {downloadError && (
              <p className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                {downloadError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Legend bar ── */}
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Activity className="h-4 w-4" aria-hidden />
          <span>
            {t("legendPrefix")}
          </span>
          <span className="ml-auto font-mono">
            {t("eventCount", { count: total })}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                Timestamp
              </span>
            </TableHead>
            <TableHead className="w-[140px]">
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5" aria-hidden />
                User
              </span>
            </TableHead>
            <TableHead className="w-[200px]">Action</TableHead>
            <TableHead className="w-[140px]">Framework</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead className="w-[100px] text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                {t("noEvents")}
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono text-xs">{formatTimestamp(log.timestamp)}</TableCell>
                <TableCell className="max-w-[140px] truncate font-medium" title={log.userId}>
                  {log.userId}
                </TableCell>
                <TableCell>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {log.action}
                  </span>
                </TableCell>
                <TableCell>
                  <ComplianceBadge category={log.complianceCategory} />
                </TableCell>
                <TableCell>
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Database className="h-3.5 w-3.5" aria-hidden />
                    <span className="font-medium text-foreground">{log.entityType}</span>
                    <span>/</span>
                    <span className="font-mono">{log.entityId}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedId(log.id);
                          setShowPrompt(false);
                        }}
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                        Details
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Audit Event Details</DialogTitle>
                        <DialogDescription>
                          Complete forensic record — NIS2 · DORA · EU AI Act · ISO 27001 · GDPR
                        </DialogDescription>
                      </DialogHeader>

                      {selected ? (
                        <div className="space-y-5">
                          {/* ── Core event fields ── */}
                          <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40 sm:grid-cols-2">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Timestamp</p>
                              <p className="font-mono">{formatTimestamp(selected.timestamp)}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">User ID</p>
                              <p className="break-all font-mono text-xs">{selected.userId}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Action</p>
                              <p className="font-semibold">{selected.action}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Framework</p>
                              <ComplianceBadge category={selected.complianceCategory} />
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Entity</p>
                              <p className="font-mono text-xs">
                                {selected.entityType}/{selected.entityId}
                              </p>
                            </div>
                            {selected.requestId && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Request ID (NIS2/DORA correlation)
                                </p>
                                <code className="break-all font-mono text-xs">{selected.requestId}</code>
                              </div>
                            )}
                            {selected.reason && (
                              <div className="col-span-full">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Purpose / Reason (GDPR Art. 5(1)(b))
                                </p>
                                <p className="rounded border border-amber-200 bg-amber-50/40 px-2 py-1 text-xs dark:border-amber-800 dark:bg-amber-950/20">
                                  {selected.reason}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* ── Forensic metadata ── */}
                          {(selected.ipAddress || selected.userAgent) && (
                            <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
                              <h3 className="mb-3 text-sm font-semibold text-indigo-800 dark:text-indigo-300">
                                Forensic Metadata (BSI Grundschutz / ISO 27001 A.12.4)
                              </h3>
                              <div className="space-y-2 text-sm">
                                {selected.ipAddress && (
                                  <div className="flex items-start gap-2">
                                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
                                    <div>
                                      <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-100">
                                        IP Address{" "}
                                        <span className="font-normal text-indigo-600 dark:text-indigo-300">
                                          (truncated — GDPR Rec. 30)
                                        </span>
                                      </p>
                                      <code className="block text-xs text-indigo-800 dark:text-indigo-200">
                                        {selected.ipAddress}
                                      </code>
                                    </div>
                                  </div>
                                )}
                                {selected.userAgent && (
                                  <div className="flex items-start gap-2">
                                    <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
                                    <div>
                                      <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-100">
                                        User Agent
                                      </p>
                                      <code className="block max-w-sm overflow-auto text-xs text-indigo-800 dark:text-indigo-200">
                                        {selected.userAgent}
                                      </code>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* ── NIS2/DORA hash-chain ── */}
                          {(selected.eventHash || selected.previousLogHash) && (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                                <Hash className="h-4 w-4" aria-hidden />
                                Hash-Chain Integrity (NIS2 / DORA Art. 9)
                              </h3>
                              <div className="space-y-2 text-sm">
                                <HashDisplay label="Event Hash (SHA-256)" value={selected.eventHash} />
                                <HashDisplay
                                  label="Previous Log Hash"
                                  value={selected.previousLogHash ?? "GENESIS"}
                                />
                              </div>
                            </div>
                          )}

                          {/* ── EU AI Act traceability ── */}
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
                                    <p className="text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
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
                                    <p className="text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                                      Input Context Hash (SHA-256 — no raw PII stored)
                                    </p>
                                    <code className="block break-all font-mono text-xs text-cyan-900 dark:text-cyan-100">
                                      {selected.inputContextHash}
                                    </code>
                                  </div>
                                )}
                                {selected.hitlVerifiedBy && (
                                  <div className="col-span-full">
                                    <p className="text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                                      Human-in-the-Loop Reviewer (Art. 14)
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
                                    <p className="text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
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

                          {/* ── Field diff ── */}
                          <div>
                            <h3 className="mb-3 text-sm font-semibold">
                              Field Changes (ISO 27001 A.12.4 / SOC2 CC7)
                            </h3>
                            <AuditDiffViewer
                              previousValue={selected.previousValue}
                              newValue={selected.newValue}
                            />
                          </div>
                        </div>
                      ) : null}
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
