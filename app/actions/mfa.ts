"use server";

import { createHash } from "crypto";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  requireAuthSession,
  createSessionForUser,
  setAuthSessionCookie,
  getLocalizedLandingPath,
  requireUserRole,
} from "@/lib/auth/server";
import { shouldSecureCookie } from "@/lib/auth/token";
import { getMfaPendingClaims, clearMfaPendingCookie } from "@/lib/auth/mfa-pending";
import {
  getMfaSetupPendingClaims,
  clearMfaSetupPendingCookie,
} from "@/lib/auth/mfa-setup-pending";
import {
  getVendorMfaPendingClaims,
  clearVendorMfaPendingCookie,
} from "@/lib/auth/vendor-mfa-pending";
import {
  generateTotpSecret,
  generateTotpUri,
  encryptMfaSecret,
  verifyTotpToken,
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode,
} from "@/lib/mfa";
import { ADMIN_ONLY_ROLES, canAccessPath } from "@/lib/auth/permissions";
import { AuditLogger } from "@/lib/structured-logger";
import { truncateIp } from "@/lib/audit-sanitize";
import {
  isRateLimited,
  registerFailure,
  resetFailures,
  readClientIp,
} from "@/lib/rate-limit";

const RECOVERY_CODE_MAX_FAILURES = 3;
const RECOVERY_CODE_BLOCK_MS = 15 * 60 * 1000;

function resolveMfaMode(rawMode: FormDataEntryValue | null): "totp" | "recovery" {
  return String(rawMode || "totp").trim().toLowerCase() === "recovery"
    ? "recovery"
    : "totp";
}

function getRecoveryRateLimitKey(userId: string): string {
  return `rcv:${userId}`;
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getSafeNextPath(
  role: "ADMIN" | "RISK_REVIEWER" | "AUDITOR" | "VENDOR",
  nextPath: string,
  locale: string,
): string {
  return (
    nextPath.startsWith("/") &&
    !nextPath.startsWith("//") &&
    nextPath.length > 1 &&
    canAccessPath(role, nextPath)
  )
    ? nextPath
    : getLocalizedLandingPath(role, locale);
}

async function canAttemptRecoveryCode(user: {
  id: string;
  role: "ADMIN" | "RISK_REVIEWER" | "AUDITOR" | "VENDOR";
}): Promise<boolean> {
  const headerStore = await headers();
  const sourceIp = truncateIp(readClientIp(headerStore));
  const bucket = getRecoveryRateLimitKey(user.id);

  if (isRateLimited(bucket)) {
    AuditLogger.auth("mfa.recovery_code.rate_limited", "failure", {
      userId: user.id,
      role: user.role,
      sourceIp,
      message: "Recovery code verification blocked by rate limiter",
      details: { bucket },
    });
    return false;
  }
  return true;
}

/**
 * Generates a new TOTP secret for the current user and persists it (encrypted)
 * in the database. MFA is NOT yet active — the user must call verifyAndEnableMfa()
 * with their first valid token to activate it.
 *
 * Returns the otpauth:// URI (for QR code rendering) and the plain secret (for
 * manual entry). Both values are only ever shown once on the client.
 */
export async function generateMfaSecret(): Promise<{
  uri: string;
  secret: string;
}> {
  const session = await requireAuthSession();

  const secret = generateTotpSecret();
  const encryptedSecret = encryptMfaSecret(secret);

  await prisma.user.update({
    where: { id: session.userId },
    data: { mfaSecret: encryptedSecret },
  });

  const email = session.email ?? session.userId;
  const uri = generateTotpUri(email, secret);

  return { uri, secret };
}

export async function verifyAndEnableMfa(
  token: string,
): Promise<{ success: true; recoveryCodes: string[] }> {
  const session = await requireAuthSession();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { mfaSecret: true, role: true },
  });

  if (!user.mfaSecret) {
    throw new Error("NO_MFA_SECRET");
  }

  if (!verifyTotpToken(token, user.mfaSecret)) {
    AuditLogger.auth("mfa.verify_failed", "failure", {
      userId: session.userId,
      role: user.role,
      message: "MFA enrollment token verification failed",
    });
    throw new Error("INVALID_MFA_TOKEN");
  }

  const { plaintext, hashed } = await generateRecoveryCodes();

  const result = await prisma.user.updateMany({
    where: { id: session.userId, mfaEnabled: false },
    data: {
      mfaSecret: user.mfaSecret,
      mfaEnabled: true,
      mfaRecoveryCodes: hashed,
    },
  });

  if (result.count === 0) {
    throw new Error("ALREADY_ENROLLED");
  }

  AuditLogger.auth("mfa.enabled", "success", {
    userId: session.userId,
    role: user.role,
    message: "User enabled MFA",
    details: { recoveryCodeCount: plaintext.length },
  });

  revalidatePath("/settings");
  return { success: true, recoveryCodes: plaintext };
}

