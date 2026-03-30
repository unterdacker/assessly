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
  translations: {
    Dashboard: string;
    DashboardDesc: string;
    SupplyChainRiskScore: string;
    SupplyChainRiskScoreDesc: string;
    Pending: string;
    AwaitingVendorResponse: string;
    Incomplete: string;
    QuestionnaireUnderway: string;
    Completed: string;
    AssessmentsClosed: string;
    ManageVendors: string;
    ElevatedAttentionRecommended: string;
    MonitorAndRemediateGaps: string;
    WithinAcceptableBand: string;
    TrustAndCompliance: string;
    TrustComplianceDesc: string;
    RiskColoring: string;
    AssessmentWorkspace: string;
    InviteNewVendors: string;
  };
};

export function DashboardOverview({
  vendorAssessments,
  translations,
}: DashboardOverviewProps) {
  const score = supplyChainRiskScore(vendorAssessments);
  const pending = countByStatus(vendorAssessments, "pending");
  const inProgress = countByStatus(vendorAssessments, "incomplete");
  const completed = countByStatus(vendorAssessments, "completed");

  const tiles = [
    {
      label: translations.Pending,
      value: pending,
      icon: Mail,
      hint: translations.AwaitingVendorResponse,
    },
    {
      label: translations.Incomplete,
      value: inProgress,
      icon: ClipboardList,
      hint: translations.QuestionnaireUnderway,
    },
    {
      label: translations.Completed,
      value: completed,
      icon: UserCheck,
      hint: translations.AssessmentsClosed,
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {translations.Dashboard}
          </h1>
          <p className="text-sm text-muted-foreground">
            {translations.DashboardDesc}
          </p>
        </div>
        <Button variant="secondary" asChild className="w-full sm:w-auto">
          <Link href="/vendors">{translations.ManageVendors}</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">{translations.SupplyChainRiskScore}</CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              {translations.SupplyChainRiskScoreDesc}
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
              {score < 40 && translations.ElevatedAttentionRecommended}
              {score >= 40 && score <= 70 && translations.MonitorAndRemediateGaps}
              {score > 70 && translations.WithinAcceptableBand}
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
          <CardTitle className="text-base">{translations.TrustAndCompliance}</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            {translations.TrustComplianceDesc}
          </p>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>{translations.RiskColoring}</li>
            <li>{translations.AssessmentWorkspace}</li>
            <li>{translations.InviteNewVendors}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
