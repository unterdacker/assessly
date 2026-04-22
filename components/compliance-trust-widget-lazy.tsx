"use client";

import dynamic from "next/dynamic";

const Skeleton = () => (
  <div className="h-[220px] w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />
);

export const ComplianceTrustWidgetLazy = dynamic(
  () =>
    import("@/components/compliance-trust-widget").then((m) => ({
      default: m.ComplianceTrustWidget,
    })),
  { ssr: false, loading: () => <Skeleton /> },
);
