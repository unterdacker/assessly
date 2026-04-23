/**
 * Venshield Universal Mail Utility
 *
 * Strategy resolution order:
 *   1. MAIL_FORCE_ENV=true check — if set, skips DB and reads env vars directly.
 *   2. SystemSettings table (DB) — configured via Admin › Settings › Mail.
 *   3. Environment variables (fallback):
 *        MAIL_STRATEGY=smtp|resend|log
 *        MAIL_FROM="Venshield <noreply@yourdomain.com>"
 *        SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
 *        RESEND_API_KEY
 */

import nodemailer from "nodemailer";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export type MailPayload = {
  to: string;
  subject: string;
  html: string;
  /** Override the resolved sender address for this specific message. */
  from?: string;
};

export type MailResult = { ok: true } | { ok: false; error: string };

// ─── Config resolution ────────────────────────────────────────────────────────

type ResolvedConfig = {
  strategy: string;
  from: string;
  smtp: { host: string; port: number; user: string; pass: string };
  resendApiKey: string;
};

/**
 * Resolves mail configuration: DB row takes precedence over .env variables.
 * Falls back gracefully to env vars if the DB is unreachable.
 */
async function resolveMailConfig(): Promise<ResolvedConfig> {
  // ── MAIL_FORCE_ENV escape hatch ─────────────────────────────────────────
  // Skip DB entirely and use env vars. Useful for local testing when
  // the DB already holds a different strategy from a previous web-UI config.
  // The value comparison is case-insensitive to tolerate common typos.
  const forceEnv =
    (process.env.MAIL_FORCE_ENV ?? "false").toLowerCase().trim() === "true";
  if (forceEnv) {
    if (process.env.NODE_ENV === "production") {
      // env.ts superRefine may not have run (Server Actions bypass app/layout.tsx).
      // This secondary runtime guard is mandatory — it prevents MAIL_FORCE_ENV=true
      // from silently bypassing DB config in production if accidentally left in .env.
      console.error(
        "[Venshield Mail] SECURITY: MAIL_FORCE_ENV=true is a development-only " +
          "escape hatch and is BLOCKED in production. Falling back to DB config.",
      );
      // Fall through to DB resolution — do NOT return early.
    } else {
      return {
        strategy: (process.env.MAIL_STRATEGY ?? "log").toLowerCase().trim(),
        from: process.env.MAIL_FROM ?? "Venshield <noreply@venshield.local>",
        smtp: {
          host: process.env.SMTP_HOST ?? "",
          port: parseInt(process.env.SMTP_PORT ?? "587", 10),
          user: process.env.SMTP_USER ?? "",
          pass: process.env.SMTP_PASSWORD ?? "",
        },
        resendApiKey: process.env.RESEND_API_KEY ?? "",
      };
    }
  }

  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
    });

    if (settings && settings.mailStrategy !== "LOG") {
      const from =
        settings.mailFrom
          ? settings.mailFromName
            ? `${settings.mailFromName} <${settings.mailFrom}>`
            : settings.mailFrom
          : "Venshield <noreply@venshield.local>";

      const smtpPass = settings.smtpPassword
        ? decrypt(settings.smtpPassword)
        : "";
      const resendKey = settings.resendApiKey
        ? decrypt(settings.resendApiKey)
        : "";

      return {
        strategy: settings.mailStrategy.toLowerCase(),
        from,
        smtp: {
          host: settings.smtpHost ?? "",
          port: settings.smtpPort ?? 587,
          user: settings.smtpUser ?? "",
          pass: smtpPass,
        },
        resendApiKey: resendKey,
      };
    }
  } catch {
    // DB unreachable or decryption error ‒ fall through to env vars silently.
  }

  // ── Env-var fallback ───────────────────────────────────────────────────────
  return {
    strategy: (process.env.MAIL_STRATEGY ?? "log").toLowerCase().trim(),
    from:
      process.env.MAIL_FROM ?? "Venshield <noreply@venshield.local>",
    smtp: {
      host: process.env.SMTP_HOST ?? "",
      port: parseInt(process.env.SMTP_PORT ?? "587", 10),
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASSWORD ?? "",
    },
    resendApiKey: process.env.RESEND_API_KEY ?? "",
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a transactional email.
 * Resolves mail configuration from the database first, falling back to .env
 * variables. Never throws — failures are returned as `{ ok: false }`.
 */
export async function sendMail(payload: MailPayload): Promise<MailResult> {
  const config = await resolveMailConfig();
  const resolvedFrom = payload.from ?? config.from;

  switch (config.strategy) {
    case "smtp":
      return sendViaSMTP({ ...payload, from: resolvedFrom }, config.smtp);
    case "resend":
      return sendViaResend({ ...payload, from: resolvedFrom }, config.resendApiKey);
    case "log":
      return logSimulatedEmail({ ...payload, from: resolvedFrom });
    default:
      console.warn(
        `[Venshield Mail] Unknown mail strategy "${config.strategy}". ` +
          `Valid values: smtp | resend | log. Falling back to "log".`,
      );
      return logSimulatedEmail({ ...payload, from: resolvedFrom });
  }
}

// ─── SMTP ──────────────────────────────────────────────────────────────────

async function sendViaSMTP(
  payload: Required<MailPayload>,
  credentials: { host: string; port: number; user: string; pass: string },
): Promise<MailResult> {
  const { host, port, user, pass } = credentials;

  if (!host || !user || !pass) {
    console.warn(
      "[Venshield Mail] SMTP strategy selected but host / user / password are not configured. " +
        "Falling back to simulated log.",
    );
    return logSimulatedEmail(payload);
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[Venshield Mail] SMTP delivery failed:", error);
    return { ok: false, error };
  }
}

// ─── RESEND ─────────────────────────────────────────────────────────────────

async function sendViaResend(
  payload: Required<MailPayload>,
  apiKey: string,
): Promise<MailResult> {
  if (!apiKey) {
    console.warn(
      "[Venshield Mail] Resend strategy selected but API key is not configured. " +
        "Falling back to simulated log.",
    );
    return logSimulatedEmail(payload);
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: payload.from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
    });

    if (error) {
      console.error("[Venshield Mail] Resend delivery failed:", error.message);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[Venshield Mail] Resend delivery failed:", error);
    return { ok: false, error };
  }
}

