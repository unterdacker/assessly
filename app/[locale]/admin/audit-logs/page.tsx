import { prisma } from "@/lib/prisma";
import { ShieldAlert } from "lucide-react";
import { AuditLogsTable } from "@/components/admin/audit-logs-table";
import { requirePageRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

type AuditLogsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string }>;
};

export default async function AuditLogsPage({ params, searchParams }: AuditLogsPageProps) {
  const { locale } = await params;
  const { category } = await searchParams;
  const session = await requirePageRole(["ADMIN", "AUDITOR"], locale);

  const categoryFilter = category && category !== "ALL" ? category : undefined;

  const logs = await prisma.auditLog.findMany({
    where: {
      companyId: session.companyId ?? undefined,
      ...(categoryFilter ? { complianceCategory: categoryFilter } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
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
  });

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

      <AuditLogsTable logs={tableRows} activeCategory={categoryFilter ?? "ALL"} isAdmin={session.role === "ADMIN"} />
    </div>
  );
}
