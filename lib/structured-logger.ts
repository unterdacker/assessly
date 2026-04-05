/**
 * Centralized Structured Logger
 *
 * All log output is JSON to stdout/stderr for container log aggregation.
 * Every entry follows the 5-W principle:
 *   Who   → user_id, role, source_ip
 *   When  → timestamp (ISO 8601, UTC)
 *   What  → action_name, event_type
 *   Where → service_name, environment, trace_id
 *   Outcome → status, response_code
 *
 * Compliance:
 *   - NIS2 Art. 21 / DORA Art. 9: forensic hash-chaining (DB layer)
 *   - GDPR Recital 30: IP truncation at write time
 *   - ISO 27001 A.12: structured operational logging
 *   - BSI Grundschutz OPS.1.1.5: centralized log management
 */

// ---------------------------------------------------------------------------
// Audit Category Enum — maps to the Audit Trail UI "Data Type" filter
// ---------------------------------------------------------------------------

export enum AuditCategory {
  /** IAM actions: Logins, MFA, Token refreshes, Logout */
  AUTH = "AUTH",
  /** Permission changes, role assignments, 403 Forbidden attempts */
  ACCESS_CONTROL = "ACCESS_CONTROL",
  /** Changes to system settings, environment variables, feature flags */
  CONFIGURATION = "CONFIGURATION",
  /** CRUD actions on business entities (masking PII, retaining IDs) */
  DATA_OPERATIONS = "DATA_OPERATIONS",
  /** Critical errors, service restarts, middleware failures */
  SYSTEM_HEALTH = "SYSTEM_HEALTH",
}

// ---------------------------------------------------------------------------
// Log Levels
// ---------------------------------------------------------------------------

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  FATAL = "fatal",
}

// ---------------------------------------------------------------------------
// Structured Log Entry — the 5-W schema
// ---------------------------------------------------------------------------

export type StructuredLogEntry = {
  // ── When ─────────────────────────────────────────────────────────────────
  timestamp: string;

  // ── What ─────────────────────────────────────────────────────────────────
  level: LogLevel;
  event_type: AuditCategory;
  action_name: string;
  message?: string;

  // ── Who ──────────────────────────────────────────────────────────────────
  user_id?: string | null;
  role?: string | null;
  source_ip?: string | null;

  // ── Where ────────────────────────────────────────────────────────────────
  service_name: string;
  environment: string;
  trace_id?: string | null;

  // ── Outcome ──────────────────────────────────────────────────────────────
  status: "success" | "failure";
  response_code?: number | null;

  // ── Context ──────────────────────────────────────────────────────────────
  entity_type?: string | null;
  entity_id?: string | null;
  duration_ms?: number | null;
  error_name?: string | null;
  error_message?: string | null;
  details?: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SERVICE_NAME = "avra-compliance";
const ENVIRONMENT = process.env.NODE_ENV ?? "development";

// ---------------------------------------------------------------------------
// PII field scrubbing — applied at write time, not just export
// ---------------------------------------------------------------------------

const PII_KEYS = new Set([
  "email",
  "password",
  "passwordHash",
  "password_hash",
  "mfaSecret",
  "mfa_secret",
  "accessCode",
  "access_code",
  "inviteToken",
  "invite_token",
  "securityOfficerEmail",
  "dpoEmail",
  "recipientEmail",
  "recipient_email",
  "security_contact_email",
  "apiKey",
  "api_key",
  "secret",
  "token",
  "authorization",
  "cookie",
  "set-cookie",
]);

const PII_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /apikey/i,
  /api_key/i,
  /authorization/i,
];

function isPiiKey(key: string): boolean {
  if (PII_KEYS.has(key)) return true;
  return PII_PATTERNS.some((p) => p.test(key));
}

/**
 * Recursively scrubs PII from an object. Passwords, secrets, tokens,
 * and email fields are replaced with "[REDACTED]" before the log is
 * emitted. This ensures sensitive data is never persisted in the log.
 */
export function scrubPii(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[MAX_DEPTH]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.map((item) => scrubPii(item, depth + 1));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (isPiiKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = scrubPii(val, depth + 1);
      }
    }
    return result;
  }

  return String(value);
}

// ---------------------------------------------------------------------------
// Core emit — writes a single JSON line to stdout or stderr
// ---------------------------------------------------------------------------

