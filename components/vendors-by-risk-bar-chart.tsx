"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type VendorsByRiskBarChartProps = {
  data: Array<{
    label: string;
    count: number;
    color: string;
  }>;
  legendLabel: string;
  emptyLabel: string;
};

export function VendorsByRiskBarChart({
  data,
  legendLabel,
  emptyLabel,
}: VendorsByRiskBarChartProps) {
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
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="label"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <Tooltip
            formatter={(value: number | string, _name, item) => {
              const payloadCount = item?.payload?.count;
              const normalizedCount = Number.isFinite(Number(payloadCount))
                ? Number(payloadCount)
                : Number(value);
              return [normalizedCount, legendLabel];
            }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
            }}
          />
          <Bar dataKey="count" name={legendLabel} radius={[8, 8, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
