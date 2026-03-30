"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { UploadCloud, FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { analyzeDocument } from "@/app/actions/analyze-document";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PdfUploadZoneProps = {
  vendorId: string;
  isAdminView?: boolean;
};

export function PdfUploadZone({ vendorId, isAdminView = false }: PdfUploadZoneProps) {
  const t = useTranslations("assessment.pdfUpload");
  const router = useRouter();
  const requiresConsent = !isAdminView;
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [fileSize, setFileSize] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [hasConsent, setHasConsent] = React.useState(isAdminView);

  React.useEffect(() => {
    if (isAdminView) {
      setHasConsent(true);
    }
  }, [isAdminView]);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    if (requiresConsent && !hasConsent) return;

    const dropped = event.dataTransfer.files?.[0];
    if (!dropped) return;
    if (dropped.type !== "application/pdf") {
      setFileName(null);
      setFileSize(null);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(dropped);
    setFileName(dropped.name);
    setFileSize(dropped.size);
    if (fileInputRef.current) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(dropped);
      fileInputRef.current.files = dataTransfer.files;
    }
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (requiresConsent && !hasConsent) return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return;
    setSelectedFile(file);
    setFileName(file.name);
    setFileSize(file.size);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (requiresConsent && !hasConsent) {
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
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="hidden" name="vendorId" value={vendorId} />

      {requiresConsent && (
        <div className="flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/30 p-3 dark:border-indigo-900/10 dark:bg-indigo-900/5">
          <input 
            type="checkbox" 
            id="privacy-consent"
            checked={hasConsent}
            onChange={(e) => setHasConsent(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="privacy-consent" className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 cursor-pointer select-none">
            {t.rich("privacyConsentLabel", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </label>
        </div>
      )}

      <div
        className={cn(
          "relative rounded-lg border-2 p-4 text-center transition-all",
          !requiresConsent || hasConsent ? "border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500 dark:hover:bg-slate-800" : "border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900",
          dragOver && (!requiresConsent || hasConsent) ? "border-indigo-500 bg-indigo-50/40 dark:bg-indigo-900/40" : "",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!requiresConsent || hasConsent) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <UploadCloud className={cn("mx-auto mb-1.5 h-6 w-6", !requiresConsent || hasConsent ? "text-indigo-600" : "text-slate-300")} />
        <p className="text-xs font-semibold">{t("dragAndDropTitle")}</p>
        <p className="text-[11px] text-muted-foreground">{t("orClickToSelect")}</p>
        <input
          ref={fileInputRef}
          type="file"
          name="file"
          accept="application/pdf"
          disabled={requiresConsent && !hasConsent}
          className="sr-only"
          onChange={onFileChange}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2 h-7 px-3 text-xs"
          disabled={requiresConsent && !hasConsent}
          onClick={() => fileInputRef.current?.click()}
        >
          {t("choosePdf")}
        </Button>
      </div>

      {fileName ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-left transition-all animate-in fade-in slide-in-from-top-1 dark:border-slate-700 dark:bg-slate-950/60">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" />
            <span className="truncate text-xs font-medium">{fileName}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{(fileSize || 0).toLocaleString()} bytes</p>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="rounded bg-red-50 p-1.5 text-[11px] text-red-600 dark:bg-red-900/10 dark:text-red-400">{errorMessage}</p>
      ) : null}
      
      {statusMessage ? (
        <p className="rounded bg-emerald-50 p-1.5 text-[11px] text-emerald-600 dark:bg-emerald-900/10 dark:text-emerald-400">{statusMessage}</p>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          className="h-8 px-3 text-xs shadow-sm"
          disabled={!selectedFile || isPending || (requiresConsent && !hasConsent)}
        >
          {isPending ? (<><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{t("runningAnalysis")}</>) : t("runAiAudit")}
        </Button>
      </div>
    </form>
  );
}
