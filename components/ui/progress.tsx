import * as React from "react";
import { cn } from "@/lib/utils";

export type ProgressProps = {
  value: number;
  max?: number;
  className?: string;
  /** Explicit label for screen readers (value is also exposed numerically). */
  "aria-label"?: string;
};

export function Progress({
  value,
  max = 100,
  className,
  "aria-label": ariaLabel = "Progress",
}: ProgressProps) {
  const clamped = Math.max(0, Math.min(max, value));
  const pct = max === 0 ? 0 : Math.round((clamped / max) * 100);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamped}
      aria-label={ariaLabel}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-indigo-600 transition-[width] duration-300 ease-out dark:bg-indigo-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
