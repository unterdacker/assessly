"use client";

import { useTransition } from "react";
import { BrainCircuit, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { refreshAiSummary } from "@/app/actions/refresh-ai-summary";
import { useAiMode } from "@/lib/ai/ai-mode-context";

type RefreshAiSummaryButtonProps = {
  labels: {
    idle: string;
    pending: string;
  };
};

export function RefreshAiSummaryButton({ labels }: RefreshAiSummaryButtonProps) {
  const [isPending, startTransition] = useTransition();
  const { aiDisabled } = useAiMode();
  const t = useTranslations();

  if (aiDisabled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
        <BrainCircuit className="h-3 w-3" aria-hidden />
        {t("aiDisabledBadge")}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await refreshAiSummary();
        })
      }
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 text-xs text-slate-600 shadow-sm transition-opacity hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <RefreshCw className={cn("h-3 w-3", isPending && "animate-spin")} aria-hidden />
      {isPending ? labels.pending : labels.idle}
    </button>
  );
}
