#!/usr/bin/env node
/**
 * Venshield — Build-time environment variable validator
 *
 * Runs before `next build` via the prebuild script:
 *   "prebuild": "npm run ready-check && npm run env:validate && ..."
 *
 * Behaviour mirrors lib/env.ts:
 *   production  — any missing or low-entropy security variable causes a
 *                 non-zero exit that aborts the build immediately.
 *   development — prints warnings but exits 0 so local dev is unblocked.
 *
 * This script is intentionally self-contained (no TypeScript, no server-only
 * import) so it can run in any Node.js 20 + environment without a compile
 * step while still using the same Zod version as the application.
 *
 * Usage:
 *   node ./scripts/env-check.mjs
 *   NODE_ENV=production node ./scripts/env-check.mjs   # dry-run prod checks
 */

import { z } from "zod";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

// ---------------------------------------------------------------------------
// Load .env file and merge with process.env
// File variables are lower-priority — real environment always wins.
// ---------------------------------------------------------------------------
function parseDotEnv(content) {
  return content.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return acc;
    const sep = trimmed.indexOf("=");
    if (sep < 0) return acc;
    const key = trimmed.slice(0, sep).trim();
    const raw = trimmed.slice(sep + 1).trim();
    acc[key] = raw.replace(/^['"]/, "").replace(/['"]$/, "");
    return acc;
  }, {});
}

async function loadEnv() {
  let fileVars = {};
  try {
    const content = await fs.readFile(path.join(ROOT, ".env"), "utf8");
    fileVars = parseDotEnv(content);
  } catch {
    // .env is optional — CI/CD environments inject variables directly.
  }
  return { ...fileVars, ...process.env };
}

// ---------------------------------------------------------------------------
// Dev fallback key derivation
//
// Mirrors lib/env.ts devFallbackKey() — keep the derivation string in sync.
// ---------------------------------------------------------------------------
function devFallbackKey(variableName) {
  return createHash("sha256")
    .update(`venshield-dev-insecure:${variableName}:do-not-use-in-production`)
    .digest("hex");
}

// Security keys that receive deterministic dev fallbacks when absent.
const DEV_SECURITY_KEYS = [
  "SETTINGS_ENCRYPTION_KEY",
  "MFA_ENCRYPTION_KEY",
  "AUDIT_BUNDLE_SECRET",
  "AUTH_SESSION_SECRET",
  "CRON_SECRET",
];

// ---------------------------------------------------------------------------
// Validation schema  (mirrors lib/env.ts — keep both files in sync)
// ---------------------------------------------------------------------------
const PLACEHOLDER_RE =
  /change[_-]?me|dev[_-]only|placeholder|your_\w|example_|^CHANGE_ME/i;

// When true, localhost URL checks are skipped for containerised local/CI runs.
const ALLOW_INSECURE_LOCALHOST =
  process.env.ALLOW_INSECURE_LOCALHOST === "true";
