"use client";

import { FileText, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type VendorAssessmentSidePanelsProps = {
  insightLines: string[];
};

export function VendorAssessmentSidePanels({
  insightLines,
}: VendorAssessmentSidePanelsProps) {
  return (
    <div className="space-y-4 lg:sticky lg:top-20">
      <Card>
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText
              className="h-4 w-4 text-indigo-600 dark:text-indigo-400"
              aria-hidden
            />
            Vendor evidence (PDF)
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Placeholder viewer — connect to your document pipeline in production.
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <div
            className="flex aspect-[4/3] flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50/80 text-center dark:border-slate-700 dark:bg-slate-900/40"
            role="region"
            aria-label="Evidence document placeholder"
          >
            <FileText className="mb-2 h-10 w-10 text-slate-400" aria-hidden />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No PDF loaded
            </p>
            <p className="mt-1 max-w-xs px-4 text-xs text-muted-foreground">
              Drag-and-drop or API upload would appear here for auditors and
              security officers.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles
              className="h-4 w-4 text-indigo-600 dark:text-indigo-400"
              aria-hidden
            />
            AI insights
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Heuristic summary from dummy assessment data — not legal advice. For live AI
            features, route inference through EU-based endpoints only to align with your
            data residency commitments.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-6">
          <ul
            className="m-0 list-none space-y-3 p-0"
            aria-label="Assessment insights"
          >
            {insightLines.map((line, i) => (
              <li
                key={i}
                className="rounded-md border border-slate-200/80 bg-white/60 p-3 text-sm leading-relaxed dark:border-slate-800 dark:bg-slate-900/40"
              >
                {line}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
