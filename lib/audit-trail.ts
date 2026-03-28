/**
 * Audit trail types and enqueue helpers. Persist these server-side in production.
 * Privacy: never attach PII (names, emails, free-text answers) — use opaque IDs only.
 */

export type VendorAssessmentAuditAction =
  | "vendor_assessment.created"
  | "vendor_assessment.updated"
  | "vendor_assessment.deleted";

export type AuditLogEntry = {
  id: string;
  action: VendorAssessmentAuditAction;
  /** Stable entity type for indexing (e.g. API routes). */
  entityType: "vendor_assessment";
  entityId: string;
  occurredAt: string;
  /** Opaque actor identifier (session subject, service account). Never an email. */
  actorId: string;
};

export type VendorAssessmentCreatedAuditInput = {
  entityId: string;
  occurredAt: string;
  actorId: string;
};

function newAuditId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `audit-${Date.now()}`;
}

export function buildVendorAssessmentCreatedAuditEntry(
  input: VendorAssessmentCreatedAuditInput,
): AuditLogEntry {
  return {
    id: newAuditId(),
    action: "vendor_assessment.created",
    entityType: "vendor_assessment",
    entityId: input.entityId,
    occurredAt: input.occurredAt,
    actorId: input.actorId,
  };
}

export type VendorAssessmentMutationAuditInput = {
  entityId: string;
  occurredAt: string;
  actorId: string;
};

/** Call when wiring update flows (no PII in metadata). */
export function buildVendorAssessmentUpdatedAuditEntry(
  input: VendorAssessmentMutationAuditInput,
): AuditLogEntry {
  return {
    id: newAuditId(),
    action: "vendor_assessment.updated",
    entityType: "vendor_assessment",
    entityId: input.entityId,
    occurredAt: input.occurredAt,
    actorId: input.actorId,
  };
}

/** Call when wiring delete / archive flows (no PII in metadata). */
export function buildVendorAssessmentDeletedAuditEntry(
  input: VendorAssessmentMutationAuditInput,
): AuditLogEntry {
  return {
    id: newAuditId(),
    action: "vendor_assessment.deleted",
    entityType: "vendor_assessment",
    entityId: input.entityId,
    occurredAt: input.occurredAt,
    actorId: input.actorId,
  };
}

/**
 * Hook for sending audit rows to your API / queue. Default is a no-op so the UI
 * stays free of console noise and accidental PII leakage.
 */
export type AuditLogSink = (entry: AuditLogEntry) => void;

let sink: AuditLogSink | null = null;

export function registerAuditLogSink(next: AuditLogSink | null): void {
  sink = next;
}

export function submitAuditLogEntry(entry: AuditLogEntry): void {
  sink?.(entry);
}
