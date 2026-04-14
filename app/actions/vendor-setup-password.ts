"use server";

import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import { BCRYPT_COST_FACTOR } from "@/lib/auth/constants";
import { Prisma } from "@prisma/client";

export type VendorSetupPasswordState =
  | { status: "idle"; error: null }
  | { status: "success"; error: null }
  | { status: "error"; error: string };

/** Minimum password complexity: 12+ chars, upper, lower, digit, special */
function isPasswordComplex(password: string): boolean {
  return (
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export async function acceptVendorSetupAction(
  _prevState: VendorSetupPasswordState | null,
  formData: FormData,
): Promise<VendorSetupPasswordState> {
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
        const vendors = await tx.$queryRaw<
          Array<{ id: string; companyId: string | null }>
        >`
          SELECT id, "companyId"
          FROM "Vendor"
          WHERE "setupToken" = ${tokenHash}
            AND "setupTokenExpires" > NOW()
          FOR UPDATE
        `;

        if (vendors.length === 0) {
          throw new Error("INVALID_OR_EXPIRED_TOKEN");
        }

        const vendor = vendors[0];

        await tx.vendor.update({
          where: { id: vendor.id },
          data: {
            passwordHash,
            setupToken: null,
            setupTokenExpires: null,
            // isFirstLogin stays true - used for welcome UX, NOT forcing password change
          },
        });

        await logAuditEvent(
          {
            companyId: vendor.companyId ?? "unknown",
            userId: "vendor-self",
            action: "VENDOR_INVITE_ACCEPTED",
            entityType: "Vendor",
            entityId: vendor.id,
            newValue: { channel: "email-link", passwordSet: true },
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
        error: "This invite link is invalid or has expired. Please contact the assessment team for a new invite.",
      };
    }
    return { status: "error", error: "Could not set password. Please try again." };
  }

  return { status: "success", error: null };
}
