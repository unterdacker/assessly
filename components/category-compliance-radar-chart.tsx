"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

type CategoryComplianceRadarChartProps = {
  data: Array<{
    label: string;
    shortLabel: string;
    value: number;
  }>;
  legendLabel: string;
  emptyLabel: string;
};

export function CategoryComplianceRadarChart({
  data,
  legendLabel,
  emptyLabel,
}: CategoryComplianceRadarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-slate-50/70 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/30">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis
            dataKey="shortLabel"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          />
          <Tooltip
            formatter={(value: number) => [`${value}%`, legendLabel]}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
            }}
          />
          <Legend
            wrapperStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}
          />
          <Radar
            name={legendLabel}
            dataKey="value"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.24}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
