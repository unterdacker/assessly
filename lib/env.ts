/**
 * AVRA — Runtime environment validation
 *
 * This module validates every environment variable declared in .env.example
 * using Zod at server startup.  It is the single source of truth for the
 * shape and requirements of the runtime configuration.
 *
 * Behaviour by NODE_ENV:
 *   production — strict: throws a fatal error with a full list of all invalid
 *                or missing variables so the container fails fast before
 *                serving any traffic.
 *   development / test — lenient: missing production-only secrets emit a
 *                console warning but the process continues with safe defaults
 *                (the individual libs already have dev-time fallbacks).
 *
 * Usage:
 *   import { env } from "@/lib/env";
 *   const url = env.NEXT_PUBLIC_APP_URL;
 *
 * Note: this module is marked server-only — it must not be imported from
 * Client Components or middleware (which runs in the Edge Runtime).
 * Validation is triggered by the root app/layout.tsx import.
 */

import "server-only";

import { z } from "zod";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Patterns that indicate a placeholder / skeleton value that was never filled in. */
const PLACEHOLDER_RE =
  /change[_-]?me|change_me|dev[_-]only|placeholder|your_\w|example_|^CHANGE_ME|^CHANGE_ME_/i;

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_RE.test(value);
}

// ---------------------------------------------------------------------------
// Base schema  (permissive — used in all environments)
// Optional fields here receive typing "undefined" so callers know to guard.
// ---------------------------------------------------------------------------

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ── Database ─────────────────────────────────────────────────────────────
  /** PostgreSQL connection string. Always required — the app cannot start without it. */
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required" })
    .min(1, "DATABASE_URL must not be empty")
    .refine(
      (v) => /^(postgres(?:ql)?):\/\//.test(v),
      "DATABASE_URL must begin with postgresql:// or postgres://",
    ),

  // ── Session & authentication ──────────────────────────────────────────────
  /**
   * HMAC-SHA256 key for signing session tokens.
   * Required in production (min 32 chars, no weak defaults).
   * Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   */
  AUTH_SESSION_SECRET: z.string().optional(),
  /** Legacy alias — AUTH_SESSION_SECRET takes precedence. */
  NEXTAUTH_SECRET: z.string().optional(),

  // ── Encryption keys ───────────────────────────────────────────────────────
  /**
   * AES-256-GCM key for settings/API-key encryption at rest.
   * MUST be exactly 64 hex characters (32 bytes) in production.
   * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   */
  SETTINGS_ENCRYPTION_KEY: z.string().optional(),
  /**
   * AES-256-GCM key for TOTP / MFA secret encryption at rest.
   * MUST be exactly 64 hex characters (32 bytes) in production.
   */
  MFA_ENCRYPTION_KEY: z.string().optional(),

  // ── Application URL ────────────────────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a valid URL")
    .default("http://localhost:3000"),

  // ── Cron ──────────────────────────────────────────────────────────────────
  /**
   * Bearer token for /api/cron/* endpoints.
   * Required in production — without it all cron routes are locked (fail-closed).
   */
  CRON_SECRET: z.string().optional(),

  // ── AI provider ───────────────────────────────────────────────────────────
  AI_PROVIDER: z.enum(["mistral", "local"]).default("local"),
  MISTRAL_API_KEY: z.string().optional(),
  LOCAL_AI_ENDPOINT: z.string().optional(),
  LOCAL_AI_MODEL: z.string().default("ministral-3:8b"),

  // ── Mail ──────────────────────────────────────────────────────────────────
  MAIL_STRATEGY: z.enum(["log", "smtp", "resend"]).default("log"),
  MAIL_FROM: z.string().default("AVRA Compliance <noreply@avra.local>"),
  MAIL_COMPANY_NAME: z.string().default("AVRA Compliance"),
  SMTP_HOST: z.string().optional(),
  /** Validated as a numeric port string. Consumers should parseInt(). */
  SMTP_PORT: z
    .string()
    .regex(/^\d{1,5}$/, "SMTP_PORT must be a port number (1–65535)")
    .refine(
      (v) => { const n = parseInt(v, 10); return n >= 1 && n <= 65535; },
      "SMTP_PORT must be between 1 and 65535",
    )
    .default("587"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  // ── Audit log signing ─────────────────────────────────────────────────────
  /**
   * HMAC signing key for forensic audit bundle exports.
   * Also referred to as the "audit signing secret" in security documentation.
   * Required in production (min 32 chars, no weak defaults).
   * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   */
  AUDIT_BUNDLE_SECRET: z.string().optional(),
  /** HMAC key for pseudonymising user IDs in exports (GDPR Art. 5). */
  AUDIT_EXPORT_KEY: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Strict production schema  (extends rawEnvSchema with security superRefine)
// superRefine only adds issues when NODE_ENV === "production" so in dev this
// schema behaves identically to rawEnvSchema.
// ---------------------------------------------------------------------------

const HEX_64_RE = /^[0-9a-f]{64}$/i;

const envSchema = rawEnvSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV !== "production") return;

  function require(
    field: string,
    value: string | undefined,
    message: string,
  ): boolean {
    if (!value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
      return false;
    }
    return true;
  }

  // ── SETTINGS_ENCRYPTION_KEY ───────────────────────────────────────────────
  if (
    require(
      "SETTINGS_ENCRYPTION_KEY",
      data.SETTINGS_ENCRYPTION_KEY,
      "SETTINGS_ENCRYPTION_KEY is required in production. " +
        'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    ) &&
    data.SETTINGS_ENCRYPTION_KEY
  ) {
    if (!HEX_64_RE.test(data.SETTINGS_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SETTINGS_ENCRYPTION_KEY"],
        message:
          "SETTINGS_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes / 256 bits). " +
          'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      });
    } else if (isPlaceholder(data.SETTINGS_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SETTINGS_ENCRYPTION_KEY"],
        message:
          "SETTINGS_ENCRYPTION_KEY contains a placeholder value. " +
          "Generate a real cryptographic key before deploying.",
      });
    }
  }

  // ── MFA_ENCRYPTION_KEY ────────────────────────────────────────────────────
  if (
    require(
      "MFA_ENCRYPTION_KEY",
      data.MFA_ENCRYPTION_KEY,
      "MFA_ENCRYPTION_KEY is required in production. " +
        'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    ) &&
    data.MFA_ENCRYPTION_KEY
  ) {
    if (!HEX_64_RE.test(data.MFA_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MFA_ENCRYPTION_KEY"],
        message:
          "MFA_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes / 256 bits). " +
          'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      });
    }
  }

  // ── AUDIT_BUNDLE_SECRET (= "audit signing secret") ────────────────────────
  if (
    require(
      "AUDIT_BUNDLE_SECRET",
      data.AUDIT_BUNDLE_SECRET,
      "AUDIT_BUNDLE_SECRET (audit signing secret) is required in production. " +
        'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    ) &&
    data.AUDIT_BUNDLE_SECRET
  ) {
    if (data.AUDIT_BUNDLE_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUDIT_BUNDLE_SECRET"],
        message:
          `AUDIT_BUNDLE_SECRET must be at least 32 characters (got ${data.AUDIT_BUNDLE_SECRET.length}).`,
      });
    } else if (isPlaceholder(data.AUDIT_BUNDLE_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUDIT_BUNDLE_SECRET"],
        message:
          "AUDIT_BUNDLE_SECRET contains a placeholder value. " +
          "Generate a real signing secret before deploying.",
      });
    }
  }

  // ── AUTH_SESSION_SECRET ───────────────────────────────────────────────────
  const authSecret = data.AUTH_SESSION_SECRET ?? data.NEXTAUTH_SECRET;
  if (!authSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AUTH_SESSION_SECRET"],
      message:
        "AUTH_SESSION_SECRET is required in production. " +
        'Generate: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
    });
  } else if (authSecret.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AUTH_SESSION_SECRET"],
      message:
        `AUTH_SESSION_SECRET must be at least 32 characters (got ${authSecret.length}).`,
    });
  } else if (
    isPlaceholder(authSecret) ||
    authSecret === "dev-only-avra-session-secret-change-me"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AUTH_SESSION_SECRET"],
      message:
        "AUTH_SESSION_SECRET is set to a known weak or placeholder value. " +
        "Generate a real secret before deploying.",
    });
  }

  // ── CRON_SECRET ───────────────────────────────────────────────────────────
  if (
    require(
      "CRON_SECRET",
      data.CRON_SECRET,
      "CRON_SECRET is required in production (cron endpoints are fail-closed without it). " +
        'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    ) &&
    data.CRON_SECRET
  ) {
    if (data.CRON_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CRON_SECRET"],
        message: `CRON_SECRET must be at least 32 characters (got ${data.CRON_SECRET.length}).`,
      });
    }
  }

  // ── NEXT_PUBLIC_APP_URL ────────────────────────────────────────────────────
  if (
    data.NEXT_PUBLIC_APP_URL &&
    /localhost|127\.0\.0\.1/.test(data.NEXT_PUBLIC_APP_URL)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["NEXT_PUBLIC_APP_URL"],
      message:
        "NEXT_PUBLIC_APP_URL must not point to localhost in production. " +
        "Set it to your public-facing domain (e.g. https://avra.example.com).",
    });
  }

  // ── AUDIT_EXPORT_KEY length ────────────────────────────────────────────────
  if (data.AUDIT_EXPORT_KEY && data.AUDIT_EXPORT_KEY.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AUDIT_EXPORT_KEY"],
      message:
        `AUDIT_EXPORT_KEY must be at least 32 characters if set (got ${data.AUDIT_EXPORT_KEY.length}).`,
    });
  }
});

