"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { UserRole } from "@prisma/client";
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, Copy, SendHorizonal, ShieldAlert, ShieldCheck, RefreshCw, Building2, SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { AddVendorModal } from "@/components/add-vendor-modal";
import { VendorCsvImportModal } from "@/components/vendor-csv-import-modal";
import { InviteVendorModal } from "@/components/admin/invite-vendor-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccessCodeDuration } from "@/app/actions/vendor-actions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { VendorAssessment } from "@/lib/vendor-assessment";
import { cn } from "@/lib/utils";

export type VendorsPagination = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
};

export type VendorsTableSectionProps = {
  vendorAssessments: VendorAssessment[];
  role: UserRole;
  pagination?: VendorsPagination;
};

type SortKey = 'name' | 'serviceType' | 'status' | 'lastAssessmentDate' | 'complianceScore' | 'questionnaireProgress';

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatAccessCodeExpiry(
  value: string | null,
  noActiveCode = "No active code",
  expired = "Expired",
  expires = "Expires",
) {
  if (!value) return noActiveCode;
  const expiresAt = new Date(value);
  if (!Number.isFinite(expiresAt.getTime())) return noActiveCode;
  if (expiresAt.getTime() <= Date.now()) return expired;

  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(expiresAt);

  return `${expires}: ${formatted}`;
}

function getStatusDotClass(status: VendorAssessment["status"]) {
  if (status === "completed") return "bg-[var(--risk-low)]";
  if (status === "incomplete") return "bg-[var(--risk-medium)]";
  return "bg-[var(--risk-medium)]";
}

function sanitizeCsvCell(value: string): string {
  const startsWithFormula = /^[=+\-@]/.test(value);
  return startsWithFormula ? `\t${value}` : value;
}

function toCsvCell(value: string): string {
  const sanitized = sanitizeCsvCell(value).replaceAll('"', '""');
  return `"${sanitized}"`;
}

function RiskScore({ score, level }: { score: number; level: string }) {
  if (!level || level === "not_calculated") {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  const colorMap: Record<string, string> = {
    low: "bg-[var(--risk-low)] text-[var(--risk-low-fg)]",
    medium: "bg-[var(--risk-medium)] text-[var(--risk-medium-fg)]",
    high: "bg-[var(--risk-high)] text-[var(--risk-high-fg)]",
  };
  const normalizedLevel = level.toLowerCase();
  const colors = colorMap[normalizedLevel] ?? "bg-muted text-muted-foreground";

  return (
    <span
      className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium tabular-nums ${colors}`}
      aria-label={`${normalizedLevel} risk, ${score}% compliance score`}
    >
      {normalizedLevel.toUpperCase()} · {score}%
    </span>
  );
}

/** Visual tracker for security questionnaire progress (COMPLIANT/NON_COMPLIANT count). */
function ProgressPill({ progress, filled }: { progress: number; filled: number }) {
  const t = useTranslations("vendors");
  if (progress === 100) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-success-border bg-success-muted px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-success-muted-fg">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
        {t("progressCompleted")}
      </span>
    );
  }

  const colorCls = progress > 0 
    ? "bg-[var(--accent)] text-[var(--primary)] border-[var(--border)]"
    : "bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-800";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ${colorCls}`}>
      {progress}% 
      <span className="opacity-60 font-normal">({filled}/20)</span>
    </span>
  );
}

function VendorActions({
  vendorAssessment,
  role,
}: {
  vendorAssessment: VendorAssessment;
  role: UserRole;
}) {
  const t = useTranslations("vendors");
  const locale = useLocale();
  const canManage = role === "ADMIN";

  const showResendInvite = canManage && Boolean(vendorAssessment.inviteTokenExpires);

  return (
    <div className="flex justify-end gap-2">
      {canManage ? (
        <InviteVendorModal
          vendorId={vendorAssessment.id}
          vendorName={vendorAssessment.name}
          prefillEmail={vendorAssessment.email}
          trigger={
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground">
              <SendHorizonal className="h-3.5 w-3.5" aria-hidden />
              {t("sendInvite")}
            </Button>
          }
        />
      ) : null}
      {showResendInvite ? (
        <InviteVendorModal
          vendorId={vendorAssessment.id}
          vendorName={vendorAssessment.name}
          prefillEmail={vendorAssessment.email}
          forceRefresh
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-warning hover:opacity-80"
              title={t("resendInviteTooltip")}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {t("resendInvite")}
            </Button>
          }
        />
      ) : null}
      <Button variant="outline" size="sm" className="h-8" asChild>
        <Link href={`/${locale}/vendors/${vendorAssessment.id}/assessment`}>
          {t("openAssessment")}
        </Link>
      </Button>
    </div>
  );
}

