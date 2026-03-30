"use client";

import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EvidenceViewerProps = {
  answerId: string;
  filename: string;
  fileSize?: number | null;
  uploadedAt?: string | Date | null;
  uploadedBy?: string | null;
  viewLabel: string;
  uploadedAtLabel: string;
  uploadedByLabel: string;
  sizeLabel: string;
  unknownLabel: string;
  className?: string;
};

function formatFileSize(size: number | null | undefined, unknownLabel: string): string {
  if (!size || size <= 0) return unknownLabel;
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDateLabel(value: string | Date | null | undefined, unknownLabel: string): string {
  if (!value) return unknownLabel;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return unknownLabel;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function EvidenceViewer({
  answerId,
  filename,
  fileSize,
  uploadedAt,
  uploadedBy,
  viewLabel,
  uploadedAtLabel,
  uploadedByLabel,
  sizeLabel,
  unknownLabel,
  className,
}: EvidenceViewerProps) {
  return (
    <div className={cn("rounded-md border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
            <p className="truncate text-xs font-medium text-foreground">{filename}</p>
          </div>
          <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
            <p>{sizeLabel}: {formatFileSize(fileSize, unknownLabel)}</p>
            <p>{uploadedAtLabel}: {formatDateLabel(uploadedAt, unknownLabel)}</p>
            <p>{uploadedByLabel}: {uploadedBy || unknownLabel}</p>
          </div>
        </div>

        <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" asChild>
          <a href={`/api/documents/answer/${answerId}`} target="_blank" rel="noopener noreferrer">
            {viewLabel}
          </a>
        </Button>
      </div>
    </div>
  );
}