export async function disableMfa(token: string): Promise<{ success: true }> {
  const session = await requireAuthSession();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { mfaSecret: true, mfaEnabled: true, role: true },
  });

  if (!user.mfaEnabled || !user.mfaSecret) {
    throw new Error("MFA_NOT_ENABLED");
  }

  if (!verifyTotpToken(token, user.mfaSecret)) {
    AuditLogger.auth("MFA_FAILED_ATTEMPT", "failure", {
      userId: session.userId,
      role: user.role,
      message: "MFA disable failed due to invalid token",
      details: { context: "disable-mfa" },
    });
    throw new Error("INVALID_MFA_TOKEN");
  }

  const result = await prisma.user.updateMany({
    where: { id: session.userId, mfaEnabled: true },
    data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: [] },
  });

  if (result.count === 0) {
    throw new Error("MFA_NOT_ENABLED");
  }

  AuditLogger.auth("mfa.disabled", "success", {
    userId: session.userId,
    role: user.role,
    message: "User disabled MFA",
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function regenerateRecoveryCodes(
  token: string,
): Promise<{ success: true; recoveryCodes: string[] }> {
  const session = await requireAuthSession();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { mfaSecret: true, mfaEnabled: true, role: true },
  });

  if (!user?.mfaEnabled || !user.mfaSecret) {
    throw new Error("MFA_NOT_ENABLED");
  }

  if (!verifyTotpToken(token, user.mfaSecret)) {
    AuditLogger.auth("mfa.recovery_codes_regenerate_failed", "failure", {
      userId: session.userId,
      role: user.role,
      message: "Recovery code regeneration failed due to invalid MFA token",
    });
    throw new Error("INVALID_MFA_TOKEN");
  }

  const { plaintext, hashed } = await generateRecoveryCodes();

  await prisma.user.update({
    where: { id: session.userId },
    data: { mfaRecoveryCodes: hashed },
  });

  AuditLogger.auth("MFA_RECOVERY_CODES_REGENERATED", "success", {
    userId: session.userId,
    role: user.role,
    message: "Recovery codes regenerated",
    details: { count: plaintext.length },
  });

  revalidatePath("/settings");
  return { success: true, recoveryCodes: plaintext };
}

