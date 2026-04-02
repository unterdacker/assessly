"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Lock,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { analyzeDocument } from "@/app/actions/analyze-document";
import { reanalyzeStoredDocument } from "@/app/actions/reanalyze-document";
import { removeAssessmentDocument } from "@/app/actions/remove-assessment-document";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  readOnly?: boolean;
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
  readOnly = false,
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
  const [isRemoving, setIsRemoving] = React.useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = React.useState(false);

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
  const isAuditActionDisabled = readOnly || isPending || isReanalyzing || (requiresConsent && !isConsented);

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

  async function handleRemove() {
    if (!assessmentId) return;
    setIsRemoving(true);
    setErrorMessage(null);
    try {
      const result = await removeAssessmentDocument(assessmentId);
      if (!result.ok) {
        setErrorMessage(result.error || t("aiAuditFailed"));
        return;
      }
      setFileName(null);
      setFileSize(null);
      setSelectedFile(null);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("aiAuditFailed");
      setErrorMessage(message);
    } finally {
      setIsRemoving(false);
      setShowRemoveConfirm(false);
    }
  }

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

  const canInteract = (isConsented || !requiresConsent) && !readOnly;

  return (
    <Card className="overflow-hidden border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
      <form onSubmit={handleSubmit}>
        <input type="hidden" name="vendorId" value={vendorId} />

        {/* ── Compact header ─────────────────────────────── */}
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xs font-semibold tracking-tight">{t("title")}</CardTitle>
            {hasStoredDocument && !hasLocalSelection ? (
              <Badge variant="compliant" className="shrink-0 gap-1 px-1.5 py-0 text-[10px]">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                {t("evidenceStoredBadge")}
              </Badge>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-2 px-3 py-3">
          {/* Consent checkbox (vendor only) – slim inline */}
          {requiresConsent && (
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="privacy-consent"
                checked={isConsented}
                onChange={(e) => setIsConsented(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label
                htmlFor="privacy-consent"
                className="cursor-pointer select-none text-[11px] leading-snug text-slate-500 dark:text-slate-400"
              >
                {t("consentLabel")}
              </label>
            </div>
          )}

          {/* ── File row  OR  slim dropzone strip ─────────── */}
          {displayFileName ? (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900/40">
              <FileText className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                {displayFileName}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatFileSize(displayFileSize ?? null, "")}
              </span>
              <Badge
                variant={hasLocalSelection ? "secondary" : "compliant"}
                className="shrink-0 px-1.5 py-0 text-[10px]"
              >
                {hasLocalSelection ? t("evidenceReadyBadge") : t("evidenceStoredBadge")}
              </Badge>
              {isAdminView && !readOnly && hasStoredDocument && !hasLocalSelection && assessmentId ? (
                <button
                  type="button"
                  aria-label={t("removeDocument")}
                  onClick={() => setShowRemoveConfirm(true)}
                  className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : (
            <div
              role="button"
              tabIndex={canInteract ? 0 : -1}
              aria-label={t("placeholderShort")}
              className={cn(
                "flex h-11 cursor-pointer items-center gap-2.5 rounded-md border-2 border-dashed px-3 transition-colors",
                canInteract
                  ? "border-slate-300 hover:border-indigo-400 hover:bg-slate-50/80 dark:border-slate-700 dark:hover:border-indigo-500 dark:hover:bg-slate-900/50"
                  : "cursor-not-allowed border-slate-200 opacity-40",
                dragOver && canInteract
                  ? "border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30"
                  : "",
              )}
              onClick={() => { if (canInteract) fileInputRef.current?.click(); }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && canInteract)
                  fileInputRef.current?.click();
              }}
              onDragOver={(e) => { e.preventDefault(); if (canInteract) setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onDrop={onDrop}
            >
              <UploadCloud
                className={cn("h-4 w-4 shrink-0", canInteract ? "text-indigo-400" : "text-slate-300")}
                aria-hidden
              />
              <span className="flex-1 text-[11px] text-muted-foreground">{t("placeholderShort")}</span>
              <span className="shrink-0 rounded border border-slate-300 bg-background px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                {t("choosePdf")}
              </span>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept="application/pdf"
            disabled={requiresConsent && !isConsented}
            className="sr-only"
            onChange={onFileChange}
          />

          {/* ── Inline action row ──────────────────────────── */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">
              {formattedAuditTimestamp
                ? t("lastAuditedAt", { timestamp: formattedAuditTimestamp })
                : t("notAuditedYet")}
            </p>

            <div className="flex items-center gap-1.5">
              {hasStoredDocument && documentUrl ? (
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" asChild>
                  <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                    <Eye className="h-3 w-3" aria-hidden />
                    {t("viewStoredPdf")}
                  </a>
                </Button>
              ) : null}

              {hasStoredDocument && !hasLocalSelection && assessmentId ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 gap-1 bg-indigo-600 px-3 text-[11px] text-white hover:bg-indigo-700"
                        disabled={isAuditActionDisabled}
                        onClick={handleReanalyze}
                      >
                        {isReanalyzing ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        ) : (
                          <Sparkles className="h-3 w-3" aria-hidden />
                        )}
                        {isReanalyzing ? t("runningAnalysis") : t("rerunAudit")}
                      </Button>
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
                          className="h-7 gap-1 bg-indigo-600 px-3 text-[11px] text-white hover:bg-indigo-700"
                          disabled={!selectedFile || isAuditActionDisabled}
                        >
                          {isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                          ) : (
                            <Sparkles className="h-3 w-3" aria-hidden />
                          )}
                          {isPending ? t("runningAnalysis") : t("runAiAudit")}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t("aiTooltip")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>

          {/* Feedback messages */}
          {errorMessage ? (
            <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {errorMessage}
            </p>
          ) : null}
          {statusMessage ? (
            <p className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
              {statusMessage}
            </p>
          ) : null}
        </CardContent>

        {/* ── Micro privacy note ─────────────────────────── */}
        <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
          <p className="flex items-center gap-1 text-[10px] leading-relaxed text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" aria-hidden />
            {t("microPrivacyNote")}
          </p>
        </div>
      </form>

      {/* ── Remove document confirmation (admin only) ─── */}
      <Dialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {t("removeConfirmTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {t("removeConfirmDescription")}
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => setShowRemoveConfirm(false)}
              disabled={isRemoving}
            >
              {t("removeCancelButton")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-[11px]"
              onClick={handleRemove}
              disabled={isRemoving}
            >
              {isRemoving ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
              ) : null}
              {t("removeConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
