export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuditLogger, AuditCategory } from "@/lib/structured-logger";
import { logErrorReport } from "@/lib/logger";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const bearer = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  if (bearer.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(bearer), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const now = new Date();
    let totalDeleted = 0;

    while (true) {
      const rows = await prisma.auditLog.findMany({
        where: { retentionPriority: "LOW", retentionUntil: { lt: now } },
        select: { id: true },
        take: 500,
      });

      if (rows.length === 0) {
        break;
      }

      const ids = rows.map((r) => r.id);
      const result = await prisma.auditLog.deleteMany({
        where: {
          id: { in: ids },
          retentionPriority: "LOW",
          retentionUntil: { lt: now },
        },
      });
      totalDeleted += result.count;
    }

    AuditLogger.log({
      category: AuditCategory.SYSTEM_HEALTH,
      action: "AUDIT_LOG_PURGE",
      status: "success",
      message: `Purged ${totalDeleted} expired LOW-priority audit log rows.`,
      details: { deleted: totalDeleted },
    });

    return NextResponse.json({ deleted: totalDeleted });
  } catch (error) {
    logErrorReport("cron.audit-log-retention", error);
    return NextResponse.json(
      { ok: false, error: "Retention purge failed." },
      { status: 500 },
    );
  }
}
