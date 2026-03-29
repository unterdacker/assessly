"use client";

import * as React from "react";
import Link from "next/link";
import { Search, FileText, ChevronUp, ChevronDown } from "lucide-react";
import { AddVendorModal } from "@/components/add-vendor-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [q, setQ] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>('name');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');

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
        <AddVendorModal
          trigger={
            <Button type="button" className="w-full sm:w-auto">
              Invite vendor
            </Button>
          }
        />
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
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('name')} className="h-auto p-0 font-semibold">
                  Name
                  {sortKey === 'name' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                </Button>
              </TableHead>
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
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No vendors match your search.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
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
                    <VendorActions vendorAssessment={v} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