const HEX_64_RE = /^[0-9a-f]{64}$/i;

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // DATABASE_URL is always required — structural failure in all envs.
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL must not be empty")
      .refine(
        (v) => /^(postgres(?:ql)?):\/\//.test(v),
        "DATABASE_URL must begin with postgresql:// or postgres://",
      ),

    // Security secrets — validated strictly in production only (superRefine).
    AUTH_SESSION_SECRET: z.string().optional(),
    NEXTAUTH_SECRET: z.string().optional(),
    SETTINGS_ENCRYPTION_KEY: z.string().optional(),
    MFA_ENCRYPTION_KEY: z.string().optional(),
    AUDIT_BUNDLE_SECRET: z.string().optional(),
    AUDIT_EXPORT_KEY: z.string().optional(),
    CRON_SECRET: z.string().optional(),

    NEXT_PUBLIC_APP_URL: z
      .string()
      .url("NEXT_PUBLIC_APP_URL must be a valid URL")
      .default("http://localhost:3000"),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== "production") return;

    /** Adds a "custom" ZodIssue and returns false if value is falsy. */
    function requireField(field, value, message) {
      if (!value) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
        return false;
      }
      return true;
    }

    // ── SETTINGS_ENCRYPTION_KEY ──────────────────────────────────────────────
    if (
      requireField(
        "SETTINGS_ENCRYPTION_KEY",
        data.SETTINGS_ENCRYPTION_KEY,
        'SETTINGS_ENCRYPTION_KEY is required in production. ' +
          'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      ) &&
      data.SETTINGS_ENCRYPTION_KEY
    ) {
      if (!HEX_64_RE.test(data.SETTINGS_ENCRYPTION_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SETTINGS_ENCRYPTION_KEY"],
          message:
            "SETTINGS_ENCRYPTION_KEY must be exactly 64 hex characters " +
            "(32 bytes / 256 bits). Re-generate with the command above.",
        });
      } else if (PLACEHOLDER_RE.test(data.SETTINGS_ENCRYPTION_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SETTINGS_ENCRYPTION_KEY"],
          message:
            "SETTINGS_ENCRYPTION_KEY appears to be a placeholder. " +
            "Generate a real cryptographic key before deploying.",
        });
      }
    }

    // ── MFA_ENCRYPTION_KEY ───────────────────────────────────────────────────
    if (
      requireField(
        "MFA_ENCRYPTION_KEY",
        data.MFA_ENCRYPTION_KEY,
        'MFA_ENCRYPTION_KEY is required in production. ' +
          'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      ) &&
      data.MFA_ENCRYPTION_KEY
    ) {
      if (!HEX_64_RE.test(data.MFA_ENCRYPTION_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["MFA_ENCRYPTION_KEY"],
          message:
            "MFA_ENCRYPTION_KEY must be exactly 64 hex characters " +
            "(32 bytes / 256 bits). Re-generate with the command above.",
        });
      } else if (PLACEHOLDER_RE.test(data.MFA_ENCRYPTION_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["MFA_ENCRYPTION_KEY"],
          message:
            "MFA_ENCRYPTION_KEY appears to be a placeholder. " +
            "Generate a real cryptographic key before deploying.",
        });
      }
    }

    // ── AUDIT_BUNDLE_SECRET ──────────────────────────────────────────────────
    if (
      requireField(
        "AUDIT_BUNDLE_SECRET",
        data.AUDIT_BUNDLE_SECRET,
        'AUDIT_BUNDLE_SECRET is required in production. ' +
          'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      ) &&
      data.AUDIT_BUNDLE_SECRET
    ) {
      if (data.AUDIT_BUNDLE_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["AUDIT_BUNDLE_SECRET"],
          message:
            `AUDIT_BUNDLE_SECRET must be at least 32 characters ` +
            `(got ${data.AUDIT_BUNDLE_SECRET.length}).`,
        });
      } else if (PLACEHOLDER_RE.test(data.AUDIT_BUNDLE_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["AUDIT_BUNDLE_SECRET"],
          message:
            "AUDIT_BUNDLE_SECRET appears to be a placeholder. " +
            "Generate a real signing secret before deploying.",
        });
      }
    }

    // ── AUTH_SESSION_SECRET ──────────────────────────────────────────────────
    const authSecret = data.AUTH_SESSION_SECRET ?? data.NEXTAUTH_SECRET;
    if (!authSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_SESSION_SECRET"],
        message:
          'AUTH_SESSION_SECRET is required in production. ' +
          'Generate: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
      });
    } else if (authSecret.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_SESSION_SECRET"],
        message:
          `AUTH_SESSION_SECRET must be at least 32 characters ` +
          `(got ${authSecret.length}).`,
      });
    } else if (
      PLACEHOLDER_RE.test(authSecret) ||
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

    // ── CRON_SECRET ──────────────────────────────────────────────────────────
    if (
      requireField(
        "CRON_SECRET",
        data.CRON_SECRET,
        'CRON_SECRET is required in production (cron endpoints are fail-closed without it). ' +
          'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      ) &&
      data.CRON_SECRET
    ) {
      if (data.CRON_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CRON_SECRET"],
          message:
            `CRON_SECRET must be at least 32 characters ` +
            `(got ${data.CRON_SECRET.length}).`,
        });
      }
    }

    // ── NEXT_PUBLIC_APP_URL ──────────────────────────────────────────────────
    // Skip localhost/HTTP checks when ALLOW_INSECURE_LOCALHOST=true so that
    // containerised local and CI deployments (NODE_ENV=production,
    // NEXT_PUBLIC_APP_URL=http://localhost:3000) can start without errors.
    if (data.NEXT_PUBLIC_APP_URL && !ALLOW_INSECURE_LOCALHOST) {
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

    // ── AUDIT_EXPORT_KEY length (optional but validated if present) ──────────
    if (data.AUDIT_EXPORT_KEY && data.AUDIT_EXPORT_KEY.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUDIT_EXPORT_KEY"],
        message:
          `AUDIT_EXPORT_KEY must be at least 32 characters if set ` +
          `(got ${data.AUDIT_EXPORT_KEY.length}).`,
      });
    }
  });

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";

