"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import { requireAuthSession, createSessionForUser, setAuthSessionCookie, getLocalizedLandingPath } from "@/lib/auth/server";
import { getMfaPendingClaims, clearMfaPendingCookie } from "@/lib/auth/mfa-pending";
import { generateTotpSecret, generateTotpUri, encryptMfaSecret, verifyTotpToken } from "@/lib/mfa";
import { canAccessPath } from "@/lib/auth/permissions";

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

/**
 * Validates the user's first TOTP token and marks MFA as enabled.
 * Must be called after generateMfaSecret() while the user is authenticated.
 */
export async function verifyAndEnableMfa(token: string): Promise<{ success: true }> {
  const session = await requireAuthSession();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { mfaSecret: true, mfaEnabled: true, companyId: true },
  });

  if (!user.mfaSecret) {
    throw new Error("NO_MFA_SECRET");
  }

  if (!verifyTotpToken(token, user.mfaSecret)) {
    if (user.companyId) {
      await logAuditEvent(
        {
          companyId: user.companyId,
          userId: session.userId,
          action: "MFA_FAILED_ATTEMPT",
          entityType: "User",
          entityId: session.userId,
          newValue: { context: "enrollment" },
        },
        { captureHeaders: true },
      );
    }
    throw new Error("INVALID_MFA_TOKEN");
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { mfaEnabled: true },
  });

  if (user.companyId) {
    await logAuditEvent(
      {
        companyId: user.companyId,
        userId: session.userId,
        action: "MFA_ENABLED",
        entityType: "User",
        entityId: session.userId,
        newValue: { mfaEnabled: true },
      },
      { captureHeaders: true },
    );
  }

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Disables MFA after the user confirms with a valid TOTP token.
 * Clears both mfaEnabled and mfaSecret.
 */
export async function disableMfa(token: string): Promise<{ success: true }> {
  const session = await requireAuthSession();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { mfaSecret: true, mfaEnabled: true, companyId: true },
  });

  if (!user.mfaEnabled || !user.mfaSecret) {
    throw new Error("MFA_NOT_ENABLED");
  }

  if (!verifyTotpToken(token, user.mfaSecret)) {
    throw new Error("INVALID_MFA_TOKEN");
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { mfaEnabled: false, mfaSecret: null },
  });

  if (user.companyId) {
    await logAuditEvent(
      {
        companyId: user.companyId,
        userId: session.userId,
        action: "MFA_DISABLED",
        entityType: "User",
        entityId: session.userId,
        newValue: { mfaEnabled: false },
      },
      { captureHeaders: true },
    );
  }

  revalidatePath("/settings");
  return { success: true };
}

export type MfaVerifyState = { error: string | null };

/**
 * Called from the /auth/mfa-verify page.
 *
 * Reads the short-lived MFA pending cookie established after password auth,
 * verifies the TOTP token, and — if valid — creates the full auth session and
 * redirects. On failure, returns an error code for the form to display.
 */
export async function verifyMfaAndAuthenticate(
  _prev: MfaVerifyState,
  formData: FormData,
): Promise<MfaVerifyState> {
  const token = String(formData.get("token") || "").trim();

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
    },
  });

  if (!user?.mfaEnabled || !user.mfaSecret) {
    await clearMfaPendingCookie();
    return { error: "MFA_NOT_CONFIGURED" };
  }

  if (!verifyTotpToken(token, user.mfaSecret)) {
    if (user.companyId) {
      await logAuditEvent(
        {
          companyId: user.companyId,
          userId: user.id,
          action: "MFA_FAILED_ATTEMPT",
          entityType: "User",
          entityId: user.id,
          newValue: { context: "login" },
        },
        { captureHeaders: true },
      );
    }
    return { error: "INVALID_MFA_TOKEN" };
  }

  // Token valid — promote to full session.
  const { token: sessionToken, expiresAt } = await createSessionForUser({
    userId: user.id,
    role: user.role,
    companyId: user.companyId,
    vendorId: user.vendorId,
  });
  await setAuthSessionCookie(sessionToken, expiresAt);
  await clearMfaPendingCookie();

  const safeNext =
    claims.next.startsWith("/") && claims.next.length > 1 &&
    canAccessPath(user.role, claims.next)
      ? claims.next
      : getLocalizedLandingPath(user.role, claims.locale);

  redirect(safeNext);
}
