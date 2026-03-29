"use client";

import { useState, useRef, useOptimistic, useTransition } from "react";
import {
  FileText,
  Sparkles,
  CheckCircle2,
  XCircle,
  Upload,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { overrideAssessmentAnswer } from "@/app/actions/update-answer-override";
import { nis2Questions } from "@/lib/nis2-questions";
import { cn } from "@/lib/utils";
import type { AssessmentAnswer } from "@prisma/client";

/* ─── Inline Evidence Form ────────────────────────────────────────────────── */

type EvidenceFormProps = {
  targetStatus: "COMPLIANT" | "NON_COMPLIANT";
  onSave: (notes: string, pdfBase64: string | null, pdfFilename: string | null) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
};

function EvidenceForm({ targetStatus, onSave, onCancel, isSaving }: EvidenceFormProps) {
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isCompliant = targetStatus === "COMPLIANT";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    let base64: string | null = null;
    if (file) {
      const ab = await file.arrayBuffer();
      base64 = Buffer.from(ab).toString("base64");
    }
    await onSave(notes, base64, file?.name ?? null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFileError(null);
    if (f && f.type !== "application/pdf") {
      setFileError("Only PDF files are accepted.");
      return;
    }
    setFile(f);
  }

  return (
    <form
      onSubmit={handleSave}
      className="mt-3 space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-4"
      aria-label="Manual override evidence form"
    >
      {/* Status badge */}
      <div className="flex items-center gap-2">
        {isCompliant ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-red-400" aria-hidden />
        )}
        <span className={cn("text-xs font-semibold", isCompliant ? "text-emerald-400" : "text-red-400")}>
          Marking as {isCompliant ? "Compliant" : "Non-compliant"}
        </span>
      </div>

      {/* Justification — required */}
      <div className="space-y-1">
        <label htmlFor="override-notes" className="text-xs font-medium text-slate-300">
          Justification / Reasoning{" "}
          <span className="text-red-400" aria-hidden="true">*</span>
        </label>
        <textarea
          id="override-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Explain why you are overriding this answer…"
          rows={4}
          required
          className={cn(
            "w-full rounded-md border bg-slate-950 px-3 py-2 text-sm text-slate-100",
            "placeholder:text-slate-500 shadow-sm",
            "focus:outline-none focus:ring-2 focus:ring-indigo-500",
            "border-slate-700 hover:border-slate-600 resize-y",
          )}
        />
        <p className="text-xs text-slate-500">
          Required. Stored permanently in the audit trail.
        </p>
      </div>

      {/* Supplemental evidence PDF — optional */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-300">
          Supplemental Evidence PDF{" "}
          <span className="text-slate-500 font-normal">(optional)</span>
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-md border border-dashed",
            "border-slate-700 bg-slate-950 px-3 py-2.5 text-left",
            "hover:border-slate-500 hover:bg-slate-900 transition-colors",
            fileError && "border-red-700",
          )}
          aria-label="Attach supplemental evidence PDF"
        >
          <Upload className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <span className="text-xs text-slate-400 truncate">
            {file ? file.name : "Click to attach a PDF…"}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
        </button>
        {fileError && (
          <p className="text-xs text-red-400">{fileError}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="flex-1 text-slate-400 hover:text-slate-200"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={isSaving || !notes.trim()}
          className={cn(
            "flex-1 gap-1.5",
            isCompliant
              ? "bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-900"
              : "bg-red-600 hover:bg-red-700 text-white disabled:bg-red-900",
          )}
        >
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {isSaving ? "Saving…" : `Save Override`}
        </Button>
      </div>
    </form>
  );
}

/* ─── AI Insight Card ─────────────────────────────────────────────────────── */

type AiInsightCardProps = {
  assessmentId: string;
  selectedQuestion: (typeof nis2Questions)[number] | undefined;
  selectedAnswer: AssessmentAnswer | undefined;
};

function AiInsightCard({ assessmentId, selectedQuestion, selectedAnswer }: AiInsightCardProps) {
  // Which override button was clicked ("COMPLIANT" | "NON_COMPLIANT" | null)
  const [activeOverride, setActiveOverride] = useState<"COMPLIANT" | "NON_COMPLIANT" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Optimistic status — shown instantly before server confirms
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<string | null>(
    selectedAnswer?.status ?? null,
  );

  const isAnswered = !!selectedAnswer;
  const evidenceSnippet = (selectedAnswer as { evidenceSnippet?: string | null } | undefined)?.evidenceSnippet;

  async function handleSaveOverride(
    notes: string,
    pdfBase64: string | null,
    pdfFilename: string | null,
  ) {
    if (!activeOverride || !selectedQuestion) return;
    setSaveError(null);

    startTransition(async () => {
      // Optimistic update — instant feedback
      setOptimisticStatus(activeOverride);

      const result = await overrideAssessmentAnswer({
        assessmentId,
        questionId: selectedQuestion.id,
        status: activeOverride,
        manualNotes: notes,
        evidencePdfBase64: pdfBase64,
        evidencePdfFilename: pdfFilename,
      });

      if (!result.success) {
        setOptimisticStatus(selectedAnswer?.status ?? null); // rollback
        setSaveError(result.error);
      } else {
        setActiveOverride(null);
      }
    });
  }

  const displayStatus = optimisticStatus;

  return (
    <Card
      className={cn(
        selectedAnswer?.createdBy?.includes("ai")
          ? "border-amber-400 dark:border-amber-500/50"
          : "",
      )}
    >
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
          AI Insight
        </CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          Reviewing: {selectedQuestion?.text}
        </p>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        {/* Current status indicator */}
        {displayStatus && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium",
              displayStatus === "COMPLIANT"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
              isPending && "opacity-60",
            )}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : displayStatus === "COMPLIANT" ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <XCircle className="h-3.5 w-3.5" aria-hidden />
            )}
            {isPending
              ? "Saving…"
              : displayStatus === "COMPLIANT"
              ? "Compliant"
              : "Non-compliant"}
          </div>
        )}

        {/* AI findings */}
        <div className="text-sm rounded-md bg-white p-3 border border-slate-200 shadow-sm dark:bg-slate-950 dark:border-slate-800 text-slate-700 dark:text-slate-300">
          {selectedAnswer?.findings ? (
            <p className="whitespace-pre-wrap leading-relaxed">{selectedAnswer.findings}</p>
          ) : (
            <p className="text-muted-foreground italic">
              No AI reasoning recorded for this question yet.
            </p>
          )}
        </div>

        {evidenceSnippet && (
          <div className="rounded-md border border-indigo-200 bg-indigo-50/70 p-3 text-xs leading-relaxed text-slate-700 shadow-sm dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-slate-300">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Evidence from document
            </p>
            <p className="italic">&quot;{evidenceSnippet}&quot;</p>
          </div>
        )}

        {/* Link to supplemental evidence if present */}
        {selectedAnswer?.evidenceUrl && (
          <a
            href={selectedAnswer.evidenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:underline"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            View supplemental evidence PDF
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}

        {/* Inline evidence form — rendered below AI text */}
        {activeOverride && (
          <EvidenceForm
            targetStatus={activeOverride}
            onSave={handleSaveOverride}
            onCancel={() => { setActiveOverride(null); setSaveError(null); }}
            isSaving={isPending}
          />
        )}

        {saveError && (
          <div className="flex items-center gap-2 rounded-md border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {saveError}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
        <p className="text-xs font-semibold text-slate-500 tracking-wider uppercase w-full">
          Manual Override
          {isAnswered && (
            <span className="ml-1 normal-case font-normal text-amber-600 dark:text-amber-400">
              — justification required
            </span>
          )}
        </p>
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "flex-1 gap-1",
              activeOverride === "COMPLIANT" && "ring-2 ring-emerald-500",
            )}
            onClick={() =>
              setActiveOverride(activeOverride === "COMPLIANT" ? null : "COMPLIANT")
            }
            aria-pressed={activeOverride === "COMPLIANT"}
            disabled={isPending}
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Mark Compliant
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "flex-1 gap-1",
              activeOverride === "NON_COMPLIANT" && "ring-2 ring-red-500",
            )}
            onClick={() =>
              setActiveOverride(activeOverride === "NON_COMPLIANT" ? null : "NON_COMPLIANT")
            }
            aria-pressed={activeOverride === "NON_COMPLIANT"}
            disabled={isPending}
          >
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            Mark Non-compliant
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

