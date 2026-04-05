import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthSessionFromRequest } from "@/lib/auth/server";
import { computeEventHash, pseudonymizeUserId, scrubPiiFields, truncateIp } from "@/lib/audit-sanitize";
import { AuditLogger } from "@/lib/structured-logger";

const REDACTED_FOR_PRIVACY = "[REDACTED_FOR_PRIVACY]";

type Params = {
  params: Promise<{ id: string }>;
};

function parseMetadata(metadata: unknown): Record<string, unknown> | null {
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;
}

export async function GET(request: NextRequest, { params }: Params) {
  const session = await getAuthSessionFromRequest(request);
  if (!session || (session.role !== "ADMIN" && session.role !== "AUDITOR")) {
    AuditLogger.accessControl("api.audit_logs.details.forbidden", "failure", {
      role: session?.role ?? null,
      userId: session?.userId ?? null,
      sourceIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      message: "Forbidden audit details access attempt",
      responseCode: 403,
      details: { pathname: request.nextUrl.pathname, method: request.method },
    });
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const companyId = session.companyId;
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "No company context." }, { status: 400 });
  }

  const { id } = await params;
  const verifyOnly = request.nextUrl.searchParams.get("verify") === "1";

  const row = await prisma.auditLog.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      companyId: true,
      userId: true,
      actorId: true,
      action: true,
      entityType: true,
      entityId: true,
      timestamp: true,
      createdAt: true,
      metadata: true,
      requestId: true,
      previousLogHash: true,
      eventHash: true,
      reason: true,
      complianceCategory: true,
      aiModelId: true,
      aiProviderName: true,
      inputContextHash: true,
      hitlVerifiedBy: true,
      previousValue: true,
      newValue: true,
    },
  });

  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const expectedHash = computeEventHash({
    companyId: row.companyId,
    userId: row.userId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    timestamp: row.timestamp.toISOString(),
    previousLogHash: row.previousLogHash,
  });

  const hashMatches = Boolean(row.eventHash) && row.eventHash === expectedHash;
  const immediatePrevious = await prisma.auditLog.findFirst({
    where: {
      companyId,
      OR: [
        { createdAt: { lt: row.createdAt } },
        {
          AND: [
            { createdAt: row.createdAt },
            { id: { lt: row.id } },
          ],
        },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, eventHash: true },
  });

  const previousLinkMatches =
    row.previousLogHash === null
      ? immediatePrevious === null
      : immediatePrevious?.eventHash === row.previousLogHash;

  const integrity = {
    status: hashMatches && previousLinkMatches ? "VALID" : "INVALID",
    hashMatches,
    previousLinkMatches,
    expectedHash,
    computedAt: new Date().toISOString(),
  };

  if (verifyOnly) {
    return NextResponse.json({ ok: true, integrity });
  }

  const metadata = parseMetadata(row.metadata);
  const forensics = parseMetadata(metadata?.forensics);
  const rawIp =
    (forensics && typeof forensics.ipAddress === "string" ? forensics.ipAddress : null) ??
    (metadata && typeof metadata.ipAddress === "string" ? metadata.ipAddress : null);
  const rawUserAgent =
    (forensics && typeof forensics.userAgent === "string" ? forensics.userAgent : null) ??
    (metadata && typeof metadata.userAgent === "string" ? metadata.userAgent : null);

  const traceId =
    row.requestId ??
    (metadata && typeof metadata.traceId === "string" ? metadata.traceId : null) ??
    null;

  const relatedRows = traceId
    ? await prisma.auditLog.findMany({
        where: {
          companyId,
          id: { not: row.id },
          ...(row.requestId ? { requestId: traceId } : {}),
        },
        orderBy: [{ createdAt: "desc" }],
        take: row.requestId ? 8 : 200,
        select: {
          id: true,
          createdAt: true,
          action: true,
          entityType: true,
          entityId: true,
          requestId: true,
          eventHash: true,
          metadata: true,
        },
      })
    : [];

  const normalizedRelatedRows = relatedRows
    .filter((related) => {
      if (row.requestId) return true;
      const relatedMetadata = parseMetadata(related.metadata);
      return relatedMetadata?.traceId === traceId;
    })
    .slice(0, 8);

  const isAuditor = session.role === "AUDITOR";

  const responsePayload = {
    ok: true,
    integrity,
    traceId,
    forensic: {
      ipAddress: rawIp ? truncateIp(rawIp) : null,
      userAgent: isAuditor && rawUserAgent ? REDACTED_FOR_PRIVACY : rawUserAgent,
    },
    privacy: {
      legalBasisKey: "gdprArt5Minimization",
    },
    relatedEvents: normalizedRelatedRows.map((related) => ({
      id: related.id,
      timestamp: related.createdAt.toISOString(),
      action: related.action,
      entity: `${related.entityType}/${related.entityId}`,
      requestId: isAuditor ? REDACTED_FOR_PRIVACY : (related.requestId ?? traceId),
      eventHash: related.eventHash,
    })),
    // Return normalized row for detail rendering consistency.
    entry: {
      id: row.id,
      timestamp: row.createdAt.toISOString(),
      userId: isAuditor ? pseudonymizeUserId(row.actorId, "export") : row.actorId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      previousValue: isAuditor ? scrubPiiFields(row.previousValue) : row.previousValue,
      newValue: isAuditor ? scrubPiiFields(row.newValue) : row.newValue,
      requestId: isAuditor ? REDACTED_FOR_PRIVACY : row.requestId,
      reason: isAuditor ? REDACTED_FOR_PRIVACY : row.reason,
      previousLogHash: row.previousLogHash,
      eventHash: row.eventHash,
      complianceCategory: row.complianceCategory,
      aiModelId: row.aiModelId,
      aiProviderName: row.aiProviderName,
      inputContextHash: row.inputContextHash,
      hitlVerifiedBy: isAuditor && row.hitlVerifiedBy ? REDACTED_FOR_PRIVACY : row.hitlVerifiedBy,
      metadata: isAuditor ? scrubPiiFields(metadata) : metadata,
    },
  };

  return NextResponse.json(responsePayload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
