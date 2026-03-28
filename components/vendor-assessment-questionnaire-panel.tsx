"use client";

import * as React from "react";
import {
  NIS2_QUESTIONNAIRE_VERSION,
  groupQuestionsByCategory,
  nis2Questions,
} from "@/lib/nis2-questions";
import type { Nis2QuestionAnalysis } from "@/lib/nis2-question-analysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const groupedByCategory = groupQuestionsByCategory(nis2Questions);
const categories = Object.keys(groupedByCategory);

export type VendorAssessmentQuestionnairePanelProps = {
  analysisByQuestionId: Record<string, Nis2QuestionAnalysis> | null;
};

export function VendorAssessmentQuestionnairePanel({
  analysisByQuestionId,
}: VendorAssessmentQuestionnairePanelProps) {
  const numberById = React.useMemo(() => {
    const m: Record<string, number> = {};
    nis2Questions.forEach((q, i) => {
      m[q.id] = i + 1;
    });
    return m;
  }, []);

  return (
    <Card>
      <CardHeader className="border-b border-slate-100 dark:border-slate-800">
        <CardTitle className="text-base">NIS2 security questionnaire</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          {nis2Questions.length} questions across {categories.length} categories
          · catalogue {NIS2_QUESTIONNAIRE_VERSION}
        </p>
      </CardHeader>
      <CardContent className="max-h-[min(70vh,640px)] space-y-6 overflow-y-auto pt-6">
        {categories.map((cat) => (
          <section key={cat} aria-labelledby={`questionnaire-cat-${slugify(cat)}`}>
            <h2
              id={`questionnaire-cat-${slugify(cat)}`}
              className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300"
            >
              {cat}
            </h2>
            <ol className="space-y-3">
              {groupedByCategory[cat].map((q) => {
                const analysis = analysisByQuestionId?.[q.id];
                return (
                  <li
                    key={q.id}
                    className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30"
                  >
                    <div
                      className={cn(
                        "grid gap-3",
                        analysis ? "lg:grid-cols-2 lg:gap-4" : "",
                      )}
                    >
                      <div className="min-w-0 text-sm">
                        <span className="font-medium text-muted-foreground">
                          {numberById[q.id]}.
                        </span>{" "}
                        {q.text}
                        {q.guidance ? (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {q.guidance}
                          </p>
                        ) : null}
                      </div>
                      {analysis ? (
                        <aside
                          className="flex min-w-0 flex-col gap-2 rounded-md border border-slate-200/90 bg-white/80 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/40"
                          aria-label={`AI analysis for question ${numberById[q.id]}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">
                              AI review
                            </span>
                            <Badge
                              variant={
                                analysis.status === "compliant"
                                  ? "compliant"
                                  : "nonCompliant"
                              }
                              className="font-normal"
                            >
                              {analysis.status === "compliant"
                                ? "Compliant"
                                : "Non-compliant"}
                            </Badge>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {analysis.reasoning}
                          </p>
                        </aside>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
