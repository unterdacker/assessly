"use server";

import { createHash } from "crypto";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/queries/vendor-assessments";
import type { SendInviteState } from "@/lib/types/vendor-auth";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";
import { sendMail } from "@/lib/mail";
import { buildVendorInviteEmail } from "@/components/emails/vendor-invite";
import { logAuditEvent } from "@/lib/audit-log";
import { AuditLogger } from "@/lib/structured-logger";
import { INVITE_TOKEN_EXPIRES_MS } from "@/lib/auth/constants";

const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateAccessCode(): string {
  const chars = randomBytes(8);
  const picked = Array.from(chars, (b) => ACCESS_CODE_ALPHABET[b % ACCESS_CODE_ALPHABET.length]);
  return `${picked.slice(0, 4).join("")}-${picked.slice(4, 8).join("")}`;
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function resolveExpiry(duration: string): Date {
  const now = new Date();
  switch (duration) {
    case "1h":
      return new Date(now.getTime() + 60 * 60 * 1_000);
    case "7d":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
    case "30d":
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1_000);
  }
}

export async function sendOutOfBandInviteAction(
  _prevState: SendInviteState,
  formData: FormData,
): Promise<SendInviteState> {
  const vendorId = formData.get("vendorId");
  const email = formData.get("email");
  const duration = formData.get("duration") ?? "24h";
  const locale = typeof formData.get("locale") === "string"
    ? (formData.get("locale") as string)
    : "en";
  const forceRefresh = formData.get("forceRefresh") === "true";

  if (typeof vendorId !== "string" || !vendorId.trim()) {
    return { status: "error", error: "Invalid vendor." };
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { status: "error", error: "A valid email address is required." };
  }

  let session: Awaited<ReturnType<typeof requireAdminUser>>;
  try {
    session = await requireAdminUser();
  } catch (err) {
    if (isAccessControlError(err)) return { status: "error", error: "Unauthorized." };
    return { status: "error", error: "Authentication failed." };
  }

  const companyId = session.companyId ?? (await getDefaultCompanyId());
  if (!companyId) {
    return { status: "error", error: "Database not ready." };
  }

  const resolvedDuration = typeof duration === "string" ? duration : "24h";
  const codeExpiresAt = resolveExpiry(resolvedDuration);

  // Generate setup token: 32 random bytes, store only SHA-256 hash
  const setupTokenBytes = randomBytes(32);
  const setupTokenPlain = setupTokenBytes.toString("hex");
  const setupTokenHash = createHash("sha256").update(setupTokenPlain).digest("hex");
  const setupTokenExpires = new Date(Date.now() + INVITE_TOKEN_EXPIRES_MS);

  // Generate portal session token (separate from setup token)
  const inviteToken = randomBytes(16).toString("hex");
  const inviteTokenHash = createHash("sha256").update(inviteToken).digest("hex");

  let accessCode = "";
  let vendorName = "";

  try {
    await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findFirst({
        where: { id: vendorId.trim(), companyId },
        select: { id: true, name: true, setupTokenExpires: true },
      });
      if (!vendor) throw new Error("Vendor not found.");

      // Guard: block re-invite when a still-valid setup token exists
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1_000);
      if (
        !forceRefresh &&
        vendor.setupTokenExpires instanceof Date &&
        vendor.setupTokenExpires > oneHourFromNow
      ) {
        throw new Error("INVITE_STILL_VALID");
      }

      vendorName = vendor.name;

      let updated = false;
      for (let i = 0; i < 10; i++) {
        accessCode = generateAccessCode();
        try {
          await tx.vendor.update({
            where: { id: vendor.id },
            data: {
              accessCode,
              codeExpiresAt,
              isCodeActive: true,
              // Portal session token (for assessment API auth after first login)
              inviteToken: inviteTokenHash,
              inviteTokenExpires: codeExpiresAt,
              // Setup token: one-time password-setup link (hash only)
              setupToken: setupTokenHash,
              setupTokenExpires,
              // Clear any previous password hash — vendor sets their own via invite link
              passwordHash: null,
              isFirstLogin: true,
              inviteSentAt: new Date(),
            },
          });
          updated = true;
          break;
        } catch (err) {
          if (isUniqueConstraintError(err)) continue;
          throw err;
        }
      }
      if (!updated) throw new Error("Failed to generate a unique access code.");

      await logAuditEvent(
        {
          companyId,
          userId: session.userId,
          action: forceRefresh ? "VENDOR_INVITE_REFRESHED" : "INVITE_SENT",
          entityType: "Vendor",
          entityId: vendor.id,
          newValue: {
            channel: "email-link",
            duration: resolvedDuration,
            expiresAt: codeExpiresAt.toISOString(),
            setupTokenExpiresAt: setupTokenExpires.toISOString(),
            ...(forceRefresh && {
              priorTokenActive:
                vendor.setupTokenExpires instanceof Date &&
                vendor.setupTokenExpires > new Date(),
            }),
          },
        },
        { tx, captureHeaders: true },
      );
    });
  } catch (err) {
    if (isAccessControlError(err)) {
      return { status: "error", error: "Unauthorized." };
    }
    if (err instanceof Error && err.message === "INVITE_STILL_VALID") {
      return {
        status: "error",
        error: "Vendor already has a valid invite (expires in more than 1 hour). Use the Resend button to override.",
      };
    }
    AuditLogger.dataOp("vendor.invite.sent", "failure", {
      userId: session.userId,
      error: err instanceof Error ? err : new Error(String(err)),
      message: "Invite failed",
    });
    return { status: "error", error: "Could not send invite. Please try again." };
  }

  // Build the password-setup link (server env var, never NEXT_PUBLIC_*)
  const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const setupUrl = `${appUrl}/${locale}/vendor/accept-invite?token=${setupTokenPlain}`;
  const portalUrl = `${appUrl}/${locale}/external/portal`;

  const { subject, html } = buildVendorInviteEmail({
    locale,
    companyName: process.env.MAIL_COMPANY_NAME ?? "Venshield",
    vendorName,
    accessCode,
    portalUrl,
    setupUrl,
  });

  const mailResult = await sendMail({ to: email.trim(), subject, html });

  if (!mailResult.ok) {
    await logAuditEvent({
      companyId,
      userId: session.userId,
      action: "MAIL_DELIVERY_FAILED",
      entityType: "Vendor",
      entityId: vendorId.trim(),
      newValue: {
        reason: mailResult.error,
        destination: email.trim(),
        strategy: process.env.MAIL_STRATEGY ?? "log",
      },
    }).catch(() => {});
  }

  revalidatePath("/vendors");
  return { status: "sent", error: null };
}