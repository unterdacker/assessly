"use client";

import * as React from "react";
import { Plus, ArrowUp, ArrowDown, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  createCustomQuestion,
  updateCustomQuestion,
  deleteCustomQuestion,
  reorderCustomQuestions,
} from "@/app/actions/custom-questions";
import { QuestionTranslationPanel } from "./question-translation-panel";
import type { QuestionTranslationPanelTranslations } from "./question-translation-panel";

const MAX_QUESTIONS = 50;
const MAX_TEXT_LENGTH = 1000;
const MAX_GUIDANCE_LENGTH = 2000;

type Question = {
  id: string;
  text: string;
  guidance: string | null;
  textDe: string | null;
  guidanceDe: string | null;
  textEn: string | null;
  guidanceEn: string | null;
  category: string;
  sortOrder: number;
};

type QuestionFormData = {
  text: string;
  guidance: string;
  category: string;
};

export type CustomQuestionsManagerProps = {
  initialQuestions: Array<Question>;
  aiDisabled: boolean;
  targetLang: "de" | "en";
  translationTranslations: QuestionTranslationPanelTranslations;
  translations: {
    title: string;
    description: string;
    addQuestion: string;
    questionText: string;
    questionTextPlaceholder: string;
    guidanceOptional: string;
    guidancePlaceholder: string;
    categoryLabel: string;
    categoryDefault: string;
    save: string;
    saving: string;
    cancel: string;
    edit: string;
    delete_: string;
    deleteConfirm: string;
    limitReached: string;
    noQuestions: string;
    errorEmpty: string;
    errorSave: string;
    errorDelete: string;
    errorReorder: string;
    moveUp: string;
    moveDown: string;
  };
};

// ---------------------------------------------------------------------------
// QuestionForm — reused for both add and inline edit
// ---------------------------------------------------------------------------

type QuestionFormProps = {
  formId: string;
  initialText?: string;
  initialGuidance?: string;
  initialCategory?: string;
  saving: boolean;
  onSave: (data: QuestionFormData) => Promise<void>;
  onCancel: () => void;
  translations: CustomQuestionsManagerProps["translations"];
};