// ---------------------------------------------------------------------------
// Exported type
// ---------------------------------------------------------------------------

export type Env = z.infer<typeof rawEnvSchema>;

// ---------------------------------------------------------------------------
// Validation and export
// ---------------------------------------------------------------------------

function formatErrors(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? String(issue.path[0]) : "root";
      return `  • ${field}: ${issue.message}`;
    })
    .join("\n");
}

const FATAL_HEADER = `
╔══════════════════════════════════════════════════════════════╗
║   AVRA — FATAL: Invalid or missing environment variables     ║
╚══════════════════════════════════════════════════════════════╝

The following configuration errors must be resolved before the
application can start. See .env.example for documentation and
key-generation commands for each variable.

`;

const FATAL_FOOTER = `

The application will not serve traffic until all errors above
are resolved. Set the variables in your deployment environment
(Docker secrets, Kubernetes secrets, or a .env file).
`;

function validateEnv(): Env {
  // --- Phase 1: base structural parse (always required, both envs) ----------
  const baseResult = rawEnvSchema.safeParse(process.env);

  if (!baseResult.success) {
    // Structural failures (e.g. DATABASE_URL missing) are always fatal
    const msg = formatErrors(baseResult.error);
    throw new Error(
      FATAL_HEADER +
        msg +
        "\n\nNote: DATABASE_URL and other structurally required variables " +
        "are always mandatory regardless of NODE_ENV." +
        FATAL_FOOTER,
    );
  }

  // --- Phase 2: strict production security checks ---------------------------
  const strictResult = envSchema.safeParse(process.env);

  if (!strictResult.success) {
    const msg = formatErrors(strictResult.error);

    if (baseResult.data.NODE_ENV === "production") {
      // Fatal in production — container should not start
      throw new Error(FATAL_HEADER + msg + FATAL_FOOTER);
    }

    // Development / test — warn and continue (libs have their own dev fallbacks)
    console.warn(
      `\n⚠  AVRA [env] — configuration warnings` +
        ` (these are fatal errors in production):\n\n` +
        msg +
        `\n\nSee .env.example for documentation and key-generation commands.\n`,
    );
  }

  return baseResult.data;
}

/**
 * Validated, typed environment configuration for the entire application.
 *
 * In production, accessing this export guarantees all required variables
 * are present and correctly formatted — the process would have thrown during
 * module initialisation otherwise.
 *
 * Usage:
 *   import { env } from "@/lib/env";
 *   const appUrl = env.NEXT_PUBLIC_APP_URL;
 */
export const env: Env = validateEnv();
