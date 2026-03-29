"use client";

import * as React from "react";
import { UploadCloud, FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { analyzeDocument } from "@/app/actions/analyze-document";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PdfUploadZoneProps = {
  vendorId: string;
};

export function PdfUploadZone({ vendorId }: PdfUploadZoneProps) {
  const router = useRouter();
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [fileSize, setFileSize] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [hasConsent, setHasConsent] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    if (!hasConsent) return;

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
    if (!hasConsent) return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return;
    setSelectedFile(file);
    setFileName(file.name);
    setFileSize(file.size);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasConsent) {
      setErrorMessage("Privacy consent is required.");
      return;
    }

    if (!selectedFile) {
      setErrorMessage("Please select a PDF file before submitting.");
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
        setErrorMessage(response.error || "AI audit failed.");
      } else {
        setStatusMessage("Analysis complete. Results saved.");
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="vendorId" value={vendorId} />

      <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 dark:border-indigo-900/10 dark:bg-indigo-900/5">
        <input 
          type="checkbox" 
          id="privacy-consent"
          checked={hasConsent}
          onChange={(e) => setHasConsent(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label htmlFor="privacy-consent" className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 cursor-pointer select-none">
          I understand that this document will be analyzed <strong>statelessly</strong> by AVRA's private AI engine for audit purposes only. 
          The PDF itself is NOT stored permanently.
        </label>
      </div>

      <div
        className={cn(
          "relative rounded-lg border-2 p-6 text-center transition-all",
          hasConsent ? "border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500 dark:hover:bg-slate-800" : "border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900",
          dragOver && hasConsent ? "border-indigo-500 bg-indigo-50/40 dark:bg-indigo-900/40" : "",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (hasConsent) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <UploadCloud className={cn("mx-auto mb-2 h-8 w-8", hasConsent ? "text-indigo-600" : "text-slate-300")} />
        <p className="text-sm font-semibold">Drag and drop a PDF file here</p>
        <p className="text-xs text-muted-foreground">or click to select</p>
        <input
          ref={fileInputRef}
          type="file"
          name="file"
          accept="application/pdf"
          disabled={!hasConsent}
          className="sr-only"
          onChange={onFileChange}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled={!hasConsent}
          onClick={() => fileInputRef.current?.click()}
        >
          Choose PDF
        </Button>
      </div>

      {fileName ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-left dark:border-slate-700 dark:bg-slate-950/60 transition-all animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-medium truncate">{fileName}</span>
          </div>
          <p className="text-xs text-muted-foreground">{(fileSize || 0).toLocaleString()} bytes</p>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-2 rounded">{errorMessage}</p>
      ) : null}
      
      {statusMessage ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/10 p-2 rounded">{statusMessage}</p>
      ) : null}

      <Button 
        type="submit" 
        className="w-full shadow-md"
        disabled={!selectedFile || isPending || !hasConsent}
      >
        {isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running analysis…</>) : "Run AI Audit"}
      </Button>
    </form>
  );
}
