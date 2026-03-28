"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import type { VendorAssessment } from "@/lib/vendor-assessment";
import type { Nis2QuestionAnalysis } from "@/lib/nis2-question-analysis";
import { analyzeDocument } from "@/app/actions/analyze-document";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/risk-badge";
import { scoreGaugeColor } from "@/lib/score-colors";
import { cn } from "@/lib/utils";
import { buildVendorAssessmentInsightLines } from "@/lib/vendor-assessment-insights";
import { VendorAssessmentQuestionnairePanel } from "@/components/vendor-assessment-questionnaire-panel";
import { VendorAssessmentSidePanels } from "@/components/vendor-assessment-side-panels";
import { Progress } from "@/components/ui/progress";

type AssessmentWorkspaceProps = {
  vendorAssessment: VendorAssessment;
  assessmentId: string;
  initialAnswers: any[]; // Using any[] temporarily until prisma generate solves the type locally
};

export function AssessmentWorkspace({
  vendorAssessment,
  assessmentId,
  initialAnswers,
}: AssessmentWorkspaceProps) {
  const insightLines = buildVendorAssessmentInsightLines(vendorAssessment);
  
  // Track selected question for side-by-side view
  const [selectedQuestionId, setSelectedQuestionId] = React.useState<string | null>(null);

  // We rely purely on the DB answers passed in, which are refreshed via Server Action revalidation.
  // We no longer need the local simulation-based analysisByQuestionId state for the panels.
  const [auditRunning, setAuditRunning] = React.useState(false);
  const [auditError, setAuditError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (!auditRunning) return;
    const tick = window.setInterval(() => {
      setProgress((p) => (p >= 88 ? p : p + 4));
    }, 160);
    return () => window.clearInterval(tick);
  }, [auditRunning]);

  const handleRunAiAudit = React.useCallback(async () => {
    setAuditError(null);
    setAuditRunning(true);
    setProgress(4);
    const formData = new FormData();
    formData.append("vendorId", vendorAssessment.id);
    formData.append(
      "file",
      new File(
        [new TextEncoder().encode("simulated: vendor security policy excerpt")],
        "simulated-security-policy.txt",
        { type: "text/plain" },
      ),
    );
    try {
      const outcome = await analyzeDocument(formData);
      if (!outcome.ok) {
        setAuditError(outcome.error);
        return;
      }
      // Success. revalidatePath inside analyzeDocument will refresh initialAnswers automatically.
    } catch {
      setAuditError("Analysis could not be completed. Try again in a moment.");
    } finally {
      setProgress(100);
      setAuditRunning(false);
    }
  }, [vendorAssessment.id]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-1" asChild>
            <Link href="/vendors">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to vendors
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {vendorAssessment.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Assessment workspace · {vendorAssessment.serviceType}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge level={vendorAssessment.riskLevel} />
          <span
            className={cn(
              "rounded-md border border-slate-200 px-2 py-1 text-xs font-medium tabular-nums dark:border-slate-700",
              scoreGaugeColor(vendorAssessment.complianceScore),
            )}
          >
            Score {vendorAssessment.complianceScore}/100
          </span>
        </div>
      </header>

      <section
        className="rounded-lg border border-slate-200 bg-card p-4 dark:border-slate-800"
        aria-labelledby="ai-document-audit-title"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h2
              id="ai-document-audit-title"
              className="flex items-center gap-2 text-sm font-semibold"
            >
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
              AI document audit (simulated)
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Data is processed on{" "}
              <strong className="font-medium text-foreground">
                EU-based AI endpoints only
              </strong>{" "}
              in this design — no US-only inference regions. This prototype still uses a fixed policy
              excerpt and a deterministic rule set instead of a live model.
            </p>
          </div>
          <Button
            type="button"
            className="w-full shrink-0 sm:w-auto"
            onClick={handleRunAiAudit}
            disabled={auditRunning}
            aria-busy={auditRunning}
          >
            {auditRunning ? (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                Running…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden />
                Run AI audit
              </>
            )}
          </Button>
        </div>

        <div
          className="mt-4 space-y-2"
          aria-live="polite"
          aria-atomic="true"
        >
          {auditRunning ? (
            <>
              <p className="text-sm font-medium text-foreground">
                Running AI audit…
              </p>
              <Progress value={progress} aria-label="AI audit progress" />
            </>
          ) : null}
          {auditError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {auditError}
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <VendorAssessmentQuestionnairePanel
          answers={initialAnswers}
          selectedQuestionId={selectedQuestionId}
          onSelectQuestion={setSelectedQuestionId}
        />
        <VendorAssessmentSidePanels 
          insightLines={insightLines}
          assessmentId={assessmentId}
          answers={initialAnswers}
          selectedQuestionId={selectedQuestionId}
        />
      </div>
    </div>
  );
}
