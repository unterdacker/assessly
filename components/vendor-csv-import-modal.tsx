"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  importVendorsCsvAction,
  type ImportRowResult,
  type ImportVendorsCsvResult,
} from "@/app/actions/vendor-csv-import";
import { parseRfc4180 } from "@/lib/csv-parse";

type VendorCsvImportModalProps = {
  trigger?: React.ReactNode;
};

type Step = "upload" | "preview" | "importing" | "result";

type HeaderIndex = {
  name: number;
  email: number;
  serviceType: number;
};

type PreviewRow = {
  row: number;
  name: string;
  email: string;
  serviceType: string;
  valid: boolean;
  reason?: string;
};

const CsvRowSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  serviceType: z.string().min(1).max(255),
});

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

export function VendorCsvImportModal({ trigger }: VendorCsvImportModalProps) {
  const router = useRouter();
  const t = useTranslations("vendors");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>("upload");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [csvContent, setCsvContent] = React.useState("");
  const [previewRows, setPreviewRows] = React.useState<PreviewRow[]>([]);
  const [result, setResult] = React.useState<ImportVendorsCsvResult | null>(null);

  const dialogTitleId = "vendor-csv-import-title";

  const validPreviewCount = React.useMemo(
    () => previewRows.filter((row) => row.valid).length,
    [previewRows],
  );
  const invalidPreviewCount = previewRows.length - validPreviewCount;

  const resetState = React.useCallback(() => {
    setStep("upload");
    setFileName(null);
    setError(null);
    setCsvContent("");
    setPreviewRows([]);
    setResult(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setTimeout(() => {
        resetState();
      }, 300);
    }
  };

  const parseForPreview = (textContent: string) => {
    const stripped = textContent.replace(/^\uFEFF/, "");
    const rows = parseRfc4180(stripped);

    if (rows.length === 0) {
      setError(t("csvImport.parseError"));
      return;
    }

    const headers = rows[0] ?? [];
    const indexByName = new Map<string, number>();
    for (let index = 0; index < headers.length; index += 1) {
      const normalized = normalizeHeader(headers[index] ?? "");
      if (!indexByName.has(normalized)) {
        indexByName.set(normalized, index);
      }
    }

    const required = ["name", "email", "servicetype"];
    const hasAllRequired = required.every((key) => indexByName.has(key));
    if (!hasAllRequired) {
      setError(t("csvImport.headerMissing"));
      return;
    }

    const headerIndex: HeaderIndex = {
      name: indexByName.get("name") ?? -1,
      email: indexByName.get("email") ?? -1,
      serviceType: indexByName.get("servicetype") ?? -1,
    };

    const dataRows = rows.slice(1);
    if (dataRows.length === 0) {
      setError(t("csvImport.noDataRows"));
      return;
    }
    if (dataRows.length > 200) {
      setError(t("csvImport.tooManyRows"));
      return;
    }

    const seenEmails = new Set<string>();
    const normalizedRows: PreviewRow[] = dataRows.map((row, idx) => {
      const name = (row[headerIndex.name] ?? "").trim();
      const email = (row[headerIndex.email] ?? "").trim();
      const serviceType = (row[headerIndex.serviceType] ?? "").trim();

      const parsed = CsvRowSchema.safeParse({ name, email, serviceType });
      if (!parsed.success) {
        return {
          row: idx + 1,
          name,
          email,
          serviceType,
          valid: false,
          reason: t("csvImport.resultReasonInvalidRow"),
        };
      }

      const lowerEmail = email.toLowerCase();
      if (seenEmails.has(lowerEmail)) {
        return {
          row: idx + 1,
          name,
          email,
          serviceType,
          valid: false,
          reason: t("csvImport.resultReasonDuplicateEmail"),
        };
      }

      seenEmails.add(lowerEmail);
      return {
        row: idx + 1,
        name,
        email,
        serviceType,
        valid: true,
      };
    });

    setCsvContent(stripped);
    setPreviewRows(normalizedRows);
    setError(null);
    setStep("preview");
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError(t("csvImport.parseError"));
      return;
    }

    if (file.size > 512_000) {
      setError(t("csvImport.fileTooLarge"));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setError(t("csvImport.parseError"));
    };
    reader.onload = () => {
      const resultText = typeof reader.result === "string" ? reader.result : "";
      if (!resultText) {
        setError(t("csvImport.parseError"));
        return;
      }

      try {
        parseForPreview(resultText);
      } catch {
        setError(t("csvImport.parseError"));
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const handleDownloadTemplate = () => {
    const header = "name,email,serviceType,officialName,contactEmail,headquartersLocation\n";
    const blob = new Blob([header], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "vendor-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const mapServerError = (code: string): string => {
    if (code === "rateLimited") return t("csvImport.errorRateLimited");
    if (code === "unauthorized") return t("csvImport.errorUnauthorized");
    if (code === "tooManyRows") return t("csvImport.tooManyRows");
    if (code === "noDataRows") return t("csvImport.noDataRows");
    if (code === "invalidHeaders") return t("csvImport.headerMissing");
    if (code === "parseError") return t("csvImport.parseError");
    return t("csvImport.errorGeneric");
  };

  const runImport = async () => {
    setStep("importing");
    setError(null);
    try {
      const response = await importVendorsCsvAction({ csvContent });

      if (!response.ok) {
        setError(mapServerError(response.error));
        setStep("upload");
        return;
      }

      setResult(response);
      setStep("result");
    } catch {
      setError(t("csvImport.errorGeneric"));
      setStep("upload");
    }
  };

  const onDropZoneKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const statusLabel = (status: ImportRowResult["status"]) => {
    if (status === "created") return t("csvImport.resultStatusCreated");
    if (status === "skipped") return t("csvImport.resultStatusSkipped");
    return t("csvImport.resultStatusFailed");
  };

  const reasonLabel = (reason?: string) => {
    if (reason === "duplicateEmail") return t("csvImport.resultReasonDuplicateEmail");
    if (reason === "invalidRow") return t("csvImport.resultReasonInvalidRow");
    if (reason === "dbError") return t("csvImport.resultReasonDbError");
    return "";
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" className="w-full sm:w-auto">
            {t("csvImport.buttonLabel")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        aria-labelledby={dialogTitleId}
        aria-busy={step === "importing"}
        onEscapeKeyDown={(event) => {
          if (step === "importing") {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (step === "importing") {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle id={dialogTitleId}>{t("csvImport.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("csvImport.dialogDesc")}</DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={onDropZoneKeyDown}
              className="cursor-pointer rounded-lg border border-dashed border-slate-300 p-4 text-sm text-muted-foreground transition-colors hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <label htmlFor="csv-file-input" className="block cursor-pointer font-medium text-foreground">
                {t("csvImport.fileLabelText")}
              </label>
              <p className="mt-2">{t("csvImport.dropZoneLabel")}</p>
              {fileName ? <p className="mt-2 text-xs">{t("csvImport.selectedFile", { filename: fileName })}</p> : null}
              <input
                id="csv-file-input"
                type="file"
                accept=".csv"
                ref={inputRef}
                className="sr-only"
                onChange={handleFileChange}
              />
            </div>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handleDownloadTemplate}>
                {t("csvImport.downloadTemplate")}
              </Button>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        {step === "preview" ? (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t("csvImport.previewTitle", { count: previewRows.length })}</h3>
            <div className="max-h-64 overflow-y-auto border rounded">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("csvImport.previewCaption", { count: previewRows.length })}</caption>
                <thead className="sticky top-0 bg-background">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">{t("csvImport.previewColRow")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("csvImport.previewColName")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("csvImport.previewColEmail")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("csvImport.previewColServiceType")}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.row} className={row.valid ? "bg-green-50" : "bg-red-50"}>
                      <td className="px-3 py-2">{row.row}</td>
                      <td className="px-3 py-2">{row.name || "-"}</td>
                      <td className="px-3 py-2">{row.email || "-"}</td>
                      <td className="px-3 py-2">
                        <div className="space-y-1">
                          <p>{row.serviceType || "-"}</p>
                          {!row.valid && row.reason ? (
                            <p className="text-xs text-red-700">{row.reason}</p>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("csvImport.previewValid", { count: validPreviewCount })}, {" "}
              {t("csvImport.previewInvalid", { count: invalidPreviewCount })}
            </p>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setStep("upload")}>
                {t("csvImport.backButton")}
              </Button>
              <Button type="button" onClick={runImport} disabled={validPreviewCount === 0}>
                {t("csvImport.importButton", { count: validPreviewCount })}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "importing" ? (
          <div className="flex items-center gap-3 py-4">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
            <p className="text-sm">{t("csvImport.importing")}</p>
          </div>
        ) : null}

        {step === "result" && result?.ok ? (
          <div aria-live="polite" role="status" className="space-y-4">
            <h3 className="text-sm font-semibold">{t("csvImport.resultTitle")}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                {t("csvImport.resultCreated", { count: result.created })}
              </div>
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {t("csvImport.resultSkipped", { count: result.skipped })}
              </div>
              <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {t("csvImport.resultFailed", { count: result.failed })}
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto border rounded">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("csvImport.resultCaption", { count: result.rows.length })}</caption>
                <thead className="sticky top-0 bg-background">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">{t("csvImport.resultColRow")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("csvImport.resultColStatus")}</th>
                    <th scope="col" className="px-3 py-2 text-left">{t("csvImport.resultColReason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={`${row.row}-${row.status}`}>
                      <td className="px-3 py-2">{row.row}</td>
                      <td className="px-3 py-2">{statusLabel(row.status)}</td>
                      <td className="px-3 py-2">{reasonLabel(row.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  handleOpenChange(false);
                  router.refresh();
                }}
              >
                {t("csvImport.closeButton")}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
