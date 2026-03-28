"use client";

import * as React from "react";
import { UploadCloud, FileText, Loader2 } from "lucide-react";
import { analyzeDocument } from "@/app/actions/analyze-document";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PdfUploadZoneProps = {
  vendorId: string;
};

export function PdfUploadZone({ vendorId }: PdfUploadZoneProps) {
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [fileSize, setFileSize] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
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
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return;
    setSelectedFile(file);
    setFileName(file.name);
    setFileSize(file.size);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="vendorId" value={vendorId} />

      <div
        className={cn(
          "rounded-lg border-2 p-6 text-center transition-colors",
          "border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-slate-100",
          "dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500 dark:hover:bg-slate-800",
          dragOver ? "border-indigo-500 bg-indigo-50/40 dark:bg-indigo-900/40" : "",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <UploadCloud className="mx-auto mb-2 h-8 w-8 text-indigo-600" />
        <p className="text-sm font-semibold">Drag and drop a PDF file here</p>
        <p className="text-xs text-muted-foreground">or click to select</p>
        <input
          ref={fileInputRef}
          type="file"
          name="file"
          accept="application/pdf"
          className="sr-only"
          onChange={onFileChange}
        />
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose PDF
        </Button>
      </div>

      {fileName ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-left dark:border-slate-700 dark:bg-slate-950/60">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="text-sm font-medium">{fileName}</span>
          </div>
          <p className="text-xs text-muted-foreground">{(fileSize || 0).toLocaleString()} bytes</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No file selected</p>
      )}

      {errorMessage ? (
        <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      ) : null}
      {statusMessage ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{statusMessage}</p>
      ) : null}

      <Button type="submit" disabled={!selectedFile || isPending}>
        {isPending ? (<><Loader2 className="mr-1 h-4 w-4 animate-spin" />Running audit…</>) : "Run AI Audit"}
      </Button>
    </form>
  );
}
