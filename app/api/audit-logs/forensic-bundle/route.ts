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
import { prisma } from "@/lib/prisma";
import { getAuthSessionFromRequest } from "@/lib/auth/server";
import {
  pseudonymizeUserId,
  scrubPiiFields,
  truncateIp,
  signBundle,
  computeEventHash,
} from "@/lib/audit-sanitize";

export async function GET(request: NextRequest) {
  // --- Access control ---
  const session = await getAuthSessionFromRequest(request);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const companyId = session.companyId;
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "No company context." }, { status: 400 });
  }

  // --- Optional compliance category filter from query param ---
  const { searchParams } = new URL(request.url);
  const categoryFilter = searchParams.get("category") || undefined;

  // --- Fetch all logs for this company, oldest first (chain order) ---
  // Cast to any: Prisma client types lag behind schema until next `prisma generate`.
  // The select fields are correct per schema.prisma — this cast is intentional.
  const rawLogs = await (prisma.auditLog as any).findMany({
    where: {
      companyId,
      ...(categoryFilter ? { complianceCategory: categoryFilter } : {}),
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
  }) as Array<{
    id: string;
    companyId: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    previousValue: unknown;
    newValue: unknown;
    timestamp: Date;
    createdAt: Date;
    complianceCategory: string | null;
    reason: string | null;
    requestId: string | null;
    previousLogHash: string | null;
    eventHash: string | null;
    aiModelId: string | null;
    aiProviderName: string | null;
    inputContextHash: string | null;
    hitlVerifiedBy: string | null;
    metadata: unknown;
  }>;

  // --- Hash-chain verification ---
  let chainVerified = 0;
  let chainBrokenAt: string | null = null;
  let genesisEvents = 0;

  for (let i = 0; i < rawLogs.length; i++) {
    const log = rawLogs[i];

    if (!log.eventHash) {
      // Pre-upgrade log; no chain data
      genesisEvents++;
      continue;
    }

    // Re-compute the expected hash to verify integrity
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

  const totalWithChain = rawLogs.filter((l) => l.eventHash).length;

  // --- GDPR-compliant sanitization for export ---
  const sanitizedLogs = rawLogs.map((log) => {
    // Re-extract IP from metadata if stored there
    const meta = log.metadata as Record<string, unknown> | null;
    const storedIp =
      (meta?.forensics as Record<string, unknown> | undefined)?.ipAddress ??
      meta?.ipAddress ??
      null;

    return {
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      createdAt: log.createdAt.toISOString(),
      // GDPR Art. 4(5): Pseudonymize user IDs for external auditors
      userId: pseudonymizeUserId(log.userId, "export"),
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      complianceCategory: log.complianceCategory ?? "OTHER",
      reason: log.reason ?? null,
      requestId: log.requestId ?? null,
      // NIS2/DORA hash-chain fields
      previousLogHash: log.previousLogHash ?? null,
      eventHash: log.eventHash ?? null,
      // EU AI Act fields
      aiModelId: log.aiModelId ?? null,
      aiProviderName: log.aiProviderName ?? null,
      inputContextHash: log.inputContextHash ?? null,
      // HITL field pseudonymized
      hitlVerifiedBy: log.hitlVerifiedBy
        ? pseudonymizeUserId(log.hitlVerifiedBy, "export")
        : null,
      // GDPR: truncate IP, scrub PII fields from previousValue / newValue
      ipAddress: truncateIp(typeof storedIp === "string" ? storedIp : null),
      previousValue: scrubPiiFields(log.previousValue),
      newValue: scrubPiiFields(log.newValue),
    };
  });

  // --- Build canonical bundle ---
  const bundleId = `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const generatedAt = new Date().toISOString();

  const bundleContent = {
    bundleId,
    generatedAt,
    generatedBy: pseudonymizeUserId(session.userId, "export"),
    companyId,
    exportScope: categoryFilter ?? "ALL",
    chainIntegrity: {
      verified: chainBrokenAt === null && genesisEvents < rawLogs.length,
      brokenAt: chainBrokenAt,
      totalEvents: rawLogs.length,
      eventsWithChain: totalWithChain,
      verifiedChain: chainVerified,
      genesisEvents,
      integrityRate:
        totalWithChain > 0
          ? Math.round((chainVerified / totalWithChain) * 100)
          : null,
    },
    logs: sanitizedLogs,
  };

  // --- HMAC-SHA256 signature (NIS2/DORA tamper evidence) ---
  const canonicalJson = JSON.stringify(bundleContent);
  const signature = signBundle(canonicalJson);

  const signedBundle = {
    ...bundleContent,
    _meta: {
      format: "avra-forensic-bundle-v2",
      frameworks: ["NIS2", "DORA", "EU_AI_ACT", "ISO27001", "SOC2", "GDPR"],
      signatureAlgorithm: "HMAC-SHA256",
      signatureNote:
        "Verify with HMAC-SHA256 of the canonical JSON body (excluding _meta.signature field) using the deployment AUDIT_BUNDLE_SECRET.",
      signature,
    },
  };

  return NextResponse.json(signedBundle, {
    headers: {
      "Content-Disposition": `attachment; filename="avra-forensic-bundle-${Date.now()}.json"`,
      "Content-Type": "application/json",
      // Security: prevent caching of sensitive audit data
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}
