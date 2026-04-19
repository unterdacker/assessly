"use client";

import dynamic from "next/dynamic";

const ChartSkeleton = () => (
  <div
    className="h-[400px] w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
    aria-hidden="true"
  />
);

export const ComplianceTimelineChartLazy = dynamic(
  () =>
    import("@/components/compliance-timeline-chart").then((m) => ({
      default: m.ComplianceTimelineChart,
    })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
