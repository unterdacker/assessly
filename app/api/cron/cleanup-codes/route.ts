import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logErrorReport } from "@/lib/logger";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Deny all requests when CRON_SECRET is not configured — fail closed, never open.
  if (!secret) return false;

  const bearer = request.headers.get("authorization");
  return bearer === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  try {
    const [pendingResult, securedResult, stalePendingResult] = await prisma.$transaction([
      prisma.vendor.updateMany({
        where: {
          isCodeActive: true,
          codeExpiresAt: { lt: now },
          isFirstLogin: true,
        },
        data: {
          accessCode: null,
          codeExpiresAt: null,
          isCodeActive: false,
          inviteSentAt: null,
          passwordHash: null,
        },
      }),
      prisma.vendor.updateMany({
        where: {
          isCodeActive: true,
          codeExpiresAt: { lt: now },
          isFirstLogin: false,
        },
        data: {
          accessCode: null,
          codeExpiresAt: null,
          isCodeActive: false,
        },
      }),
      prisma.vendor.updateMany({
        where: {
          isCodeActive: false,
          isFirstLogin: true,
          inviteSentAt: { not: null },
        },
        data: {
          inviteSentAt: null,
          passwordHash: null,
        },
      }),
    ]);

    const cleanedCount = pendingResult.count + securedResult.count + stalePendingResult.count;

    return NextResponse.json({
      ok: true,
      cleanedCount,
      cleanedAt: now.toISOString(),
    });
  } catch (error) {
    logErrorReport("cron.cleanup-codes", error);
    return NextResponse.json(
      { ok: false, error: "Failed to clean expired access codes." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
