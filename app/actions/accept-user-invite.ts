"use server";

import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import { BCRYPT_COST_FACTOR } from "@/lib/auth/constants";
import { Prisma } from "@prisma/client";

export type UserInviteState =
  | { status: "idle"; error: null }
  | { status: "success"; error: null }
  | { status: "error"; error: string };

function isPasswordComplex(password: string): boolean {
  return (
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export async function acceptUserInviteAction(
  _prevState: UserInviteState,
  formData: FormData,
): Promise<UserInviteState> {
  const token = formData.get("token");
  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof token !== "string" || !token.trim()) {
    return { status: "error", error: "Invalid invite link. Please request a new invite." };
  }
  if (typeof newPassword !== "string" || typeof confirmPassword !== "string") {
    return { status: "error", error: "Password fields are required." };
  }
  if (newPassword !== confirmPassword) {
    return { status: "error", error: "Passwords do not match." };
  }
  if (!isPasswordComplex(newPassword)) {
    return {
      status: "error",
      error:
        "Password must be at least 12 characters and include uppercase, lowercase, a number, and a special character.",
    };
  }

  const tokenHash = createHash("sha256").update(token.trim()).digest("hex");
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST_FACTOR);

  try {
    // R1: Serializable transaction + FOR UPDATE to prevent TOCTOU race
    await prisma.$transaction(
      async (tx) => {
        const users = await tx.$queryRaw<
          Array<{ id: string; companyId: string | null }>
        >`
          SELECT id, "companyId"
          FROM "User"
          WHERE "inviteToken" = ${tokenHash}
            AND "inviteTokenExpires" > NOW()
            AND "passwordHash" IS NULL
          FOR UPDATE
        `;

        if (users.length === 0) {
          throw new Error("INVALID_OR_EXPIRED_TOKEN");
        }

        const user = users[0];

        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            isActive: true,
            inviteToken: null,
            inviteTokenExpires: null,
          },
        });

        await logAuditEvent(
          {
            companyId: user.companyId ?? "unknown",
            userId: user.id,
            action: "USER_INVITE_ACCEPTED",
            entityType: "User",
            entityId: user.id,
            newValue: { channel: "email-link", accountActivated: true },
          },
          { tx, captureHeaders: true },
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_OR_EXPIRED_TOKEN") {
      return {
        status: "error",
        error: "This invite link is invalid or has expired. Ask an administrator to send a new invite.",
      };
    }
    return { status: "error", error: "Could not activate account. Please try again." };
  }

  return { status: "success", error: null };
}
