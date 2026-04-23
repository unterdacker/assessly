"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Activity,
  Cpu,
  UserRound,
  Clock3,
  Database,
  Download,
  BrainCircuit,
  KeyRound,
  Settings2,
  ShieldAlert,
  Users,
  UserCheck,
  AlertCircle,
  ShieldCheck,
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
import { AuditDetailsModal } from "@/components/admin/audit-details-modal";


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
  isAuditor: boolean;
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
    badge: "bg-[var(--badge-ai-act-bg)] text-[var(--badge-ai-act-fg)]",
  },
  AUTH: {
    label: "Auth Events",
    description: "Login failures, MFA events, access control",
    Icon: KeyRound,
    color: "text-rose-700 dark:text-rose-400",
    badge: "bg-[var(--badge-auth-bg)] text-[var(--badge-auth-fg)]",
  },
  CONFIG: {
    label: "Configuration",
    description: "System settings changes",
    Icon: Settings2,
    color: "text-amber-700 dark:text-amber-400",
    badge: "bg-[var(--badge-config-bg)] text-[var(--badge-config-fg)]",
  },
  NIS2_DORA: {
    label: "NIS2 / DORA",
    description: "Vendor, assessment, and access code lifecycle",
    Icon: ShieldAlert,
    color: "text-indigo-700 dark:text-indigo-400",
    badge: "bg-[var(--badge-compliance-bg)] text-[var(--badge-compliance-fg)]",
  },
  ISO27001_SOC2: {
    label: "ISO 27001 / SOC2",
    description: "User lifecycle and access governance",
    Icon: Users,
    color: "text-violet-700 dark:text-violet-400",
    badge: "bg-[var(--badge-governance-bg)] text-[var(--badge-governance-fg)]",
  },
  SYSTEM_HEALTH: {
    label: "System Health",
    description: "Health checks and system monitoring",
    Icon: Activity,
    color: "text-emerald-700 dark:text-emerald-400",
    badge: "bg-[var(--badge-health-bg)] text-[var(--badge-health-fg)]",
  },
  OTHER: {
    label: "Other",
    description: "Uncategorized events",
    Icon: Activity,
    color: "text-slate-600 dark:text-slate-400",
    badge: "bg-[var(--badge-other-bg)] text-[var(--badge-other-fg)]",
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
    timeZone: "UTC",
  }).format(date);
}

export function AuditLogsTable({ logs, isAdmin, isAuditor, activeCategory, total }: AuditLogsTableProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Audit");
  const [downloading, startDownload] = useTransition();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [verifying, startVerify] = useTransition();
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  async function ensureChainHealthyForExport(): Promise<boolean> {
    const res = await fetch("/api/audit-logs/forensic-bundle?mode=verify", {
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDownloadError((body as { error?: string }).error ?? `HTTP ${res.status}`);
      return false;
    }

    const body = (await res.json()) as {
      chainIntegrity?: {
        verified?: boolean;
        eventsWithChain?: number;
        verifiedChain?: number;
        brokenAt?: string | null;
      };
    };

    const chainIntegrity = body.chainIntegrity;
    if (!chainIntegrity) {
      setDownloadError("Unable to verify chain integrity.");
      return false;
    }

    if (!chainIntegrity.verified) {
      setDownloadError(
        `Export blocked: integrity mismatch detected at log ${chainIntegrity.brokenAt ?? "unknown"}.`,
      );
      setVerifyResult(
        `Integrity alert: mismatch detected at log ${chainIntegrity.brokenAt ?? "unknown"}.`,
      );
      return false;
    }

    return true;
  }

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

  function buildQueryParams(extra?: Record<string, string>): string {
    const params = new URLSearchParams();
    if (activeCategory) {
      params.set("category", activeCategory);
    }
    if (extra) {
      Object.entries(extra).forEach(([key, value]) => params.set(key, value));
    }
    return params.toString();
  }

  function handleDownloadBundle() {
    startDownload(async () => {
      setDownloadError(null);
      try {
        const healthy = await ensureChainHealthyForExport();
        if (!healthy) return;

        const query = buildQueryParams({ format: isAuditor ? "csv" : "json" });
        const url = `/api/audit-logs/forensic-bundle${query ? `?${query}` : ""}`;
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
        a.download = `venshield-forensic-bundle-${Date.now()}.${isAuditor ? "csv" : "json"}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : "Download failed");
      }
    });
  }

  function handleDownloadAdminCsv() {
    startDownload(async () => {
      setDownloadError(null);
      try {
        const healthy = await ensureChainHealthyForExport();
        if (!healthy) return;

        const query = buildQueryParams({ format: "csv", profile: "admin" });
        const res = await fetch(`/api/audit-logs/forensic-bundle?${query}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setDownloadError((body as { error?: string }).error ?? `HTTP ${res.status}`);
          return;
        }

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `venshield-audit-logs-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : "Download failed");
      }
    });
  }

  function handleVerifyIntegrity() {
    startVerify(async () => {
      setDownloadError(null);
      setVerifyResult(null);
      try {
        const query = buildQueryParams({ mode: "verify" });
        const res = await fetch(`/api/audit-logs/forensic-bundle?${query}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setDownloadError((body as { error?: string }).error ?? `HTTP ${res.status}`);
          return;
        }

        const body = (await res.json()) as {
          chainIntegrity?: {
            verified?: boolean;
            eventsWithChain?: number;
            verifiedChain?: number;
            brokenAt?: string | null;
          };
        };

        if (!body.chainIntegrity) {
          setVerifyResult("Unable to verify chain integrity.");
          return;
        }

        const { verified, eventsWithChain, verifiedChain, brokenAt } = body.chainIntegrity;
        setVerifyResult(
          verified
            ? `Chain verified (${verifiedChain ?? 0}/${eventsWithChain ?? 0} hashed events).`
            : `Integrity alert: mismatch detected at log ${brokenAt ?? "unknown"}.`,
        );
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : "Verification failed");
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

        {(isAdmin || isAuditor) && (
          <div className="flex flex-col items-end gap-1 sm:ml-auto">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {(isAdmin || isAuditor) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleVerifyIntegrity}
                  disabled={verifying}
                  className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  {verifying ? t("verifyIntegrityRunning") : t("verifyIntegrity")}
                </Button>
              )}

              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadAdminCsv}
                  disabled={downloading}
                  className="gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {downloading ? t("downloadPreparing") : t("downloadCsv")}
                </Button>
              )}

              {(isAdmin || isAuditor) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadBundle}
                  disabled={downloading}
                  aria-label="Download Forensic Bundle"
                  className="gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {downloading ? t("downloadPreparing") : t("downloadBundle")}
                </Button>
              )}
            </div>

            {verifyResult && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">{verifyResult}</p>
            )}
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
                  <AuditDetailsModal log={log} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
