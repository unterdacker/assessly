import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { truncateIp, computeEventHash } from "@/lib/audit-sanitize";

// ---------------------------------------------------------------------------
// Action type catalogue
// Framework coverage per action:
//   AI_ACT      → EU AI Act Art. 12 / 14 (AI transparency & traceability)
//   AUTH        → ISO 27001 A.9 / SOC2 CC6 (access control events)
//   CONFIG      → ISO 27001 A.12 / SOC2 CC7 (configuration changes)
//   NIS2_DORA   → NIS2 Art. 21 / DORA Art. 9 (resilience & traceability)
//   ISO27001    → ISO 27001 A.9 / SOC2 CC6 (user lifecycle governance)
// ---------------------------------------------------------------------------

export type AuditAction =
  // --- Vendor & Assessment (NIS2_DORA) ---
  | "VENDOR_CREATED"
  | "ASSESSMENT_OVERRIDE"
  | "ASSESSMENT_UPDATED"
  | "EXTERNAL_ASSESSMENT_UPDATED"
  // --- AI pipeline (AI_ACT) ---
  | "DOCUMENT_ANALYZED"
  | "AI_GENERATION"
  | "AI_REMEDIATION_SENT"
  // --- Access code lifecycle (NIS2_DORA) ---
  | "INVITE_SENT"
  | "ACCESS_CODE_GENERATED"
  | "ACCESS_CODE_VOIDED"
  // --- Authentication (AUTH) ---
  | "MFA_ENABLED"
  | "MFA_DISABLED"
  | "MFA_FAILED_ATTEMPT"
  | "LOGIN_FAILED"
  // --- System configuration (CONFIG) ---
  | "SETTINGS_UPDATED"
  // --- Notifications (NOTIFY) ---
  | "MAIL_DELIVERY_FAILED"
  // --- User lifecycle (ISO27001_SOC2) ---
  | "USER_CREATED"
  | "USER_DELETED"
  | "USER_ROLE_CHANGED"
  // --- Fallback ---
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
  /**
   * NIS2/DORA: Correlation ID from the originating HTTP request.
   * Allows joining this event with server-side API / CDN logs.
   */
  requestId?: string | null;
  /**
   * EU AI Act Art. 14: LLM model identifier (e.g. "mistral-large-latest").
   * Required for all AI_GENERATION and AI_REMEDIATION_SENT events.
   */
  aiModelId?: string | null;
  /**
   * EU AI Act Art. 14: LLM provider name (e.g. "mistral", "local").
   */
  aiProviderName?: string | null;
  /**
   * EU AI Act Art. 12: SHA-256 hash of the AI input (prompt or source document).
   * Never store the raw text here — only the hash for integrity verification.
   */
  inputContextHash?: string | null;
  /**
   * EU AI Act Art. 14 (HITL): UserId of the human who reviewed and approved
   * the AI output. Mandatory field for HITL compliance under Art. 14.
   */
  hitlVerifiedBy?: string | null;
  /**
   * GDPR Art. 5(1)(b) — Purpose limitation: documented reason for sensitive actions
   * (e.g. USER_DELETED, SETTINGS_UPDATED). Required for GDPR accountability principle.
   */
  reason?: string | null;
};

export type LogAuditEventOptions = {
  tx?: Prisma.TransactionClient;
  captureHeaders?: boolean;
};

// ---------------------------------------------------------------------------
// Compliance Category Auto-Tagger
// ---------------------------------------------------------------------------

const AI_ACTIONS = new Set(["AI_GENERATION", "AI_REMEDIATION_SENT", "DOCUMENT_ANALYZED"]);
const AUTH_ACTIONS = new Set(["MFA_ENABLED", "MFA_DISABLED", "MFA_FAILED_ATTEMPT", "LOGIN_FAILED"]);
const CONFIG_ACTIONS = new Set(["SETTINGS_UPDATED", "MAIL_DELIVERY_FAILED"]);
const NIS2_DORA_ACTIONS = new Set([
  "VENDOR_CREATED",
  "ACCESS_CODE_GENERATED",
  "ACCESS_CODE_VOIDED",
  "INVITE_SENT",
  "ASSESSMENT_OVERRIDE",
  "ASSESSMENT_UPDATED",
  "EXTERNAL_ASSESSMENT_UPDATED",
]);
const ISO27001_ACTIONS = new Set(["USER_CREATED", "USER_DELETED", "USER_ROLE_CHANGED"]);