function emit(entry: StructuredLogEntry): void {
  const scrubbed = scrubPii(entry) as StructuredLogEntry;
  const line = JSON.stringify(scrubbed);

  if (
    scrubbed.level === LogLevel.ERROR ||
    scrubbed.level === LogLevel.FATAL
  ) {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

// ---------------------------------------------------------------------------
// Public API — AuditLogger
// ---------------------------------------------------------------------------

export type AuditLogParams = {
  /** Required: the audit category for UI data-type filtering */
  category: AuditCategory;
  /** Required: the action name (e.g. "user.login", "record.deleted") */
  action: string;
  /** Optional human-readable message */
  message?: string;
  /** Log level — defaults to INFO for success, ERROR for failure */
  level?: LogLevel;
  /** Success or failure */
  status: "success" | "failure";

  // ── Who ──────────────────────────────────────────────────────────────────
  userId?: string | null;
  role?: string | null;
  sourceIp?: string | null;

  // ── Where ────────────────────────────────────────────────────────────────
  traceId?: string | null;

  // ── Outcome ──────────────────────────────────────────────────────────────
  responseCode?: number | null;

  // ── Context ──────────────────────────────────────────────────────────────
  entityType?: string | null;
  entityId?: string | null;
  durationMs?: number | null;
  error?: Error | null;
  details?: Record<string, unknown> | null;
};

/**
 * The centralized audit logger. Accepts a typed `AuditCategory` enum to
 * ensure every log entry is categorized for the Audit Trail UI filters.
 *
 * Usage:
 *   AuditLogger.log({
 *     category: AuditCategory.AUTH,
 *     action: "user.login",
 *     status: "success",
 *     userId: session.userId,
 *     role: session.role,
 *     sourceIp: truncatedIp,
 *     traceId: requestId,
 *   });
 */
export const AuditLogger = {
  log(params: AuditLogParams): void {
    const level =
      params.level ??
      (params.status === "failure" ? LogLevel.ERROR : LogLevel.INFO);

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event_type: params.category,
      action_name: params.action,
      message: params.message,
      user_id: params.userId ?? null,
      role: params.role ?? null,
      source_ip: params.sourceIp ?? null,
      service_name: SERVICE_NAME,
      environment: ENVIRONMENT,
      trace_id: params.traceId ?? null,
      status: params.status,
      response_code: params.responseCode ?? null,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      duration_ms: params.durationMs ?? null,
      error_name: params.error?.name ?? null,
      error_message: params.error?.message ?? null,
      details: params.details ? (scrubPii(params.details) as Record<string, unknown>) : null,
    };

    emit(entry);
  },

  /** Shorthand: log an AUTH event */
  auth(
    action: string,
    status: "success" | "failure",
    ctx?: Partial<Omit<AuditLogParams, "category" | "action" | "status">>,
  ): void {
    this.log({ category: AuditCategory.AUTH, action, status, ...ctx });
  },

  /** Shorthand: log an ACCESS_CONTROL event */
  accessControl(
    action: string,
    status: "success" | "failure",
    ctx?: Partial<Omit<AuditLogParams, "category" | "action" | "status">>,
  ): void {
    this.log({ category: AuditCategory.ACCESS_CONTROL, action, status, ...ctx });
  },

  /** Shorthand: log a CONFIGURATION event */
  configuration(
    action: string,
    status: "success" | "failure",
    ctx?: Partial<Omit<AuditLogParams, "category" | "action" | "status">>,
  ): void {
    this.log({ category: AuditCategory.CONFIGURATION, action, status, ...ctx });
  },

  /** Shorthand: log a DATA_OPERATIONS event */
  dataOp(
    action: string,
    status: "success" | "failure",
    ctx?: Partial<Omit<AuditLogParams, "category" | "action" | "status">>,
  ): void {
    this.log({ category: AuditCategory.DATA_OPERATIONS, action, status, ...ctx });
  },

  /** Shorthand: log a SYSTEM_HEALTH event */
  systemHealth(
    action: string,
    status: "success" | "failure",
    ctx?: Partial<Omit<AuditLogParams, "category" | "action" | "status">>,
  ): void {
    this.log({ category: AuditCategory.SYSTEM_HEALTH, action, status, ...ctx });
  },
};
