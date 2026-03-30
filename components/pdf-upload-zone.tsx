"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { analyzeDocument } from "@/app/actions/analyze-document";
import { reanalyzeStoredDocument } from "@/app/actions/reanalyze-document";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type PdfUploadZoneProps = {
  vendorId: string;
  isAdminView?: boolean;
  assessmentId?: string;
  storedDocumentFilename?: string | null;
  documentUrl?: string | null;
  storedDocumentSize?: number | null;
  lastAuditedAt?: string | null;
};

const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

function formatFileSize(size: number | null, fallbackLabel: string): string {
  if (!size || size <= 0) return fallbackLabel;
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatAuditTimestamp(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function PdfUploadZone({
  vendorId,
  isAdminView = false,
  assessmentId,
  storedDocumentFilename,
  documentUrl,
  storedDocumentSize,
  lastAuditedAt,
}: PdfUploadZoneProps) {
  const t = useTranslations("pdfUpload");
  const router = useRouter();
  const requiresConsent = !isAdminView;

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [fileSize, setFileSize] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isConsented, setIsConsented] = React.useState(isAdminView);
  const [isReanalyzing, setIsReanalyzing] = React.useState(false);

  React.useEffect(() => {
    if (isAdminView) {
      setIsConsented(true);
    }
  }, [isAdminView]);

  React.useEffect(() => {
    if (!selectedFile) {
      setFileName(storedDocumentFilename ?? null);
      setFileSize(storedDocumentSize ?? null);
    }
  }, [selectedFile, storedDocumentFilename, storedDocumentSize]);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const hasStoredDocument = Boolean(storedDocumentFilename && documentUrl);
  const hasLocalSelection = Boolean(selectedFile);
  const displayFileName = fileName ?? storedDocumentFilename ?? null;
  const displayFileSize = hasLocalSelection ? fileSize : storedDocumentSize;
  const formattedAuditTimestamp = formatAuditTimestamp(lastAuditedAt);
  const isAuditActionDisabled = isPending || isReanalyzing || (requiresConsent && !isConsented);

  function assignFile(file: File | null) {
    if (!file) {
      setSelectedFile(null);
      setFileName(null);
      setFileSize(null);
      return;
    }

    if (file.type !== "application/pdf") {
      setSelectedFile(null);
      setErrorMessage(t("pdfOnly"));
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setSelectedFile(null);
      setErrorMessage(t("fileTooLarge"));
      return;
    }

    setErrorMessage(null);
    setSelectedFile(file);
    setFileName(file.name);
    setFileSize(file.size);
  }

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    if (requiresConsent && !isConsented) return;

    const dropped = event.dataTransfer.files?.[0];
    if (!dropped) return;

    assignFile(dropped);

    if (fileInputRef.current) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(dropped);
      fileInputRef.current.files = dataTransfer.files;
    }
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (requiresConsent && !isConsented) return;
    const file = event.target.files?.[0];
    assignFile(file ?? null);
  };

  async function handleReanalyze() {
    if (!assessmentId) return;

    setIsReanalyzing(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result = await reanalyzeStoredDocument(assessmentId);
      if (!result.ok) {
        setErrorMessage(result.error || t("aiAuditFailed"));
        return;
      }
      setStatusMessage(t("analysisComplete"));
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("aiAuditFailed");
      setErrorMessage(message);
    } finally {
      setIsReanalyzing(false);
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (requiresConsent && !isConsented) {
      setErrorMessage(t("privacyConsentRequired"));
      return;
    }

    if (!selectedFile) {
      setErrorMessage(t("selectPdfBeforeSubmitting"));
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);

    const formData = new FormData();
    formData.append("vendorId", vendorId);
    formData.append("file", selectedFile);

    startTransition(async () => {
      const response = await analyzeDocument(formData);
      if (!response.ok) {
        setErrorMessage(response.error || t("aiAuditFailed"));
      } else {
        setStatusMessage(t("analysisComplete"));
        setSelectedFile(null);
        router.refresh();
      }
    });
  };

  return (
    <Card className="overflow-hidden border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
      <form onSubmit={handleSubmit}>
        <input type="hidden" name="vendorId" value={vendorId} />

        <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-sm font-semibold tracking-tight">{t("title")}</CardTitle>
              <CardDescription className="text-xs leading-relaxed">{t("placeholder")}</CardDescription>
            </div>
            {hasStoredDocument && !hasLocalSelection ? (
              <Badge variant="compliant" className="shrink-0 gap-1 px-2 py-1">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {t("evidenceStoredBadge")}
              </Badge>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-4 py-4">
          {requiresConsent && (
            <div className="flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 dark:border-indigo-900/20 dark:bg-indigo-950/20">
              <input
                type="checkbox"
                id="privacy-consent"
                checked={isConsented}
                onChange={(e) => setIsConsented(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="privacy-consent" className="cursor-pointer select-none text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {t("consentLabel")}
              </label>
            </div>
          )}

          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900 dark:border-blue-900/30 dark:bg-slate-900/60 dark:text-blue-200">
            {t("privacyNote")}
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-muted/40 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            {displayFileName ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-background px-3 py-3 shadow-sm dark:border-slate-800">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                  <FileText className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{displayFileName}</p>
                    <Badge variant={hasLocalSelection ? "secondary" : "compliant"} className="shrink-0">
                      {hasLocalSelection ? t("evidenceReadyBadge") : t("evidenceStoredBadge")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatFileSize(displayFileSize, t("sizeUnavailable"))}
                  </p>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "relative rounded-xl border-2 border-dashed p-8 text-center transition-all",
                  isConsented || !requiresConsent
                    ? "border-slate-300 bg-background hover:border-indigo-400 hover:bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/30 dark:hover:border-indigo-500 dark:hover:bg-slate-900/70"
                    : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-50 dark:border-slate-800 dark:bg-slate-900",
                  dragOver && (isConsented || !requiresConsent)
                    ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40"
                    : "",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (isConsented || !requiresConsent) setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                }}
                onDrop={onDrop}
              >
                <UploadCloud
                  className={cn(
                    "mx-auto mb-3 h-8 w-8",
                    isConsented || !requiresConsent ? "text-indigo-500" : "text-slate-300",
                  )}
                  aria-hidden
                />
                <p className="text-sm font-semibold text-foreground">{t("title")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("placeholder")}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  name="file"
                  accept="application/pdf"
                  disabled={requiresConsent && !isConsented}
                  className="sr-only"
                  onChange={onFileChange}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-4 h-8 px-4 text-xs"
                  disabled={requiresConsent && !isConsented}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t("choosePdf")}
                </Button>
              </div>
            )}
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {errorMessage}
            </p>
          ) : null}

          {statusMessage ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
              {statusMessage}
            </p>
          ) : null}
        </CardContent>

        <CardFooter className="flex flex-col items-stretch gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/40 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("auditTrailLabel")}
            </p>
            <p className="text-xs text-muted-foreground">
              {formattedAuditTimestamp
                ? t("lastAuditedAt", { timestamp: formattedAuditTimestamp })
                : t("notAuditedYet")}
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {hasStoredDocument && documentUrl ? (
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                  {t("viewStoredPdf")}
                </a>
              </Button>
            ) : null}

            {hasStoredDocument && !hasLocalSelection && assessmentId ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1.5 bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-600 px-4 text-xs text-white shadow-sm transition-all hover:from-indigo-500 hover:via-blue-500 hover:to-indigo-500"
                        disabled={isAuditActionDisabled}
                        onClick={handleReanalyze}
                      >
                        {isReanalyzing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {isReanalyzing ? t("runningAnalysis") : t("rerunAudit")}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t("aiTooltip")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="submit"
                        size="sm"
                        className="h-8 gap-1.5 bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-600 px-4 text-xs text-white shadow-sm transition-all hover:from-indigo-500 hover:via-blue-500 hover:to-indigo-500"
                        disabled={!selectedFile || isAuditActionDisabled}
                      >
                        {isPending ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            {t("runningAnalysis")}
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5" aria-hidden />
                            {t("runAiAudit")}
                          </>
                        )}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t("aiTooltip")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
