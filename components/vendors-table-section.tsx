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
            Vendor assessments with service type, last assessment date, risk level, and actions
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Service type</TableHead>
              <TableHead>Last assessment</TableHead>
              <TableHead>Risk level</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
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
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatDate(v.lastAssessmentDate)}
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
