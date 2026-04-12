"use server";

import crypto from "crypto";
import { createHmac } from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/queries/vendor-assessments";
import type { SendInviteState } from "@/lib/types/vendor-auth";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";
import { sendMail } from "@/lib/mail";
import { buildVendorInviteEmail } from "@/components/emails/vendor-invite";
import { logAuditEvent } from "@/lib/audit-log";
import { sendSms } from "@/lib/sms";
import { env } from "@/lib/env";
import { scrubPiiFields } from "@/lib/audit-sanitize";
import { AuditLogger } from "@/lib/structured-logger";

const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%";

// Strict E.164: + followed by 7-15 digits (spaces stripped before test)
const E164_RE = /^\+[1-9]\d{6,14}$/;

function generateAccessCode(): string {
  const chars = crypto.randomBytes(8);
  const picked = Array.from(chars, (b) => ACCESS_CODE_ALPHABET[b % ACCESS_CODE_ALPHABET.length]);
  return `${picked.slice(0, 4).join("")}-${picked.slice(4, 8).join("")}`;
}

function generateTempPassword(): string {
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (b) => TEMP_PASSWORD_ALPHABET[b % TEMP_PASSWORD_ALPHABET.length]).join("");
}

function maskPhone(normalized: string): string {
  if (normalized.length <= 4) return "****";
  return `${"*".repeat(normalized.length - 4)}${normalized.slice(-4)}`;
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function resolveExpiry(duration: string): Date {
  const now = new Date();
  switch (duration) {
    case "1h":  return new Date(now.getTime() + 60 * 60 * 1_000);
    case "7d":  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
    case "30d": return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
    default:    return new Date(now.getTime() + 24 * 60 * 60 * 1_000); // 24h
  }
}

export async function sendOutOfBandInviteAction(
  _prevState: SendInviteState,
  formData: FormData,
): Promise<SendInviteState> {
  const vendorId = formData.get("vendorId");
  const email    = formData.get("email");
  const rawPhone = formData.get("phone");
  const duration = formData.get("duration") ?? "24h";
  const locale   = typeof formData.get("locale") === "string"
    ? (formData.get("locale") as string)
    : "en";
  // Strict string equality prevents "1"/"yes"/boolean-coerced values from enabling force.
  const forceRefresh = formData.get("forceRefresh") === "true";

  if (typeof vendorId !== "string" || !vendorId.trim()) {
    return { status: "error", error: "Invalid vendor." };
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { status: "error", error: "A valid email address is required." };
  }
  if (typeof rawPhone !== "string") {
    return { status: "error", error: "A phone number is required." };
  }

  // Normalize: strip spaces and dashes so "+49 151 1234 5678" -> "+491511234568"
  const phone = rawPhone.replace(/[\s\-().]/g, "");
  if (!E164_RE.test(phone)) {
    return {
      status: "error",
      error: "Phone must be in international format, e.g. +49 151 12345678.",
    };
  }

  // Authenticate before any DB access (fixes previous ordering bug)
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

  // Credentials created once, in memory only -- hash immediately, never return to client
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const codeExpiresAt = resolveExpiry(resolvedDuration);
  const inviteToken = crypto.randomUUID().replace(/-/g, "");
  let accessCode = "";
  let vendorName = "";

  try {
    await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findFirst({
        where: { id: vendorId.trim(), companyId },
        select: { id: true, name: true, inviteTokenExpires: true },
      });
      if (!vendor) throw new Error("Vendor not found.");

      // Guard: block re-invite when a still-valid token exists and forceRefresh was not requested.
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1_000);
      if (
        !forceRefresh &&
        vendor.inviteTokenExpires instanceof Date &&
        vendor.inviteTokenExpires > oneHourFromNow
      ) {
        throw new Error("INVITE_STILL_VALID");
      }

      vendorName = vendor.name;

      // Retry on unique-code collision
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
              inviteToken,
              inviteTokenExpires: codeExpiresAt,
              passwordHash,
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

      // -- SMS rate limit (per E.164 phone, 60-min window) --------------------
      // Only enforced when a real SMS provider is active (not log/dev).
      // TOCTOU note: count+create are inside the same tx but not serializable;
      // worst case: 1-2 extra deliveries may slip through under high concurrency.
      // This is an accepted trade-off for this low-frequency operation.
      if ((env.SMS_PROVIDER ?? "log") !== "log") {
        const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1_000);
        const phoneHashHex = createHmac("sha256", env.SMS_PSEUDONYM_KEY!)
          .update(phone)
          .digest("hex");

        const recentCount = await tx.vendorSmsLog.count({
          where: {
            phoneHash: phoneHashHex,
            sentAt: { gte: sixtyMinutesAgo },
          },
        });

        if (recentCount >= 3) {
          throw new Error("SMS_RATE_LIMITED");
        }

        await tx.vendorSmsLog.create({
          data: { vendorId: vendorId.trim(), phoneHash: phoneHashHex },
        });
      }

      await logAuditEvent(
        {
          companyId,
          userId: session.userId,
          // Log VENDOR_INVITE_REFRESHED whenever the admin explicitly forced renewal
          // (even if the prior token was already expired) so auditors can distinguish
          // a deliberate resend from a routine first invite.
          action: forceRefresh ? "VENDOR_INVITE_REFRESHED" : "INVITE_SENT",
          entityType: "Vendor",
          entityId: vendor.id,
          newValue: {
            channel: "out-of-band",
            duration: resolvedDuration,
            expiresAt: codeExpiresAt.toISOString(),
            ...(forceRefresh && { priorTokenActive: vendor.inviteTokenExpires instanceof Date && vendor.inviteTokenExpires > new Date() }),
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
    if (err instanceof Error && err.message === "SMS_RATE_LIMITED") {
      await logAuditEvent({
        companyId,
        userId: session.userId,
        action: "SMS_RATE_LIMITED",
        entityType: "vendor",
        entityId: vendorId.trim(),
        newValue: { destination: maskPhone(phone) },
      }).catch(() => {});
      return { status: "error", error: "Too many SMS invites to this number. Please wait 60 minutes." };
    }
    AuditLogger.dataOp("vendor.invite.sent", "failure", {
      userId: session.userId,
      error: err instanceof Error ? err : new Error(String(err)),
      message: "Out-of-band invite failed",
    });
    return { status: "error", error: "Could not send invite. Please try again." };
  }

  // -- EMAIL DELIVERY ---------------------------------------------------------
  // Outside the transaction: a mail failure must not roll back the DB write.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const portalUrl = `${appUrl}/${locale}/external/portal`;

  const { subject, html } = buildVendorInviteEmail({
    locale,
    companyName: process.env.MAIL_COMPANY_NAME ?? "Venshield",
    vendorName,
    accessCode,
    portalUrl,
  });

  const mailResult = await sendMail({ to: email.trim(), subject, html });

  if (!mailResult.ok) {
    // Log failure to the audit trail but do not surface it in the UI --
    // the access code was saved successfully; the admin can resend manually.
    await logAuditEvent({
      companyId,
      userId: session.userId,
      action: "MAIL_DELIVERY_FAILED",
      entityType: "vendor",
      entityId: vendorId.trim(),
      newValue: {
        reason: mailResult.error,
        destination: email.trim(),
        strategy: process.env.MAIL_STRATEGY ?? "log",
      },
    }).catch(() => {});
  }

  // -- SMS DELIVERY -----------------------------------------------------------
  // SECURITY: tempPassword is embedded in smsBody and transmitted to the provider.
  // It is NEVER stored in plain text, never logged, never returned to the client.
  // Provider implementations are PROHIBITED from logging the body parameter.
  const smsBody =
    `Your Venshield temporary password is: ${tempPassword}. ` +
    `Use your emailed Access Code to log in and change this password immediately.`;

  const smsResult = await sendSms(phone, smsBody);

  if (!smsResult.ok) {
    const safeReason = (smsResult.error ?? "Unknown").replace(/password[=: ].*/gi, "[REDACTED]");
    await logAuditEvent({
      companyId,
      userId: session.userId,
      action: "SMS_DELIVERY_FAILED",
      entityType: "vendor",
      entityId: vendorId.trim(),
      newValue: scrubPiiFields({
        reason: safeReason,
        destination: maskPhone(phone),
        provider: env.SMS_PROVIDER ?? "log",
      }) as Prisma.InputJsonValue,
    }).catch(() => {});
    // Non-blocking: access code was saved; admin can provide credentials via alternate channel
  }
  // tempPassword and smsBody references end here â€” neither leaves this server action

  revalidatePath("/vendors");
  return { status: "sent", maskedPhone: maskPhone(phone), error: null };
}