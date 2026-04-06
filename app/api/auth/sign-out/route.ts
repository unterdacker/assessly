import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { clearAuthSessionCookie } from "@/lib/auth/server";
import { AUTH_SESSION_COOKIE_NAME, hashSessionToken, verifySessionToken } from "@/lib/auth/token";
import { AuditLogger } from "@/lib/structured-logger";
import { logErrorReport } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { locale?: string };
    const locale = typeof body.locale === "string" ? body.locale : "en";

    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value ?? null;
    let logoutUserId: string | null = null;
    if (token) {
      const claims = await verifySessionToken(token).catch(() => null);
      logoutUserId = claims?.uid ?? null;
      const tokenHash = await hashSessionToken(token);
      await prisma.authSession
        .updateMany({
          where: { tokenHash, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch((dbErr) => {
          logErrorReport("api.auth.sign-out.revoke", dbErr);
        });
    }

    AuditLogger.auth("user.logout", "success", {
      userId: logoutUserId,
      message: "User signed out",
    });

    await clearAuthSessionCookie();

    return NextResponse.json({ ok: true, redirectTo: `/${locale}/auth/sign-in` });
  } catch (err) {
    logErrorReport("api.auth.sign-out", err);
    return NextResponse.json(
      { ok: false, error: "Sign-out failed." },
      { status: 500 },
    );
  }
}
