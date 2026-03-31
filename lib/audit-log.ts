import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export type AuditAction =
  | "VENDOR_CREATED"
  | "ASSESSMENT_OVERRIDE"
  | "ASSESSMENT_UPDATED"
  | "EXTERNAL_ASSESSMENT_UPDATED"
  | "SETTINGS_UPDATED"
  | "DOCUMENT_ANALYZED"
  | "AI_GENERATION"
  | "AI_REMEDIATION_SENT"
  | "INVITE_SENT"
  | "ACCESS_CODE_GENERATED"
  | "ACCESS_CODE_VOIDED"
  | "MFA_ENABLED"
  | "MFA_DISABLED"
  | "MFA_FAILED_ATTEMPT"
  | "OTHER";

export type LogAuditEventInput = {
  companyId: string;
  userId: string;
  action: AuditAction | string;
  entityType: string;
  entityId: string;
  previousValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  timestamp?: Date;
  /** Optional IP address and user agent for forensics */
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type LogAuditEventOptions = {
  tx?: Prisma.TransactionClient;
  captureHeaders?: boolean;
};

/**
 * Extract field-level differences from two objects, omitting unchanged fields.
 * For large objects, only include fields that actually changed.
 */
export function computeFieldDiff(
  previous: unknown,
  current: unknown,
): { previous: unknown; current: unknown } {
  if (
    typeof previous !== "object" ||
    typeof current !== "object" ||
    previous === null ||
    current === null ||
    Array.isArray(previous) ||
    Array.isArray(current)
  ) {
    return { previous, current };
  }

  const prevObj = previous as Record<string, unknown>;
  const currObj = current as Record<string, unknown>;
  const changedFields: Set<string> = new Set();

  // Detect changed field names
  const allKeys = new Set([...Object.keys(prevObj), ...Object.keys(currObj)]);
  for (const key of allKeys) {
    const prevVal = prevObj[key];
    const currVal = currObj[key];
    if (JSON.stringify(prevVal) !== JSON.stringify(currVal)) {
      changedFields.add(key);
    }
  }

  // Return only changed fields
  const diffPrev: Record<string, unknown> = {};
  const diffCurr: Record<string, unknown> = {};

  for (const field of changedFields) {
    if (field in prevObj) diffPrev[field] = prevObj[field];
    if (field in currObj) diffCurr[field] = currObj[field];
  }

  return {
    previous: Object.keys(diffPrev).length > 0 ? diffPrev : null,
    current: Object.keys(diffCurr).length > 0 ? diffCurr : null,
  };
}

/**
 * Attempt to extract client IP and User-Agent from request headers.
 * Essential for NIS2 forensic traceability.
 * Returns null gracefully if headers are not available (e.g., in transaction contexts).
 */
async function extractHeadersForForensics(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const headerStore = await headers();
    const ipAddress =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerStore.get("x-real-ip") ||
      null;
    const userAgent = headerStore.get("user-agent") || null;
    return { ipAddress, userAgent };
  } catch (err) {
    // Headers not available in current context (e.g., transaction, API route)
    // Return nulls gracefully
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Centralized audit logger for server actions and API handlers.
 * Captures detailed state changes, headers for forensics, and auto-diffs large payloads.
 * Privacy: Only attach opaque IDs; never log PII like email addresses.
 * Error handling: Returns early if payload serialization fails, logs error to console.
 */
export async function logAuditEvent(
  input: LogAuditEventInput,
  options: LogAuditEventOptions = {},
) {
  const client = options.tx ?? prisma;

  // Auto-capture headers for forensics if not provided
  let ipAddress = input.ipAddress ?? null;
  let userAgent = input.userAgent ?? null;

  if (options.captureHeaders) {
    const headers = await extractHeadersForForensics();
    ipAddress = ipAddress || headers.ipAddress;
    userAgent = userAgent || headers.userAgent;
  }

  // Compute field-level diff to exclude unchanged fields for compact logging
  const diff = computeFieldDiff(input.previousValue, input.newValue);

  // Build metadata object with defensive null handling
  const forensicsObj: Record<string, unknown> = {
    capturedAt: new Date().toISOString(),
  };
  if (ipAddress) forensicsObj.ipAddress = ipAddress;
  if (userAgent) forensicsObj.userAgent = userAgent;

  const data = {
    companyId: input.companyId,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    previousValue: diff.previous ?? null,
    newValue: diff.current ?? null,
    timestamp: input.timestamp ?? new Date(),
    // Legacy fields populated for backward compatibility.
    actorId: input.userId,
    metadata: {
      previousValue: diff.previous ?? null,
      newValue: diff.current ?? null,
      ...(ipAddress !== null ? { ipAddress } : {}),
      ...(userAgent !== null ? { userAgent } : {}),
      forensics: forensicsObj,
    } as Record<string, unknown>,
    createdBy: input.userId,
  } as Record<string, unknown>;

  // Validate JSON serializability before attempting database write
  try {
    JSON.stringify(data);
  } catch (jsonErr) {
    console.error("[logAuditEvent] JSON serialization failed for audit payload:", jsonErr);
    console.error("[logAuditEvent] Input:", input);
    // Don't throw; caller handles this gracefully
    return;
  }

  try {
    return (client.auditLog as any).create({ data });
  } catch (err) {
    // Log the error but don't crash the parent action
    console.error("[logAuditEvent] Audit event creation failed:", err);
    // Re-throw so calling action can handle gracefully with try-catch
    throw err;
  }
}