// ─── LOG (local dev fallback) ────────────────────────────────────────────────

/** Converts HTML to a readable plain-text approximation for console output. */
function htmlToText(html: string): string {
  return html
    // Preserve href URLs: replace <a href="url"> with a marker so the URL
    // appears in the output even though the tag itself is stripped later.
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>/gi, (_, href) => {
      const url = href
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      return `[→ ${url}] `;
    })
    // Block-level elements → newlines
    .replace(/<\/?(br|p|div|tr|h[1-6]|li|blockquote)[^>]*>/gi, "\n")
    // Horizontal rules
    .replace(/<hr[^>]*>/gi, "\n─────────────────────────────\n")
    // Table cells → tab separator
    .replace(/<\/?(td|th)[^>]*>/gi, "  ")
    // Strip all remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Collapse 3+ consecutive blank lines to 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function logSimulatedEmail(payload: Required<MailPayload>): MailResult {
  const border = "═".repeat(63);
  const bodyText = htmlToText(payload.html);

  console.log(`\n╔${border}`);
  console.log(`║  [Venshield Mail · SIMULATED — set MAIL_STRATEGY to send for real]`);
  console.log(`║  To:      ${payload.to}`);
  console.log(`║  From:    ${payload.from}`);
  console.log(`║  Subject: ${payload.subject}`);
  console.log(`╠${border}`);
  bodyText.split("\n").forEach((line) => console.log(`║  ${line}`));
  console.log(`╚${border}\n`);

  return { ok: true };
}
