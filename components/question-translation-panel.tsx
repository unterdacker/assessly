"use client";

import { useState, useRef, useEffect } from "react";
import { 
  Languages, 
  Sparkles, 
  Loader2, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  PenLine 
} from "lucide-react";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from "@/components/ui/tooltip";

import { 
  aiTranslateCustomQuestion, 
  manualTranslateCustomQuestion 
} from "@/app/actions/translate-custom-question";
import { 
  aiTranslateTemplateQuestion, 
  manualTranslateTemplateQuestion 
} from "@/app/actions/translate-template-question";

export interface QuestionTranslationPanelTranslations {
  panelHeading: string;
  panelHeadingExisting: string;
  targetLabelDe: string;
  targetLabelEn: string;
  translateWithAi: string;
  enterManually: string;
  aiDisabledTooltip: string;
  dismiss: string;
  translatedText: string;
  translatedGuidance: string;
  save: string;
  saving: string;
  translating: string;
  cancel: string;
  accept: string;
  retranslate: string;
  editManually: string;
  translationSaved: string;
  errorAi: string;
  errorSave: string;
  sourceText: string;
  sourceGuidance: string;
}

export interface QuestionTranslationPanelProps {
  questionId: string;
  questionType: "custom" | "template";
  sourceText: string;
  sourceGuidance?: string | null;
  targetLang: "de" | "en";
  existingText: string | null;
  existingGuidance: string | null;
  aiDisabled: boolean;
  translations: QuestionTranslationPanelTranslations;
  onSaved: (text: string, guidance: string | null) => void;
  onDismiss: () => void;
}

type PanelMode = "prompt" | "manual-edit" | "ai-loading" | "ai-preview" | "error" | "saved";
type ErrorSource = "ai" | "save" | null;

