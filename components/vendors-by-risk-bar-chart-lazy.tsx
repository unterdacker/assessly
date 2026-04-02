"use client";

import dynamic from "next/dynamic";

const ChartSkeleton = () => (
  <div className="h-[320px] w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />
);

export const VendorsByRiskBarChartLazy = dynamic(
  () =>
    import("@/components/vendors-by-risk-bar-chart").then((m) => ({
      default: m.VendorsByRiskBarChart,
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
