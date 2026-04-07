"use client";

import { useState, useRef, useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { uploadInternalAnswerEvidence } from "@/app/actions/upload-answer-evidence";
import { nis2Questions } from "@/lib/nis2-questions";
import { cn } from "@/lib/utils";
import type { AssessmentAnswer } from "@prisma/client";
import { EvidenceViewer } from "@/components/evidence-viewer";

/* ─── Inline Evidence Form ────────────────────────────────────────────────── */

type EvidenceFormProps = {
  targetStatus: "COMPLIANT" | "NON_COMPLIANT";
  onSave: (notes: string, pdfBase64: string | null, pdfFilename: string | null) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
  t: ReturnType<typeof useTranslations>;
};

function EvidenceForm({ targetStatus, onSave, onCancel, isSaving, t }: EvidenceFormProps) {
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
      setFileError(t("manualOverride.fileOnlyPdf"));
      return;
    }
    setFile(f);
  }

  return (
    <form
      onSubmit={handleSave}
      className="mt-3 space-y-3 rounded-lg border border-border bg-card p-4"
      aria-label={t("manualOverride.formAria")}
    >
      {/* Status badge */}
      <div className="flex items-center gap-2">
        {isCompliant ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-red-400" aria-hidden />
        )}
        <span className={cn("text-xs font-semibold", isCompliant ? "text-emerald-400" : "text-red-400")}>
          {t("manualOverride.markingAs", {
            status: isCompliant ? t("status.compliant") : t("status.nonCompliant"),
          })}
        </span>
      </div>

      {/* Justification — required */}
      <div className="space-y-1">
        <label htmlFor="override-notes" className="text-xs font-medium text-foreground">
          {t("manualOverride.justificationLabel")}{" "}
          <span className="text-red-400" aria-hidden="true">*</span>
        </label>
        <textarea
          id="override-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("manualOverride.justificationPlaceholder")}
          rows={4}
          required
          className={cn(
            "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground",
            "placeholder:text-muted-foreground shadow-sm",
            "focus:outline-none focus:ring-2 focus:ring-indigo-500",
            "hover:border-slate-400 dark:hover:border-slate-600 resize-y",
          )}
        />
        <p className="text-xs text-muted-foreground">
          {t("manualOverride.justificationHelp")}
        </p>
      </div>

      {/* Supplemental evidence PDF — optional */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">
          {t("manualOverride.supplementalEvidenceLabel")}{" "}
          <span className="font-normal text-muted-foreground">({t("manualOverride.optional")})</span>
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-md border border-dashed",
            "border-border bg-background px-3 py-2.5 text-left",
            "hover:border-slate-400 hover:bg-muted/40 transition-colors",
            fileError && "border-red-700",
          )}
          aria-label={t("manualOverride.attachPdfAria")}
        >
          <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-xs text-muted-foreground">
            {file ? file.name : t("manualOverride.attachPdfPlaceholder")}
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
          className="flex-1 text-muted-foreground hover:text-foreground"
          onClick={onCancel}
          disabled={isSaving}
        >
          {t("manualOverride.cancel")}
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
          {isSaving ? t("manualOverride.saving") : t("manualOverride.saveOverride")}
        </Button>
      </div>
    </form>
  );
}

/* ─── AI Insight Card ─────────────────────────────────────────────────────── */

type AiInsightCardProps = {
  assessmentId: string;
  selectedQuestion: (typeof nis2Questions)[number] | undefined;
  selectedQuestionText: string | undefined;
  selectedAnswer:
    | (AssessmentAnswer & {
        document?: {
          id: string;
          filename: string;
          fileSize: number;
          uploadedAt: string | Date;
          uploadedBy: string;
        } | null;
      })
    | undefined;
  t: ReturnType<typeof useTranslations>;
  readOnly: boolean;
};

