"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { UserRole } from "@prisma/client";
import { Search, ChevronUp, ChevronDown, Copy, SendHorizonal, ShieldAlert, ShieldCheck, RefreshCw, Building2, SearchX } from "lucide-react";
import { AddVendorModal } from "@/components/add-vendor-modal";
import { VendorCsvImportModal } from "@/components/vendor-csv-import-modal";
import { InviteVendorModal } from "@/components/admin/invite-vendor-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccessCodeDuration } from "@/app/actions/vendor-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { RiskBadge } from "@/components/risk-badge";
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

type SortKey = 'name' | 'serviceType' | 'status' | 'lastAssessmentDate' | 'complianceScore' | 'riskLevel' | 'questionnaireProgress';

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

/** Colour-coded compliance score pill. */
function ScorePill({ score }: { score: number }) {
  const displayScore = score;

  const colorCls =
    displayScore >= 70
      ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800"
      : displayScore >= 40
      ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800"
      : "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800";

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold font-mono tabular-nums ${colorCls}`}
      title={`NIS2 compliance score: ${displayScore}/100`}
    >
      {displayScore}%
    </span>
  );
}

/** Visual tracker for security questionnaire progress (COMPLIANT/NON_COMPLIANT count). */
function ProgressPill({ progress, filled }: { progress: number; filled: number }) {
  const t = useTranslations("vendors");
  if (progress === 100) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
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
              className="h-8 gap-1 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
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
  const [showDeleteAlert, setShowDeleteAlert] = React.useState(false);
  const [copiedVendorId, setCopiedVendorId] = React.useState<string | null>(null);
  const [codeDialogVendorId, setCodeDialogVendorId] = React.useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = React.useState<AccessCodeDuration>("24h");
  const [codeActionVendorId, setCodeActionVendorId] = React.useState<string | null>(null);
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
        case 'riskLevel':
          const riskOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
          aVal = riskOrder[a.riskLevel as keyof typeof riskOrder] || 0;
          bVal = riskOrder[b.riskLevel as keyof typeof riskOrder] || 0;
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
        window.alert(result.error ?? t("genCodeUnexpectedError"));
        setIsBulkDeleting(false);
        return;
      }

      setShowDeleteAlert(false);
      setSelectedVendorIds(new Set());
      router.refresh();
    } catch {
      window.alert(t("genCodeUnexpectedError"));
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleCopyAccessCode = async (vendorId: string, accessCode: string | null) => {
    if (!accessCode) return;

    try {
      await navigator.clipboard.writeText(accessCode);
      setCopiedVendorId(vendorId);
      window.setTimeout(() => setCopiedVendorId((prev) => (prev === vendorId ? null : prev)), 1200);
    } catch {
      window.alert(t("copyFailed"));
    }
  };

  const handleCopyCredField = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCredField(field);
      window.setTimeout(() => setCopiedCredField((prev) => (prev === field ? null : prev)), 1500);
    } catch {
      window.alert(t("copyCredFailed"));
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
        window.alert(result.error ?? t("genCodeUnexpectedError"));
        setCodeActionVendorId(null);
        return;
      }

      if (!result.accessCode || !result.tempPassword || !result.codeExpiresAt) {
        window.alert(t("genCodeUnexpectedError"));
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
      window.alert(t("genCodeUnexpectedError"));
      setCodeActionVendorId(null);
    }
  };

  const handleVoidCode = async (vendor: VendorAssessment) => {
    const confirmed = window.confirm(t("confirmVoidCode", { vendorName: vendor.name }));
    if (!confirmed) return;

    setCodeActionVendorId(vendor.id);
    try {
      const res = await fetch("/api/vendors/void-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: vendor.id }),
      });
      const result = (await res.json()) as { ok: boolean; error?: string };

      if (!result.ok) {
        window.alert(result.error ?? t("genCodeUnexpectedError"));
        setCodeActionVendorId(null);
        return;
      }

      setCodeActionVendorId(null);
      router.refresh();
    } catch {
      window.alert(t("genCodeUnexpectedError"));
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
          {canManageVendors && selectedVendorIds.size > 0 && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-red-200 text-red-700 hover:bg-red-50 sm:w-auto dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
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
                <Button variant="ghost" onClick={() => handleSort('name')} className="h-auto p-0 font-semibold">
                  {t("columnName")}
                  {sortKey === 'name' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">{t("columnAccessCode")}</TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                <Button variant="ghost" onClick={() => handleSort('serviceType')} className="h-auto p-0 font-semibold">
                  {t("columnServiceType")}
                  {sortKey === 'serviceType' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                <Button variant="ghost" onClick={() => handleSort('status')} className="h-auto p-0 font-semibold">
                  {t("columnStatus")}
                  {sortKey === 'status' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                <Button variant="ghost" onClick={() => handleSort('lastAssessmentDate')} className="h-auto p-0 font-semibold">
                  {t("columnLastAssessment")}
                  {sortKey === 'lastAssessmentDate' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                <Button variant="ghost" onClick={() => handleSort('questionnaireProgress')} className="h-auto p-0 font-semibold">
                  {t("columnQuestionsFilled")}
                  {sortKey === 'questionnaireProgress' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                <Button variant="ghost" onClick={() => handleSort('complianceScore')} className="h-auto p-0 font-semibold">
                  {t("columnComplianceScore")}
                  {sortKey === 'complianceScore' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                <Button variant="ghost" onClick={() => handleSort('riskLevel')} className="h-auto p-0 font-semibold">
                  {t("columnRiskLevel")}
                  {sortKey === 'riskLevel' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead className="px-4 py-2.5 text-right text-[0.625rem] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">{t("columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="hover:bg-[var(--muted)]">
                <TableCell
                  colSpan={10}
                  className="h-24 px-4 py-6 text-center text-muted-foreground"
                >
                  {q.trim() ? (
                    <div className="flex flex-col items-center gap-2">
                      <SearchX className="h-5 w-5 text-muted-foreground" aria-hidden />
                      <p>{t("noVendorsSearch")}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden />
                      <p>{t("noVendorsFound")}</p>
                      {canManageVendors ? (
                        <AddVendorModal
                          trigger={
                            <Button type="button" size="sm">
                              {t("addFirstVendor")}
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
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{t("copied")}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("noActiveCode")}</span>
                      )}
                      {hasAccessCode && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatAccessCodeExpiry(v.codeExpiresAt, t("noActiveCode"), t("expired"), t("expires"))}</p>
                      )}
                      {hasAccessCode && v.isCodeActive && v.isFirstLogin && (
                        <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                          <ShieldAlert className="h-3 w-3" aria-hidden />
                          {t("passwordPendingChange")}
                        </p>
                      )}
                      {hasAccessCode && v.isCodeActive && !v.isFirstLogin && (
                        <p className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
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
                              className="h-7 border-red-200 px-2 text-[10px] text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
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
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                          : v.status === "incomplete"
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
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
                    <ScorePill score={v.complianceScore} />
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <RiskBadge level={v.riskLevel} />
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

      <Dialog open={canManageVendors && Boolean(generatedCredentials)} onOpenChange={(open) => {
        if (!open) {
          setGeneratedCredentials(null);
          router.refresh();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <span className="text-amber-500 mr-1" aria-hidden>&#9888;</span>
              {t("credDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("credDialogDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
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

          <DialogFooter>
            <Button
              onClick={() => {
                setGeneratedCredentials(null);
                router.refresh();
              }}
            >
              {t("credDialogSaveButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={canManageVendors && Boolean(codeDialogVendorId)} onOpenChange={(open) => !open && setCodeDialogVendorId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("genCodeDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("genCodeDialogDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setCodeDialogVendorId(null)}>
              {t("genCodeCancel")}
            </Button>
            <Button onClick={handleGenerateCode} disabled={Boolean(codeActionVendorId)}>
              {codeActionVendorId ? t("genCodeGenerating") : t("genCodeGenerate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
