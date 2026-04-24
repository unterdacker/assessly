"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  NIS2_QUESTIONNAIRE_VERSION,
  groupQuestionsByCategory,
  categoryKeyMap,
  nis2Questions,
} from "@/lib/nis2-questions";
import type { AssessmentAnswer, Question, RemediationTask } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RemediationTaskInlineList,
  type RemediationTaskInlineListTranslations,
} from "@/components/remediation-task-inline-list";
import { cn } from "@/lib/utils";

const groupedByCategory = groupQuestionsByCategory(nis2Questions);

type LoadedSection = {
  id: string;
  title: string;
  orderIndex: number;
  questions: Array<{
    id: string;
    text: string;
    helpText: string | null;
    type: string;
    isRequired: boolean;
    orderIndex: number;
  }>;
};

type LoadedTemplate = {
  name: string;
  sections: LoadedSection[];
};

export type VendorAssessmentQuestionnairePanelProps = {
  answers: AssessmentAnswer[];
  selectedQuestionId: string | null;
  onSelectQuestion: (id: string) => void;
  customQuestions?: Question[];
  remediationTasks?: RemediationTask[];
  canEdit?: boolean;
  canDelete?: boolean;
  onAddRemediationTask?: (questionId: string) => void;
  onEditRemediationTask?: (task: RemediationTask) => void;
  onDeleteRemediationTask?: (taskId: string) => void;
  remediationTranslations?: RemediationTaskInlineListTranslations & {
    addTask: string;
  };
  templateId?: string | null;
};

