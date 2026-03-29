"use client";

import * as React from "react";
import { 
  ShieldCheck, 
  XCircle, 
  Info, 
  Sparkles, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp,
  AlertCircle,
  Upload
} from "lucide-react";
import type { AssessmentAnswer, Question } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { updateExternalAnswer } from "@/app/actions/update-external-answer";
import { deleteExternalAnswerEvidence } from "@/app/actions/external-portal-actions";

// Local extension to AssessmentAnswer until prisma generate takes full effect
type ExtendedAssessmentAnswer = AssessmentAnswer & {
  isAiSuggested?: boolean;
  verified?: boolean;
  aiSuggestedStatus?: string | null;
  aiConfidence?: number | null;
  aiReasoning?: string | null;
  evidenceSnippet?: string | null;
  justificationText?: string | null;
  evidenceFileUrl?: string | null;
  evidenceFileName?: string | null;
};

type VendorQuestionnaireWizardProps = {
  questions: Question[];
  initialAnswers: ExtendedAssessmentAnswer[];
  assessmentId: string;
  token: string;
  onAnswerSaved?: (answer: ExtendedAssessmentAnswer) => void;
};

/**
 * A streamlined, step-by-step interface for the 20 NIS2 security questions.
 * Supports manual entry and "Confirming" AI-suggested answers with definitive statuses.
 */
