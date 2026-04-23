"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface DashboardAnalyticsSectionProps {
  label: string;
  toggleOpenLabel: string;
  toggleCloseLabel: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function DashboardAnalyticsSection({
  label,
  toggleOpenLabel,
  toggleCloseLabel,
  defaultOpen = true,
  children,
}: DashboardAnalyticsSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mt-12 flex flex-col gap-4">
      <div className="flex flex-row items-center justify-between gap-4 border-b border-[var(--border)]/50 pb-2">
        <p className="text-[0.6875rem] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          {label}
        </p>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls="dashboard-analytics-content"
          className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]/50 hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
        >
          {isOpen ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              {toggleCloseLabel}
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              {toggleOpenLabel}
            </>
          )}
        </button>
      </div>
      <div
        id="dashboard-analytics-content"
        className={isOpen ? "flex flex-col gap-6" : "hidden"}
      >
        {children}
      </div>
    </div>
  );
}