export function VendorAssessmentQuestionnairePanel({
  answers,
  selectedQuestionId,
  onSelectQuestion,
  customQuestions,
  remediationTasks,
  canEdit,
  canDelete,
  onAddRemediationTask,
  onEditRemediationTask,
  onDeleteRemediationTask,
  remediationTranslations,
  templateId,
}: VendorAssessmentQuestionnairePanelProps) {
  const t = useTranslations("assessment.questionnaire");
  const tRoot = useTranslations();
  const tQuestions = useTranslations("externalAssessment.questions");
  const [templateData, setTemplateData] = React.useState<LoadedTemplate | null>(null);
  const [templateLoading, setTemplateLoading] = React.useState(false);
  const [templateError, setTemplateError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    async function loadTemplateData() {
      if (!templateId) {
        setTemplateData(null);
        setTemplateError(null);
        setTemplateLoading(false);
        return;
      }

      setTemplateLoading(true);
      setTemplateError(null);

      try {
        const res = await fetch(`/api/vendors/templates/${templateId}`);

        if (!active) return;

        if (res.status === 401 || res.status === 403) {
          setTemplateError("Session expired. Please reload.");
          setTemplateData(null);
          return;
        }

        if (res.status === 404) {
          setTemplateData(null);
          return;
        }

        const data = (await res.json()) as {
          ok: boolean;
          template?: LoadedTemplate;
        };

        if (!data.ok || !data.template) {
          setTemplateData(null);
          return;
        }

        setTemplateData(data.template);
      } catch {
        if (!active) return;
        setTemplateError("Failed to load template.");
        setTemplateData(null);
      } finally {
        if (active) {
          setTemplateLoading(false);
        }
      }
    }

    void loadTemplateData();

    return () => {
      active = false;
    };
  }, [templateId]);

  const questionText = React.useCallback(
    (q: { id: string; text: string }) => {
      const key = `externalAssessment.questions.${q.id}.text` as Parameters<typeof tRoot>[0];
      return tRoot.has(key) ? tQuestions(`${q.id}.text` as Parameters<typeof tQuestions>[0]) : q.text;
    },
    [tRoot, tQuestions],
  );

  const numberById = React.useMemo(() => {
    const m: Record<string, number> = {};

    if (templateData) {
      let index = 1;
      for (const section of templateData.sections) {
        for (const q of section.questions) {
          m[q.id] = index;
          index += 1;
        }
      }
      (customQuestions ?? []).forEach((q, i) => {
        m[q.id] = index + i;
      });
      return m;
    }

    nis2Questions.forEach((q, i) => {
      m[q.id] = i + 1;
    });
    (customQuestions ?? []).forEach((q, i) => {
      m[q.id] = nis2Questions.length + 1 + i;
    });
    return m;
  }, [customQuestions, templateData]);

  const remediationByQuestionId = React.useMemo(() => {
    const map = new Map<string, RemediationTask[]>();
    for (const task of remediationTasks ?? []) {
      const list = map.get(task.questionId) ?? [];
      list.push(task);
      map.set(task.questionId, list);
    }
    return map;
  }, [remediationTasks]);

  const templateQuestionCount = React.useMemo(() => {
    if (!templateData) return 0;
    return templateData.sections.reduce((total, section) => total + section.questions.length, 0);
  }, [templateData]);

  return (
    <Card>
      <CardHeader className="border-b border-slate-100 dark:border-slate-800">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        {templateData ? (
          <p className="text-sm font-normal text-muted-foreground">
            {templateQuestionCount} questions across {templateData.sections.length} sections - {templateData.name}
          </p>
        ) : (
          <p className="text-sm font-normal text-muted-foreground">
            {nis2Questions.length + (customQuestions?.length ?? 0)} {t("questionsAcross")} {Object.keys(groupedByCategory).length} {t("categories")}
            - {t("catalogue")} {NIS2_QUESTIONNAIRE_VERSION}
          </p>
        )}
      </CardHeader>
      <CardContent className="max-h-[min(70vh,640px)] space-y-6 overflow-y-auto pt-6">
        {templateError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            {templateError}
          </div>
        ) : null}

        {templateLoading ? (
          <div className="space-y-3">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-14 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-14 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-14 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          </div>
        ) : null}

        {!templateLoading && !templateError && templateData
          ? templateData.sections.map((section) => (
              <section key={section.id} aria-labelledby={`questionnaire-template-section-${section.id}`}>
                <h2
                  id={`questionnaire-template-section-${section.id}`}
                  className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300"
                >
                  {section.title}
                </h2>
                <ol className="space-y-3">
                  {section.questions.map((q) => {
                    const answer = answers.find((a) => a.questionId === q.id);
                    const isSelected = selectedQuestionId === q.id;
                    const isNonCompliant = answer?.status === "NON_COMPLIANT";
                    const questionTasks = remediationByQuestionId.get(q.id) ?? [];

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
                        {isNonCompliant && remediationTranslations ? (
                          <div className="mt-2">
                            {canEdit && onAddRemediationTask ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddRemediationTask(q.id);
                                }}
                              >
                                {remediationTranslations.addTask}
                              </Button>
                            ) : null}
                            {questionTasks.length > 0 ? (
                              <RemediationTaskInlineList
                                tasks={questionTasks}
                                canEdit={Boolean(canEdit)}
                                canDelete={Boolean(canDelete)}
                                onEdit={onEditRemediationTask ?? (() => undefined)}
                                onDelete={onDeleteRemediationTask ?? (() => undefined)}
                                translations={remediationTranslations}
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))
          : null}

        {!templateLoading && !templateError && !templateData
          ? Object.entries(groupedByCategory).map(([categoryName, questions]) => {
              const categoryKey = categoryKeyMap[questions[0]?.id];

              return (
                <section key={categoryName} aria-labelledby={`questionnaire-cat-${slugify(categoryName)}`}>
                  <h2
                    id={`questionnaire-cat-${slugify(categoryName)}`}
                    className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300"
                  >
                    {categoryKey ? t(`categories_list.${categoryKey}`) : categoryName}
                  </h2>
                  <ol className="space-y-3">
                    {questions.map((q) => {
                      const answer = answers.find((a) => a.questionId === q.id);
                      const isSelected = selectedQuestionId === q.id;
                      const qText = questionText(q);
                      const isNonCompliant = answer?.status === "NON_COMPLIANT";
                      const questionTasks = remediationByQuestionId.get(q.id) ?? [];

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
                              {qText}
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
                          {isNonCompliant && remediationTranslations ? (
                            <div className="mt-2">
                              {canEdit && onAddRemediationTask ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAddRemediationTask(q.id);
                                  }}
                                >
                                  {remediationTranslations.addTask}
                                </Button>
                              ) : null}
                              {questionTasks.length > 0 ? (
                                <RemediationTaskInlineList
                                  tasks={questionTasks}
                                  canEdit={Boolean(canEdit)}
                                  canDelete={Boolean(canDelete)}
                                  onEdit={onEditRemediationTask ?? (() => undefined)}
                                  onDelete={onDeleteRemediationTask ?? (() => undefined)}
                                  translations={remediationTranslations}
                                />
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })
          : null}

        {customQuestions && customQuestions.length > 0 && (() => {
          const customGrouped: Record<string, Question[]> = {};
          for (const q of customQuestions) {
            if (!customGrouped[q.category]) customGrouped[q.category] = [];
            customGrouped[q.category]!.push(q);
          }
          return Object.entries(customGrouped).map(([categoryName, qs]) => (
            <section key={`custom-${categoryName}`} aria-labelledby={`questionnaire-cat-custom-${slugify(categoryName)}`}>
              <h2
                id={`questionnaire-cat-custom-${slugify(categoryName)}`}
                className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300"
              >
                {categoryName}
              </h2>
              <ol className="space-y-3">
                {qs.map((q) => {
                  const answer = answers.find((a) => a.questionId === q.id);
                  const isSelected = selectedQuestionId === q.id;
                  const isNonCompliant = answer?.status === "NON_COMPLIANT";
                  const questionTasks = remediationByQuestionId.get(q.id) ?? [];
                  return (
                    <li
                      key={q.id}
                      onClick={() => onSelectQuestion(q.id)}
                      className={cn(
                        "cursor-pointer rounded-lg border p-3 transition-colors",
                        isSelected
                          ? "border-violet-300 bg-violet-50/60 dark:border-violet-700 dark:bg-violet-900/30"
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
                      {isNonCompliant && remediationTranslations ? (
                        <div className="mt-2">
                          {canEdit && onAddRemediationTask ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                onAddRemediationTask(q.id);
                              }}
                            >
                              {remediationTranslations.addTask}
                            </Button>
                          ) : null}
                          {questionTasks.length > 0 ? (
                            <RemediationTaskInlineList
                              tasks={questionTasks}
                              canEdit={Boolean(canEdit)}
                              canDelete={Boolean(canDelete)}
                              onEdit={onEditRemediationTask ?? (() => undefined)}
                              onDelete={onDeleteRemediationTask ?? (() => undefined)}
                              translations={remediationTranslations}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ));
        })()}
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
