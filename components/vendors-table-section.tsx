"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, FileText, ChevronUp, ChevronDown, Copy } from "lucide-react";
import { AddVendorModal } from "@/components/add-vendor-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteVendorsAction,
  generateVendorAccessCodeAction,
  voidVendorAccessCodeAction,
  type AccessCodeDuration,
} from "@/app/actions/vendor-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export type VendorsTableSectionProps = {
  vendorAssessments: VendorAssessment[];
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

function formatAccessCodeExpiry(value: string | null) {
  if (!value) return "No active code";
  const expiresAt = new Date(value);
  if (!Number.isFinite(expiresAt.getTime())) return "No active code";
  if (expiresAt.getTime() <= Date.now()) return "Expired";

  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(expiresAt);

  return `Expires: ${formatted}`;
}

/** Colour-coded compliance score pill. */
function ScorePill({ score, status }: { score: number; status: string }) {
  // Pending/incomplete vendors are always treated as 0% for display
  const displayScore = status === "pending" ? 0 : score;

  const colorCls =
    displayScore >= 70
      ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800"
      : displayScore >= 40
      ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800"
      : "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800";

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${colorCls}`}
      title={`NIS2 compliance score: ${displayScore}/100`}
    >
      {displayScore}%
    </span>
  );
}

/** Visual tracker for security questionnaire progress (COMPLIANT/NON_COMPLIANT count). */
function ProgressPill({ progress, filled }: { progress: number; filled: number }) {
  if (progress === 100) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
        Completed
      </span>
    );
  }

  const colorCls = progress > 0 
    ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800"
    : "bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900/50 dark:text-slate-600 dark:border-slate-800";

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums gap-1.5 ${colorCls}`}>
      {progress}% 
      <span className="opacity-60 font-normal">({filled}/20)</span>
    </span>
  );
}

function VendorActions({
  vendorAssessment,
}: {
  vendorAssessment: VendorAssessment;
}) {
  return (
    <div className="flex justify-end gap-2">
      {vendorAssessment.documentUrl && (
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" asChild>
          <a href={vendorAssessment.documentUrl} target="_blank" rel="noopener noreferrer" aria-label={`View evidence PDF for ${vendorAssessment.name}`}>
            <FileText className="h-3.5 w-3.5" aria-hidden />
            View PDF
          </a>
        </Button>
      )}
      <Button variant="outline" size="sm" className="h-8" asChild>
        <Link href={`/vendors/${vendorAssessment.id}/assessment`}>
          Open assessment
        </Link>
      </Button>
    </div>
  );
}