function QuestionForm({
  formId,
  initialText = "",
  initialGuidance = "",
  initialCategory = "",
  saving,
  onSave,
  onCancel,
  translations,
}: QuestionFormProps) {
  const [text, setText] = React.useState(initialText);
  const [guidance, setGuidance] = React.useState(initialGuidance);
  const [category, setCategory] = React.useState(
    initialCategory || translations.categoryDefault,
  );
  const [localError, setLocalError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim()) {
      setLocalError(translations.errorEmpty);
      return;
    }
    setLocalError(null);
    await onSave({
      text: text.trim(),
      guidance: guidance.trim(),
      category: category.trim() || translations.categoryDefault,
    });
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20"
      noValidate
    >
      {localError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-400"
        >
          {localError}
        </div>
      )}

      {/* Question text */}
      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-text`} className="text-xs font-medium">
          {translations.questionText}
          <span className="ml-0.5 text-red-500" aria-hidden="true">
            *
          </span>
        </Label>
        <textarea
          ref={textareaRef}
          id={`${formId}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={translations.questionTextPlaceholder}
          maxLength={MAX_TEXT_LENGTH}
          required
          disabled={saving}
          rows={3}
          aria-required="true"
          className={cn(
            "flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "dark:border-slate-700",
            "resize-none disabled:pointer-events-none disabled:opacity-50",
          )}
        />
        <div className="flex justify-end">
          <span className="text-xs text-muted-foreground">
            {text.length}/{MAX_TEXT_LENGTH}
          </span>
        </div>
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-category`} className="text-xs font-medium">
          {translations.categoryLabel}
        </Label>
        <Input
          id={`${formId}-category`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={translations.categoryDefault}
          disabled={saving}
          maxLength={100}
        />
      </div>

      {/* Guidance */}
      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-guidance`} className="text-xs font-medium">
          {translations.guidanceOptional}
        </Label>
        <textarea
          id={`${formId}-guidance`}
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          placeholder={translations.guidancePlaceholder}
          maxLength={MAX_GUIDANCE_LENGTH}
          disabled={saving}
          rows={2}
          className={cn(
            "flex w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "dark:border-slate-700",
            "resize-none disabled:pointer-events-none disabled:opacity-50",
          )}
        />
        <div className="flex justify-end">
          <span className="text-xs text-muted-foreground">
            {guidance.length}/{MAX_GUIDANCE_LENGTH}
          </span>
        </div>
      </div>

      {/* Form actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          {translations.cancel}
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving && (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          )}
          {saving ? translations.saving : translations.save}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CustomQuestionsManager({
  initialQuestions,
  aiDisabled,
  targetLang,
  translationTranslations,
  translations,
}: CustomQuestionsManagerProps) {
  const [questions, setQuestions] = React.useState<Question[]>(
    [...initialQuestions]
      .map((q) => ({
        ...q,
        textDe: q.textDe ?? null,
        guidanceDe: q.guidanceDe ?? null,
        textEn: q.textEn ?? null,
        guidanceEn: q.guidanceEn ?? null,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [isAdding, setIsAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [translatingId, setTranslatingId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const atLimit = questions.length >= MAX_QUESTIONS;

  async function handleCreate(formData: QuestionFormData): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const result = await createCustomQuestion({
        text: formData.text,
        guidance: formData.guidance || undefined,
        category: formData.category || undefined,
      });
      if (!result.success) {
        setError(result.error ?? translations.errorSave);
        return;
      }
      const createdQuestion = result.data?.question;
      if (createdQuestion) {
        const createdQuestionId = createdQuestion.id;
        setQuestions((prev) => [
          ...prev,
          {
            id: createdQuestionId,
            text: createdQuestion.text,
            guidance: createdQuestion.guidance,
            textDe: createdQuestion.textDe ?? null,
            guidanceDe: createdQuestion.guidanceDe ?? null,
            textEn: createdQuestion.textEn ?? null,
            guidanceEn: createdQuestion.guidanceEn ?? null,
            category: createdQuestion.category,
            sortOrder: createdQuestion.sortOrder,
          },
        ]);
        setTranslatingId(createdQuestionId);
      }
      setIsAdding(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, formData: QuestionFormData): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const result = await updateCustomQuestion(id, {
        text: formData.text,
        guidance: formData.guidance || null,
        category: formData.category || undefined,
      });
      if (!result.success) {
        setError(result.error ?? translations.errorSave);
        return;
      }
      const updatedQuestion = result.data?.question;
      if (updatedQuestion) {
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === id
              ? {
                  ...q,
                  text: updatedQuestion.text,
                  guidance: updatedQuestion.guidance,
                  textDe: updatedQuestion.textDe ?? q.textDe,
                  guidanceDe: updatedQuestion.guidanceDe ?? q.guidanceDe,
                  textEn: updatedQuestion.textEn ?? q.textEn,
                  guidanceEn: updatedQuestion.guidanceEn ?? q.guidanceEn,
                  category: updatedQuestion.category,
                }
              : q,
          ),
        );
      }
      setEditingId(null);
      setTranslatingId(id);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm(translations.deleteConfirm)) return;
    setSaving(true);
    setError(null);
    try {
      const result = await deleteCustomQuestion(id);
      if (!result.success) {
        setError(result.error ?? translations.errorDelete);
        return;
      }
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } finally {
      setSaving(false);
    }
  }

  async function handleMoveUp(index: number): Promise<void> {
    if (index === 0) return;
    const prev = [...questions];
    const next = [...questions];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setQuestions(next);
    setError(null);
    setSaving(true);
    try {
      const result = await reorderCustomQuestions(next.map((q) => q.id));
      if (!result.success) {
        setError(result.error ?? translations.errorReorder);
        setQuestions(prev);
      }
    } catch {
      setError(translations.errorReorder);
      setQuestions(prev);
    } finally {
      setSaving(false);
    }
  }

  async function handleMoveDown(index: number): Promise<void> {
    if (index === questions.length - 1) return;
    const prev = [...questions];
    const next = [...questions];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setQuestions(next);
    setError(null);
    setSaving(true);
    try {
      const result = await reorderCustomQuestions(next.map((q) => q.id));
      if (!result.success) {
        setError(result.error ?? translations.errorReorder);
        setQuestions(prev);
      }
    } catch {
      setError(translations.errorReorder);
      setQuestions(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">{translations.description}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingId(null);
            setTranslatingId(null);
            setIsAdding(true);
          }}
          disabled={atLimit || isAdding}
          title={atLimit ? translations.limitReached : undefined}
          aria-disabled={atLimit}
          className="shrink-0"
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          {translations.addQuestion}
        </Button>
      </div>

      {/* Limit reached hint */}
      {atLimit && (
        <p className="text-xs text-muted-foreground">{translations.limitReached}</p>
      )}

      {/* Global error banner */}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {questions.length === 0 && !isAdding && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-900/20">
          <p className="text-sm text-muted-foreground">{translations.noQuestions}</p>
        </div>
      )}

      {/* Question list */}
      {questions.length > 0 && (
        <ul className="space-y-2" aria-label={translations.title}>
          {questions.map((q, index) =>
            editingId === q.id ? (
              <li key={q.id}>
                <QuestionForm
                  formId={`edit-question-${q.id}`}
                  initialText={q.text}
                  initialGuidance={q.guidance ?? ""}
                  initialCategory={q.category}
                  saving={saving}
                  onSave={async (data) => {
                    await handleUpdate(q.id, data);
                  }}
                  onCancel={() => setEditingId(null)}
                  translations={translations}
                />
              </li>
            ) : (
              <li key={q.id}>
                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-start gap-3">
                    {/* Number badge */}
                    <span
                      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>

                    {/* Content */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">
                        {q.text}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {q.category}
                        </Badge>
                        {q.guidance && (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {q.guidance}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Row actions */}
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0 || saving}
                        aria-label={translations.moveUp}
                        className="h-8 w-8"
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === questions.length - 1 || saving}
                        aria-label={translations.moveDown}
                        className="h-8 w-8"
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsAdding(false);
                          setTranslatingId(null);
                          setEditingId(q.id);
                        }}
                        disabled={saving}
                        aria-label={translations.edit}
                        className="h-7 px-2"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">{translations.edit}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(q.id)}
                        disabled={saving}
                        aria-label={translations.delete_}
                        className="h-7 px-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">{translations.delete_}</span>
                      </Button>
                    </div>
                  </div>

                  {translatingId === q.id && (
                    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                      <QuestionTranslationPanel
                        questionId={q.id}
                        questionType="custom"
                        sourceText={q.text}
                        sourceGuidance={q.guidance ?? null}
                        targetLang={targetLang}
                        existingText={targetLang === "de" ? q.textDe : q.textEn}
                        existingGuidance={targetLang === "de" ? q.guidanceDe : q.guidanceEn}
                        aiDisabled={aiDisabled}
                        translations={translationTranslations}
                        onSaved={(text, guidance) => {
                          setQuestions((prev) =>
                            prev.map((qq) =>
                              qq.id === q.id
                                ? {
                                    ...qq,
                                    ...(targetLang === "de"
                                      ? { textDe: text, guidanceDe: guidance }
                                      : { textEn: text, guidanceEn: guidance }),
                                  }
                                : qq,
                            ),
                          );
                          setTranslatingId(null);
                        }}
                        onDismiss={() => setTranslatingId(null)}
                      />
                    </div>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {/* Add form – rendered at the bottom */}
      {isAdding && (
        <QuestionForm
          formId="add-question"
          saving={saving}
          onSave={async (data) => {
            await handleCreate(data);
          }}
          onCancel={() => setIsAdding(false)}
          translations={translations}
        />
      )}
    </div>
  );
}