export async function generateMfaSecretForSetup(): Promise<{ uri: string; secret: string }> {
  const claims = await getMfaSetupPendingClaims();
  if (!claims) throw new Error("SETUP_SESSION_EXPIRED");

  const user = await prisma.user.findUnique({
    where: { id: claims.uid },
    select: { email: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  const secret = generateTotpSecret();
  const uri = generateTotpUri(user.email ?? claims.uid, secret);
  const encryptedSecret = encryptMfaSecret(secret);
  await prisma.user.update({
    where: { id: claims.uid },
    data: { mfaSecret: encryptedSecret },
  });

  return { uri, secret };
}

export type MfaVerifyState = { error: string | null };
export type VendorMfaVerifyState = { error: string | null };

export async function completeForcedMfaSetup(
  _prev: MfaVerifyState | null,
  formData: FormData,
): Promise<MfaVerifyState & { recoveryCodes?: string[] }> {
  const claims = await getMfaSetupPendingClaims();
  if (!claims) return { error: "SETUP_SESSION_EXPIRED" };

  const token = String(formData.get("token") || "").trim();

  const user = await prisma.user.findUnique({
    where: { id: claims.uid, isActive: true },
    select: {
      id: true,
      mfaSecret: true,
      mfaEnabled: true,
      role: true,
      companyId: true,
      vendorId: true,
    },
  });
  if (!user) return { error: "ACCOUNT_DISABLED" };
  if (!user.mfaSecret) return { error: "NO_MFA_SECRET" };

  if (!verifyTotpToken(token, user.mfaSecret)) {
    AuditLogger.auth("mfa.forced_setup.verify_failed", "failure", {
      userId: user.id,
      role: user.role,
      message: "Forced MFA setup token verification failed",
    });
    return { error: "INVALID_MFA_TOKEN" };
  }

  const { plaintext, hashed } = await generateRecoveryCodes();

  const result = await prisma.user.updateMany({
    where: { id: claims.uid, mfaEnabled: false },
    data: { mfaEnabled: true, mfaRecoveryCodes: hashed },
  });
  if (result.count === 0) return { error: "ALREADY_ENROLLED" };

  const { token: sessionToken, expiresAt } = await createSessionForUser({
    userId: claims.uid,
    role: user.role,
    companyId: user.companyId,
    vendorId: user.vendorId,
  });
  await setAuthSessionCookie(sessionToken, expiresAt);
  await clearMfaSetupPendingCookie();

  AuditLogger.auth("mfa.enabled", "success", {
    userId: user.id,
    role: user.role,
    message: "Forced MFA setup completed",
    details: { source: "forced-setup", recoveryCodeCount: plaintext.length },
  });

  return { error: null, recoveryCodes: plaintext };
}

export async function verifyMfaAndAuthenticate(
  _prev: MfaVerifyState,
  formData: FormData,
): Promise<MfaVerifyState> {
  const token = String(formData.get("token") || "").trim();
  const mode = resolveMfaMode(formData.get("mode"));

  const claims = await getMfaPendingClaims();
  if (!claims) {
    return { error: "MFA_SESSION_EXPIRED" };
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.uid, isActive: true },
    select: {
      id: true,
      role: true,
      companyId: true,
      vendorId: true,
      mfaSecret: true,
      mfaEnabled: true,
      mfaRecoveryCodes: true,
    },
  });

  if (!user) {
    await clearMfaPendingCookie();
    return { error: "ACCOUNT_DISABLED" };
  }

  if (!user.mfaEnabled || !user.mfaSecret) {
    await clearMfaPendingCookie();
    return { error: "MFA_NOT_CONFIGURED" };
  }

  if (mode === "recovery") {
    if (!(await canAttemptRecoveryCode(user))) {
      return { error: "RECOVERY_CODE_INVALID" };
    }

    const currentCodes = user.mfaRecoveryCodes;
    const matchIndex = await verifyAndConsumeRecoveryCode(token, currentCodes);
    const bucket = getRecoveryRateLimitKey(user.id);

    if (matchIndex < 0) {
      registerFailure(bucket, {
        maxFailures: RECOVERY_CODE_MAX_FAILURES,
        blockMs: RECOVERY_CODE_BLOCK_MS,
      });
      return { error: "RECOVERY_CODE_INVALID" };
    }

    const remaining = currentCodes.filter((_, index) => index !== matchIndex);
    const consumed = await prisma.user.updateMany({
      where: { id: user.id, mfaRecoveryCodes: { equals: currentCodes } },
      data: { mfaRecoveryCodes: remaining },
    });

    if (consumed.count === 0) {
      registerFailure(bucket, {
        maxFailures: RECOVERY_CODE_MAX_FAILURES,
        blockMs: RECOVERY_CODE_BLOCK_MS,
      });
      return { error: "RECOVERY_CODE_INVALID" };
    }

    resetFailures(bucket);
    AuditLogger.auth("MFA_RECOVERY_CODE_USED", "success", {
      userId: user.id,
      role: user.role,
      message: "Recovery code accepted during login",
      details: { remainingCount: remaining.length },
    });
  } else if (!verifyTotpToken(token, user.mfaSecret)) {
    AuditLogger.auth("mfa.verify_failed", "failure", {
      userId: user.id,
      role: user.role,
      message: "MFA login token verification failed",
    });
    return { error: "INVALID_MFA_TOKEN" };
  }

  const { token: sessionToken, expiresAt } = await createSessionForUser({
    userId: user.id,
    role: user.role,
    companyId: user.companyId,
    vendorId: user.vendorId,
  });
  await setAuthSessionCookie(sessionToken, expiresAt);
  await clearMfaPendingCookie();

  const safeNext = getSafeNextPath(user.role, claims.next, claims.locale);

  redirect(safeNext);
}

export async function verifyVendorMfaAndAuthenticate(
  _prev: VendorMfaVerifyState,
  formData: FormData,
): Promise<VendorMfaVerifyState> {
  const token = String(formData.get("token") || "").trim();
  const mode = resolveMfaMode(formData.get("mode"));

  const claims = await getVendorMfaPendingClaims();
  if (!claims) {
    return { error: "MFA_SESSION_EXPIRED" };
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.uid, isActive: true },
    select: {
      id: true,
      role: true,
      companyId: true,
      vendorId: true,
      mfaSecret: true,
      mfaEnabled: true,
      mfaRecoveryCodes: true,
    },
  });

  if (!user) {
    await clearVendorMfaPendingCookie();
    return { error: "ACCOUNT_DISABLED" };
  }

  if (!user.mfaEnabled || !user.mfaSecret) {
    await clearVendorMfaPendingCookie();
    return { error: "MFA_NOT_CONFIGURED" };
  }

  if (mode === "recovery") {
    if (!(await canAttemptRecoveryCode(user))) {
      return { error: "RECOVERY_CODE_INVALID" };
    }

    const currentCodes = user.mfaRecoveryCodes;
    const matchIndex = await verifyAndConsumeRecoveryCode(token, currentCodes);
    const bucket = getRecoveryRateLimitKey(user.id);

    if (matchIndex < 0) {
      registerFailure(bucket, {
        maxFailures: RECOVERY_CODE_MAX_FAILURES,
        blockMs: RECOVERY_CODE_BLOCK_MS,
      });
      return { error: "RECOVERY_CODE_INVALID" };
    }

    const remaining = currentCodes.filter((_, index) => index !== matchIndex);
    const consumed = await prisma.user.updateMany({
      where: { id: user.id, mfaRecoveryCodes: { equals: currentCodes } },
      data: { mfaRecoveryCodes: remaining },
    });

    if (consumed.count === 0) {
      registerFailure(bucket, {
        maxFailures: RECOVERY_CODE_MAX_FAILURES,
        blockMs: RECOVERY_CODE_BLOCK_MS,
      });
      return { error: "RECOVERY_CODE_INVALID" };
    }

    resetFailures(bucket);
    AuditLogger.auth("MFA_RECOVERY_CODE_USED", "success", {
      userId: user.id,
      role: user.role,
      message: "Vendor used recovery code during login",
      details: { remainingCount: remaining.length },
    });
  } else if (!verifyTotpToken(token, user.mfaSecret)) {
    AuditLogger.auth("mfa.vendor_verify_failed", "failure", {
      userId: user.id,
      role: user.role,
      message: "Vendor MFA token verification failed",
    });
    return { error: "INVALID_MFA_TOKEN" };
  }

  if (!user.vendorId) {
    await clearVendorMfaPendingCookie();
    return { error: "ACCOUNT_DISABLED" };
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: user.vendorId },
    select: { id: true, codeExpiresAt: true },
  });

  if (!vendor || !vendor.codeExpiresAt || vendor.codeExpiresAt <= new Date()) {
    await clearVendorMfaPendingCookie();
    return { error: "ACCOUNT_DISABLED" };
  }

  const now = new Date();
  const inviteTokenPlain = crypto.randomUUID().replace(/-/g, "");
  const inviteToken = hashInviteToken(inviteTokenPlain);
  const inviteTokenExpires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14);

  await prisma.vendor.update({
    where: { id: vendor.id },
    data: {
      inviteToken,
      inviteTokenExpires,
    },
  });

  const tokenMaxAgeSeconds = Math.max(
    0,
    Math.floor((inviteTokenExpires.getTime() - Date.now()) / 1000),
  );
  const codeMaxAgeSeconds = Math.max(
    0,
    Math.floor((vendor.codeExpiresAt.getTime() - Date.now()) / 1000),
  );
  const isSecure = shouldSecureCookie();
  const cookieStore = await cookies();

  cookieStore.set("venshield-vendor-id", vendor.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: tokenMaxAgeSeconds,
  });

  cookieStore.set("venshield-vendor-token", inviteTokenPlain, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: tokenMaxAgeSeconds,
  });

  cookieStore.set("venshield-vendor-code-exp", vendor.codeExpiresAt.toISOString(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: codeMaxAgeSeconds,
  });

  const { token: sessionToken, expiresAt } = await createSessionForUser({
    userId: user.id,
    role: user.role,
    companyId: user.companyId,
    vendorId: user.vendorId,
  });
  await setAuthSessionCookie(sessionToken, expiresAt);

  await clearVendorMfaPendingCookie();

  AuditLogger.auth("MFA_VENDOR_LOGIN_SUCCESS", "success", {
    userId: user.id,
    role: user.role,
    message: "Vendor authenticated with MFA",
  });

  redirect(`/${claims.locale}/external/assessment/${inviteTokenPlain}`);
}

