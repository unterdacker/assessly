"use client";

import { useState } from "react";
import { FileText, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveAssessmentAnswer } from "@/app/actions/vendor-assessment-actions";
import { nis2Questions } from "@/lib/nis2-questions";

type VendorAssessmentSidePanelsProps = {
  insightLines: string[];
  assessmentId: string;
  answers: any[];
  selectedQuestionId: string | null;
};

export function VendorAssessmentSidePanels({
  insightLines,
  assessmentId,
  answers,
  selectedQuestionId,
}: VendorAssessmentSidePanelsProps) {
  const [isSaving, setIsSaving] = useState(false);

  const selectedAnswer = selectedQuestionId 
    ? answers.find(a => a.questionId === selectedQuestionId) 
    : null;
    
  const selectedQuestion = selectedQuestionId 
    ? nis2Questions.find(q => q.id === selectedQuestionId) 
    : null;

  async function handleOverride(status: "COMPLIANT" | "NON_COMPLIANT") {
    if (!selectedQuestionId) return;
    setIsSaving(true);
    await saveAssessmentAnswer({
      assessmentId,
      questionId: selectedQuestionId,
      status,
      findings: selectedAnswer?.findings || "Manually updated by ISB",
      evidenceSnippet: selectedAnswer?.evidenceSnippet,
    });
    setIsSaving(false);
  }

  return (
    <div className="space-y-4 lg:sticky lg:top-20">
      
      {selectedQuestionId ? (
        <Card className={selectedAnswer?.createdBy?.includes("ai") ? "border-amber-400 dark:border-amber-500/50" : ""}>
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
            <div className="text-sm rounded-md bg-white p-3 border border-slate-200 shadow-sm dark:bg-slate-950 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              {selectedAnswer?.findings ? (
                <p className="whitespace-pre-wrap leading-relaxed">{selectedAnswer.findings}</p>
              ) : (
                <p className="text-muted-foreground italic">No AI reasoning recorded for this question yet.</p>
              )}
            </div>
            
            <Button 
              variant="outline" 
              className="w-full gap-2 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
              onClick={() => window.alert("Highlighting Section 4 in PDF...")}
            >
              <FileText className="h-4 w-4" />
              Show Evidence in Document
            </Button>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-semibold text-slate-500 tracking-wider uppercase w-full">Manual Override</p>
            <div className="flex w-full gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1 gap-1"
                disabled={isSaving}
                onClick={() => handleOverride("COMPLIANT")}
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Mark Compliant
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1 gap-1"
                disabled={isSaving}
                onClick={() => handleOverride("NON_COMPLIANT")}
              >
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                Mark Non-compliant
              </Button>
            </div>
          </CardFooter>
        </Card>
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
            <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50/80 text-center dark:border-slate-700 dark:bg-slate-900/40" >
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
              <li key={i} className="rounded-md border border-slate-200/80 bg-white/60 p-3 text-sm leading-relaxed dark:border-slate-800 dark:bg-slate-900/40">
                {line}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
