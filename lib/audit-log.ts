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
 *
 * ── Hash-chain atomicity guarantee ───────────────────────────────────────────
 *
 * SECURITY INVARIANT: A log entry MUST NEVER be persisted without being
 * linked to the correct SHA-256 hash of the previous entry in the company's
 * chain. Violating this invariant would allow an attacker (or a bug) to
 * silently insert rows mid-chain without detection.
 *
 * Enforcement mechanism (see `writeChainEntry` below):
 *   1. A PostgreSQL advisory lock (pg_advisory_xact_lock) is acquired at the
 *      start of the transaction, keyed on (ADVISORY_LOCK_NAMESPACE, companyId).
 *      This serialises all concurrent chain writes for the same company — no
 *      two callers can race through findFirst + create simultaneously.
 *   2. The SELECT of the previous eventHash and the INSERT of the new row
 *      execute inside the SAME database transaction, so no other writer can
 *      sneak in a row between them.
 *   3. The advisory lock is transaction-scoped: PostgreSQL releases it
 *      automatically on commit or rollback, with no manual UNLOCK step.
 *
 * Auditor note: To verify the chain, walk the AuditLog table for a company
 * ordered by `createdAt ASC`.  For each row, recompute `eventHash` from the
 * seven canonical fields (see computeEventHash in audit-sanitize.ts) and
 * confirm it matches `previousLogHash` in the next row.
 */

// ---------------------------------------------------------------------------
// Advisory lock namespace
// ---------------------------------------------------------------------------

/**
 * Application-specific namespace integer for pg_advisory_xact_lock.
 *
 * PostgreSQL advisory locks take either one bigint key or two int4 keys.
 * Using the two-argument form (namespace, derived key) avoids collisions with
 * advisory locks used by other subsystems in the same database.
 *
 * 7769 was chosen arbitrarily for AVRA; document it here so operators can
 * identify it in pg_locks:
 *   SELECT pid, granted, classid, objid
 *   FROM pg_locks WHERE locktype = 'advisory' AND classid = 7769;
 */
const ADVISORY_LOCK_NAMESPACE = 7769;

export async function logAuditEvent(
  input: LogAuditEventInput,
  options: LogAuditEventOptions = {},
): Promise<unknown> {
  // ── Pre-flight: work that can safely run before the transaction ─────────────

  // GDPR Recital 30: Truncate IP so it no longer qualifies as personal data.
  let ipAddress = truncateIp(input.ipAddress) ?? null;
  let userAgent = input.userAgent ?? null;

  if (options.captureHeaders) {
    const hdrs = await extractHeadersForForensics();
    // Only overwrite if the caller did not supply values directly.
    ipAddress = ipAddress ?? truncateIp(hdrs.ipAddress);
    userAgent = userAgent ?? hdrs.userAgent;
  }

  // Compute the structural diff outside the transaction — pure CPU work.
  const diff = computeFieldDiff(input.previousValue, input.newValue);
  // Auto-derive compliance category from the action name.
  const complianceCategory = deriveComplianceCategory(input.action);
  // Fix the timestamp before the transaction; all derived values use this.
  const timestamp = input.timestamp ?? new Date();

  const forensicsObj: Record<string, unknown> = { capturedAt: new Date().toISOString() };
  if (ipAddress) forensicsObj.ipAddress = ipAddress;
  if (userAgent) forensicsObj.userAgent = userAgent;

  // ── Atomic hash-chain write ─────────────────────────────────────────────────
  //
  // writeChainEntry encapsulates the three-step atomic operation that enforces
  // the hash-chain invariant.  It MUST be called inside a database transaction.
  //
  // Step 1 — Advisory lock: prevents concurrent chain writers for this company.
  // Step 2 — Read previous hash: reads the chain tail *inside* the locked tx.
  // Step 3 — Compute + insert: hashes the new entry and writes it atomically.
  const writeChainEntry = async (tx: Prisma.TransactionClient): Promise<unknown> => {
    // ── Step 1: Serialise concurrent chain writes via an advisory lock ──────
    //
    // pg_advisory_xact_lock(ns int4, key int4) blocks until the lock is free.
    // hashtext(text) → int32: derives a deterministic key from the companyId.
    // The lock is automatically released when the surrounding transaction ends.
    //
    // Auditor note: While this lock is held, no other session can write an
    // audit row for the same company.  This guarantees that the SELECT in
    // Step 2 returns the true chain tail at the moment of INSERT.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE}, hashtext(${input.companyId}))`;

    // ── Step 2: Read the chain tail inside the locked transaction ───────────
    //
    // Because the advisory lock is held, no concurrent writer can insert a
    // new row between this SELECT and the INSERT below.
    //
    // We select only `eventHash` and deliberately ignore `id`.  The CUID `id`
    // is NOT a hash and MUST NOT be used as previousLogHash — doing so would
    // break the chain's mathematical verification property.
    const lastLog = await tx.auditLog.findFirst({
      where: { companyId: input.companyId },
      orderBy: { createdAt: "desc" },
      select: { eventHash: true },
    });

    // If the most recent row has a null eventHash (written before hash-chain
    // support was added), we start a fresh chain segment from this entry.
    // This is explicitly documented in previousLogHash as null (= GENESIS).
    // The pre-chain rows remain accessible by their own fields; the chain
    // audit simply begins from the first row that carries an eventHash.
    const previousLogHash: string | null = lastLog?.eventHash ?? null;

    // ── Step 3: Compute the canonical event hash and insert the row ─────────
    //
    // computeEventHash will throw if any field contains the separator character,
    // ensuring the canonical form is always unambiguous.
    const eventHash = computeEventHash({
      companyId: input.companyId,
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      timestamp: timestamp.toISOString(),
      previousLogHash,
    });

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

    // Validate JSON serializability before the write.
    // A non-serializable payload would cause an opaque database error later;
    // throwing here surfaces a clear error message with the offending input.
    try {
      JSON.stringify(data);
    } catch (jsonErr) {
      throw new Error(
        `[logAuditEvent] Audit payload is not JSON-serializable: ${jsonErr}. Input action: ${input.action}`,
      );
    }

    return (tx.auditLog as any).create({ data });
  };

  // ── Execute in the caller's transaction or a new one ───────────────────────
  //
  // If options.tx is provided, the caller already owns a transaction and is
  // responsible for its commit/rollback.  We participate by acquiring the
  // advisory lock within that transaction, so the chain invariant holds for
  // the entire caller-managed unit of work.
  //
  // If no transaction is provided, we open a dedicated one.  The default
  // isolation level (Read Committed) is sufficient because the advisory lock
  // provides the necessary serialisation guarantee.
  if (options.tx) {
    return writeChainEntry(options.tx);
  }
  return prisma.$transaction(writeChainEntry);
}