export async function setUserMfaEnforced(
  targetUserId: string,
  enforced: boolean,
): Promise<{ success: true }> {
  const session = await requireUserRole(ADMIN_ONLY_ROLES);

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, companyId: true, role: true },
  });

  if (!targetUser || !session.companyId || targetUser.companyId !== session.companyId) {
    throw new Error("FORBIDDEN");
  }

  if (ADMIN_ONLY_ROLES.includes(targetUser.role)) {
    throw new Error("CANNOT_ENFORCE_ADMIN");
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: { mfaEnforced: enforced },
  });

  AuditLogger.auth("MFA_ENFORCEMENT_CHANGED", "success", {
    userId: session.userId,
    role: session.role,
    entityId: targetUserId,
    entityType: "User",
    message: "Per-user MFA enforcement updated",
    details: { enforced },
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function setOrgMfaRequired(required: boolean): Promise<{ success: true }> {
  const session = await requireUserRole(ADMIN_ONLY_ROLES);

  if (!session.companyId) {
    throw new Error("FORBIDDEN");
  }

  const admin = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { mfaEnabled: true },
  });

  if (required && !admin?.mfaEnabled) {
    throw new Error("ADMIN_MFA_NOT_ENROLLED");
  }

  await prisma.company.update({
    where: { id: session.companyId },
    data: { mfaRequired: required },
  });

  AuditLogger.auth("ORG_MFA_POLICY_CHANGED", "success", {
    userId: session.userId,
    role: session.role,
    entityId: session.companyId,
    entityType: "Company",
    message: "Organization MFA policy updated",
    details: { mfaRequired: required },
  });

  revalidatePath("/settings");
  return { success: true };
}
