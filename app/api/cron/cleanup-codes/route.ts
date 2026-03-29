import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  const bearer = request.headers.get("authorization");
  return bearer === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  try {
    const result = await (prisma.vendor as any).updateMany({
      where: {
        isCodeActive: true,
        codeExpiresAt: { lt: now },
      },
      data: {
        accessCode: null,
        codeExpiresAt: null,
        isCodeActive: false,
      },
    });

    return NextResponse.json({
      ok: true,
      cleanedCount: result.count,
      cleanedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Access code cleanup failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to clean expired access codes." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
