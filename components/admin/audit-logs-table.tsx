"use client";

import { useMemo, useState } from "react";
import { Eye, Activity, UserRound, Clock3, Database, MapPin, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AuditDiffViewer } from "@/components/admin/audit-diff-viewer";

type AuditLogRow = {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type AuditLogsTableProps = {
  logs: AuditLogRow[];
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function AuditLogsTable({ logs }: AuditLogsTableProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const selected = useMemo(
    () => logs.find((entry) => entry.id === selectedId) ?? null,
    [logs, selectedId],
  );

  const aiProvenance = useMemo(() => {
    if (!selected?.metadata || typeof selected.metadata !== "object") return null;

    const metadata = selected.metadata as Record<string, unknown>;
    const newValue = metadata.newValue;
    if (!newValue || typeof newValue !== "object") return null;

    const ai = newValue as Record<string, unknown>;
    const modelInfo = ai.model_info;
    const promptSnapshot = ai.prompt_snapshot;
    const rawAiOutput = ai.raw_ai_output;
    const linkedGenerationId = ai.ai_generation_event_id;

    const hasAiPayload =
      typeof modelInfo === "object" ||
      typeof promptSnapshot === "string" ||
      typeof rawAiOutput === "string" ||
      typeof linkedGenerationId === "string";

    if (!hasAiPayload) return null;

    const modelRecord =
      modelInfo && typeof modelInfo === "object"
        ? (modelInfo as Record<string, unknown>)
        : null;

    const provider =
      modelRecord && typeof modelRecord.provider === "string" ? modelRecord.provider : null;
    const modelId =
      modelRecord && typeof modelRecord.modelId === "string" ? modelRecord.modelId : null;

    return {
      provider,
      modelId,
      promptSnapshot: typeof promptSnapshot === "string" ? promptSnapshot : null,
      rawAiOutput: typeof rawAiOutput === "string" ? rawAiOutput : null,
      linkedGenerationId:
        typeof linkedGenerationId === "string" ? linkedGenerationId : null,
    };
  }, [selected]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" aria-hidden />
          Latest audit events for security review and incident traceability. Each entry includes forensic
          metadata (IP address, user agent) for NIS2 compliance.
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[220px]">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                Timestamp
              </span>
            </TableHead>
            <TableHead className="w-[160px]">
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5" aria-hidden />
                User
              </span>
            </TableHead>
            <TableHead className="w-[220px]">Action</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead className="w-[120px] text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No audit events found.
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono text-xs">{formatTimestamp(log.timestamp)}</TableCell>
                <TableCell className="font-medium">{log.userId}</TableCell>
                <TableCell>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {log.action}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Database className="h-3.5 w-3.5" aria-hidden />
                    <span className="font-medium text-foreground">{log.entityType}</span>
                    <span>/</span>
                    <span className="font-mono">{log.entityId}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedId(log.id);
                          setShowPrompt(false);
                        }}
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                        Details
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Audit Event Details</DialogTitle>
                        <DialogDescription>
                          Complete change history with forensic metadata for compliance verification.
                        </DialogDescription>
                      </DialogHeader>

                      {selected ? (
                        <div className="space-y-6">
                          <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40 md:grid-cols-2">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Timestamp</p>
                              <p className="font-mono">{formatTimestamp(selected.timestamp)}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">User</p>
                              <p>{selected.userId}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Action</p>
                              <p>{selected.action}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Entity</p>
                              <p className="font-mono">{selected.entityType}/{selected.entityId}</p>
                            </div>
                          </div>

                          {(selected.ipAddress || selected.userAgent) && (
                            <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
                              <h3 className="mb-3 text-sm font-semibold text-indigo-800 dark:text-indigo-300">
                                Forensic Metadata
                              </h3>
                              <div className="space-y-2 text-sm">
                                {selected.ipAddress && (
                                  <div className="flex items-start gap-2">
                                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                                    <div>
                                      <p className="font-semibold text-indigo-900 dark:text-indigo-100">
                                        IP Address
                                      </p>
                                      <code className="block text-xs text-indigo-800 dark:text-indigo-200">
                                        {selected.ipAddress}
                                      </code>
                                    </div>
                                  </div>
                                )}
                                {selected.userAgent && (
                                  <div className="flex items-start gap-2">
                                    <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                                    <div>
                                      <p className="font-semibold text-indigo-900 dark:text-indigo-100">
                                        User Agent
                                      </p>
                                      <code className="block max-w-sm overflow-auto text-xs text-indigo-800 dark:text-indigo-200">
                                        {selected.userAgent}
                                      </code>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {aiProvenance ? (
                            <div className="rounded-md border border-cyan-200 bg-cyan-50/40 p-4 dark:border-cyan-900 dark:bg-cyan-950/20">
                              <h3 className="mb-3 text-sm font-semibold text-cyan-900 dark:text-cyan-200">
                                AI Provenance
                              </h3>
                              <div className="space-y-2 text-sm">
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                                    Model
                                  </p>
                                  <p className="font-mono text-cyan-900 dark:text-cyan-100">
                                    {aiProvenance.modelId || "Unknown"}
                                    {aiProvenance.provider ? ` (${aiProvenance.provider})` : ""}
                                  </p>
                                </div>
                                {aiProvenance.linkedGenerationId ? (
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                                      Linked AI Generation Event
                                    </p>
                                    <p className="font-mono text-cyan-900 dark:text-cyan-100">
                                      {aiProvenance.linkedGenerationId}
                                    </p>
                                  </div>
                                ) : null}
                                {aiProvenance.promptSnapshot ? (
                                  <div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setShowPrompt((prev) => !prev)}
                                    >
                                      {showPrompt ? "Hide Original Prompt" : "View Original Prompt"}
                                    </Button>
                                    {showPrompt ? (
                                      <pre className="mt-2 max-h-52 overflow-auto rounded bg-white/80 p-2 text-xs leading-relaxed text-cyan-950 dark:bg-slate-950 dark:text-cyan-100">
                                        {aiProvenance.promptSnapshot}
                                      </pre>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          <div>
                            <h3 className="mb-3 text-sm font-semibold">Field Changes</h3>
                            <AuditDiffViewer previousValue={selected.previousValue} newValue={selected.newValue} />
                          </div>
                        </div>
                      ) : null}
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
