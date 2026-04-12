"use server";

import nodemailer from "nodemailer";
import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import type { MailStrategy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { requireAdminUser, isAccessControlError } from "@/lib/auth/server";
import { logAuditEvent } from "@/lib/audit-log";
import { AuditLogger } from "@/lib/structured-logger";

// ─── Update Mail Settings ─────────────────────────────────────────────────────

export async function updateMailSettings(
  _prevState: unknown,
  formData: FormData,
) {
  let session;
  try {
    session = await requireAdminUser();
  } catch (err) {
    if (isAccessControlError(err)) {
      return { ok: false, error: "Unauthorized." };
    }
    throw err;
  }

  const mailStrategy = formData.get("mailStrategy") as string;
  const mailFrom = (formData.get("mailFrom") as string)?.trim() || null;
  const mailFromName = (formData.get("mailFromName") as string)?.trim() || null;
  const smtpHost = (formData.get("smtpHost") as string)?.trim() || null;
  const smtpPortRaw = (formData.get("smtpPort") as string)?.trim();
  const smtpUser = (formData.get("smtpUser") as string)?.trim() || null;
  const smtpPasswordRaw = (formData.get("smtpPassword") as string)?.trim();
  const resendApiKeyRaw = (formData.get("resendApiKey") as string)?.trim();

  const validStrategies: MailStrategy[] = ["SMTP", "RESEND", "LOG"];
  if (!validStrategies.includes(mailStrategy as MailStrategy)) {
    return { ok: false, error: "Invalid mail strategy." };
  }

  if (mailFrom && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailFrom)) {
    return { ok: false, error: "Invalid sender email address." };
  }

  // Load existing record so we only re-encrypt when a new secret is provided.
  const existing = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: { smtpPassword: true, resendApiKey: true },
  });

  const smtpPassword = smtpPasswordRaw
    ? encrypt(smtpPasswordRaw)
    : (existing?.smtpPassword ?? null);

  const resendApiKey = resendApiKeyRaw
    ? encrypt(resendApiKeyRaw)
    : (existing?.resendApiKey ?? null);

  const smtpPort = smtpPortRaw ? parseInt(smtpPortRaw, 10) : 587;
  if (isNaN(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    return { ok: false, error: "SMTP port must be a number between 1 and 65535." };
  }

  try {
    await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        mailStrategy: mailStrategy as MailStrategy,
        mailFrom,
        mailFromName,
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPassword,
        resendApiKey,
        updatedBy: session.userId,
      },
      update: {
        mailStrategy: mailStrategy as MailStrategy,
        mailFrom,
        mailFromName,
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPassword,
        resendApiKey,
        updatedBy: session.userId,
      },
    });

    await logAuditEvent(
      {
        companyId: session.companyId ?? "system",
        userId: session.userId,
        action: "SETTINGS_UPDATED",
        entityType: "system_settings",
        entityId: "mail_config",
        newValue: {
          mailStrategy,
          mailFrom,
          mailFromName,
          smtpHost,
          smtpPort,
          smtpUser,
          // Passwords and API keys are never written to the audit log.
        },
        reason: "Admin updated mail delivery configuration via System Settings UI",
      },
      { captureHeaders: true },
    );

    AuditLogger.configuration("settings.mail_updated", "success", {
      userId: session.userId,
      entityType: "system_settings",
      entityId: "mail_config",
      message: `Mail configuration updated to ${mailStrategy}`,
      details: { mailStrategy, smtpHost, smtpPort },
    });

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    AuditLogger.configuration("settings.mail_updated", "failure", {
      userId: session?.userId,
      message: `Failed to save mail settings: ${error}`,
      error: err instanceof Error ? err : new Error(String(err)),
    });
    return { ok: false, error: "Failed to save settings. Please try again." };
  }
}

// ─── Test Mail Config ─────────────────────────────────────────────────────────

export async function testMailConfig(
  _prevState: unknown,
  formData: FormData,
) {
  try {
    await requireAdminUser();
  } catch (err) {
    if (isAccessControlError(err)) {
      return { ok: false, error: "Unauthorized." };
    }
    throw err;
  }

  const strategy = (formData.get("strategy") as string)?.toUpperCase().trim();
  const testEmail = (formData.get("testEmail") as string)?.trim();
  const mailFrom = (formData.get("mailFrom") as string)?.trim();
  const mailFromName = (formData.get("mailFromName") as string)?.trim();
  const smtpHost = (formData.get("smtpHost") as string)?.trim();
  const smtpPortRaw = (formData.get("smtpPort") as string)?.trim();
  const smtpUser = (formData.get("smtpUser") as string)?.trim();
  const smtpPasswordRaw = (formData.get("smtpPassword") as string)?.trim();
  const resendApiKeyRaw = (formData.get("resendApiKey") as string)?.trim();

  if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
    return { ok: false, error: "A valid recipient email address is required." };
  }

  const resolvedFrom =
    mailFromName && mailFrom
      ? `${mailFromName} <${mailFrom}>`
      : mailFrom || "Venshield <noreply@venshield.local>";

  const testHtml = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:8px;">
      <h2 style="color:#1e40af;margin-bottom:8px;">✅ Venshield Mail Configuration Test</h2>
      <p style="color:#374151;">This test email confirms that your mail delivery settings are working correctly.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#6b7280;font-size:12px;">Sent from Venshield Platform · System Settings</p>
    </div>
  `;

  if (strategy === "SMTP") {
    const smtpPort = smtpPortRaw ? parseInt(smtpPortRaw, 10) : 587;

    // Prefer form-supplied password; fall back to the encrypted one from DB.
    let pass = smtpPasswordRaw;
    if (!pass) {
      const existing = await prisma.systemSettings.findUnique({
        where: { id: "singleton" },
        select: { smtpPassword: true },
      });
      if (existing?.smtpPassword) {
        try {
          pass = decrypt(existing.smtpPassword);
        } catch {
          return { ok: false, error: "Could not decrypt stored SMTP password." };
        }
      }
    }

    if (!smtpHost || !smtpUser || !pass) {
      return {
        ok: false,
        error: "SMTP Host, User, and Password are required for a SMTP test.",
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass },
      });

      await transporter.sendMail({
        from: resolvedFrom,
        to: testEmail,
        subject: "Hello from Venshield — Test Email",
        html: testHtml,
      });

      return { ok: true, message: `Test email delivered to ${testEmail}.` };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `SMTP delivery failed: ${error}` };
    }
  }

  if (strategy === "RESEND") {
    // Prefer form-supplied key; fall back to DB.
    let apiKey = resendApiKeyRaw;
    if (!apiKey) {
      const existing = await prisma.systemSettings.findUnique({
        where: { id: "singleton" },
        select: { resendApiKey: true },
      });
      if (existing?.resendApiKey) {
        try {
          apiKey = decrypt(existing.resendApiKey);
        } catch {
          return { ok: false, error: "Could not decrypt stored Resend API key." };
        }
      }
    }

    if (!apiKey) {
      return { ok: false, error: "Resend API Key is required for a Resend test." };
    }

    try {
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({
        from: resolvedFrom,
        to: [testEmail],
        subject: "Hello from Venshield — Test Email",
        html: testHtml,
      });

      if (error) {
        return { ok: false, error: `Resend delivery failed: ${error.message}` };
      }

      return { ok: true, message: `Test email delivered to ${testEmail}.` };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Resend delivery failed: ${error}` };
    }
  }

  return {
    ok: false,
    error: 'Select SMTP or Resend strategy before testing. "Log" mode only simulates delivery.',
  };
}
