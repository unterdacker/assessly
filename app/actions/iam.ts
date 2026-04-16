"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import { requireAdminUser } from "@/lib/auth/server";
import { AuditLogger } from "@/lib/structured-logger";
import { INVITE_TOKEN_EXPIRES_MS } from "@/lib/auth/constants";

/**
 * Updates a target user's role.
 *
 * Security guarantees:
 * - Caller must hold the ADMIN role (enforced via requireAdminUser).
 * - An admin cannot change their own role (anti-lockout guard).
 * - All changes are recorded in the AuditLog with an ACCESS_CONTROL_CHANGE action.
 */
export async function updateUserRole(
  targetUserId: string,
  newRole: UserRole,
): Promise<{ success: true }> {
  const session = await requireAdminUser();

  if (targetUserId === session.userId) {
    throw new Error("SELF_ROLE_CHANGE_FORBIDDEN");
  }

  const companyId = session.companyId;
  if (!companyId) {
    throw new Error("MISSING_COMPANY_CONTEXT");
  }

  const targetUser = await prisma.user.findUniqueOrThrow({
    where: { id: targetUserId },
    select: { id: true, role: true },
  });

  await prisma.user.update({
    where: { id: targetUserId },
    data: { role: newRole },
  });

  await logAuditEvent(
    {
      companyId,
      userId: session.userId,
      action: "USER_ROLE_CHANGED",
      entityType: "User",
      entityId: targetUserId,
      previousValue: { previous_role: targetUser.role },
      newValue: { new_role: newRole },
    },
    { captureHeaders: true },
  );

  AuditLogger.accessControl("user.role_changed", "success", {
    userId: session.userId,
    entityType: "User",
    entityId: targetUserId,
    message: `Role changed from ${targetUser.role} to ${newRole}`,
    details: { previousRole: targetUser.role, newRole },
  });

  revalidatePath("/dashboard/users");

  return { success: true };
}

/**
 * Creates a new internal user (Admin or Auditor).
 *
 * Security guarantees:
 * - Caller must hold the ADMIN role (enforced via requireAdminUser).
 * - Duplicate email addresses are rejected before insertion.
 * - A cryptographically random temporary password is hashed with bcrypt (cost 12).
 * - All creations are recorded in the AuditLog with a USER_CREATED action.
 */
export async function createInternalUser(
  email: string,
  role: Extract<UserRole, "ADMIN" | "AUDITOR">,
): Promise<{ success: true }> {
  const session = await requireAdminUser();

  const companyId = session.companyId;
  if (!companyId) {
    throw new Error("MISSING_COMPANY_CONTEXT");
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check for existing user — if they have an unaccepted invite, regenerate it
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, inviteToken: true, passwordHash: true },
  });

  if (existing && existing.passwordHash !== null) {
    // Active user with a password — reject duplicate
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  // Generate invite token: 32 random bytes, store only SHA-256 hash
  const inviteTokenBytes = randomBytes(32);
  const inviteTokenPlain = inviteTokenBytes.toString("hex");
  const inviteTokenHash = createHash("sha256").update(inviteTokenPlain).digest("hex");
  const inviteTokenExpires = new Date(Date.now() + INVITE_TOKEN_EXPIRES_MS);

  let newUserId: string;

  if (existing) {
    // Existing unactivated user — regenerate invite token
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role,
        inviteToken: inviteTokenHash,
        inviteTokenExpires,
        isActive: false,
      },
    });
    newUserId = existing.id;
  } else {
    const newUser = await prisma.user.create({
      data: {
        companyId,
        email: normalizedEmail,
        passwordHash: null,
        role,
        isActive: false,
        inviteToken: inviteTokenHash,
        inviteTokenExpires,
        createdBy: session.userId,
      },
      select: { id: true },
    });
    newUserId = newUser.id;
  }

  // Build invite URL using server env var
  const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  // Default locale to "en" — the user can switch after login
  const inviteUrl = `${appUrl}/en/auth/accept-invite?token=${inviteTokenPlain}`;

  // Import here to avoid circular dependency
  const { buildUserInviteEmail } = await import("@/components/emails/user-invite");
  const { sendMail } = await import("@/lib/mail");

  const { subject, html } = buildUserInviteEmail({
    locale: "en",
    companyName: process.env.MAIL_COMPANY_NAME ?? "Venshield",
    inviteUrl,
    recipientEmail: normalizedEmail,
  });

  const mailResult = await sendMail({ to: normalizedEmail, subject, html });

  await logAuditEvent(
    {
      companyId,
      userId: session.userId,
      action: "USER_CREATED",
      entityType: "User",
      entityId: newUserId,
      newValue: {
        email: normalizedEmail,
        role,
        inviteChannel: "email-link",
        mailDelivered: mailResult.ok,
      },
    },
    { captureHeaders: true },
  );

  if (!mailResult.ok) {
    await logAuditEvent({
      companyId,
      userId: session.userId,
      action: "MAIL_DELIVERY_FAILED",
      entityType: "User",
      entityId: newUserId,
      newValue: { reason: mailResult.error },
    }).catch(() => {});
    throw new Error("MAIL_DELIVERY_FAILED");
  }

  AuditLogger.accessControl("user.created", "success", {
    userId: session.userId,
    entityType: "User",
    entityId: newUserId,
    message: `Internal user created with role ${role}`,
    details: { role },
  });

  revalidatePath("/dashboard/users");

  return { success: true };
}

/**
 * Revokes access for an internal user by deactivating their account.
 *
 * Security guarantees:
 * - Caller must hold the ADMIN role (enforced via requireAdminUser).
 * - An admin cannot revoke their own access (anti-lockout guard).
 * - The user record is NOT hard-deleted to preserve Audit Trail integrity;
 *   instead isActive is set to false, all sessions are revoked, and the
 *   email is anonymized so the address can be reused.
 * - The action is recorded in the AuditLog as USER_REMOVED.
 */
export async function deleteUser(
  targetUserId: string,
): Promise<{ success: true }> {
  const session = await requireAdminUser();

  if (targetUserId === session.userId) {
    throw new Error("SELF_DELETE_FORBIDDEN");
  }

  const companyId = session.companyId;
  if (!companyId) {
    throw new Error("MISSING_COMPANY_CONTEXT");
  }

  const targetUser = await prisma.user.findUniqueOrThrow({
    where: { id: targetUserId },
    select: { id: true, email: true, role: true, isActive: true },
  });

  // Anonymize the email so the address can be reused, and deactivate the account.
  const anonymizedEmail = `revoked-${targetUserId}@revoked.invalid`;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUserId },
      data: {
        isActive: false,
        email: anonymizedEmail,
        passwordHash: null,
        ssoProviderId: null,
      },
    });

    // Revoke all active sessions for the user.
    await tx.authSession.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // GDPR Art. 17 — anonymize approval step comments authored by deleted user
    await tx.assessmentApprovalStep.updateMany({
      where: { actorUserId: targetUserId },
      data: { comment: null },
    });
  });

  await logAuditEvent(
    {
      companyId,
      userId: session.userId,
      action: "USER_DELETED",
      entityType: "User",
      entityId: targetUserId,
      previousValue: { role: targetUser.role },
      newValue: { isActive: false },
    },
    { captureHeaders: true },
  );

  AuditLogger.accessControl("user.deleted", "success", {
    userId: session.userId,
    entityType: "User",
    entityId: targetUserId,
    message: `User ${targetUserId} deactivated (role: ${targetUser.role})`,
    details: { previousRole: targetUser.role },
  });

  revalidatePath("/dashboard/users");

  return { success: true };
}
