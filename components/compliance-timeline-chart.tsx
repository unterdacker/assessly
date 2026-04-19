"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type ComplianceSnapshot = {
  snapshotDate: Date;
  overallScore: number;
  categoryScores: Record<string, number>;
};

type ComplianceTimelineChartProps = {
  snapshots: ComplianceSnapshot[];
  translations: {
    title: string;
    noData: string;
    xAxisLabel: string;
    yAxisLabel: string;
  };
};

function formatSnapshotDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ComplianceTimelineChart({
  snapshots,
  translations,
}: ComplianceTimelineChartProps) {
  if (snapshots.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-slate-50/70 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/30">
        {translations.noData}
      </div>
    );
  }

  const chartData = snapshots.map((snapshot) => ({
    date: formatSnapshotDate(snapshot.snapshotDate),
    score: snapshot.overallScore,
  }));

  return (
    <div
      role="img"
      aria-label={translations.title}
      className="h-[400px] w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            label={{
              value: translations.xAxisLabel,
              position: "insideBottom",
              offset: -5,
              style: {
                fill: "hsl(var(--muted-foreground))",
                fontSize: 12,
              },
            }}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            label={{
              value: translations.yAxisLabel,
              angle: -90,
              position: "insideLeft",
              style: {
                fill: "hsl(var(--muted-foreground))",
                fontSize: 12,
              },
            }}
          />
          <Tooltip
            formatter={(value) => {
              const num = typeof value === "number" ? value : Number(value ?? 0);
              return [`${Number.isFinite(num) ? num.toFixed(1) : 0}%`, "Score"];
            }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
            }}
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
          />
          <Legend
            wrapperStyle={{
              color: "hsl(var(--muted-foreground))",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#scoreGradient)"
            name="Compliance Score"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
