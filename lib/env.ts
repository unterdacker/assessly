/**
 * Venshield — Runtime environment validation
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

import { createHash } from "crypto";
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
  OIDC_STATE_SECRET: z.string().min(32),

  APP_URL: z.string().url(),

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
  /**
   * AES-256-GCM key for evidence file encryption at rest in .venshield-storage/.
   * MUST be exactly 64 hex characters (32 bytes) in production.
   * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   */
  STORAGE_ENCRYPTION_KEY: z.string().optional(),
  /**
   * AES-256-GCM key for webhook signing-secret encryption at rest.
   * Intentionally separate from SETTINGS_ENCRYPTION_KEY to limit blast radius.
   * MUST be exactly 64 hex characters (32 bytes) in production.
   * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   */
  WEBHOOK_ENCRYPTION_KEY: z.string().optional(),
  /**
   * Delivery timeout in milliseconds for outbound webhook HTTP requests.
   * Min: 1000 (1s), Max: 60000 (60s), Default: 30000 (30s).
   */
  WEBHOOK_DELIVERY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(30000),

  // ── Application URL ────────────────────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a valid URL")
    .default("http://localhost:3000"),

  /**
   * Safety escape hatch for containerised local/CI deployments that run with
   * NODE_ENV=production but deliberately serve on http://localhost.
   * Set to "true" only in Docker Compose or CI — never in a real deployment.
   * When true, the localhost and HTTP checks for NEXT_PUBLIC_APP_URL are
   * skipped in the production superRefine.
   */
  ALLOW_INSECURE_LOCALHOST: z
    .enum(["true", "false"])
    .default("false"),

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
  /**
   * Active delivery strategy.
   *   log     → console simulation (default, no config required)
   *   smtp    → real SMTP relay
   *   resend  → Resend SaaS API
   */
  MAIL_STRATEGY: z
    .enum(["log", "smtp", "resend"])
    .default("log"),
  MAIL_FROM: z.string().default("Venshield <noreply@venshield.local>"),
  MAIL_COMPANY_NAME: z.string().default("Venshield"),
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
  /**
   * Development escape hatch. When "true", lib/mail.ts skips the DB lookup
   * and reads all mail settings from env vars, even when DB settings exist.
   * BLOCKED in production by envSchema superRefine.
   * NOTE: This guard only activates when NODE_ENV=production — ensure your
   * deployment environment always sets NODE_ENV=production.
   */
  MAIL_FORCE_ENV: z.enum(["true", "false"]).default("false"),

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
  AUDIT_PSEUDONYMIZATION_KEY: z.string().optional(),

  // ── Storage (S3-compatible) ────────────────────────────────────────────────
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),

  // ── License ───────────────────────────────────────────────────────────────
  /** PEM-encoded Ed25519 public key used to verify license JWT signatures. */
  LICENSE_PUBLIC_KEY: z.string().optional(),
  /** Base URL of the license server for activation and heartbeat calls. */
  LICENSE_SERVER_URL: z.string().url().optional(),

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

  // ── STORAGE_ENCRYPTION_KEY ────────────────────────────────────────────────
  if (
    require(
      "STORAGE_ENCRYPTION_KEY",
      data.STORAGE_ENCRYPTION_KEY,
      "STORAGE_ENCRYPTION_KEY is required in production. " +
        'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    ) &&
    data.STORAGE_ENCRYPTION_KEY
  ) {
    if (!HEX_64_RE.test(data.STORAGE_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STORAGE_ENCRYPTION_KEY"],
        message:
          "STORAGE_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes / 256 bits). " +
          'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      });
    } else if (isPlaceholder(data.STORAGE_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STORAGE_ENCRYPTION_KEY"],
        message:
          "STORAGE_ENCRYPTION_KEY contains a placeholder value. " +
          "Generate a real cryptographic key before deploying.",
      });
    }
  }

  // ── WEBHOOK_ENCRYPTION_KEY ─────────────────────────────────────────────
  if (
    require(
      "WEBHOOK_ENCRYPTION_KEY",
      data.WEBHOOK_ENCRYPTION_KEY,
      "WEBHOOK_ENCRYPTION_KEY is required in production. " +
        'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    ) &&
    data.WEBHOOK_ENCRYPTION_KEY
  ) {
    if (!HEX_64_RE.test(data.WEBHOOK_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WEBHOOK_ENCRYPTION_KEY"],
        message:
          "WEBHOOK_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes / 256 bits). " +
          'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      });
    } else if (isPlaceholder(data.WEBHOOK_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WEBHOOK_ENCRYPTION_KEY"],
        message:
          "WEBHOOK_ENCRYPTION_KEY contains a placeholder value. " +
          "Generate a real cryptographic key before deploying.",
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

  // ── AUDIT_EXPORT_KEY ──────────────────────────────────────────────────────
  if (
    require(
      "AUDIT_EXPORT_KEY",
      data.AUDIT_EXPORT_KEY,
      "AUDIT_EXPORT_KEY is required in production. Omitting this key severs GDPR audit-trail pseudonym linkability for exported bundles.",
    ) &&
    data.AUDIT_EXPORT_KEY
  ) {
    if (data.AUDIT_EXPORT_KEY.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUDIT_EXPORT_KEY"],
        message:
          `AUDIT_EXPORT_KEY must be at least 32 characters (got ${data.AUDIT_EXPORT_KEY.length}).`,
      });
    }
  }

  // ── AUDIT_PSEUDONYMIZATION_KEY ───────────────────────────────────────────
  if (
    require(
      "AUDIT_PSEUDONYMIZATION_KEY",
      data.AUDIT_PSEUDONYMIZATION_KEY,
      "AUDIT_PSEUDONYMIZATION_KEY is required in production. Omitting this key severs GDPR audit-trail pseudonym linkability for pseudonymized exports.",
    ) &&
    data.AUDIT_PSEUDONYMIZATION_KEY
  ) {
    if (data.AUDIT_PSEUDONYMIZATION_KEY.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUDIT_PSEUDONYMIZATION_KEY"],
        message:
          `AUDIT_PSEUDONYMIZATION_KEY must be at least 32 characters (got ${data.AUDIT_PSEUDONYMIZATION_KEY.length}).`,
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
    authSecret === "dev-only-venshield-session-secret-change-me"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AUTH_SESSION_SECRET"],
      message:
        "AUTH_SESSION_SECRET is set to a known weak or placeholder value. " +
        "Generate a real secret before deploying.",
    });
  }

    // ── OIDC_STATE_SECRET ────────────────────────────────────────────────────
    if (
      isPlaceholder(data.OIDC_STATE_SECRET) ||
      data.OIDC_STATE_SECRET === "dev-only-venshield-oidc-state-secret-change-me"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OIDC_STATE_SECRET"],
        message:
          "OIDC_STATE_SECRET is set to a known weak or placeholder value. " +
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
  // Skip localhost/HTTP checks when ALLOW_INSECURE_LOCALHOST=true so that
  // containerised local and CI deployments (NODE_ENV=production,
  // NEXT_PUBLIC_APP_URL=http://localhost:3000) can start without errors.
  if (data.NEXT_PUBLIC_APP_URL && data.ALLOW_INSECURE_LOCALHOST !== "true") {
    if (/localhost|127\.0\.0\.1/.test(data.NEXT_PUBLIC_APP_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_APP_URL"],
        message:
          "NEXT_PUBLIC_APP_URL must not point to localhost in production. " +
          "Set it to your public-facing domain (e.g. https://venshield.example.com).",
      });
    } else if (!data.NEXT_PUBLIC_APP_URL.startsWith("https://")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_APP_URL"],
        message:
          "NEXT_PUBLIC_APP_URL must use HTTPS in production " +
          "(e.g. https://venshield.example.com). HTTP is not permitted.",
      });
    }
  }

  // ── APP_URL ──────────────────────────────────────────────────────────────
  if (data.APP_URL && data.ALLOW_INSECURE_LOCALHOST !== "true") {
    if (/localhost|127\.0\.0\.1/.test(data.APP_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_URL"],
        message:
          "APP_URL must not point to localhost in production. " +
          "Set it to your public-facing domain (e.g. https://venshield.example.com).",
      });
    } else if (!data.APP_URL.startsWith("https://")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_URL"],
        message:
          "APP_URL must use HTTPS in production " +
          "(e.g. https://venshield.example.com). HTTP is not permitted.",
      });
    }
  }

  // ── MAIL_FORCE_ENV: only valid in development ─────────────────────────────
  if (data.MAIL_FORCE_ENV === "true") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MAIL_FORCE_ENV"],
      message:
        "MAIL_FORCE_ENV=true is a development-only escape hatch and is BLOCKED in production. " +
        "Remove it from your deployment environment.",
    });
  }

  // ── S3_ENDPOINT: must be HTTPS in production ─────────────────────────────
  if (data.S3_ENDPOINT && data.ALLOW_INSECURE_LOCALHOST !== "true") {
    if (!data.S3_ENDPOINT.startsWith("https://")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["S3_ENDPOINT"],
        message:
          "S3_ENDPOINT must use HTTPS in production. HTTP is not permitted.",
      });
    }
  }

  // ── S3 credentials: reject placeholders ──────────────────────────────────
  if (data.S3_ACCESS_KEY_ID && isPlaceholder(data.S3_ACCESS_KEY_ID)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["S3_ACCESS_KEY_ID"],
      message:
        "S3_ACCESS_KEY_ID contains a placeholder value. Use real AWS credentials.",
    });
  }
  if (data.S3_SECRET_ACCESS_KEY && isPlaceholder(data.S3_SECRET_ACCESS_KEY)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["S3_SECRET_ACCESS_KEY"],
      message:
        "S3_SECRET_ACCESS_KEY contains a placeholder value. Use real AWS credentials.",
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
║   Venshield — FATAL: Invalid or missing environment variables ║
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

/**
 * Returns a deterministic, insecure, development-only fallback value for
 * the named environment variable.  The output is a 64-char lowercase hex
 * string (SHA-256 digest) that satisfies all structural constraints while
 * being obviously unsuitable for production use.
 *
 * The same input always produces the same output, so dev databases encrypted
 * with the fallback key remain readable across server restarts.
 */
function devFallbackKey(variableName: string): string {
  return createHash("sha256")
    .update(`venshield-dev-insecure:${variableName}:do-not-use-in-production`)
    .digest("hex");
}

function validateEnv(): Env {
  // --- Phase 1: base structural parse — always required in all environments --
  const baseResult = rawEnvSchema.safeParse(process.env);

  if (!baseResult.success) {
    const msg = formatErrors(baseResult.error);
    throw new Error(
      FATAL_HEADER +
        msg +
        "\n\nNote: DATABASE_URL and other structurally required variables " +
        "are always mandatory regardless of NODE_ENV." +
        FATAL_FOOTER,
    );
  }

  const data: Env = { ...baseResult.data };

  // --- Phase 2: production — strict security checks, fatal on any failure ----
  if (data.NODE_ENV === "production") {
    const strictResult = envSchema.safeParse(process.env);
    if (!strictResult.success) {
      throw new Error(FATAL_HEADER + formatErrors(strictResult.error) + FATAL_FOOTER);
    }
    return data;
  }

  // --- Phase 3: development / test — inject deterministic fallbacks ----------
  //
  // Missing security keys never block local development.  Instead, a stable
  // SHA-256 fallback is derived from the variable name so that encrypted data
  // written in one dev session remains readable in subsequent sessions.
  //
  // ⚠  These keys are public knowledge (the derivation is in the source).
  //    They MUST NOT be used in production or staging environments.
  const fallbacksUsed: string[] = [];

  if (!data.SETTINGS_ENCRYPTION_KEY) {
    data.SETTINGS_ENCRYPTION_KEY = devFallbackKey("SETTINGS_ENCRYPTION_KEY");
    fallbacksUsed.push("SETTINGS_ENCRYPTION_KEY");
  }
  if (!data.MFA_ENCRYPTION_KEY) {
    data.MFA_ENCRYPTION_KEY = devFallbackKey("MFA_ENCRYPTION_KEY");
    fallbacksUsed.push("MFA_ENCRYPTION_KEY");
  }
  if (!data.STORAGE_ENCRYPTION_KEY) {
    data.STORAGE_ENCRYPTION_KEY = devFallbackKey("STORAGE_ENCRYPTION_KEY");
    fallbacksUsed.push("STORAGE_ENCRYPTION_KEY");
  }
  if (!data.WEBHOOK_ENCRYPTION_KEY) {
    data.WEBHOOK_ENCRYPTION_KEY = devFallbackKey("WEBHOOK_ENCRYPTION_KEY");
    fallbacksUsed.push("WEBHOOK_ENCRYPTION_KEY");
  }
  if (!data.AUDIT_BUNDLE_SECRET) {
    data.AUDIT_BUNDLE_SECRET = devFallbackKey("AUDIT_BUNDLE_SECRET");
    fallbacksUsed.push("AUDIT_BUNDLE_SECRET");
  }
  if (!data.AUDIT_EXPORT_KEY) {
    data.AUDIT_EXPORT_KEY = devFallbackKey("AUDIT_EXPORT_KEY");
    fallbacksUsed.push("AUDIT_EXPORT_KEY");
  }
  if (!data.AUDIT_PSEUDONYMIZATION_KEY) {
    (data as Record<string, unknown>).AUDIT_PSEUDONYMIZATION_KEY = devFallbackKey("AUDIT_PSEUDONYMIZATION_KEY");
    fallbacksUsed.push("AUDIT_PSEUDONYMIZATION_KEY");
  }
  if (!data.AUTH_SESSION_SECRET && !data.NEXTAUTH_SECRET) {
    data.AUTH_SESSION_SECRET = devFallbackKey("AUTH_SESSION_SECRET");
    fallbacksUsed.push("AUTH_SESSION_SECRET");
  }
  if (!data.CRON_SECRET) {
    data.CRON_SECRET = devFallbackKey("CRON_SECRET");
    fallbacksUsed.push("CRON_SECRET");
  }

  if (fallbacksUsed.length > 0) {
    console.warn(
      "\n⚠️  WARNING: Using insecure development keys for: " +
        fallbacksUsed.join(", ") +
        ".\n" +
        "   Set production keys in .env for real deployments.\n" +
        "   See .env.example for generation commands.\n",
    );
  }

  return data;
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

// ---------------------------------------------------------------------------
// Typed logical groups
//
// Import the group that matches your concern instead of the flat `env` object.
// Each group is a plain object with JSDoc on every field — editors show the
// purpose inline while you type.
//
//   import { authEnv }       from "@/lib/env";   // session & auth
//   import { encryptionEnv } from "@/lib/env";   // AES-256-GCM keys
//   import { auditEnv }      from "@/lib/env";   // audit log signing
//   import { appEnv }        from "@/lib/env";   // URL, cron, node env
//   import { aiEnv }         from "@/lib/env";   // AI provider config
//   import { mailEnv }       from "@/lib/env";   // mail delivery
// ---------------------------------------------------------------------------

/** Session signing and authentication. */
export const authEnv = {
  /**
   * Primary session HMAC-SHA256 secret.
   * Falls back to the legacy NEXTAUTH_SECRET alias if AUTH_SESSION_SECRET
   * is absent so existing deployments continue to work during migration.
   */
  sessionSecret: (env.AUTH_SESSION_SECRET ?? env.NEXTAUTH_SECRET) as string | undefined,
  /** Legacy NextAuth secret alias. Prefer AUTH_SESSION_SECRET in new code. */
  nextAuthSecret: env.NEXTAUTH_SECRET,
};

/** AES-256-GCM encryption keys for sensitive data at rest. */
export const encryptionEnv = {
  /** 64-char hex key (32 bytes) for mail-credential / settings encryption. */
  settingsKey: env.SETTINGS_ENCRYPTION_KEY,
  /** 64-char hex key (32 bytes) for TOTP / MFA secret encryption. */
  mfaKey: env.MFA_ENCRYPTION_KEY,
  /** 64-char hex key (32 bytes) for local file storage encryption. */
  storageKey: env.STORAGE_ENCRYPTION_KEY,
};

/** Audit log integrity and forensic bundle export secrets. */
export const auditEnv = {
  /** HMAC-SHA256 signing secret for forensic bundle exports (BaFin / BSI). */
  bundleSecret: env.AUDIT_BUNDLE_SECRET,
  /** HMAC key for user-ID pseudonymisation in GDPR exports (Art. 5). */
  exportKey: env.AUDIT_EXPORT_KEY,
};

/** Application-level runtime settings. */
export const appEnv = {
  /** Canonical public-facing URL, e.g. https://venshield.example.com. */
  url: env.NEXT_PUBLIC_APP_URL,
  /** Bearer token for /api/cron/* route protection. */
  cronSecret: env.CRON_SECRET,
  /** Current deployment environment ("development" | "test" | "production"). */
  nodeEnv: env.NODE_ENV,
  /** True when NODE_ENV === "production". Avoids string comparison at call sites. */
  isProd: env.NODE_ENV === "production",
};

/** AI provider configuration. */
export const aiEnv = {
  /** Active provider: "mistral" for cloud, "local" for sovereign on-prem. */
  provider: env.AI_PROVIDER,
  /** Mistral API key — required when provider === "mistral". */
  mistralApiKey: env.MISTRAL_API_KEY,
  /** Local LLM base URL, e.g. http://localhost:11434 (Ollama default). */
  localEndpoint: env.LOCAL_AI_ENDPOINT,
  /** Model identifier for the local endpoint, e.g. "mistral:7b". */
  localModel: env.LOCAL_AI_MODEL,
};

/** Mail delivery configuration. */
export const mailEnv = {
  /** Active delivery strategy: "log" | "smtp" | "resend". */
  strategy: env.MAIL_STRATEGY,
  /** Sender address / display name used in all outbound emails. */
  from: env.MAIL_FROM,
  /** Company name injected into email templates. */
  companyName: env.MAIL_COMPANY_NAME,
  /** SMTP relay hostname. */
  smtpHost: env.SMTP_HOST,
  /** SMTP relay port, parsed to a number (default: 587). */
  smtpPort: parseInt(env.SMTP_PORT, 10),
  /** SMTP authentication username. */
  smtpUser: env.SMTP_USER,
  /** SMTP authentication password. */
  smtpPassword: env.SMTP_PASSWORD,
  /** Resend API key for serverless/edge mail delivery. */
  resendApiKey: env.RESEND_API_KEY,
  /**
   * True when MAIL_FORCE_ENV=true — instructs resolveMailConfig() to skip the
   * DB lookup and read all mail settings from env vars instead.
   * Never true in production (blocked by superRefine).
   */
  forceEnv: env.MAIL_FORCE_ENV === "true",
};