/* ─── Main Side Panels ────────────────────────────────────────────────────── */

type VendorAssessmentSidePanelsProps = {
  insightLines: string[];
  assessmentId: string;
  answers: AssessmentAnswer[];
  selectedQuestionId: string | null;
};

export function VendorAssessmentSidePanels({
  insightLines,
  assessmentId,
  answers,
  selectedQuestionId,
}: VendorAssessmentSidePanelsProps) {
  const selectedAnswer = selectedQuestionId
    ? answers.find((a) => a.questionId === selectedQuestionId)
    : null;

  const selectedQuestion = selectedQuestionId
    ? nis2Questions.find((q) => q.id === selectedQuestionId)
    : null;

  return (
    <div className="space-y-4 lg:sticky lg:top-20">
      {selectedQuestionId ? (
        <AiInsightCard
          assessmentId={assessmentId}
          selectedQuestion={selectedQuestion ?? undefined}
          selectedAnswer={selectedAnswer ?? undefined}
        />
      ) : (
        <Card>
          <CardHeader className="border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
              Vendor evidence (PDF)
            </CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Select a question from the questionnaire to view AI insights.
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50/80 text-center dark:border-slate-700 dark:bg-slate-900/40">
              <FileText className="mb-2 h-10 w-10 text-slate-400" aria-hidden />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Awaiting Selection
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
            Workspace Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-6">
          <ul className="m-0 list-none space-y-3 p-0" aria-label="Assessment insights">
            {insightLines.map((line, i) => (
              <li
                key={i}
                className="rounded-md border border-slate-200/80 bg-white/60 p-3 text-sm leading-relaxed dark:border-slate-800 dark:bg-slate-900/40"
              >
                {line}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
