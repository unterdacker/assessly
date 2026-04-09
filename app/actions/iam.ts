"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import { requireAdminUser } from "@/lib/auth/server";
import { AuditLogger } from "@/lib/structured-logger";

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
): Promise<{ success: true; temporaryPassword: string }> {
  const session = await requireAdminUser();

  const companyId = session.companyId;
  if (!companyId) {
    throw new Error("MISSING_COMPANY_CONTEXT");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existing) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const temporaryPassword = randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const newUser = await prisma.user.create({
    data: {
      companyId,
      email: normalizedEmail,
      passwordHash,
      role,
      createdBy: session.userId,
    },
    select: { id: true },
  });

  await logAuditEvent(
    {
      companyId,
      userId: session.userId,
      action: "USER_CREATED",
      entityType: "User",
      entityId: newUser.id,
      newValue: { email: normalizedEmail, role },
    },
    { captureHeaders: true },
  );

  AuditLogger.accessControl("user.created", "success", {
    userId: session.userId,
    entityType: "User",
    entityId: newUser.id,
    message: `Internal user created with role ${role}`,
    details: { role },
  });

  revalidatePath("/dashboard/users");

  return { success: true, temporaryPassword };
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
