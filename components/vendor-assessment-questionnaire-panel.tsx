"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  NIS2_QUESTIONNAIRE_VERSION,
  groupQuestionsByCategory,
  nis2Questions,
} from "@/lib/nis2-questions";
import type { AssessmentAnswer } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const groupedByCategory = groupQuestionsByCategory(nis2Questions);
const categories = Object.keys(groupedByCategory);

export type VendorAssessmentQuestionnairePanelProps = {
  answers: AssessmentAnswer[];
  selectedQuestionId: string | null;
  onSelectQuestion: (id: string) => void;
};

export function VendorAssessmentQuestionnairePanel({
  answers,
  selectedQuestionId,
  onSelectQuestion,
}: VendorAssessmentQuestionnairePanelProps) {
  const t = useTranslations("assessment.questionnaire");

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
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          {nis2Questions.length} {t("questionsAcross")} {categories.length} {t("categories")}
          · {t("catalogue")} {NIS2_QUESTIONNAIRE_VERSION}
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
                const answer = answers.find((a) => a.questionId === q.id);
                const isSelected = selectedQuestionId === q.id;

                return (
                  <li
                    key={q.id}
                    onClick={() => onSelectQuestion(q.id)}
                    className={cn(
                      "cursor-pointer rounded-lg border p-3 transition-colors",
                      isSelected
                        ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-900/30"
                        : "border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/50 dark:border-slate-800 dark:bg-slate-900/30 dark:hover:bg-slate-800/50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 text-sm">
                        <span className="font-medium text-muted-foreground pr-1">
                          {numberById[q.id]}.
                        </span>
                        {q.text}
                      </div>
                      <div className="shrink-0 pt-0.5">
                        <Badge
                          variant={
                            answer?.status === "COMPLIANT"
                              ? "compliant"
                              : answer?.status === "NON_COMPLIANT"
                              ? "nonCompliant"
                              : "secondary"
                          }
                          className="font-normal"
                        >
                          {answer?.status === "COMPLIANT"
                            ? t("compliant")
                            : answer?.status === "NON_COMPLIANT"
                            ? t("nonCompliant")
                            : t("pending")}
                        </Badge>
                      </div>
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
