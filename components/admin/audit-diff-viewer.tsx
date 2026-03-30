"use client";

import { getFieldLabel, formatFieldValue } from "@/lib/audit-field-labels";

type AuditDiffViewerProps = {
  previousValue: unknown;
  newValue: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractChangedFields(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Map<string, { prev: unknown; next: unknown }> {
  const changes = new Map<string, { prev: unknown; next: unknown }>();
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);

  for (const key of allKeys) {
    const prevVal = prev[key];
    const nextVal = next[key];

    if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
      changes.set(key, { prev: prevVal, next: nextVal });
    }
  }

  return changes;
}

function DiffRow({
  fieldName,
  previousValue,
  newValue,
}: {
  fieldName: string;
  previousValue: unknown;
  newValue: unknown;
}) {
  const label = getFieldLabel(fieldName);
  const displayPrev = formatFieldValue(previousValue);
  const displayNext = formatFieldValue(newValue);

  return (
    <div className="border-b border-slate-200 py-3 dark:border-slate-800">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        {label}
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded bg-red-50 p-2 dark:bg-red-950/30">
          <p className="mb-1 text-xs font-semibold text-red-700 dark:text-red-300">Previous</p>
          <code className="block overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-red-900 dark:text-red-100">
            {displayPrev}
          </code>
        </div>
        <div className="rounded bg-emerald-50 p-2 dark:bg-emerald-950/30">
          <p className="mb-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">New</p>
          <code className="block overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-emerald-900 dark:text-emerald-100">
            {displayNext}
          </code>
        </div>
      </div>
    </div>
  );
}

export function AuditDiffViewer({ previousValue, newValue }: AuditDiffViewerProps) {
  // Handle case where both are null
  if (!previousValue && !newValue) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-center text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/40">
        No changes recorded
      </div>
    );
  }

  // Handle case where previous is null (new record)
  if (!previousValue && isObject(newValue)) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">New Record Created</p>
        <div className="rounded bg-emerald-50 p-3 dark:bg-emerald-950/30">
          {Object.entries(newValue).map(([key, val]) => (
            <div key={key} className="border-b border-emerald-200 py-2 last:border-0 dark:border-emerald-900">
              <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                {getFieldLabel(key)}
              </p>
              <code className="mt-1 block text-xs text-emerald-900 dark:text-emerald-100">
                {formatFieldValue(val)}
              </code>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Both are objects: show field-level diff
  if (isObject(previousValue) && isObject(newValue)) {
    const changes = extractChangedFields(previousValue, newValue);

    if (changes.size === 0) {
      return (
        <div className="rounded border border-slate-200 bg-slate-50 p-4 text-center text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/40">
          No field-level changes detected
        </div>
      );
    }

    return (
      <div className="space-y-1 rounded border border-slate-200 dark:border-slate-800">
        {Array.from(changes.entries()).map(([fieldName, { prev, next }]) => (
          <DiffRow key={fieldName} fieldName={fieldName} previousValue={prev} newValue={next} />
        ))}
      </div>
    );
  }

  // Fallback: show side-by-side raw values
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded bg-red-50 p-3 dark:bg-red-950/30">
        <h3 className="mb-2 text-xs font-semibold uppercase text-red-700 dark:text-red-300">Previous</h3>
        <pre className="overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 text-xs leading-relaxed text-red-900 dark:bg-slate-950 dark:text-red-100">
          {JSON.stringify(previousValue, null, 2)}
        </pre>
      </div>
      <div className="rounded bg-emerald-50 p-3 dark:bg-emerald-950/30">
        <h3 className="mb-2 text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">New</h3>
        <pre className="overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 text-xs leading-relaxed text-emerald-900 dark:bg-slate-950 dark:text-emerald-100">
          {JSON.stringify(newValue, null, 2)}
        </pre>
      </div>
    </div>
  );
}
