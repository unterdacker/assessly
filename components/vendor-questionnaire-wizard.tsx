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
  ArrowRight
} from "lucide-react";
import type { AssessmentAnswer, Question } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { updateExternalAnswer } from "@/app/actions/update-external-answer";

// Local extension to AssessmentAnswer until prisma generate takes full effect
type ExtendedAssessmentAnswer = AssessmentAnswer & {
  isAiSuggested?: boolean;
  verified?: boolean;
  aiSuggestedStatus?: string | null;
  aiConfidence?: number | null;
  aiReasoning?: string | null;
  evidenceSnippet?: string | null;
};

type VendorQuestionnaireWizardProps = {
  questions: Question[];
  initialAnswers: ExtendedAssessmentAnswer[];
  assessmentId: string;
};

/**
 * A streamlined, step-by-step interface for the 20 NIS2 security questions.
 * Supports manual entry and "Confirming" AI-suggested answers with definitive statuses.
 */
export function VendorQuestionnaireWizard({
  questions,
  initialAnswers,
  assessmentId,
}: VendorQuestionnaireWizardProps) {
  const [answers, setAnswers] = React.useState<Record<string, Partial<ExtendedAssessmentAnswer>>>(
    initialAnswers.reduce((acc, a) => ({ ...acc, [a.questionId]: a }), {})
  );

  // Sync state if initialAnswers prop changes (e.g. after a router.refresh())
  React.useEffect(() => {
    setAnswers(initialAnswers.reduce((acc, a) => ({ ...acc, [a.questionId]: a }), {}));
  }, [initialAnswers]);

  const [openQuestionId, setOpenQuestionId] = React.useState<string | null>(questions[0]?.id || null);
  const [isUpdating, setIsUpdating] = React.useState<string | null>(null);

  const handleUpdateStatus = async (questionId: string, status: string) => {
    setIsUpdating(questionId);
    try {
      const result = await updateExternalAnswer(
        assessmentId, 
        questionId, 
        status as any
      );
      if (result.ok) {
        setAnswers(prev => ({
          ...prev,
          [questionId]: { ...prev[questionId], status, verified: true, questionId }
        }));
      }
    } catch (err) {
      console.error("Failed to update answer:", err);
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <div className="space-y-4">
      {questions.map((q, index) => {
        const answer = answers[q.id];
        const isOpen = openQuestionId === q.id;
        const isFilled = !!answer?.verified;
        
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
                  {isAiSuggested && (
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
                            onClick={() => handleUpdateStatus(q.id, answer!.aiSuggestedStatus!)}
                            disabled={isUpdating === q.id}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Confirm AI Suggestion
                          </Button>
                        )}
                      </div>
                      <div className="space-y-3">
                        <p className="text-xs italic leading-relaxed text-slate-600 dark:text-slate-400">
                          "{answer?.findings || "Based on your documents, this requirement appears to be met."}"
                        </p>
                        {answer?.evidenceSnippet && (
                          <div className="mt-2 rounded-lg border-l-2 border-indigo-200 bg-white/50 p-3 text-[11px] leading-relaxed text-slate-600 dark:border-indigo-800 dark:bg-slate-950/50 dark:text-slate-400 shadow-sm">
                            <strong className="block mb-1 text-slate-900 dark:text-white uppercase tracking-tighter text-[9px]">Evidence from your document:</strong> 
                            "{answer.evidenceSnippet}"
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Options */}
                  <RadioGroup 
                    value={answer?.status || ""} 
                    onValueChange={(val) => handleUpdateStatus(q.id, val)}
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
                              answer?.status === opt.id ? opt.active : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950",
                              isUpdating === q.id && "opacity-50 pointer-events-none",
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

                  <div className="flex justify-end pt-2">
                    <Button 
                      variant="ghost" 
                      onClick={() => {
                        const nextIndex = questions.findIndex(quest => quest.id === q.id) + 1;
                        if (nextIndex < questions.length) {
                          setOpenQuestionId(questions[nextIndex].id);
                        } else {
                          setOpenQuestionId(null);
                        }
                      }}
                      className="group/btn text-xs"
                    >
                      Next Question
                      <ArrowRight className="ml-2 h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-1" />
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