export function VendorsTableSection({
  vendorAssessments,
}: VendorsTableSectionProps) {
  const router = useRouter();
  const selectAllRef = React.useRef<HTMLInputElement | null>(null);
  const [q, setQ] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>('name');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [selectedVendorIds, setSelectedVendorIds] = React.useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [copiedVendorId, setCopiedVendorId] = React.useState<string | null>(null);
  const [codeDialogVendorId, setCodeDialogVendorId] = React.useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = React.useState<AccessCodeDuration>("24h");
  const [codeActionVendorId, setCodeActionVendorId] = React.useState<string | null>(null);

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
      let aVal: any, bVal: any;
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

    const confirmed = window.confirm(
      `Delete ${selectedVendorIds.size} selected vendors? This will remove linked assessments and answers.`
    );
    if (!confirmed) return;

    setIsBulkDeleting(true);
    const result = await deleteVendorsAction(Array.from(selectedVendorIds));

    if (!result.ok) {
      window.alert(result.error);
      setIsBulkDeleting(false);
      return;
    }

    setSelectedVendorIds(new Set());
    router.refresh();
    setIsBulkDeleting(false);
  };

  const handleCopyAccessCode = async (vendorId: string, accessCode: string | null) => {
    if (!accessCode) return;

    try {
      await navigator.clipboard.writeText(accessCode);
      setCopiedVendorId(vendorId);
      window.setTimeout(() => setCopiedVendorId((prev) => (prev === vendorId ? null : prev)), 1200);
    } catch {
      window.alert("Copy failed. Please copy the code manually.");
    }
  };

  const handleGenerateCode = async () => {
    if (!codeDialogVendorId) return;
    setCodeActionVendorId(codeDialogVendorId);
    const result = await generateVendorAccessCodeAction(codeDialogVendorId, selectedDuration);
    if (!result.ok) {
      window.alert(result.error);
      setCodeActionVendorId(null);
      return;
    }

    setCodeActionVendorId(null);
    setCodeDialogVendorId(null);
    router.refresh();
  };

  const handleVoidCode = async (vendor: VendorAssessment) => {
    const confirmed = window.confirm(`Void active access code for ${vendor.name}?`);
    if (!confirmed) return;

    setCodeActionVendorId(vendor.id);
    const result = await voidVendorAccessCodeAction(vendor.id);
    if (!result.ok) {
      window.alert(result.error);
      setCodeActionVendorId(null);
      return;
    }

    setCodeActionVendorId(null);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Vendors
          </h1>
          <p className="text-sm text-muted-foreground">
            Search, invite, and open NIS2 assessment workspaces.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {selectedVendorIds.size > 0 && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-red-200 text-red-700 hover:bg-red-50 sm:w-auto dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? "Deleting selected..." : `Delete selected (${selectedVendorIds.size})`}
            </Button>
          )}
          <AddVendorModal
            trigger={
              <Button type="button" className="w-full sm:w-auto" disabled={isBulkDeleting}>
                Invite vendor
              </Button>
            }
          />
        </div>
      </div>

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          placeholder="Search by name, service, or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
          aria-label="Search vendors"
        />
      </div>

      <div className="overflow-x-auto">
        <Table>
          <caption className="sr-only">
            Vendor assessments with status, compliance score, risk level, and actions
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Select all visible vendors"
                  checked={allVisibleSelected}
                  onChange={(e) => handleToggleAllVisible(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                  disabled={visibleIds.length === 0 || isBulkDeleting}
                />
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('name')} className="h-auto p-0 font-semibold">
                  Name
                  {sortKey === 'name' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead>Access code</TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('serviceType')} className="h-auto p-0 font-semibold">
                  Service type
                  {sortKey === 'serviceType' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('status')} className="h-auto p-0 font-semibold">
                  Status
                  {sortKey === 'status' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('lastAssessmentDate')} className="h-auto p-0 font-semibold">
                  Last assessment
                  {sortKey === 'lastAssessmentDate' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('questionnaireProgress')} className="h-auto p-0 font-semibold">
                  Questions filled
                  {sortKey === 'questionnaireProgress' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('complianceScore')} className="h-auto p-0 font-semibold">
                  Compliance score
                  {sortKey === 'complianceScore' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('riskLevel')} className="h-auto p-0 font-semibold">
                  Risk level
                  {sortKey === 'riskLevel' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="h-24 text-center text-muted-foreground"
                >
                  No vendors match your search.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Select vendor ${v.name}`}
                      checked={selectedVendorIds.has(v.id)}
                      onChange={(e) => handleToggleVendor(v.id, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                      disabled={isBulkDeleting}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      {v.isCodeActive && v.accessCode ? (
                        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold tracking-wider dark:border-slate-700 dark:bg-slate-900">
                          <span>{v.accessCode}</span>
                          <button
                            type="button"
                            aria-label={`Copy access code for ${v.name}`}
                            onClick={() => handleCopyAccessCode(v.id, v.accessCode)}
                            className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {copiedVendorId === v.id && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Copied</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No active code</span>
                      )}
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatAccessCodeExpiry(v.codeExpiresAt)}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[10px]"
                          onClick={() => setCodeDialogVendorId(v.id)}
                          disabled={Boolean(codeActionVendorId)}
                        >
                          Generate Access Code
                        </Button>
                        {v.isCodeActive && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 border-red-200 px-2 text-[10px] text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                            onClick={() => handleVoidCode(v)}
                            disabled={Boolean(codeActionVendorId)}
                          >
                            {codeActionVendorId === v.id ? "Voiding..." : "Void Code"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {v.serviceType}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                      ${ v.status === "completed"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                          : v.status === "incomplete"
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}>
                      {v.status === "completed" ? "Completed" : v.status === "incomplete" ? "Incomplete" : "Pending"}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatDate(v.lastAssessmentDate)}
                  </TableCell>
                  <TableCell>
                    <ProgressPill progress={v.questionnaireProgress} filled={v.questionsFilled} />
                  </TableCell>
                  <TableCell>
                    <ScorePill score={v.complianceScore} status={v.status} />
                  </TableCell>
                  <TableCell>
                    <RiskBadge level={v.riskLevel} />
                  </TableCell>
                  <TableCell className="text-right">
                    <VendorActions
                      vendorAssessment={v}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(codeDialogVendorId)} onOpenChange={(open) => !open && setCodeDialogVendorId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Access Code</DialogTitle>
            <DialogDescription>
              Choose how long this temporary access code should stay active.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="code-duration" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Validity
            </label>
            <select
              id="code-duration"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(e.target.value as AccessCodeDuration)}
            >
              <option value="1h">1 hour</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCodeDialogVendorId(null)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateCode} disabled={Boolean(codeActionVendorId)}>
              {codeActionVendorId ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
