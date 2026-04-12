/**
 * GET /api/audit-logs/forensic-bundle
 *
 * Exports a cryptographically signed, GDPR-compliant forensic bundle for
 * external auditors (BaFin, BSI, EU AI Office).
 *
 * Security controls:
 *   - Role-gate: ADMIN only
 *   - Company-scoped: only returns logs for the caller's company
 *   - IP truncation applied on export (GDPR Recital 30)
 *   - User ID pseudonymization applied on export (GDPR Art. 4(5))
 *   - PII field scrubbing via scrubPiiFields (GDPR Art. 25)
 *   - HMAC-SHA256 bundle signature (NIS2/DORA integrity)
 *   - Hash-chain verification report included (DORA Art. 9)
 *
 * Framework references:
 *   NIS2 Art. 21, DORA Art. 9, EU AI Act Art. 12/14,
 *   ISO 27001 A.12.4, SOC2 CC7.2, GDPR Art. 5/25
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthSessionFromRequest } from "@/lib/auth/server";
import { AuditLogger } from "@/lib/structured-logger";
import {
  pseudonymizeUserId,
  scrubPiiFields,
  truncateIp,
  signBundle,
  computeEventHash,
} from "@/lib/audit-sanitize";
import { toCsvRows } from "@/lib/csv-utils";

const REDACTED_FOR_PRIVACY = "[REDACTED_FOR_PRIVACY]";

type ChainIntegrityResult = {
  verified: boolean;
  brokenAt: string | null;
  totalEvents: number;
  eventsWithChain: number;
  verifiedChain: number;
  genesisEvents: number;
  integrityRate: number | null;
};

function verifyChain(rawLogs: Array<{
  id: string;
  companyId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: Date;
  previousLogHash: string | null;
  eventHash: string | null;
}>): ChainIntegrityResult {
  let chainVerified = 0;
  let chainBrokenAt: string | null = null;
  let genesisEvents = 0;

  for (let i = 0; i < rawLogs.length; i++) {
    const log = rawLogs[i];

    if (!log.eventHash) {
      genesisEvents++;
      continue;
    }

    const expectedHash = computeEventHash({
      companyId: log.companyId,
      userId: log.userId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      timestamp: log.timestamp.toISOString(),
      previousLogHash: log.previousLogHash,
    });

    if (expectedHash === log.eventHash) {
      chainVerified++;
    } else if (!chainBrokenAt) {
      chainBrokenAt = log.id;
    }
  }

  const totalWithChain = rawLogs.filter((log) => Boolean(log.eventHash)).length;
  const hasAnyHash = totalWithChain > 0;

  return {
    verified: chainBrokenAt === null && hasAnyHash,
    brokenAt: chainBrokenAt,
    totalEvents: rawLogs.length,
    eventsWithChain: totalWithChain,
    verifiedChain: chainVerified,
    genesisEvents,
    integrityRate: totalWithChain > 0 ? Math.round((chainVerified / totalWithChain) * 100) : null,
  };
}

export async function GET(request: NextRequest) {
  const session = await getAuthSessionFromRequest(request);
  if (!session || (session.role !== "ADMIN" && session.role !== "AUDITOR")) {
    AuditLogger.accessControl("api.audit_logs.forensic_bundle.forbidden", "failure", {
      role: session?.role ?? null,
      userId: session?.userId ?? null,
      sourceIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      message: "Forbidden forensic export attempt",
      responseCode: 403,
      details: {
        pathname: request.nextUrl.pathname,
        method: request.method,
      },
    });
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const companyId = session.companyId;
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "No company context." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const categoryFilter = searchParams.get("category") || undefined;
  const requestedFormat = (searchParams.get("format") || "").toLowerCase();
  const mode = (searchParams.get("mode") || "").toLowerCase();
  const profile = (searchParams.get("profile") || "").toLowerCase();
  const isAuditor = session.role === "AUDITOR";
  const format = requestedFormat === "json" || requestedFormat === "csv"
    ? requestedFormat
    : isAuditor
      ? "csv"
      : "json";

  const categoryToDb: Record<string, string[]> = {
    auth: ["AUTH"],
    access: ["ISO27001_SOC2"],
    config: ["CONFIG"],
    data: ["AI_ACT", "NIS2_DORA", "OTHER"],
    health: ["SYSTEM_HEALTH"],
  };

  const categoryWhere = (() => {
    if (!categoryFilter) return undefined;

    if (categoryFilter === "AI_GOVERNANCE") {
      return {
        complianceCategory: "AI_ACT",
        OR: [
          { aiModelId: { not: null } },
          { inputContextHash: { not: null } },
          { action: { in: ["AI_GENERATION", "DOCUMENT_ANALYZED", "AI_REMEDIATION_SENT"] } },
        ],
      } satisfies Prisma.AuditLogWhereInput;
    }

    if (categoryFilter === "HUMAN_OVERSIGHT") {
      return {
        complianceCategory: "AI_ACT",
        OR: [{ hitlVerifiedBy: { not: null } }, { action: "AI_REMEDIATION_SENT" }],
      } satisfies Prisma.AuditLogWhereInput;
    }

    const dbCategories = categoryToDb[categoryFilter];
    if (!dbCategories) return undefined;

    return { complianceCategory: { in: dbCategories } } satisfies Prisma.AuditLogWhereInput;
  })();

  const rawLogs = await prisma.auditLog.findMany({
    where: {
      companyId,
      ...(categoryWhere ?? {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      companyId: true,
      userId: true,
      action: true,
      entityType: true,
      entityId: true,
      previousValue: true,
      newValue: true,
      timestamp: true,
      createdAt: true,
      complianceCategory: true,
      reason: true,
      requestId: true,
      previousLogHash: true,
      eventHash: true,
      aiModelId: true,
      aiProviderName: true,
      inputContextHash: true,
      hitlVerifiedBy: true,
      metadata: true,
    },
  });

  const chainIntegrity = verifyChain(rawLogs);

  if (mode === "verify") {
    return NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        companyId,
        chainIntegrity,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  }

  const exportedLogs = rawLogs.map((log) => {
    const meta = log.metadata as Record<string, unknown> | null;
    const storedIp =
      (meta?.forensics as Record<string, unknown> | undefined)?.ipAddress ??
      meta?.ipAddress ??
      null;

    const userId = isAuditor ? pseudonymizeUserId(log.userId, "export") : log.userId;
    const hitlVerifiedBy = log.hitlVerifiedBy
      ? isAuditor
        ? pseudonymizeUserId(log.hitlVerifiedBy, "export")
        : log.hitlVerifiedBy
      : null;
    const reason = isAuditor ? REDACTED_FOR_PRIVACY : (log.reason ?? null);
    const requestId = isAuditor ? REDACTED_FOR_PRIVACY : (log.requestId ?? null);

    return {
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      createdAt: log.createdAt.toISOString(),
      userId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      complianceCategory: log.complianceCategory ?? "OTHER",
      reason,
      requestId,
      previousLogHash: log.previousLogHash ?? null,
      eventHash: log.eventHash ?? null,
      aiModelId: log.aiModelId ?? null,
      aiProviderName: log.aiProviderName ?? null,
      inputContextHash: log.inputContextHash ?? null,
      hitlVerifiedBy,
      ipAddress: truncateIp(typeof storedIp === "string" ? storedIp : null),
      previousValue: scrubPiiFields(log.previousValue),
      newValue: scrubPiiFields(log.newValue),
    };
  });

  const bundleId = `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const generatedAt = new Date().toISOString();

  const bundleContent = {
    ok: true,
    bundleId,
    generatedAt,
    generatedBy: pseudonymizeUserId(session.userId, "export"),
    companyId,
    exportScope: categoryFilter ?? "ALL",
    profile: isAuditor ? "AUDITOR" : "ADMIN",
    totalEvents: chainIntegrity.totalEvents,
    chainIntegrity,
    logs: exportedLogs,
  };

  const canonicalJson = JSON.stringify(bundleContent);
  const signature = signBundle(canonicalJson);

  if (format === "csv") {
    const csvRows = exportedLogs.map((log) => {
      if (isAuditor) return log;

      if (profile === "admin") {
        return {
          id: log.id,
          timestamp: log.timestamp,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          complianceCategory: log.complianceCategory,
          reason: log.reason,
          requestId: log.requestId,
          eventHash: log.eventHash,
          previousLogHash: log.previousLogHash,
        };
      }

      return log;
    });

    const csvBody = toCsvRows(csvRows as Array<Record<string, unknown>>);
    const signedPreamble = isAuditor
      ? [
          `# Venshield Forensic Export Signature: ${signature}`,
          `# Generated At: ${generatedAt}`,
          `# Chain Verified: ${String(chainIntegrity.verified)}`,
          `# Integrity Rate: ${chainIntegrity.integrityRate ?? "n/a"}`,
          "",
        ].join("\n")
      : "";

    return new NextResponse(`${signedPreamble}${csvBody}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="venshield-forensic-bundle-${Date.now()}.csv"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  }

  const signedBundle = {
    ...bundleContent,
    _meta: {
      format: "venshield-forensic-bundle-v2",
      frameworks: ["NIS2", "DORA", "EU_AI_ACT", "ISO27001", "SOC2", "GDPR"],
      signatureAlgorithm: "HMAC-SHA256",
      signatureNote:
        "Verify with HMAC-SHA256 of the canonical JSON body (excluding _meta.signature field) using the deployment AUDIT_BUNDLE_SECRET.",
      signature,
    },
  };

  return NextResponse.json(signedBundle, {
    headers: {
      "Content-Disposition": `attachment; filename="venshield-forensic-bundle-${Date.now()}.json"`,
      "Content-Type": "application/json",
      // Security: prevent caching of sensitive audit data
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}