function AiInsightCard({ assessmentId, selectedQuestion, selectedQuestionText, selectedAnswer, t, readOnly }: AiInsightCardProps) {
  const router = useRouter();
  // Which override button was clicked ("COMPLIANT" | "NON_COMPLIANT" | null)
  const [activeOverride, setActiveOverride] = useState<"COMPLIANT" | "NON_COMPLIANT" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  // Optimistic status — shown instantly before server confirms
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<string | null>(
    selectedAnswer?.status ?? null,
  );

  const isAnswered = !!selectedAnswer;
  const evidenceSnippet = (selectedAnswer as { evidenceSnippet?: string | null } | undefined)?.evidenceSnippet;

  async function handleUploadEvidenceFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file || !selectedQuestion) return;

    setUploadError(null);
    setIsUploadingEvidence(true);

    try {
      const formData = new FormData();
      formData.append("assessmentId", assessmentId);
      formData.append("questionId", selectedQuestion.id);
      formData.append("evidenceFile", file);

      const result = await uploadInternalAnswerEvidence(formData);
      if (!result.ok) {
        setUploadError(result.error || t("aiInsight.uploadFailed"));
        return;
      }

      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("aiInsight.uploadFailed");
      setUploadError(message);
    } finally {
      setIsUploadingEvidence(false);
      if (evidenceInputRef.current) {
        evidenceInputRef.current.value = "";
      }
    }
  }

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
          {t("aiInsight.title")}
        </CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          {t("aiInsight.reviewing", { question: selectedQuestionText ?? "" })}
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
              ? t("aiInsight.saving")
              : displayStatus === "COMPLIANT"
              ? t("status.compliant")
              : t("status.nonCompliant")}
          </div>
        )}

        {/* AI findings */}
        <div className="rounded-md border border-border bg-card p-3 text-sm text-foreground shadow-sm">
          {selectedAnswer?.findings ? (
            <p className="whitespace-pre-wrap leading-relaxed">{selectedAnswer.findings}</p>
          ) : (
            <p className="text-muted-foreground italic">
              {t("aiInsight.noReasoning")}
            </p>
          )}
        </div>

        {evidenceSnippet && (
          <div className="rounded-md border border-indigo-200 bg-indigo-50/70 p-3 text-xs leading-relaxed text-foreground shadow-sm dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-slate-300">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-foreground dark:text-slate-300">
              {t("aiInsight.evidenceFromDocument")}
            </p>
            <p className="italic">&quot;{evidenceSnippet}&quot;</p>
          </div>
        )}

        {/* Shared evidence viewer/upload for the currently selected requirement */}
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("aiInsight.answerEvidenceTitle")}
          </p>

          {selectedAnswer?.id && selectedAnswer?.evidenceFileUrl ? (
            <EvidenceViewer
              answerId={selectedAnswer.id}
              filename={selectedAnswer.evidenceFileName || selectedAnswer.document?.filename || "evidence-file"}
              fileSize={selectedAnswer.document?.fileSize ?? null}
              uploadedAt={selectedAnswer.document?.uploadedAt ?? null}
              uploadedBy={selectedAnswer.document?.uploadedBy ?? null}
              viewLabel={t("aiInsight.viewEvidence")}
              uploadedAtLabel={t("aiInsight.uploadedAt")}
              uploadedByLabel={t("aiInsight.uploadedBy")}
              sizeLabel={t("aiInsight.fileSize")}
              unknownLabel={t("aiInsight.unknown")}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("aiInsight.noEvidenceUploaded")}
            </p>
          )}

          {!readOnly ? (
            <div className="flex items-center gap-2">
              <input
                ref={evidenceInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={handleUploadEvidenceFile}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={isUploadingEvidence || !selectedQuestion}
                onClick={() => evidenceInputRef.current?.click()}
              >
                {isUploadingEvidence ? t("aiInsight.uploadingEvidence") : t("aiInsight.uploadEvidence")}
              </Button>
            </div>
          ) : null}

          {uploadError && (
            <p className="text-xs text-red-500">{uploadError}</p>
          )}
        </div>

        {/* Link to supplemental evidence if present */}
        {selectedAnswer?.evidenceUrl && (
          <a
            href={selectedAnswer.evidenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {t("aiInsight.viewSupplementalEvidencePdf")}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}

        {/* Inline evidence form — rendered below AI text */}
        {!readOnly && activeOverride && (
          <EvidenceForm
            targetStatus={activeOverride}
            onSave={handleSaveOverride}
            onCancel={() => { setActiveOverride(null); setSaveError(null); }}
            isSaving={isPending}
            t={t}
          />
        )}

        {saveError && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {saveError}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
        {readOnly ? (
          <p className="w-full text-xs text-muted-foreground">
            Read-only auditor view. Manual overrides and evidence uploads are restricted to admins.
          </p>
        ) : (
          <>
            <p className="text-xs font-semibold text-slate-500 tracking-wider uppercase w-full">
              {t("manualOverride.title")}
              {isAnswered && (
                <span className="ml-1 normal-case font-normal text-amber-600 dark:text-amber-400">
                  {t("manualOverride.justificationRequired")}
                </span>
              )}
            </p>
            <div className="flex w-full gap-2">
          {/* Mark Compliant — solid green when already saved, ring when form is open */}
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "flex-1 gap-1 transition-all",
              displayStatus === "COMPLIANT" && activeOverride !== "COMPLIANT" &&
                "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 dark:border-emerald-600",
              activeOverride === "COMPLIANT" &&
                "ring-2 ring-emerald-500 border-emerald-400",
            )}
            onClick={() =>
              setActiveOverride(activeOverride === "COMPLIANT" ? null : "COMPLIANT")
            }
            aria-pressed={activeOverride === "COMPLIANT" || displayStatus === "COMPLIANT"}
            disabled={isPending}
          >
            <CheckCircle2
              className={cn(
                "h-4 w-4",
                displayStatus === "COMPLIANT" && activeOverride !== "COMPLIANT"
                  ? "text-white"
                  : "text-emerald-600 dark:text-emerald-400",
              )}
            />
            {t("manualOverride.markCompliant")}
          </Button>

          {/* Mark Non-compliant — solid red when already saved, ring when form is open */}
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "flex-1 gap-1 transition-all",
              displayStatus === "NON_COMPLIANT" && activeOverride !== "NON_COMPLIANT" &&
                "bg-red-600 hover:bg-red-700 text-white border-red-600 dark:border-red-600",
              activeOverride === "NON_COMPLIANT" &&
                "ring-2 ring-red-500 border-red-400",
            )}
            onClick={() =>
              setActiveOverride(activeOverride === "NON_COMPLIANT" ? null : "NON_COMPLIANT")
            }
            aria-pressed={activeOverride === "NON_COMPLIANT" || displayStatus === "NON_COMPLIANT"}
            disabled={isPending}
          >
            <XCircle
              className={cn(
                "h-4 w-4",
                displayStatus === "NON_COMPLIANT" && activeOverride !== "NON_COMPLIANT"
                  ? "text-white"
                  : "text-red-600 dark:text-red-400",
              )}
            />
            {t("manualOverride.markNonCompliant")}
          </Button>
            </div>
          </>
        )}
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
  readOnly: boolean;
};