export function VendorsTableSection({
  vendorAssessments,
  role,
  pagination,
}: VendorsTableSectionProps) {
  const t = useTranslations("vendors");
  const router = useRouter();
  const canManageVendors = role === "ADMIN";
  const selectAllRef = React.useRef<HTMLInputElement | null>(null);
  const [q, setQ] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>('name');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [selectedVendorIds, setSelectedVendorIds] = React.useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [isBulkInviting, setIsBulkInviting] = React.useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = React.useState(false);
  const [copiedVendorId, setCopiedVendorId] = React.useState<string | null>(null);
  const [codeDialogVendorId, setCodeDialogVendorId] = React.useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = React.useState<AccessCodeDuration>("24h");
  const [codeActionVendorId, setCodeActionVendorId] = React.useState<string | null>(null);
  const [voidConfirmVendor, setVoidConfirmVendor] = React.useState<VendorAssessment | null>(null);
  const [generatedCredentials, setGeneratedCredentials] = React.useState<{
    accessCode: string;
    tempPassword: string;
    codeExpiresAt: string;
  } | null>(null);
  const [copiedCredField, setCopiedCredField] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return vendorAssessments;
    return vendorAssessments.filter(
      (v) =>
        v.name.toLowerCase().includes(needle) ||
        v.serviceType.toLowerCase().includes(needle) ||
        v.email.toLowerCase().includes(needle),
    );
  }, [vendorAssessments, q]);

  const sorted = React.useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: string | number, bVal: string | number;
      switch (sortKey) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'serviceType':
          aVal = a.serviceType.toLowerCase();
          bVal = b.serviceType.toLowerCase();
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'lastAssessmentDate':
          aVal = a.lastAssessmentDate ? new Date(a.lastAssessmentDate).getTime() : 0;
          bVal = b.lastAssessmentDate ? new Date(b.lastAssessmentDate).getTime() : 0;
          break;
        case 'complianceScore':
          aVal = a.complianceScore;
          bVal = b.complianceScore;
          break;
        case 'questionnaireProgress':
          aVal = a.questionnaireProgress;
          bVal = b.questionnaireProgress;
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const visibleIds = React.useMemo(() => sorted.map((v) => v.id), [sorted]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedVendorIds.has(id));
  const someVisibleSelected =
    visibleIds.some((id) => selectedVendorIds.has(id)) && !allVisibleSelected;

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  React.useEffect(() => {
    setSelectedVendorIds((prev) => {
      const valid = new Set(vendorAssessments.map((v) => v.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
      });
      return next;
    });
  }, [vendorAssessments]);

  const handleToggleVendor = (vendorId: string, checked: boolean) => {
    setSelectedVendorIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(vendorId);
      } else {
        next.delete(vendorId);
      }
      return next;
    });
  };

  const handleToggleAllVisible = (checked: boolean) => {
    setSelectedVendorIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        visibleIds.forEach((id) => next.add(id));
      } else {
        visibleIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedVendorIds.size === 0) return;

    setShowDeleteAlert(true);
    return;
  };

  const executeBulkDelete = async () => {
    if (selectedVendorIds.size === 0) {
      setShowDeleteAlert(false);
      return;
    }

    setIsBulkDeleting(true);
    try {
      const res = await fetch("/api/vendors/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorIds: Array.from(selectedVendorIds) }),
      });
      const result = (await res.json()) as { ok: boolean; error?: string };

      if (!result.ok) {
        toast.error(result.error ?? t("genCodeUnexpectedError"));
        setIsBulkDeleting(false);
        return;
      }

      setShowDeleteAlert(false);
      setSelectedVendorIds(new Set());
      router.refresh();
    } catch {
      toast.error(t("genCodeUnexpectedError"));
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkInvite = async () => {
    if (selectedVendorIds.size === 0 || !canManageVendors) {
      return;
    }

    setIsBulkInviting(true);
    try {
      const res = await fetch("/api/vendors/bulk-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorIds: Array.from(selectedVendorIds) }),
      });

      const result = (await res.json()) as {
        sent?: number;
        skipped?: number;
        failed?: number;
      };

      if (!res.ok) {
        toast.error(t("inviteAllError"));
        return;
      }

      const sent = result.sent ?? 0;
      const skipped = result.skipped ?? 0;
      const failed = result.failed ?? 0;

      if (sent === 0 && failed > 0) {
        toast.error(t("inviteAllError"));
      } else if (skipped > 0) {
        toast.success(t("inviteAllPartialSuccess", { sent, skipped }));
      } else {
        toast.success(t("inviteAllSuccess", { count: sent }));
      }
    } catch {
      toast.error(t("inviteAllError"));
    } finally {
      router.refresh();
      setSelectedVendorIds(new Set());
      setIsBulkInviting(false);
    }
  };

  const handleCsvExport = () => {
    const headers = [
      "Name",
      "Email",
      "Service Type",
      "Status",
      "Compliance Score",
      "Risk Level",
      "Questionnaire Progress",
      "Last Assessment Date",
    ];

    const rows = vendorAssessments.map((vendor) => [
      vendor.name,
      vendor.email,
      vendor.serviceType,
      vendor.status,
      String(vendor.complianceScore),
      vendor.riskLevel,
      `${vendor.questionnaireProgress}%`,
      vendor.lastAssessmentDate ?? "",
    ]);

    const csv = [
      headers.map((header) => toCsvCell(header)).join(","),
      ...rows.map((row) => row.map((cell) => toCsvCell(cell)).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `vendors-page-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  };

  const handleCopyAccessCode = async (vendorId: string, accessCode: string | null) => {
    if (!accessCode) return;

    try {
      await navigator.clipboard.writeText(accessCode);
      setCopiedVendorId(vendorId);
      setTimeout(() => setCopiedVendorId((prev) => (prev === vendorId ? null : prev)), 1200);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const handleCopyCredField = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCredField(field);
      setTimeout(() => setCopiedCredField((prev) => (prev === field ? null : prev)), 1500);
    } catch {
      toast.error(t("copyCredFailed"));
    }
  };

  const handleGenerateCode = async () => {
    if (!codeDialogVendorId) return;
    setCodeActionVendorId(codeDialogVendorId);
    try {
      const res = await fetch("/api/vendors/access-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vendorId: codeDialogVendorId,
          duration: selectedDuration,
        }),
      });

      const result = (await res.json()) as {
        ok: boolean;
        error?: string;
        accessCode?: string;
        tempPassword?: string;
        codeExpiresAt?: string;
      };

      if (!result.ok) {
        toast.error(result.error ?? t("genCodeUnexpectedError"));
        setCodeActionVendorId(null);
        return;
      }

      if (!result.accessCode || !result.tempPassword || !result.codeExpiresAt) {
        toast.error(t("genCodeUnexpectedError"));
        setCodeActionVendorId(null);
        return;
      }

      setCodeActionVendorId(null);
      setCodeDialogVendorId(null);
      setGeneratedCredentials({
        accessCode: result.accessCode,
        tempPassword: result.tempPassword,
        codeExpiresAt: result.codeExpiresAt,
      });
    } catch {
      toast.error(t("genCodeUnexpectedError"));
      setCodeActionVendorId(null);
    }
  };

  const handleVoidCode = async (vendor: VendorAssessment) => {
    setVoidConfirmVendor(vendor);
    return;
  };

  const executeVoidCode = async () => {
    if (!voidConfirmVendor) return;
    const vendor = voidConfirmVendor;
    setVoidConfirmVendor(null);

    setCodeActionVendorId(vendor.id);
    try {
      const res = await fetch("/api/vendors/void-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: vendor.id }),
      });
      const result = (await res.json()) as { ok: boolean; error?: string };

      if (!result.ok) {
        toast.error(result.error ?? t("genCodeUnexpectedError"));
        setCodeActionVendorId(null);
        return;
      }

      setCodeActionVendorId(null);
      router.refresh();
    } catch {
      toast.error(t("genCodeUnexpectedError"));
      setCodeActionVendorId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">
            {t("pageTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("pageDesc")}
          </p>
          <p className="mt-2 text-sm">
            <Link href="/external/portal" className="font-medium text-primary underline-offset-4 hover:underline">
              {t("vendorPortalLinkLabel")}
            </Link>
            <span className="ml-2 text-muted-foreground">{t("vendorPortalLinkHint")}</span>
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {role === "ADMIN" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCsvExport}
              disabled={vendorAssessments.length === 0 || isBulkDeleting || isBulkInviting}
            >
              {t("csvExport")}
            </Button>
          ) : null}
          {canManageVendors && selectedVendorIds.size > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleBulkInvite}
              disabled={isBulkDeleting || isBulkInviting}
            >
              {isBulkInviting
                ? `${t("inviteAllSelected", { count: selectedVendorIds.size })}...`
                : t("inviteAllSelected", { count: selectedVendorIds.size })}
            </Button>
          ) : null}
          {canManageVendors && selectedVendorIds.size > 0 && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-destructive/30 text-destructive hover:bg-destructive/5 sm:w-auto"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting || isBulkInviting}
            >
              {isBulkDeleting ? `${t("deleteSelected")}...` : `${t("deleteSelected")} (${selectedVendorIds.size})`}
            </Button>
          )}
          {canManageVendors ? <VendorCsvImportModal /> : null}
          {canManageVendors ? (
            <AddVendorModal
              trigger={
                <Button type="button" className="w-full sm:w-auto" disabled={isBulkDeleting}>
                  {t("addVendor")}
                </Button>
              }
            />
          ) : null}
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          placeholder={t("search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
          aria-label={t("search")}
        />
      </div>

      {q.trim() !== "" && (
        <div role="status" aria-live="polite" className="mt-2 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <span>Search: {'"'}{q.length > 30 ? `${q.slice(0, 30)}…` : q}{'"'}</span>
            <button
              type="button"
              onClick={() => setQ("")}
              className="ml-0.5 inline-flex items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            Showing {filtered.length} of {vendorAssessments.length} vendors
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)]">
        <Table>
          <caption className="sr-only">
            {t("tableCaption")}
          </caption>
          <TableHeader>
            <TableRow className="bg-[var(--muted)]">
              <TableHead className="w-10 px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                {canManageVendors ? (
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    aria-label={t("selectAllVendors")}
                    checked={allVisibleSelected}
                    onChange={(e) => handleToggleAllVisible(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                    disabled={visibleIds.length === 0 || isBulkDeleting}
                  />
                ) : null}
              </TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                <Button variant="ghost" onClick={() => handleSort('name')} className="group h-auto p-0 font-semibold">
                  {t("columnName")}
                  {sortKey === 'name'
                    ? (sortDirection === 'asc'
                      ? <ChevronUp className="ml-1 h-3.5 w-3.5" />
                      : <ChevronDown className="ml-1 h-3.5 w-3.5" />)
                    : <ChevronsUpDown className="ml-1 h-3.5 w-3.5 opacity-40 group-hover:opacity-70" />
                  }
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">{t("columnAccessCode")}</TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                <Button variant="ghost" onClick={() => handleSort('serviceType')} className="group h-auto p-0 font-semibold">
                  {t("columnServiceType")}
                  {sortKey === 'serviceType'
                    ? (sortDirection === 'asc'
                      ? <ChevronUp className="ml-1 h-3.5 w-3.5" />
                      : <ChevronDown className="ml-1 h-3.5 w-3.5" />)
                    : <ChevronsUpDown className="ml-1 h-3.5 w-3.5 opacity-40 group-hover:opacity-70" />
                  }
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                <Button variant="ghost" onClick={() => handleSort('status')} className="group h-auto p-0 font-semibold">
                  {t("columnStatus")}
                  {sortKey === 'status'
                    ? (sortDirection === 'asc'
                      ? <ChevronUp className="ml-1 h-3.5 w-3.5" />
                      : <ChevronDown className="ml-1 h-3.5 w-3.5" />)
                    : <ChevronsUpDown className="ml-1 h-3.5 w-3.5 opacity-40 group-hover:opacity-70" />
                  }
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                <Button variant="ghost" onClick={() => handleSort('lastAssessmentDate')} className="group h-auto p-0 font-semibold">
                  {t("columnLastAssessment")}
                  {sortKey === 'lastAssessmentDate'
                    ? (sortDirection === 'asc'
                      ? <ChevronUp className="ml-1 h-3.5 w-3.5" />
                      : <ChevronDown className="ml-1 h-3.5 w-3.5" />)
                    : <ChevronsUpDown className="ml-1 h-3.5 w-3.5 opacity-40 group-hover:opacity-70" />
                  }
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                <Button variant="ghost" onClick={() => handleSort('questionnaireProgress')} className="group h-auto p-0 font-semibold">
                  {t("columnQuestionsFilled")}
                  {sortKey === 'questionnaireProgress'
                    ? (sortDirection === 'asc'
                      ? <ChevronUp className="ml-1 h-3.5 w-3.5" />
                      : <ChevronDown className="ml-1 h-3.5 w-3.5" />)
                    : <ChevronsUpDown className="ml-1 h-3.5 w-3.5 opacity-40 group-hover:opacity-70" />
                  }
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                <Button variant="ghost" onClick={() => handleSort('complianceScore')} className="group h-auto p-0 font-semibold">
                  {t("columnComplianceScore")}
                  {sortKey === 'complianceScore'
                    ? (sortDirection === 'asc'
                      ? <ChevronUp className="ml-1 h-3.5 w-3.5" />
                      : <ChevronDown className="ml-1 h-3.5 w-3.5" />)
                    : <ChevronsUpDown className="ml-1 h-3.5 w-3.5 opacity-40 group-hover:opacity-70" />
                  }
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-right text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">{t("columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="hover:bg-[var(--muted)]">
                <TableCell
                  colSpan={9}
                  className="h-24 px-4 py-6 text-center text-muted-foreground"
                >
                  {q.trim() ? (
                    <div className="flex flex-col items-center gap-2">
                      <SearchX className="h-5 w-5 text-muted-foreground" aria-hidden />
                      <p>{t("noVendorsSearch")}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                      <Building2 className="h-10 w-10 text-muted-foreground/40" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{t("addFirstVendor")}</p>
                        <p className="text-sm text-muted-foreground">{t("emptyStateDescription")}</p>
                      </div>
                      {canManageVendors ? (
                        <AddVendorModal
                          trigger={
                            <Button type="button" size="sm">
                              {t("addVendor")}
                            </Button>
                          }
                        />
                      ) : null}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((v) => {
                const hasAccessCode = Boolean(v.accessCode);

                return (
                <TableRow key={v.id} className="hover:bg-[var(--muted)]">
                  <TableCell className="px-4 py-2.5">
                    {canManageVendors ? (
                      <input
                        type="checkbox"
                        aria-label={t("selectVendorAria", { vendorName: v.name })}
                        checked={selectedVendorIds.has(v.id)}
                        onChange={(e) => handleToggleVendor(v.id, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                        disabled={isBulkDeleting}
                      />
                    ) : null}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 font-medium">{v.name}</TableCell>
                  <TableCell className="px-4 py-2.5">
                    <div className="space-y-2">
                      {hasAccessCode ? (
                        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold tracking-wider dark:border-slate-700 dark:bg-slate-900">
                          <span>{v.accessCode}</span>
                          <button
                            type="button"
                            aria-label={t("copyAccessCodeAria", { vendorName: v.name })}
                            onClick={() => handleCopyAccessCode(v.id, v.accessCode)}
                            className="text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 dark:text-slate-400 dark:hover:text-slate-200"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {copiedVendorId === v.id && (
                            <span className="text-[10px] text-success">{t("copied")}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("noActiveCode")}</span>
                      )}
                      {hasAccessCode && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatAccessCodeExpiry(v.codeExpiresAt, t("noActiveCode"), t("expired"), t("expires"))}</p>
                      )}
                      {hasAccessCode && v.isCodeActive && v.isFirstLogin && (
                        <p className="flex items-center gap-1 text-[11px] text-warning">
                          <ShieldAlert className="h-3 w-3" aria-hidden />
                          {t("passwordPendingChange")}
                        </p>
                      )}
                      {hasAccessCode && v.isCodeActive && !v.isFirstLogin && (
                        <p className="flex items-center gap-1 text-[11px] text-success">
                          <ShieldCheck className="h-3 w-3" aria-hidden />
                          {t("passwordSecured")}
                        </p>
                      )}
                      {canManageVendors ? (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => setCodeDialogVendorId(v.id)}
                            disabled={Boolean(codeActionVendorId)}
                          >
                            {t("generateAccessCode")}
                          </Button>
                          {hasAccessCode && v.isCodeActive && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 border-destructive/30 px-2 text-[10px] text-destructive hover:bg-destructive/5"
                              onClick={() => handleVoidCode(v)}
                              disabled={Boolean(codeActionVendorId)}
                            >
                              {codeActionVendorId === v.id ? t("voiding") : t("voidCode")}
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-muted-foreground">
                    {v.serviceType}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                      ${ v.status === "completed"
                          ? "bg-success-muted text-success-muted-fg"
                          : v.status === "incomplete"
                          ? "bg-warning-muted text-warning-muted-fg"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}>
                      <span aria-hidden="true" className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", getStatusDotClass(v.status))} />
                      <span>{v.status === "completed" ? t("statusCompleted") : v.status === "incomplete" ? t("statusIncomplete") : t("statusPending")}</span>
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-muted-foreground">
                    <span className="font-mono tabular-nums">{formatDate(v.lastAssessmentDate)}</span>
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <ProgressPill progress={v.questionnaireProgress} filled={v.questionsFilled} />
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <RiskScore score={v.complianceScore} level={v.riskLevel} />
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right">
                    <VendorActions vendorAssessment={v} role={role} />
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && pagination.pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4 text-sm text-muted-foreground">
          <span>
            {t("paginationInfo", {
              from: (pagination.page - 1) * pagination.pageSize + 1,
              to: Math.min(pagination.page * pagination.pageSize, pagination.total),
              total: pagination.total,
            })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
              disabled={pagination.page <= 1}
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set("page", String(pagination.page - 1));
                router.push(`?${params.toString()}`);
              }}
            >
              {t("paginationPrev")}
            </button>
            <span className="tabular-nums">
              <span className="font-mono tabular-nums">{pagination.page} / {pagination.pageCount}</span>
            </span>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
              disabled={pagination.page >= pagination.pageCount}
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set("page", String(pagination.page + 1));
                router.push(`?${params.toString()}`);
              }}
            >
              {t("paginationNext")}
            </button>
          </div>
        </div>
      )}

      <Sheet open={canManageVendors && Boolean(generatedCredentials)} onOpenChange={(open) => {
        if (!open) {
          setGeneratedCredentials(null);
          router.refresh();
        }
      }}>
        <SheetContent onInteractOutside={(e) => e.preventDefault()} className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              <span className="text-warning mr-1" aria-hidden>&#9888;</span>
              {t("credDialogTitle")}
            </SheetTitle>
            <SheetDescription>
              {t("credDialogDesc")}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3">
            <div className="rounded-md border border-warning-border bg-warning-muted px-4 py-3 text-xs leading-relaxed text-warning-muted-fg">
              {t("credDialogWarning")}
            </div>

            {generatedCredentials && (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("credDialogAccessCodeLabel")}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm tracking-widest dark:border-slate-700 dark:bg-slate-800">
                      {generatedCredentials.accessCode}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyCredField("accessCode", generatedCredentials.accessCode)}
                    >
                      {copiedCredField === "accessCode" ? t("credDialogCopied") : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("credDialogTempPasswordLabel")}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800 break-all">
                      {generatedCredentials.tempPassword}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyCredField("tempPassword", generatedCredentials.tempPassword)}
                    >
                      {copiedCredField === "tempPassword" ? t("credDialogCopied") : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  {formatAccessCodeExpiry(generatedCredentials.codeExpiresAt, t("noActiveCode"), t("expired"), t("expires"))}
                </p>
              </>
            )}
          </div>

          <SheetFooter>
            <Button
              onClick={() => {
                setGeneratedCredentials(null);
                router.refresh();
              }}
            >
              {t("credDialogSaveButton")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={canManageVendors && Boolean(codeDialogVendorId)} onOpenChange={(open) => !open && setCodeDialogVendorId(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("genCodeDialogTitle")}</SheetTitle>
            <SheetDescription>
              {t("genCodeDialogDesc")}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-2 px-6">
            <label htmlFor="code-duration" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("genCodeValidityLabel")}
            </label>
            <select
              id="code-duration"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(e.target.value as AccessCodeDuration)}
            >
              <option value="1h">{t("genCodeOption1h")}</option>
              <option value="24h">{t("genCodeOption24h")}</option>
              <option value="7d">{t("genCodeOption7d")}</option>
              <option value="30d">{t("genCodeOption30d")}</option>
            </select>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setCodeDialogVendorId(null)}>
              {t("genCodeCancel")}
            </Button>
            <Button onClick={handleGenerateCode} disabled={Boolean(codeActionVendorId)}>
              {codeActionVendorId ? t("genCodeGenerating") : t("genCodeGenerate")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDeleteVendors", { count: selectedVendorIds.size })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkDelete} disabled={isBulkDeleting}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={voidConfirmVendor !== null}
        onOpenChange={(open) => {
          if (!open) setVoidConfirmVendor(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmVoidCodeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmVoidCode", { vendorName: voidConfirmVendor?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={executeVoidCode}
            >
              {t("voidCode")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
