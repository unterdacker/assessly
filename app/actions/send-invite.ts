"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/queries/vendor-assessments";
import type { SendInviteState } from "@/lib/types/vendor-auth";

const ANON_ACTOR = "anonymous:prototype";
const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%";

// Strict E.164: + followed by 7–15 digits (spaces stripped before test)
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

  if (typeof vendorId !== "string" || !vendorId.trim()) {
    return { status: "error", error: "Invalid vendor." };
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { status: "error", error: "A valid email address is required." };
  }
  if (typeof rawPhone !== "string") {
    return { status: "error", error: "A phone number is required." };
  }

  // Normalize: strip spaces and dashes so "+49 151 1234 5678" → "+491511234568"
  const phone = rawPhone.replace(/[\s\-().]/g, "");
  if (!E164_RE.test(phone)) {
    return {
      status: "error",
      error: "Phone must be in international format, e.g. +49 151 12345678.",
    };
  }

  const companyId = await getDefaultCompanyId();
  if (!companyId) {
    return { status: "error", error: "Database not ready." };
  }

  const resolvedDuration = typeof duration === "string" ? duration : "24h";

  // Credentials created once, in memory only — hash immediately, never return to client
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const codeExpiresAt = resolveExpiry(resolvedDuration);
  const inviteToken = crypto.randomUUID().replace(/-/g, "");
  let accessCode = "";

  try {
    await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findFirst({
        where: { id: vendorId.trim(), companyId },
        select: { id: true, name: true },
      });
      if (!vendor) throw new Error("Vendor not found.");

      // Retry on unique-code collision
      let updated = false;
      for (let i = 0; i < 10; i++) {
        accessCode = generateAccessCode();
        try {
          await (tx.vendor as any).update({
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

      await tx.auditLog.create({
        data: {
          companyId,
          action: "vendor.invite.sent",
          entityType: "vendor",
          entityId: vendor.id,
          actorId: ANON_ACTOR,
          createdBy: ANON_ACTOR,
          metadata: {
            channel: "out-of-band",
            emailDestination: email.trim(),   // destination logged, credentials are NOT
            phoneMasked: maskPhone(phone),
            duration: resolvedDuration,
            expiresAt: codeExpiresAt.toISOString(),
          },
        },
      });

      // ── EMAIL DELIVERY ─────────────────────────────────────────────────────────
      // TODO: replace with your email provider SDK (e.g. Resend, SendGrid, AWS SES)
      //
      // await resend.emails.send({
      //   from: "noreply@yourdomain.com",
      //   to: email.trim(),
      //   subject: "You've been invited to an AVRA NIS2 Assessment",
      //   html: `
      //     <p>You have been invited to complete a secure NIS2 supply chain assessment.</p>
      //     <p>1. Go to: https://[YOUR_DOMAIN]/external/portal</p>
      //     <p>2. Your Access Code is: <strong>${accessCode}</strong></p>
      //     <p>For security, your temporary password has been sent separately via SMS.
      //        <strong>You must change it immediately on first login.</strong></p>
      //   `,
      // });
      console.log(`[SIMULATED EMAIL → ${email.trim()}]`);
      console.log(`  Portal: https://[YOUR_DOMAIN]/external/portal`);
      console.log(`  Access Code: ${accessCode}`);
      console.log(`  (Password delivered by SMS separately)`);

      // ── SMS DELIVERY ────────────────────────────────────────────────────────────
      // SECURITY: tempPassword is transmitted here and then falls out of scope.
      // It is NEVER stored in plain text, never logged, never returned to the client.
      //
      // TODO: replace with your SMS provider SDK (e.g. Twilio, Vonage, AWS SNS)
      //
      // await twilioClient.messages.create({
      //   from: process.env.TWILIO_PHONE_NUMBER,
      //   to: phone,
      //   body: `AVRA Security Portal: Your temporary password is: ${tempPassword}. ` +
      //         `Log in with your emailed Access Code and change this password immediately.`,
      // });
      console.log(`[SIMULATED SMS → ${maskPhone(phone)}]`);
      console.log(`  [SMS BODY REDACTED — password delivered to device only]`);
      // tempPassword is now out of scope; no reference leaves this server action
    });

    revalidatePath("/vendors");
    return { status: "sent", maskedPhone: maskPhone(phone), error: null };
  } catch (err) {
    console.error("Out-of-band invite failed:", err);
    return { status: "error", error: "Could not send invite. Please try again." };
  }
}