export function VendorAssessmentSidePanels({
  insightLines,
  assessmentId,
  answers,
  selectedQuestionId,
  readOnly,
}: VendorAssessmentSidePanelsProps) {
  const t = useTranslations("assessment.sidePanels");
  const tRoot = useTranslations();
  const tQuestions = useTranslations("externalAssessment.questions");
  
  const selectedAnswer = selectedQuestionId
    ? answers.find((a) => a.questionId === selectedQuestionId)
    : null;

  const selectedQuestion = selectedQuestionId
    ? nis2Questions.find((q) => q.id === selectedQuestionId)
    : null;

  const rawKey = selectedQuestion
    ? (`externalAssessment.questions.${selectedQuestion.id}.text` as Parameters<typeof tRoot>[0])
    : null;
  const selectedQuestionText = selectedQuestion
    ? (rawKey && tRoot.has(rawKey)
        ? tQuestions(`${selectedQuestion.id}.text` as Parameters<typeof tQuestions>[0])
        : selectedQuestion.text)
    : undefined;

  return (
    <div className="space-y-3 lg:sticky lg:top-20">
      {selectedQuestionId ? (
        <AiInsightCard
          assessmentId={assessmentId}
          selectedQuestion={selectedQuestion ?? undefined}
          selectedQuestionText={selectedQuestionText}
          selectedAnswer={selectedAnswer ?? undefined}
          t={t}
          readOnly={readOnly}
        />
      ) : (
        <Card>
          <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
              {t("emptyState.vendorEvidencePdf")}
            </CardTitle>
            <p className="text-xs font-normal text-muted-foreground">
              {t("emptyState.selectQuestion")}
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <div className="flex h-36 flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50/80 text-center dark:border-slate-700 dark:bg-slate-900/40">
              <FileText className="mb-1.5 h-6 w-6 text-slate-400" aria-hidden />
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t("emptyState.awaitingSelection")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
            {t("summary.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-3">
          <ul className="m-0 list-none space-y-2 p-0" aria-label={t("summary.ariaLabel")}>
            {insightLines.map((line, i) => (
              <li
                key={i}
                className="rounded-md border border-slate-200/80 bg-white/60 p-2.5 text-xs leading-relaxed dark:border-slate-800 dark:bg-slate-900/40"
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
