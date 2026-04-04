import { prisma } from "@/lib/prisma";
import { ShieldAlert } from "lucide-react";
import { AuditLogsTable } from "@/components/admin/audit-logs-table";
import { requirePageRole } from "@/lib/auth/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

const AUDIT_LOG_PAGE_SIZE = 50;

type AuditLogsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

export default async function AuditLogsPage({ params, searchParams }: AuditLogsPageProps) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  const session = await requirePageRole(["ADMIN", "AUDITOR"], locale);

  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const skip = (page - 1) * AUDIT_LOG_PAGE_SIZE;

  const where = {
    companyId: session.companyId ?? undefined,
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: AUDIT_LOG_PAGE_SIZE,
      skip,
      select: {
        id: true,
        createdAt: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        complianceCategory: true,
        reason: true,
        requestId: true,
        previousLogHash: true,
        eventHash: true,
        aiModelId: true,
        aiProviderName: true,
        inputContextHash: true,
        hitlVerifiedBy: true,
      },
    }),
  ]);

  const tableRows = logs.map((entry) => {
    const metadata =
      entry.metadata && typeof entry.metadata === "object"
        ? (entry.metadata as Record<string, unknown>)
        : null;

    const forensics = metadata?.forensics;
    const ipAddress =
      (forensics && typeof forensics === "object" && "ipAddress" in forensics
        ? (forensics as Record<string, unknown>).ipAddress
        : null) || metadata?.ipAddress || null;

    const userAgent =
      (forensics && typeof forensics === "object" && "userAgent" in forensics
        ? (forensics as Record<string, unknown>).userAgent
        : null) || metadata?.userAgent || null;

    return {
      id: entry.id,
      timestamp: entry.createdAt.toISOString(),
      userId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      previousValue:
        metadata && typeof metadata === "object" && "previousValue" in metadata
          ? (metadata as Record<string, unknown>).previousValue
          : null,
      newValue:
        metadata && typeof metadata === "object" && "newValue" in metadata
          ? (metadata as Record<string, unknown>).newValue
          : null,
      ipAddress: typeof ipAddress === "string" ? ipAddress : null,
      userAgent: typeof userAgent === "string" ? userAgent : null,
      metadata,
      // Compliance fields
      complianceCategory: entry.complianceCategory ?? "OTHER",
      reason: entry.reason ?? null,
      requestId: entry.requestId ?? null,
      previousLogHash: entry.previousLogHash ?? null,
      eventHash: entry.eventHash ?? null,
      aiModelId: entry.aiModelId ?? null,
      aiProviderName: entry.aiProviderName ?? null,
      inputContextHash: entry.inputContextHash ?? null,
      hitlVerifiedBy: entry.hitlVerifiedBy ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
            <ShieldAlert className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Privacy-first forensic event history. NIS2 · DORA · EU AI Act · ISO 27001 · SOC2 · GDPR compliant.
            </p>
          </div>
        </div>
      </header>

      <AuditLogsTable logs={tableRows} isAdmin={session.role === "ADMIN"} />

      {total > AUDIT_LOG_PAGE_SIZE && (
        <nav aria-label="Audit log pagination" className="flex items-center justify-between border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
          <span className="text-muted-foreground">
            {skip + 1}–{Math.min(skip + AUDIT_LOG_PAGE_SIZE, total)} of {total} entries
          </span>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={`?${new URLSearchParams({ page: String(page - 1) }).toString()}`}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Previous
              </Link>
            )}
            <span className="tabular-nums text-muted-foreground">{page} / {Math.ceil(total / AUDIT_LOG_PAGE_SIZE)}</span>
            {skip + AUDIT_LOG_PAGE_SIZE < total && (
              <Link
                href={`?${new URLSearchParams({ page: String(page + 1) }).toString()}`}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
