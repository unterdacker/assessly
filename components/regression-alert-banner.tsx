"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type RegressionItem = {
  category: string;
  fromScore: number;
  toScore: number;
  delta: number;
};

type RegressionAlertBannerProps = {
  regressions: RegressionItem[];
  vendorId?: string;
  onDismiss: () => void;
  translations: {
    title: string;
    message: string;
    dismiss: string;
    category: string;
  };
};

export function RegressionAlertBanner({
  regressions,
  vendorId,
  onDismiss,
  translations,
}: RegressionAlertBannerProps) {
  const DISMISS_KEY = `regression-dismissed-${vendorId ?? "global"}`;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(DISMISS_KEY);
      if (stored) {
        setDismissed(true);
      }
    }
  }, [DISMISS_KEY]);

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(DISMISS_KEY, "1");
    }
    setDismissed(true);
    onDismiss();
  };

  if (dismissed || regressions.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="relative rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-500"
          aria-hidden
        />
        <div className="flex-1 space-y-2">
          <h3 className="font-semibold text-amber-900 dark:text-amber-300">
            {translations.title}
          </h3>
          <p className="text-sm text-amber-800 dark:text-amber-400">
            {translations.message}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {regressions.map((regression, index) => (
              <li key={index} className="flex items-baseline gap-2">
                <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-600 dark:bg-amber-500" />
                <span>
                  <strong>{regression.category}:</strong>{" "}
                  {regression.fromScore.toFixed(1)}% → {regression.toScore.toFixed(1)}%
                  {" "}
                  <span className="font-semibold text-amber-900 dark:text-amber-300">
                    ({regression.delta > 0 ? "+" : ""}
                    {regression.delta.toFixed(1)}%)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-6 w-6 flex-shrink-0 p-0 text-amber-700 hover:bg-amber-200/50 hover:text-amber-900 dark:text-amber-400 dark:hover:bg-amber-900/30 dark:hover:text-amber-300"
          aria-label={translations.dismiss}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
