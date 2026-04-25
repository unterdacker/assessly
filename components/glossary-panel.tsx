"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Button } from "@/components/ui/button";

const TERMS = [
  {
    term: "Compliance Score",
    definition:
      "0–100 score per vendor. Derived from the percentage of NIS2/DORA controls answered as COMPLIANT.",
  },
  {
    term: "Risk Level",
    definition:
      "High / Medium / Low classification. High = score below 40, Medium = 40–70, Low = above 70.",
  },
  {
    term: "Dossier Completion",
    definition:
      "Percentage of questionnaire items answered and verified by the vendor.",
  },
  {
    term: "Systemic Risk",
    definition:
      "Aggregate supply-chain risk across your entire vendor portfolio.",
  },
  {
    term: "Supply Chain Risk Score",
    definition:
      "Weighted score (0–100) across all assessed vendors. Higher scores indicate lower systemic risk.",
  },
  {
    term: "Category Compliance Radar",
    definition:
      "Radar chart showing average NIS2/DORA compliance per control category.",
  }
];

export function GlossaryPanel() {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Compliance Glossary"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align="start"
          className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-[var(--border)] bg-[var(--popover)] p-4 text-[var(--popover-foreground)] shadow-md outline-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
          aria-label="Compliance terms glossary"
        >
          <p className="mb-3 text-sm font-medium text-foreground">Glossary</p>
          <dl className="space-y-0">
            {TERMS.map((item, index) => (
              <div
                key={item.term}
                className={index < TERMS.length - 1 ? "mb-3 border-b border-border/50 pb-3" : ""}
              >
                <dt className="text-xs font-semibold text-foreground">
                  {item.term}
                </dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {item.definition}
                </dd>
                </div>
            ))}
          </dl>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
