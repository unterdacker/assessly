import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_SESSION_COOKIE_NAME, hashSessionToken, verifySessionToken } from "@/lib/auth/token";
import { prisma } from "@/lib/prisma";
import { requirePremiumPlan } from "@/lib/enterprise-bridge";
import { checkActionRateLimit } from "@/lib/action-rate-limit";
import { AuditLogger } from "@/lib/structured-logger";
import { generateAnalyticsPdf } from "@/modules/analytics/services/analytics-pdf";
import { queryCompletionRate, queryTimeToCompletion, queryFeatureAdoption, queryVendorResponseLeaderboard } from "@/modules/analytics/lib/queries";

const logger = new AuditLogger();

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value ?? null;

    if (!token) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const claims = await verifySessionToken(token).catch(() => null);
    if (!claims) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const tokenHash = await hashSessionToken(token);
    const persistedSession = await prisma.authSession.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        role: true,
        companyId: true,
        vendorId: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            role: true,
            isActive: true,
            companyId: true,
            vendorId: true,
          },
        },
      },
    });

    if (!persistedSession || persistedSession.revokedAt || persistedSession.expiresAt <= new Date()) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!persistedSession.user.isActive) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (
      persistedSession.id !== claims.sid ||
      persistedSession.userId !== claims.uid ||
      persistedSession.user.role !== claims.role ||
      persistedSession.user.companyId !== claims.cid ||
      persistedSession.user.vendorId !== claims.vid
    ) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const companyId = persistedSession.companyId ?? "";
    if (!companyId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!["ADMIN", "RISK_REVIEWER", "AUDITOR"].includes(persistedSession.role)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await requirePremiumPlan(companyId);
    await checkActionRateLimit(`analytics-pdf:${companyId}`, { maxAttempts: 5, windowMs: 3600000 });

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    const companyName = company?.name ?? companyId;

    const [completionRate, timeToCompletion, featureAdoption, vendorLeaderboard] = await Promise.all([
      queryCompletionRate(companyId, 30),
      queryTimeToCompletion(companyId, 365),
      queryFeatureAdoption(companyId),
      queryVendorResponseLeaderboard(companyId, "asc"),
    ]);

    const pdfBuffer = await generateAnalyticsPdf({
      companyName,
      completionRate,
      timeToCompletion,
      featureAdoption,
      vendorLeaderboard,
      generatedAt: new Date(),
    });

    logger.dataOp("analytics.pdf_exported", "success", {
      userId: persistedSession.userId,
      entityType: "Analytics",
      entityId: companyId,
      details: {},
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="analytics-${companyId}-${new Date().toISOString().split("T")[0]}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "PremiumGateError") {
      return new NextResponse("Premium plan required", { status: 403 });
    }
    if (err instanceof Error && err.name === "ActionRateLimitError") {
      return new NextResponse("Rate limit exceeded", { status: 429 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