function formatIssues(issues) {
  return issues
    .map((issue) => {
      const field = issue.path.length > 0 ? String(issue.path[0]) : "root";
      return `  ${RED}•${RESET} ${BOLD}${field}${RESET}: ${issue.message}`;
    })
    .join("\n");
}

const FATAL_HEADER = `
${RED}${BOLD}╔══════════════════════════════════════════════════════════════╗
║   Venshield — env-check: FATAL environment configuration errors   ║
╚══════════════════════════════════════════════════════════════╝${RESET}

The following errors must be resolved before the build can continue.
See ${BOLD}.env.example${RESET} for documentation and key-generation commands:

`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const raw = await loadEnv();
  const result = schema.safeParse(raw);

  const isProd = (raw.NODE_ENV ?? "development") === "production";
  const tag = isProd
    ? `${RED}[env-check:prod]${RESET}`
    : `${YELLOW}[env-check:dev]${RESET}`;

  if (!result.success) {
    const formatted = formatIssues(result.error.issues);

    if (isProd) {
      // Fatal — abort the build.
      process.stderr.write(
        FATAL_HEADER +
          formatted +
          `\n\n${BOLD}Build aborted.${RESET} Resolve the errors above and re-run ${BOLD}npm run build${RESET}.\n\n`,
      );
      process.exit(1);
    }

    // Development/test — schema error (e.g. bad DATABASE_URL format), warn and continue.
    process.stderr.write(
      `\n${YELLOW}${BOLD}⚠  Venshield ${tag} — environment warnings` +
        ` (these are fatal errors in production):${RESET}\n\n` +
        formatted +
        `\n\n  See ${BOLD}.env.example${RESET} for documentation and key-generation commands.\n\n`,
    );
  }

  // In dev/test: detect missing security keys and show the fallback notice.
  if (!isProd) {
    const missing = DEV_SECURITY_KEYS.filter((key) => {
      if (key === "AUTH_SESSION_SECRET") {
        return !raw["AUTH_SESSION_SECRET"] && !raw["NEXTAUTH_SECRET"];
      }
      return !raw[key];
    });

    if (missing.length > 0) {
      process.stderr.write(
        `\n${YELLOW}${BOLD}⚠️  WARNING: Using insecure development fallback keys for:${RESET}\n` +
          missing.map((k) => `  ${YELLOW}•${RESET} ${BOLD}${k}${RESET}  →  devFallbackKey("${k}")`).join("\n") +
          `\n\n  ${BOLD}Set production keys in .env for real deployments.${RESET}\n` +
          `  See ${BOLD}.env.example${RESET} for generation commands.\n\n`,
      );
    } else {
      console.log(`${GREEN}✓${RESET}  ${tag} All security keys are explicitly configured.`);
    }

    if (!result.success) return; // already warned above
    console.log(`${GREEN}✓${RESET}  ${tag} Environment variables validated successfully.`);
    return;
  }

  console.log(`${GREEN}✓${RESET}  ${tag} Environment variables validated successfully.`);
}

main().catch((err) => {
  process.stderr.write(`[env-check] Unexpected error: ${err}\n`);
  process.exit(1);
});
