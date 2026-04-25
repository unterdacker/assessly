"use client";

import { useEffect, useState } from "react";

type VendorsByRiskBarChartProps = {
  data: Array<{
    label: string;
    count: number;
    level: "low" | "medium" | "high";
  }>;
  legendLabel: string;
  emptyLabel: string;
  emptyDescription?: string;
};

export function VendorsByRiskBarChart({
  data,
  emptyLabel,
  emptyDescription,
}: VendorsByRiskBarChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (data.length === 0) {
    return (
      <div className="flex h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-slate-50/70 px-4 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/30">
        <p className="text-center">{emptyLabel}</p>
        {emptyDescription && (
          <p className="text-xs text-muted-foreground text-center mt-1 max-w-[200px]">{emptyDescription}</p>
        )}
      </div>
    );
  }

  if (!mounted) {
    return (
      <div
        className="w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
        style={{ height: 220 }}
      />
    );
  }

  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);
  const lowColor = computedStyle.getPropertyValue("--semantic-success").trim() || "oklch(0.67 0.17 147)";
  const medColor = computedStyle.getPropertyValue("--semantic-warning").trim() || "oklch(0.55 0.16 80)";
  const highColor = computedStyle.getPropertyValue("--destructive").trim() || "oklch(0.57 0.22 25)";

  const colorMap = { low: lowColor, medium: medColor, high: highColor };
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="w-full">
      {/* CSS bar chart — no recharts, no SVG, no color issues */}
      <div className="flex h-[220px] items-end gap-3 px-2 pb-0">
        {data.map((entry) => {
          const heightPct = Math.max((entry.count / maxCount) * 100, entry.count > 0 ? 4 : 0);
          const color = colorMap[entry.level];
          return (
            <div
              key={entry.label}
              className="flex flex-1 flex-col items-center justify-end gap-1 h-full"
            >
              {entry.count > 0 && (
                <span className="text-sm font-semibold tabular-nums leading-none">
                  {entry.count}
                </span>
              )}
              <div
                className="w-full rounded-t-sm"
                style={{ height: `${heightPct}%`, backgroundColor: color }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex gap-3 px-2 pt-2">
        {data.map((entry) => (
          <div key={entry.label} className="flex-1 text-center text-xs text-muted-foreground">
            {entry.label}
          </div>
        ))}
      </div>
    </div>
  );
}