export function QuestionTranslationPanel({
  questionId,
  questionType,
  sourceText,
  sourceGuidance,
  targetLang,
  existingText,
  existingGuidance,
  aiDisabled,
  translations,
  onSaved,
  onDismiss,
}: QuestionTranslationPanelProps) {
  const [mode, setMode] = useState<PanelMode>("prompt");
  const [draftText, setDraftText] = useState(existingText ?? "");
  const [draftGuidance, setDraftGuidance] = useState(existingGuidance ?? "");
  const [isTranslating, setIsTranslating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<ErrorSource>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && mode !== "ai-loading") {
      onDismiss();
    }
  };

  const handleAiTranslate = async () => {
    setIsTranslating(true);
    setMode("ai-loading");
    setErrorMsg(null);
    setErrorSource(null);

    const result = questionType === "custom"
      ? await aiTranslateCustomQuestion(questionId, targetLang)
      : await aiTranslateTemplateQuestion(questionId, targetLang);

    if (result.success) {
      setDraftText(result.data.text);
      setDraftGuidance(result.data.guidance ?? "");
      setIsTranslating(false);
      setMode("ai-preview");
    } else {
      setErrorMsg(translations.errorAi);
      setErrorSource("ai");
      setIsTranslating(false);
      setMode("error");
    }
  };

  const handleSave = async (aiGenerated = false) => {
    setIsTranslating(false);
    setMode("ai-loading");
    setErrorMsg(null);
    setErrorSource(null);

    const result = questionType === "custom"
      ? await manualTranslateCustomQuestion(questionId, targetLang, draftText, draftGuidance || null, aiGenerated)
      : await manualTranslateTemplateQuestion(questionId, targetLang, draftText, draftGuidance || null, aiGenerated);

    if (result.success) {
      setMode("saved");
      setTimeout(() => onSaved(draftText, draftGuidance || null), 1200);
    } else {
      setErrorMsg(translations.errorSave);
      setErrorSource("save");
      setMode("error");
    }
  };

  const headingText = existingText 
    ? translations.panelHeadingExisting 
    : translations.panelHeading;
  
  const targetLabel = targetLang === "de" 
    ? translations.targetLabelDe 
    : translations.targetLabelEn;

  return (
    <div
      role="region"
      aria-label={`${headingText} (${targetLabel})`}
      ref={panelRef}
      onKeyDown={handleKeyDown}
      className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-slate-700 dark:bg-slate-800/40"
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {headingText} - {targetLabel}
          </h4>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={mode === "ai-loading"}
          aria-label={translations.dismiss}
          data-autofocus
          className="rounded p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        <blockquote className="border-l-2 border-slate-200 dark:border-slate-600 pl-3 text-sm text-slate-500 dark:text-slate-400 italic">
          <p className="font-medium text-xs text-slate-400 mb-1 not-italic uppercase tracking-wider">{translations.sourceText}</p>
          {sourceText}
        </blockquote>
        {sourceGuidance && (
          <>
            <hr className="border-slate-100 dark:border-slate-700 ml-3" />
            <blockquote className="border-l-2 border-slate-200 dark:border-slate-600 pl-3 text-sm text-slate-500 dark:text-slate-400 italic">
              <p className="font-medium text-xs text-slate-400 mb-1 not-italic uppercase tracking-wider">{translations.sourceGuidance}</p>
              {sourceGuidance}
            </blockquote>
          </>
        )}
      </div>

      {mode === "prompt" && (
        <div className="flex flex-wrap gap-2 pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <button
                  type="button"
                  onClick={handleAiTranslate}
                  disabled={aiDisabled}
                  aria-disabled={aiDisabled}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    aiDisabled 
                      ? "bg-indigo-600/50 text-white/70 opacity-50 cursor-not-allowed" 
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {translations.translateWithAi}
                </button>
              </span>
            </TooltipTrigger>
            {aiDisabled && (
              <TooltipContent side="top">
                {translations.aiDisabledTooltip}
              </TooltipContent>
            )}
          </Tooltip>

          <button
            type="button"
            onClick={() => setMode("manual-edit")}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PenLine className="h-3.5 w-3.5" />
            {translations.enterManually}
          </button>
        </div>
      )}

      {mode === "ai-loading" && (
        <div className="flex items-center gap-2 pt-2 text-sm text-slate-500" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{isTranslating ? translations.translating : translations.saving}</span>
        </div>
      )}

      {mode === "ai-preview" && (
        <div className="space-y-3 pt-2">
          <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100">
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1 uppercase tracking-wider">{translations.translatedText}</p>
            {draftText}
            {draftGuidance && (
              <>
                <div className="my-2 h-px bg-slate-100 dark:bg-slate-800" />
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1 uppercase tracking-wider">{translations.translatedGuidance}</p>
                {draftGuidance}
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button 
              type="button" 
              onClick={() => handleSave(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {translations.accept}
            </button>
            <button 
              type="button" 
              onClick={() => setMode("manual-edit")}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {translations.editManually}
            </button>
            <button 
              type="button" 
              onClick={handleAiTranslate}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {translations.retranslate}
            </button>
            <button 
              type="button" 
              onClick={() => setMode("prompt")}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {translations.cancel}
            </button>
          </div>
        </div>
      )}

      {mode === "manual-edit" && (
        <div className="space-y-3 pt-2">
          <div>
            <label htmlFor="translation-draft-text" className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {translations.translatedText}
            </label>
            <textarea
              id="translation-draft-text"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              maxLength={1000}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <p aria-live="polite" className="text-right text-xs text-slate-400 mt-0.5">
              {draftText.length}/1000
            </p>
          </div>
          {sourceGuidance != null && (
            <div>
              <label htmlFor="translation-draft-guidance" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {translations.translatedGuidance}
              </label>
              <textarea
                id="translation-draft-guidance"
                value={draftGuidance}
                onChange={(e) => setDraftGuidance(e.target.value)}
                maxLength={2000}
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <p aria-live="polite" className="text-right text-xs text-slate-400 mt-0.5">
                {draftGuidance.length}/2000
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button 
              type="button" 
              onClick={() => handleSave()} 
              disabled={!draftText.trim()} 
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {translations.save}
            </button>
            <button 
              type="button" 
              onClick={() => setMode("prompt")} 
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {translations.cancel}
            </button>
          </div>
        </div>
      )}

      {mode === "error" && (
        <div className="space-y-3 pt-2">
          <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {errorSource === "ai" ? (
              <>
                <button 
                  type="button" 
                  onClick={handleAiTranslate}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {translations.retranslate}
                </button>
                <button 
                  type="button" 
                  onClick={() => setMode("manual-edit")}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PenLine className="h-3.5 w-3.5" />
                  {translations.enterManually}
                </button>
              </>
            ) : (
              <>
                <button 
                  type="button" 
                  onClick={() => handleSave()}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  {translations.save}
                </button>
                {errorSource === "save" && (
                  <button
                    type="button"
                    onClick={() => setMode("manual-edit")}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {translations.editManually}
                  </button>
                )}
              </>
            )}
            <button 
              type="button" 
              onClick={() => setMode("prompt")}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {translations.cancel}
            </button>
          </div>
        </div>
      )}

      {mode === "saved" && (
        <div className="flex items-center gap-2 pt-2 text-sm text-emerald-600 dark:text-emerald-400" role="status">
          <CheckCircle2 className="h-4 w-4" />
          <span>{translations.translationSaved}</span>
        </div>
      )}
    </div>
  );
}