function deriveComplianceCategory(action: string): string {
  if (AI_ACTIONS.has(action)) return "AI_ACT";
  if (AUTH_ACTIONS.has(action)) return "AUTH";
  if (CONFIG_ACTIONS.has(action)) return "CONFIG";
  if (NIS2_DORA_ACTIONS.has(action)) return "NIS2_DORA";
  if (ISO27001_ACTIONS.has(action)) return "ISO27001_SOC2";
  return "OTHER";
}

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
 *
 * Compliance coverage:
 *   - EU AI Act Art. 12/14: Model identity, input hash, HITL field
 *   - NIS2/DORA Art. 9:     Hash-chain for tamper detection, requestId correlation
 *   - ISO 27001 A.9/SOC2:   Auth events, user lifecycle, configuration changes
 *   - GDPR Art. 5(1)(b):    Purpose field, IP truncation, no raw PII stored
 *
 * Privacy: Only opaque IDs and hashes are written. No email addresses, no
 * full IPs (last octet truncated), no free-text prompt content.
 */
export async function logAuditEvent(
  input: LogAuditEventInput,
  options: LogAuditEventOptions = {},
) {
  const client = options.tx ?? prisma;

  // --- GDPR: Truncate IP to remove personal-data status (Recital 30) ---
  let ipAddress = truncateIp(input.ipAddress) ?? null;
  let userAgent = input.userAgent ?? null;

  if (options.captureHeaders) {
    const hdrs = await extractHeadersForForensics();
    ipAddress = ipAddress || truncateIp(hdrs.ipAddress);
    userAgent = userAgent || hdrs.userAgent;
  }

  // --- Compute field-level diff ---
  const diff = computeFieldDiff(input.previousValue, input.newValue);

  // --- Auto-tag compliance category ---
  const complianceCategory = deriveComplianceCategory(input.action);

  // --- NIS2/DORA hash-chain: fetch previous log hash ---
  let previousLogHash: string | null = null;
  try {
    const lastLog = await prisma.auditLog.findFirst({
      where: { companyId: input.companyId },
      orderBy: { createdAt: "desc" },
      select: { eventHash: true, id: true },
    });
    if (lastLog) {
      // Use eventHash if available (new logs), fall back to id for pre-chain logs
      previousLogHash = lastLog.eventHash ?? lastLog.id;
    }
  } catch {
    // Hash-chain fetch failure must not block the audit write
  }

  const timestamp = input.timestamp ?? new Date();

  // --- EU AI Act / NIS2: Compute canonical event hash ---
  const eventHash = computeEventHash({
    companyId: input.companyId,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    timestamp: timestamp.toISOString(),
    previousLogHash,
  });

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
    timestamp,
    actorId: input.userId,
    metadata: {
      previousValue: diff.previous ?? null,
      newValue: diff.current ?? null,
      ...(ipAddress !== null ? { ipAddress } : {}),
      ...(userAgent !== null ? { userAgent } : {}),
      forensics: forensicsObj,
    } as Record<string, unknown>,
    createdBy: input.userId,
    // --- Compliance fields ---
    complianceCategory,
    reason: input.reason ?? null,
    requestId: input.requestId ?? null,
    previousLogHash,
    eventHash,
    aiModelId: input.aiModelId ?? null,
    aiProviderName: input.aiProviderName ?? null,
    inputContextHash: input.inputContextHash ?? null,
    hitlVerifiedBy: input.hitlVerifiedBy ?? null,
  } as Record<string, unknown>;

  // Validate JSON serializability before attempting database write
  try {
    JSON.stringify(data);
  } catch (jsonErr) {
    console.error("[logAuditEvent] JSON serialization failed for audit payload:", jsonErr);
    console.error("[logAuditEvent] Input:", input);
    return;
  }

  try {
    return (client.auditLog as any).create({ data });
  } catch (err) {
    console.error("[logAuditEvent] Audit event creation failed:", err);
    throw err;
  }
}
