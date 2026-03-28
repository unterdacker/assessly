"use client";

import * as React from "react";
import Link from "next/link";
import { Search, FileText } from "lucide-react";
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
              <TableHead>Name</TableHead>
              <TableHead>Service type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last assessment</TableHead>
              <TableHead>Compliance score</TableHead>
              <TableHead>Risk level</TableHead>
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
              filtered.map((v) => (
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
