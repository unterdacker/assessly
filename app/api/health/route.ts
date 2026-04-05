import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuditLogger, AuditCategory } from "@/lib/structured-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckResult = {
  status: "ok" | "error";
  detail?: string;
  latencyMs?: number;
};

/**
 * Health endpoint for container orchestration (Kubernetes readiness/liveness probes,
 * Docker HEALTHCHECK, load-balancer health checks).
 *
 * GET /api/health
 *
 * Returns 200 when all checks pass, 503 when any check fails.
 * No authentication required — this endpoint must be reachable by the orchestrator
 * before any user session is established.
 *
 * Checks performed:
 *   1. database        — lightweight SELECT 1 via Prisma
 *   2. auditLogIntegrity — verifies that the 5 most recent AuditLog rows carry an
 *                          eventHash (NIS2/DORA hash-chain tamper evidence).
 */
export async function GET() {
  const checks: Record<string, CheckResult> = {};

  // ── 1. Database connectivity ──────────────────────────────────────────────
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = {
      status: "error",
      detail: err instanceof Error ? err.message : "unreachable",
      latencyMs: Date.now() - dbStart,
    };
  }

  // ── 2. Audit log hash-chain integrity (NIS2/DORA Art. 9 spot-check) ──────
  try {
    const recentLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        eventHash: true,
      },
    });

    const missingHash = recentLogs.filter((l) => !l.eventHash).length;

    if (missingHash > 0) {
      checks.auditLogIntegrity = {
        status: "error",
        detail: `${missingHash} of the 5 most recent audit entries are missing their event hash — possible tampering or schema migration gap`,
      };
    } else {
      checks.auditLogIntegrity = {
        status: "ok",
        detail: `Spot-checked ${recentLogs.length} entries — event hashes present`,
      };
    }
  } catch (err) {
    checks.auditLogIntegrity = {
      status: "error",
      detail: err instanceof Error ? err.message : "unknown",
    };
  }

  const healthy = Object.values(checks).every((c) => c.status === "ok");

  AuditLogger.log({
    category: AuditCategory.SYSTEM_HEALTH,
    action: "system.health_check",
    status: healthy ? "success" : "failure",
    responseCode: healthy ? 200 : 503,
    details: checks,
    message: `Health check: ${healthy ? "healthy" : "degraded"}`,
  });

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
