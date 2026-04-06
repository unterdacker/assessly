import {
  computeIncidentRetentionUntil,
  scrubPiiFields,
  truncateIp,
} from "@/lib/audit-sanitize";

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
  /** AI model invocations, LLM response validation, and compliance inference events (EU AI Act / NIS2 Art. 21) */
  AI_ACT = "AI_ACT",
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
  retention_priority?: "HIGH" | "MEDIUM" | "LOW";
  retention_until?: string | null;
  legal_basis?: "LEGAL_OBLIGATION" | "LEGITIMATE_INTEREST";
  security_incident?: boolean;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SERVICE_NAME = "avra-compliance";
const ENVIRONMENT = process.env.NODE_ENV ?? "development";

// ---------------------------------------------------------------------------
// PII field scrubbing — applied at write time, not just export
// ---------------------------------------------------------------------------

/**
 * Recursively scrubs PII from an object. Passwords, secrets, tokens,
 * and email fields are replaced with "[REDACTED]" before the log is
 * emitted. This ensures sensitive data is never persisted in the log.
 */
export function scrubPii(value: unknown): unknown {
  return scrubPiiFields(value);
}

function getLegalBasis(category: AuditCategory): "LEGAL_OBLIGATION" | "LEGITIMATE_INTEREST" {
  switch (category) {
    case AuditCategory.AUTH:
    case AuditCategory.ACCESS_CONTROL:
    case AuditCategory.SYSTEM_HEALTH:
      return "LEGITIMATE_INTEREST";
    case AuditCategory.CONFIGURATION:
    case AuditCategory.DATA_OPERATIONS:
      return "LEGAL_OBLIGATION";
    case AuditCategory.AI_ACT:
      return "LEGAL_OBLIGATION";
    default:
      return "LEGITIMATE_INTEREST";
  }
}

function getRetentionPolicy(
  category: AuditCategory,
  securityIncident: boolean,
): { priority: "HIGH" | "MEDIUM" | "LOW"; retentionUntil: Date } {
  const now = new Date();

  if (securityIncident) {
    return {
      priority: "HIGH",
      retentionUntil: computeIncidentRetentionUntil(now),
    };
  }

  if (category === AuditCategory.AUTH || category === AuditCategory.ACCESS_CONTROL) {
    return {
      priority: "HIGH",
      retentionUntil: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
    };
  }

  if (category === AuditCategory.SYSTEM_HEALTH) {
    return {
      priority: "LOW",
      retentionUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  if (category === AuditCategory.AI_ACT) {
    return {
      priority: "MEDIUM",
      retentionUntil: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
    };
  }

  return {
    priority: "MEDIUM",
    retentionUntil: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
  };
}

type SanitizedAuditPayload = Omit<AuditLogParams, "sourceIp" | "details"> & {
  sourceIp?: string | null;
  details?: Record<string, unknown> | null;
};

const PrivacyProxy = {
  sanitize(params: AuditLogParams): SanitizedAuditPayload {
    return {
      ...params,
      sourceIp: truncateIp(params.sourceIp, {
        securityIncident: Boolean(params.securityIncident),
      }),
      details: params.details ? (scrubPii(params.details) as Record<string, unknown>) : null,
    };
  },
};

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
  securityIncident?: boolean;
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
    const sanitized = PrivacyProxy.sanitize(params);
    const level =
      sanitized.level ??
      (sanitized.status === "failure" ? LogLevel.ERROR : LogLevel.INFO);

    const retention = getRetentionPolicy(
      sanitized.category,
      Boolean(sanitized.securityIncident),
    );

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event_type: sanitized.category,
      action_name: sanitized.action,
      message: sanitized.message,
      user_id: sanitized.userId ?? null,
      role: sanitized.role ?? null,
      source_ip: sanitized.sourceIp ?? null,
      service_name: SERVICE_NAME,
      environment: ENVIRONMENT,
      trace_id: sanitized.traceId ?? null,
      status: sanitized.status,
      response_code: sanitized.responseCode ?? null,
      entity_type: sanitized.entityType ?? null,
      entity_id: sanitized.entityId ?? null,
      duration_ms: sanitized.durationMs ?? null,
      error_name: sanitized.error?.name ?? null,
      error_message: sanitized.error?.message ?? null,
      details: sanitized.details ?? null,
      retention_priority: retention.priority,
      retention_until: retention.retentionUntil.toISOString(),
      legal_basis: getLegalBasis(sanitized.category),
      security_incident: Boolean(sanitized.securityIncident),
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

  /** Shorthand: log an AI_ACT event */
  aiAct(
    action: string,
    status: "success" | "failure",
    ctx?: Partial<Omit<AuditLogParams, "category" | "action" | "status">>,
  ): void {
    this.log({ category: AuditCategory.AI_ACT, action, status, ...ctx });
  },
};
