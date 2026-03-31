"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import { requireAuthSession } from "@/lib/auth/server";

/**
 * Minimum password policy (NIS2 / BSI C5 aligned):
 * - At least 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
function validatePasswordStrength(password: string): string | null {
  if (password.length < 12) return "PASSWORD_TOO_SHORT";
  if (!/[A-Z]/.test(password)) return "PASSWORD_NO_UPPERCASE";
  if (!/[a-z]/.test(password)) return "PASSWORD_NO_LOWERCASE";
  if (!/[0-9]/.test(password)) return "PASSWORD_NO_NUMBER";
  if (!/[^A-Za-z0-9]/.test(password)) return "PASSWORD_NO_SPECIAL";
  return null;
}

/**
 * Updates the authenticated user's password.
 *
 * Security guarantees:
 * - Caller must hold an active session (any role).
 * - The current password is verified against the stored bcrypt hash before
 *   any change is applied (prevents password replacement by session hijacking).
 * - Enforces a strong password policy (12+ chars, upper, lower, digit, special).
 * - New password hash uses bcrypt cost factor 12.
 * - The change is recorded in the AuditLog as PASSWORD_CHANGED (no plaintext stored).
 */
export async function updatePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: true }> {
  const session = await requireAuthSession();

  const validationError = validatePasswordStrength(newPassword);
  if (validationError) {
    throw new Error(validationError);
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { id: true, passwordHash: true, companyId: true },
  });

  if (!user.passwordHash) {
    throw new Error("NO_PASSWORD_SET");
  }

  const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentOk) {
    throw new Error("CURRENT_PASSWORD_WRONG");
  }

  const newHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: newHash },
  });

  if (user.companyId) {
    await logAuditEvent(
      {
        companyId: user.companyId,
        userId: session.userId,
        action: "PASSWORD_CHANGED",
        entityType: "User",
        entityId: session.userId,
        newValue: { changed: true },
      },
      { captureHeaders: true },
    );
  }

  return { success: true };
}
