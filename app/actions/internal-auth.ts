"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma, withDbRetry } from "@/lib/prisma";
import {
  createSessionForUser,
  clearAuthSessionCookie,
  getLocalizedLandingPath,
  setAuthSessionCookie,
} from "@/lib/auth/server";
import { AUTH_SESSION_COOKIE_NAME, hashSessionToken, verifySessionToken } from "@/lib/auth/token";
import { canAccessPath } from "@/lib/auth/permissions";
import { setMfaPendingCookie } from "@/lib/auth/mfa-pending";
import type { InternalSignInState } from "@/app/actions/internal-auth.types";
import { AuditLogger } from "@/lib/structured-logger";
import { logAuditEvent } from "@/lib/audit-log";
import { truncateIp } from "@/lib/audit-sanitize";
import { headers } from "next/headers";
import { isRateLimited, registerFailure, resetFailures, readClientIp } from "@/lib/rate-limit";

export async function authenticateInternalUser(
  _prevState: InternalSignInState,
  formData: FormData,
): Promise<InternalSignInState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const locale = String(formData.get("locale") || "de").trim() || "de";
  const ALLOWED_LOCALES = ["de", "en"] as const;
  const safeLocale = (ALLOWED_LOCALES as readonly string[]).includes(locale) ? locale : "de";
  const nextPath = String(formData.get("next") || "").trim();

  if (!email || !password) {
    return { error: "REQUIRED" };
  }

  const headerStore = await headers();
  const rawIp = readClientIp(headerStore);
  const sourceIp = truncateIp(rawIp);
  const rlKey = `ial:${rawIp}`;

  if (isRateLimited(rlKey)) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    AuditLogger.auth("rate_limit.exceeded", "failure", {
      sourceIp,
      message: "Internal login: per-IP rate limit exceeded",
      details: { key: rlKey },
    });
    return { error: "TOO_MANY_REQUESTS" };
  }

  const user = await withDbRetry(() =>
    prisma.user.findFirst({
      where: {
        email,
        isActive: true,
        role: { in: ["ADMIN", "AUDITOR", "VENDOR"] },
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        companyId: true,
        vendorId: true,
        mfaEnabled: true,
      },
    }),
  );

  if (!user) {
    registerFailure(rlKey, { maxFailures: 10, blockMs: 15 * 60 * 1000 });
    AuditLogger.auth("user.login_failed", "failure", {
      message: "Login failed: unknown email",
      sourceIp,
      details: { reason: "unknown_email" },
    });
    return { error: "INVALID_CREDENTIALS" };
  }

  // R2: Explicit null-password guard before bcrypt.compare
  // Handles users created via invite-link who haven't set their password yet
  if (!user.passwordHash) {
    registerFailure(rlKey, { maxFailures: 10, blockMs: 15 * 60 * 1000 });
    return { error: "ACCOUNT_NOT_ACTIVATED" };
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    registerFailure(rlKey, { maxFailures: 10, blockMs: 15 * 60 * 1000 });
    AuditLogger.auth("user.login_failed", "failure", {
      userId: user.id,
      role: user.role,
      sourceIp,
      message: "Login failed: wrong password",
      details: { reason: "wrong_password" },
    });
    // Persist to DB audit trail for compliance (LOGIN_FAILED was declared but never used)
    if (user.companyId) {
      await logAuditEvent(
        {
          companyId: user.companyId,
          userId: user.id,
          action: "LOGIN_FAILED",
          entityType: "User",
          entityId: user.id,
          newValue: { reason: "wrong_password" },
        },
        { captureHeaders: true },
      ).catch(() => { /* non-blocking */ });
    }
    return { error: "INVALID_CREDENTIALS" };
  }

  // If MFA is enrolled, gate the session behind a TOTP verification step.
  if (user.mfaEnabled) {
    await setMfaPendingCookie(user.id, safeLocale, nextPath);
    redirect(`/${safeLocale}/auth/mfa-verify`);
  }

  const { token, expiresAt } = await createSessionForUser({
    userId: user.id,
    role: user.role,
    companyId: user.companyId,
    vendorId: user.vendorId,
  });
  await setAuthSessionCookie(token, expiresAt);

  const safeNextPath = nextPath.startsWith("/") ? nextPath : "";
  const localeAwareTarget = safeNextPath ? `/${safeLocale}${safeNextPath}` : null;
  const target = localeAwareTarget && canAccessPath(user.role, safeNextPath)
    ? localeAwareTarget
    : getLocalizedLandingPath(user.role, safeLocale);

  resetFailures(rlKey);

  AuditLogger.auth("user.login", "success", {
    userId: user.id,
    role: user.role,
    sourceIp,
    message: `User ${user.id} logged in successfully`,
  });

  // Return the target to the client so it can perform a full-page navigation
  // (window.location.href) instead of a soft RSC redirect. This busts the
  // router cache and forces the root layout to re-evaluate the session.
  return { error: null, redirectTo: target };
}

export async function signOutAction(formData: FormData): Promise<never> {
  const ALLOWED_LOCALES_SIGN_OUT = ["de", "en"] as const;
  const rawLocale = String(formData.get("locale") || "en").trim();
  const safeLocale = (ALLOWED_LOCALES_SIGN_OUT as readonly string[]).includes(rawLocale) ? rawLocale : "en";

  // Revoke the session server-side so re-use of the cookie is impossible
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
      .catch(() => undefined);
  }

  AuditLogger.auth("user.logout", "success", {
    userId: logoutUserId,
    message: "User signed out",
  });

  await clearAuthSessionCookie();
  redirect(`/${safeLocale}/auth/sign-in`);
}