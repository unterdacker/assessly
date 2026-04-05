import { AuditLogger, AuditCategory, LogLevel } from "@/lib/structured-logger";

/**
 * A central error logging utility that outputs structured JSON error reports.
 * Integrates with the AuditLogger for SYSTEM_HEALTH categorization.
 */
export function logErrorReport(context: string, error: unknown) {
  const err = error instanceof Error ? error : new Error(String(error));

  AuditLogger.systemHealth("system.error", "failure", {
    level: LogLevel.ERROR,
    message: `[${context}] ${err.message}`,
    error: err,
    details: {
      context,
      stack: err.stack ?? null,
      cause: err.cause ? String(err.cause) : null,
    },
  });
}

/**
 * Structured info-level log for operational events.
 */
export function logInfo(
  category: AuditCategory,
  action: string,
  message: string,
  details?: Record<string, unknown>,
) {
  AuditLogger.log({
    category,
    action,
    status: "success",
    level: LogLevel.INFO,
    message,
    details,
  });
}

/**
 * Structured warning-level log.
 */
export function logWarn(
  category: AuditCategory,
  action: string,
  message: string,
  details?: Record<string, unknown>,
) {
  AuditLogger.log({
    category,
    action,
    status: "failure",
    level: LogLevel.WARN,
    message,
    details,
  });
}
