import { AuditLogger, AuditCategory, LogLevel } from "@/lib/structured-logger";

function sanitizeErrorMessage(msg: string): string {
  return msg
    // Strip user:pass@ style URL credentials
    .replace(/([\w+.-]+:\/\/[^/:@\s]+:)[^@\s]+(@)/g, "$1[REDACTED]$2")
    // Strip ?password=value or &token=value style query param credentials
    .replace(/([?&](password|secret|token|apikey|api_key|pwd)=)[^&\s]+/gi, "$1[REDACTED]");
}

/**
 * A central error logging utility that outputs structured JSON error reports.
 * Integrates with the AuditLogger for SYSTEM_HEALTH categorization.
 */
export function logErrorReport(context: string, error: unknown) {
  const err = error instanceof Error ? error : new Error(String(error));
  const sanitizedMessage = sanitizeErrorMessage(err.message);
  const sanitizedStack = err.stack ? sanitizeErrorMessage(err.stack) : null;

  AuditLogger.systemHealth("system.error", "failure", {
    level: LogLevel.ERROR,
    message: `[${context}] ${sanitizedMessage}`,
    error: {
      name: err.name,
      message: sanitizedMessage,
      stack: sanitizedStack ?? undefined,
    } as Error,
    details: {
      context,
      stack: sanitizedStack,
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