export function VendorQuestionnaireWizard({
  questions,
  initialAnswers,
  assessmentId,
  token,
  onAnswerSaved,
}: VendorQuestionnaireWizardProps) {
  const [answers, setAnswers] = React.useState<Record<string, Partial<ExtendedAssessmentAnswer>>>(
    initialAnswers.reduce((acc, a) => ({ ...acc, [a.questionId]: a }), {})
  );
  const [draftStatusByQuestion, setDraftStatusByQuestion] = React.useState<Record<string, string>>({});
  const [draftJustificationByQuestion, setDraftJustificationByQuestion] = React.useState<Record<string, string>>({});
  const [draftEvidenceByQuestion, setDraftEvidenceByQuestion] = React.useState<Record<string, File | null>>({});
  const [draftEvidenceLabelByQuestion, setDraftEvidenceLabelByQuestion] = React.useState<Record<string, string>>({});

  // Sync state if initialAnswers prop changes (e.g. after a router.refresh())
  React.useEffect(() => {
    const nextAnswers = initialAnswers.reduce((acc, a) => ({ ...acc, [a.questionId]: a }), {} as Record<string, Partial<ExtendedAssessmentAnswer>>);
    setAnswers(nextAnswers);
    setDraftStatusByQuestion(
      initialAnswers.reduce((acc, a) => {
        acc[a.questionId] = a.status || "";
        return acc;
      }, {} as Record<string, string>)
    );
    setDraftJustificationByQuestion(
      initialAnswers.reduce((acc, a) => {
        acc[a.questionId] = a.justificationText || a.aiReasoning || a.findings || "";
        return acc;
      }, {} as Record<string, string>)
    );
    setDraftEvidenceLabelByQuestion(
      initialAnswers.reduce((acc, a) => {
        if (a.evidenceFileName) {
          acc[a.questionId] = a.evidenceFileName;
        }
        return acc;
      }, {} as Record<string, string>)
    );
  }, [initialAnswers]);

  const [openQuestionId, setOpenQuestionId] = React.useState<string | null>(questions[0]?.id || null);
  const [isSaving, setIsSaving] = React.useState<string | null>(null);
  const [saveErrorByQuestion, setSaveErrorByQuestion] = React.useState<Record<string, string>>({});

  const handleDeleteEvidence = async (questionId: string, answerId: string) => {
    const confirmed = window.confirm("Delete this uploaded evidence file?");
    if (!confirmed) return;

    setSaveErrorByQuestion((prev) => ({ ...prev, [questionId]: "" }));
    const result = await deleteExternalAnswerEvidence({ token, answerId });

    if (!result.ok || !result.answer) {
      setSaveErrorByQuestion((prev) => ({
        ...prev,
        [questionId]: result.error || "Failed to delete evidence.",
      }));
      return;
    }

    setAnswers((prev) => {
      const previous = prev[questionId] || { questionId };
      const updated = {
        ...previous,
        ...result.answer,
      } as ExtendedAssessmentAnswer;

      onAnswerSaved?.(updated);
      return {
        ...prev,
        [questionId]: updated,
      };
    });

    setDraftEvidenceLabelByQuestion((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const handleSaveAndConfirm = async (questionId: string) => {
    const status = draftStatusByQuestion[questionId] as
      | "COMPLIANT"
      | "NON_COMPLIANT"
      | "NOT_APPLICABLE"
      | undefined;
    const justificationText = (draftJustificationByQuestion[questionId] || "").trim();

    if (!status) {
      setSaveErrorByQuestion((prev) => ({ ...prev, [questionId]: "Select a status before saving." }));
      return;
    }

    if (!justificationText) {
      setSaveErrorByQuestion((prev) => ({ ...prev, [questionId]: "Add a justification before saving." }));
      return;
    }

    setIsSaving(questionId);
    setSaveErrorByQuestion((prev) => ({ ...prev, [questionId]: "" }));

    try {
      const formData = new FormData();
      formData.append("assessmentId", assessmentId);
      formData.append("questionId", questionId);
      formData.append("status", status);
      formData.append("justificationText", justificationText);

      const evidenceFile = draftEvidenceByQuestion[questionId];
      if (evidenceFile) {
        formData.append("evidenceFile", evidenceFile);
      }

      const result = await updateExternalAnswer(formData);

      if (result.ok && result.answer) {
        const previousAnswer = answers[questionId] || { questionId };
        const updatedAnswer = {
          ...previousAnswer,
          ...result.answer,
          questionId,
          status,
          verified: true,
          justificationText,
        } as ExtendedAssessmentAnswer;

        setAnswers((prev) => ({
          ...prev,
          [questionId]: updatedAnswer,
        }));

        if (result.answer.evidenceFileName) {
          setDraftEvidenceLabelByQuestion((prev) => ({
            ...prev,
            [questionId]: result.answer.evidenceFileName as string,
          }));
        }

        setDraftEvidenceByQuestion((prev) => ({
          ...prev,
          [questionId]: null,
        }));

        onAnswerSaved?.(updatedAnswer);

        const currentIndex = questions.findIndex((q) => q.id === questionId);
        const nextQuestion = questions[currentIndex + 1];
        setOpenQuestionId(nextQuestion ? nextQuestion.id : null);
      } else {
        setSaveErrorByQuestion((prev) => ({
          ...prev,
          [questionId]: result.error || "Failed to save answer.",
        }));
      }
    } catch (err) {
      console.error("Failed to update answer:", err);
      setSaveErrorByQuestion((prev) => ({
        ...prev,
        [questionId]: "Unexpected error while saving. Please retry.",
      }));
    } finally {
      setIsSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      {questions.map((q, index) => {
        const answer = answers[q.id];
        const isOpen = openQuestionId === q.id;
        const isFilled = !!answer?.verified;
        const draftStatus = draftStatusByQuestion[q.id] || "";
        const draftJustification = draftJustificationByQuestion[q.id] || "";
        const isCurrentQuestionSaving = isSaving === q.id;
        
        // AI-Suggested logic: Use new DB fields for explicit suggestion state
        const isAiPending = answer?.isAiSuggested && !answer?.verified;
        const isAiSuggested = answer?.isAiSuggested;

        return (
          <div 
            key={q.id}
            className={cn(
              "group overflow-hidden rounded-xl border transition-all duration-200",
              isOpen ? "border-indigo-400 bg-white ring-1 ring-indigo-400/20 dark:border-indigo-500/50" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900",
              isFilled && !isOpen && "border-emerald-100 bg-emerald-50/10 dark:border-emerald-900/10 dark:bg-emerald-950/2",
              isAiPending && !isOpen && "border-amber-200 bg-amber-50/5 dark:border-amber-900/10 shadow-[0_0_15px_-5px_rgba(245,158,11,0.2)]"
            )}
          >
            {/* Question Header */}
            <button
              onClick={() => setOpenQuestionId(isOpen ? null : q.id)}
              className="flex w-full cursor-pointer items-center justify-between px-6 py-4 text-left"
            >
              <div className="flex items-center gap-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {index + 1}
                </span>
                <div>
                  <h3 className={cn(
                    "text-sm font-semibold tracking-tight transition-colors",
                    isOpen ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300",
                    isFilled && "text-slate-900 dark:text-white"
                  )}>
                    {q.text}
                  </h3>
                  <div className="mt-1 flex items-center gap-2">
                    {isFilled ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </span>
                    ) : isAiPending ? (
                      <span className="flex items-center gap-1.5 animate-pulse text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                        <Sparkles className="h-3 w-3" />
                        AI Preview Available
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Awaiting Response
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </button>

            {/* Question Body */}
            {isOpen && (
              <div className="border-t border-slate-100 px-6 py-6 transition-all dark:border-slate-800">
                <div className="space-y-6">
                  {/* Guidance */}
                  {q.guidance && (
                    <div className="flex gap-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                      {q.guidance}
                    </div>
                  )}

                  {/* AI Suggestion Box */}
                  {isAiPending && (
                    <div className={cn(
                      "space-y-4 rounded-xl border p-4 transition-all",
                      isAiPending 
                        ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/30 dark:bg-amber-950/20 ring-1 ring-amber-100 dark:ring-amber-900/10" 
                        : "border-indigo-100 bg-indigo-50/30 dark:border-indigo-900/30 dark:bg-indigo-950/20"
                    )}>
                      {isAiPending && (
                        <div className="flex items-center gap-2 rounded-lg bg-amber-100/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                          <AlertCircle className="h-3 w-3" />
                          ⚠️ AI Suggestion — Please Review
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-indigo-500" />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">AI Audit Insight</span>
                        </div>
                        {isAiPending && (
                          <Button 
                            size="sm" 
                            className="h-8 gap-1.5 bg-amber-600 px-4 text-[10px] font-bold text-white shadow-md hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                            onClick={() => {
                              const aiReasoning = (answer?.findings || answer?.aiReasoning || "").trim();
                              const aiEvidence = (answer?.evidenceSnippet || "").trim();
                              const suggestedJustification = [
                                aiReasoning,
                                aiEvidence ? `Evidence: "${aiEvidence}"` : "",
                              ]
                                .filter(Boolean)
                                .join("\n\n");

                              if (answer?.aiSuggestedStatus) {
                                setDraftStatusByQuestion((prev) => ({
                                  ...prev,
                                  [q.id]: answer.aiSuggestedStatus as string,
                                }));
                              }

                              if (suggestedJustification) {
                                setDraftJustificationByQuestion((prev) => ({
                                  ...prev,
                                  [q.id]: suggestedJustification,
                                }));
                              }
                            }}
                            disabled={isCurrentQuestionSaving}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Use AI Suggestion
                          </Button>
                        )}
                      </div>
                      <div className="space-y-3">
                        <p className="text-xs italic leading-relaxed text-slate-600 dark:text-slate-400">
                          &quot;{answer?.findings || "Based on your documents, this requirement appears to be met."}&quot;
                        </p>
                        {answer?.evidenceSnippet && (
                          <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-[11px] leading-relaxed text-slate-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-slate-300 shadow-sm">
                            <strong className="block mb-1 text-slate-900 dark:text-white uppercase tracking-tighter text-[9px]">Evidence from your document:</strong> 
                            &quot;{answer.evidenceSnippet}&quot;
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Options */}
                  <RadioGroup 
                    value={draftStatus} 
                    onValueChange={(val) =>
                      setDraftStatusByQuestion((prev) => ({
                        ...prev,
                        [q.id]: val,
                      }))
                    }
                    className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                  >
                    {[
                      { id: "COMPLIANT", label: "Compliant", icon: ShieldCheck, color: "hover:border-emerald-400 hover:bg-emerald-50 text-emerald-700", active: "border-emerald-500 bg-emerald-50/50" },
                      { id: "NON_COMPLIANT", label: "Non-Compliant", icon: XCircle, color: "hover:border-red-400 hover:bg-red-50 text-red-700", active: "border-red-500 bg-red-50/50" },
                      { id: "NOT_APPLICABLE", label: "Not Applicable", icon: Info, color: "hover:border-slate-400 hover:bg-slate-50 text-slate-700", active: "border-slate-500 bg-slate-50/50" }
                    ].map((opt) => {
                      const isSuggested = isAiPending && answer?.aiSuggestedStatus === opt.id;
                      return (
                        <div key={opt.id} className="relative">
                          <RadioGroupItem value={opt.id} id={`${q.id}-${opt.id}`} className="sr-only" />
                          <Label
                            htmlFor={`${q.id}-${opt.id}`}
                            className={cn(
                              "flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all",
                              opt.color,
                              draftStatus === opt.id ? opt.active : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950",
                              isCurrentQuestionSaving && "opacity-60 pointer-events-none",
                              isSuggested && "ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-slate-900 border-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                            )}
                          >
                            <div className="flex items-center gap-1.5">
                              <opt.icon className="h-5 w-5" />
                              {isSuggested && <Sparkles className="h-3 w-3 animate-pulse text-indigo-500" />}
                            </div>
                            <span className="text-xs font-bold">{opt.label}</span>
                          </Label>
                        </div>
                      );
                    })}
                  </RadioGroup>

                  <div className="space-y-2">
                    <Label htmlFor={`${q.id}-justification`} className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Justification
                    </Label>
                    <textarea
                      id={`${q.id}-justification`}
                      value={draftJustification}
                      onChange={(event) =>
                        setDraftJustificationByQuestion((prev) => ({
                          ...prev,
                          [q.id]: event.target.value,
                        }))
                      }
                      placeholder="Explain why this status applies. You can edit AI-generated reasoning before saving."
                      rows={4}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-indigo-900/40"
                      disabled={isCurrentQuestionSaving}
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      This text is editable and will be sanitized on save.
                    </p>
                  </div>

                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
                    <Label htmlFor={`${q.id}-evidence`} className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Upload Evidence Document
                    </Label>
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <Upload className="h-3.5 w-3.5" />
                      Accepted: PDF, JPG, PNG. Max 10MB.
                    </div>
                    <input
                      id={`${q.id}-evidence`}
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setDraftEvidenceByQuestion((prev) => ({
                          ...prev,
                          [q.id]: file,
                        }));
                        if (file) {
                          setDraftEvidenceLabelByQuestion((prev) => ({
                            ...prev,
                            [q.id]: file.name,
                          }));
                        }
                      }}
                      disabled={isCurrentQuestionSaving}
                      className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-indigo-700"
                    />
                    {draftEvidenceLabelByQuestion[q.id] && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Selected evidence: <span className="font-medium">{draftEvidenceLabelByQuestion[q.id]}</span>
                      </p>
                    )}
                    {answer?.id && answer?.evidenceFileUrl && (
                      <div className="flex items-center gap-2">
                        <a
                          href={`/api/documents/answer/${answer.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400"
                        >
                          Open current saved evidence
                        </a>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 border-red-200 px-2 text-[10px] text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                          onClick={() => handleDeleteEvidence(q.id, answer.id)}
                          disabled={isCurrentQuestionSaving}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>

                  {saveErrorByQuestion[q.id] && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                      {saveErrorByQuestion[q.id]}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={() => handleSaveAndConfirm(q.id)}
                      disabled={
                        isCurrentQuestionSaving ||
                        !draftStatus ||
                        !draftJustification.trim()
                      }
                      className="h-9 bg-indigo-600 text-xs font-semibold hover:bg-indigo-700"
                    >
                      {isCurrentQuestionSaving ? "Saving..." : "Save & Confirm"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
