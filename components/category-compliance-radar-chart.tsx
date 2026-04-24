"use client";

import { useState, useEffect } from "react";
import { useTheme } from "@/components/theme-provider";

type CategoryComplianceRadarChartProps = {
  data: Array<{ label: string; shortLabel: string; value: number }>;
  legendLabel?: string;
  emptyLabel: string;
  emptyDescription?: string;
  hoverHint?: string;
};

export function CategoryComplianceRadarChart({
  data,
  emptyLabel,
  emptyDescription,
}: CategoryComplianceRadarChartProps) {
  const { theme } = useTheme();
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

  const fillOpacity = theme === "dark" ? 0.45 : 0.2;
  const strokeWidth = theme === "dark" ? 2.5 : 2;
  const gridStroke =
    theme === "dark" ? "rgba(148,163,184,0.45)" : "rgba(100,116,139,0.4)";
  const tickFill = theme === "dark" ? "#cbd5e1" : "#475569";
  const primaryColor = theme === "dark" ? "#818cf8" : "#4338ca";

  // SVG geometry
  const cx = 240;
  const cy = 240;
  const outerRadius = 190;
  const labelPadding = 26;
  const N = data.length;
  const rings = [1, 2, 3, 4, 5];

  // Axis angles: first axis points up (12 o'clock)
  const angles = data.map((_, i) => (2 * Math.PI * i) / N - Math.PI / 2);

  // Grid ring polygon points strings
  const ringPointStrings = rings.map((L) =>
    angles
      .map(
        (a) =>
          `${cx + (L / 5) * outerRadius * Math.cos(a)},${cy + (L / 5) * outerRadius * Math.sin(a)}`,
      )
      .join(" "),
  );

  // Data polygon points string
  const dataPointString = data
    .map((d, i) => {
      const r = (d.value / 100) * outerRadius;
      return `${cx + r * Math.cos(angles[i])},${cy + r * Math.sin(angles[i])}`;
    })
    .join(" ");

  // Dot positions
  const dotPositions = data.map((d, i) => ({
    x: cx + (d.value / 100) * outerRadius * Math.cos(angles[i]),
    y: cy + (d.value / 100) * outerRadius * Math.sin(angles[i]),
  }));

  // Label positions
  const labelPositions = data.map((d, i) => {
    const lx = cx + (outerRadius + labelPadding) * Math.cos(angles[i]);
    const ly = cy + (outerRadius + labelPadding) * Math.sin(angles[i]);
    const textAnchor =
      (lx < cx - 5 ? "end" : lx > cx + 5 ? "start" : "middle") as "end" | "start" | "middle";
    const dominantBaseline =
      (ly < cy - 5 ? "auto" : ly > cy + 5 ? "hanging" : "middle") as "auto" | "hanging" | "middle";
    return { lx, ly, textAnchor, dominantBaseline, label: d.shortLabel };
  });

  return (
    <div className="w-full">
      {!mounted ? (
        <div
          className="w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
          style={{ height: 340 }}
        />
      ) : (
        <svg
          viewBox="0 0 480 480"
          aria-hidden="true"
          className="w-full"
          style={{ height: 340 }}
        >
          {/* Grid rings */}
          {ringPointStrings.map((pts, idx) => (
            <polygon
              key={idx}
              points={pts}
              fill="none"
              stroke={gridStroke}
              strokeWidth={0.75}
            />
          ))}

          {/* Axis spokes */}
          {angles.map((a, i) => (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={cx + outerRadius * Math.cos(a)}
              y2={cy + outerRadius * Math.sin(a)}
              stroke={gridStroke}
              strokeWidth={0.75}
            />
          ))}

          {/* Data polygon */}
          <polygon
            points={dataPointString}
            fill={primaryColor}
            fillOpacity={fillOpacity}
            stroke={primaryColor}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />

          {/* Data dots */}
          {dotPositions.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill={primaryColor} />
          ))}

          {/* Axis labels */}
          {labelPositions.map((lp, i) => (
            <text
              key={i}
              x={lp.lx}
              y={lp.ly}
              textAnchor={lp.textAnchor}
              dominantBaseline={lp.dominantBaseline}
              fontSize={15}
              fontWeight="600"
              fill={tickFill}
            >
              {lp.label}
            </text>
          ))}
        </svg>
      )}

      {/* Category score grid */}
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.map((item) => {
          const score = Math.round(item.value);
          const scoreColor =
            score >= 70
              ? "text-success"
              : score >= 40
                ? "text-warning"
                : "text-destructive";
          return (
            <div key={item.label} className="min-w-0">
              <div className="text-xs leading-tight text-muted-foreground">
                {item.label}
              </div>
              <div
                className={`mt-0.5 text-sm font-semibold tabular-nums ${scoreColor}`}
              >
                {score}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}




