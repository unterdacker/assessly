"use client";

import dynamic from "next/dynamic";

const ChartSkeleton = () => (
  <div className="h-[320px] w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />
);

export const CategoryComplianceRadarChartLazy = dynamic(
  () =>
    import("@/components/category-compliance-radar-chart").then((m) => ({
      default: m.CategoryComplianceRadarChart,
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
