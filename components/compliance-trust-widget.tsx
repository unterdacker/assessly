"use client";

import { useState } from "react";
import { CheckCircle2, Download, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/info-tooltip";
import type { ComplianceTrustMetrics } from "@/lib/queries/dashboard-risk-posture";

type ComplianceTrustWidgetProps = {
  metrics: ComplianceTrustMetrics;
  translations: {
    title: string;
    description: string;
    aiDecisionTransparency: string;
    aiDecisionTransparencyTooltip: string;
    humanOversightRate: string;
    humanOversightRateTooltip: string;
    systemIntegrity: string;
    systemIntegrityTooltip: string;
    aiGenerationLabel: string;
    verifiedBadge: string;
    verifiedValue: string;
    unverifiedValue: string;
    recordedActionsLabel: string;
    downloadButton: string;
    downloadHint: string;
    downloadFailed: string;
  };
};

export function ComplianceTrustWidget({ metrics, translations }: ComplianceTrustWidgetProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownloadSummary() {
    setIsDownloading(true);
    try {
      const response = await fetch("/api/admin/forensic-audit-summary?format=json", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to download forensic audit summary.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `forensic-audit-summary-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      window.alert(translations.downloadFailed);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Card className="overflow-hidden border-success-border bg-card text-foreground shadow-[var(--shadow-success-card)]">
      <CardHeader className="border-b border-success-border bg-success-muted">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-success-border bg-success-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-success-muted-fg">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {translations.verifiedBadge}
            </div>
            <CardTitle className="text-base">{translations.title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{translations.description}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-success-border bg-success-muted px-2.5 py-1 text-xs font-semibold text-success-muted-fg">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {metrics.systemIntegrityPercent}% {translations.systemIntegrity}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted p-3">
            <div className="flex items-center gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {translations.aiDecisionTransparency}
              </p>
              <InfoTooltip content={translations.aiDecisionTransparencyTooltip} />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{metrics.aiGenerationCount}</p>
            <p className="text-xs text-muted-foreground">{translations.aiGenerationLabel}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted p-3">
            <div className="flex items-center gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {translations.humanOversightRate}
              </p>
              <InfoTooltip content={translations.humanOversightRateTooltip} />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{metrics.humanOversightRate}%</p>
            <p className="text-xs text-muted-foreground">
              {metrics.editedByHumanCount}/{metrics.finalizedSuggestionCount}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted p-3">
            <div className="flex items-center gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {translations.systemIntegrity}
              </p>
              <InfoTooltip content={translations.systemIntegrityTooltip} />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {metrics.systemIntegrityVerified
                ? translations.verifiedValue
                : translations.unverifiedValue}
            </p>
            <p className="text-xs text-muted-foreground">
              {translations.recordedActionsLabel}: {metrics.recordedAuditEntries}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{translations.downloadHint}</p>
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadSummary}
            disabled={isDownloading}
            className="border-success-border text-success hover:bg-success-muted"
          >
            {isDownloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="mr-2 h-4 w-4" aria-hidden />
            )}
            {translations.downloadButton}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
