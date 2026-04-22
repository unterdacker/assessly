"use client";

import { useTheme } from "@/components/theme-provider";

const RISK_COLORS = {
  light: { low: "#2f9e44", medium: "#d97706", high: "#dc2626" },
  dark: { low: "#40a05a", medium: "#f59e0b", high: "#ef4444" },
} as const;

type VendorsByRiskBarChartProps = {
  data: Array<{
    label: string;
    count: number;
    level: "low" | "medium" | "high";
  }>;
  legendLabel: string;
  emptyLabel: string;
};

export function VendorsByRiskBarChart({
  data,
  emptyLabel,
}: VendorsByRiskBarChartProps) {
  const { theme } = useTheme();

  if (data.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-slate-50/70 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/30">
        {emptyLabel}
      </div>
    );
  }

  const colorMap = RISK_COLORS[theme];
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
