"use client";

import Link from "next/link";
import { ClipboardList, Mail, UserCheck } from "lucide-react";
import {
  countByStatus,
  supplyChainRiskScore,
  type VendorAssessment,
} from "@/lib/vendor-assessment";
import { scoreGaugeColor } from "@/lib/score-colors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskGauge } from "@/components/risk-gauge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DashboardOverviewProps = {
  vendorAssessments: VendorAssessment[];
};

export function DashboardOverview({
  vendorAssessments,
}: DashboardOverviewProps) {
  const score = supplyChainRiskScore(vendorAssessments);
  const pending = countByStatus(vendorAssessments, "pending");
  const inProgress = countByStatus(vendorAssessments, "incomplete");
  const completed = countByStatus(vendorAssessments, "completed");

  const tiles = [
    {
      label: "Pending",
      value: pending,
      icon: Mail,
      hint: "Awaiting vendor response",
    },
    {
      label: "Incomplete",
      value: inProgress,
      icon: ClipboardList,
      hint: "Questionnaire underway",
    },
    {
      label: "Completed",
      value: completed,
      icon: UserCheck,
      hint: "Assessments closed",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Third-party risk posture overview for NIS2-aligned oversight.
          </p>
        </div>
        <Button variant="secondary" asChild className="w-full sm:w-auto">
          <Link href="/vendors">Manage vendors</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Supply chain risk score</CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Aggregated from vendor compliance scores (0–100). Higher reflects
              stronger collective posture.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center pb-8">
            <RiskGauge value={score} />
            <p
              className={cn(
                "mt-2 text-center text-xs font-medium",
                scoreGaugeColor(score),
              )}
            >
              {score < 40 && "Elevated attention recommended"}
              {score >= 40 && score <= 70 && "Monitor and remediate gaps"}
              {score > 70 && "Within acceptable band — maintain reviews"}
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-3">
          {tiles.map(({ label, value, icon: Icon, hint }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {label}
                </CardTitle>
                <Icon className="h-4 w-4 text-indigo-600 opacity-80 dark:text-indigo-400" aria-hidden />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trust & compliance</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            AVRA helps security officers evidence due diligence across the digital
            supply chain. Figures on this page are read from your AVRA database.
          </p>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>Risk coloring: red below 40, amber 40–70, green above 70.</li>
            <li>Assessment workspace pairs the NIS2 questionnaire with evidence review.</li>
            <li>Invite new vendors from the vendor list; changes persist to the database.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
