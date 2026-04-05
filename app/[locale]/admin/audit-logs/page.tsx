import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ShieldAlert } from "lucide-react";
import { AuditLogsTable } from "@/components/admin/audit-logs-table";
import { requirePageRole } from "@/lib/auth/server";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

const AUDIT_LOG_PAGE_SIZE = 50;

/** Valid UI filter keys. */
const VALID_CATEGORIES = new Set([
  "auth",
  "access",
  "config",
  "data",
  "health",
  "AI_GOVERNANCE",
  "HUMAN_OVERSIGHT",
]);

/** Maps base UI filter keys to the DB complianceCategory values they cover. */
const CATEGORY_TO_DB: Record<string, string[]> = {
  auth: ["AUTH"],
  access: ["ISO27001_SOC2"],
  config: ["CONFIG"],
  data: ["AI_ACT", "NIS2_DORA", "OTHER"],
  health: ["SYSTEM_HEALTH"],
};

function buildCategoryWhere(category: string | undefined): Prisma.AuditLogWhereInput | undefined {
  if (!category) return undefined;

  if (category === "AI_GOVERNANCE") {
    return {
      complianceCategory: "AI_ACT",
      OR: [
        { aiModelId: { not: null } },
        { inputContextHash: { not: null } },
        { action: { in: ["AI_GENERATION", "DOCUMENT_ANALYZED", "AI_REMEDIATION_SENT"] } },
      ],
    };
  }

  if (category === "HUMAN_OVERSIGHT") {
    return {
      complianceCategory: "AI_ACT",
      OR: [
        { hitlVerifiedBy: { not: null } },
        { action: "AI_REMEDIATION_SENT" },
      ],
    };
  }

  const dbCategories = CATEGORY_TO_DB[category];
  if (!dbCategories) return undefined;

  return { complianceCategory: { in: dbCategories } };
}

function extractModelDisplay(
  metadata: Record<string, unknown> | null,
  aiModelId: string | null,
): string | null {
  const newValue =
    metadata?.newValue && typeof metadata.newValue === "object"
      ? (metadata.newValue as Record<string, unknown>)
      : null;
  const modelInfo =
    newValue?.model_info && typeof newValue.model_info === "object"
      ? (newValue.model_info as Record<string, unknown>)
      : null;

  const modelIdFromMeta =
    modelInfo && typeof modelInfo.modelId === "string" ? modelInfo.modelId.trim() : null;
  const modelVersionFromMeta =
    modelInfo && typeof modelInfo.modelVersion === "string"
      ? modelInfo.modelVersion.trim()
      : modelInfo && typeof modelInfo.version === "string"
        ? modelInfo.version.trim()
        : null;

  const effectiveModelId = modelIdFromMeta || (aiModelId ? aiModelId.trim() : null);
  if (!effectiveModelId) return null;

  if (!modelVersionFromMeta) return effectiveModelId;
  if (effectiveModelId.includes(modelVersionFromMeta)) return effectiveModelId;

  return `${effectiveModelId}-${modelVersionFromMeta}`;
}

function deriveOversightAction(
  metadata: Record<string, unknown> | null,
  hitlVerifiedBy: string | null,
  action: string,
): string | null {
  const newValue =
    metadata?.newValue && typeof metadata.newValue === "object"
      ? (metadata.newValue as Record<string, unknown>)
      : null;

  const wasEdited =
    newValue && typeof newValue.was_edited_by_human === "boolean"
      ? newValue.was_edited_by_human
      : false;

  if (wasEdited) return "AI decision modified by user";

  const candidateFields = [
    newValue?.decision,
    newValue?.outcome,
    newValue?.status,
    newValue?.review_decision,
    newValue?.reviewDecision,
  ];

  const normalized = candidateFields.find((value) => typeof value === "string");
  const decision = typeof normalized === "string" ? normalized.toLowerCase() : "";

  if (decision.includes("reject")) return "AI decision rejected by user";
  if (decision.includes("modify") || decision.includes("edit")) return "AI decision modified by user";
  if (decision.includes("approve") || decision.includes("accept")) return "AI decision approved by user";

  if (hitlVerifiedBy) return "AI decision approved by user";
  if (action === "AI_REMEDIATION_SENT") return "AI decision modified by user";

  return null;
}

type AuditLogsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; category?: string }>;
};

export default async function AuditLogsPage({ params, searchParams }: AuditLogsPageProps) {
  const { locale } = await params;
  const { page: pageParam, category: rawCategory } = await searchParams;
  const session = await requirePageRole(["ADMIN", "AUDITOR"], locale);
  const t = await getTranslations("Audit");

  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const skip = (page - 1) * AUDIT_LOG_PAGE_SIZE;

  const activeCategory =
    rawCategory && VALID_CATEGORIES.has(rawCategory) ? rawCategory : undefined;
  const categoryWhere = buildCategoryWhere(activeCategory);

  const where = {
    companyId: session.companyId ?? undefined,
    ...(categoryWhere ?? {}),
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

    const modelDisplay = extractModelDisplay(metadata, entry.aiModelId ?? null);
    const oversightAction = deriveOversightAction(metadata, entry.hitlVerifiedBy ?? null, entry.action);
    const isHumanOversight = Boolean(oversightAction);
    const isAiGovernance = !isHumanOversight && entry.complianceCategory === "AI_ACT";

    return {
      id: entry.id,
      timestamp: entry.createdAt.toISOString(),
      userId: entry.actorId,
      action: oversightAction ?? entry.action,
      entityType: entry.entityType,
      entityId: isAiGovernance && modelDisplay ? modelDisplay : entry.entityId,
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
      complianceCategory:
        isAiGovernance || isHumanOversight
          ? "AI_ACT"
          : (entry.complianceCategory ?? "OTHER"),
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
            <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
        </div>
      </header>

      <AuditLogsTable logs={tableRows} isAdmin={session.role === "ADMIN"} activeCategory={activeCategory} total={total} />

      {total > AUDIT_LOG_PAGE_SIZE && (
        <nav aria-label="Audit log pagination" className="flex items-center justify-between border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
          <span className="text-muted-foreground">
            {skip + 1}–{Math.min(skip + AUDIT_LOG_PAGE_SIZE, total)} of {total} entries
          </span>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={`?${new URLSearchParams({ page: String(page - 1), ...(activeCategory ? { category: activeCategory } : {}) }).toString()}`}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {t("paginationPrevious")}
              </Link>
            )}
            <span className="tabular-nums text-muted-foreground">{page} / {Math.ceil(total / AUDIT_LOG_PAGE_SIZE)}</span>
            {skip + AUDIT_LOG_PAGE_SIZE < total && (
              <Link
                href={`?${new URLSearchParams({ page: String(page + 1), ...(activeCategory ? { category: activeCategory } : {}) }).toString()}`}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {t("paginationNext")}
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
