/**
 * Privacy-First Forensic Logging Utilities
 *
 * Implements GDPR/DSGVO-compliant data handling for audit log operations:
 * - IP address truncation (GDPR Recital 30 — partial IP is not personal data)
 * - Deterministic pseudonymization of user IDs for third-party export
 * - PII field scrubbing for external auditor bundles
 *
 * Framework references:
 *   GDPR Art. 4(5) — Pseudonymisation
 *   GDPR Art. 25   — Data protection by design and by default
 *   BSI Grundschutz OPS.1.1.5 — Logging
 */

import { createHash, createHmac } from "crypto";

// ---------------------------------------------------------------------------
// IP Address Anonymization
// ---------------------------------------------------------------------------

/**
 * Truncates the last octet of an IPv4 address (192.168.1.5 → 192.168.1.xxx)
 * or the last 64 bits of an IPv6 address per GDPR Recital 30.
 * Returns the original string unchanged if it cannot be parsed.
 */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;

  const trimmed = ip.trim();

  // IPv4
  const ipv4 = trimmed.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (ipv4) {
    return `${ipv4[1]}.xxx`;
  }

  // IPv6: zero out last 4 groups (64 bits)
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length === 8) {
      const anonymized = [...parts.slice(0, 4), "xxxx", "xxxx", "xxxx", "xxxx"];
      return anonymized.join(":");
    }
    // Cannot reliably parse compressed IPv6 — return a mask indicator
    return "[ipv6-masked]";
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// Deterministic Pseudonymization
// ---------------------------------------------------------------------------

/**
 * Returns a deterministic pseudonym for a user ID using HMAC-SHA256.
 * The salt prevents reverse lookups while keeping the output consistent
 * across multiple export runs with the same key.
 *
 * For internal display, pass `mode: 'internal'` to skip hashing.
 * For external auditor exports, use `mode: 'export'`.
 */
export function pseudonymizeUserId(
  userId: string | null | undefined,
  mode: "internal" | "export",
  exportKey?: string,
): string {
  if (!userId) return "system";
  if (mode === "internal") return userId;

  const key = exportKey || process.env.AUDIT_EXPORT_KEY || "avra-audit-pseudonymize";
  const hmac = createHmac("sha256", key).update(userId).digest("hex");
  // Return a short, readable prefix to aid correlation without revealing identity
  return `uid-${hmac.slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// Content Hashing (EU AI Act Art. 12)
// ---------------------------------------------------------------------------

/**
 * Computes a SHA-256 hash of the provided content string.
 * Use this to record the integrity fingerprint of AI inputs (prompts,
 * source documents) without storing the content itself.
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Computes the canonical event hash for a single audit log entry.
 * This is used to build and verify the NIS2/DORA hash-chain.
 *
 * The canonical form includes all immutable fields (no `updatedAt`).
 * Re-computing this from the stored fields lets auditors verify integrity.
 */
export function computeEventHash(fields: {
  companyId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string; // ISO-8601
  previousLogHash: string | null;
}): string {
  const canonical = [
    fields.companyId,
    fields.userId,
    fields.action,
    fields.entityType,
    fields.entityId,
    fields.timestamp,
    fields.previousLogHash ?? "GENESIS",
  ].join("|");

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// PII Field Scrubbing
// ---------------------------------------------------------------------------

/** Fields that are considered PII and must be scrubbed in export mode. */
const PII_FIELD_NAMES = new Set([
  "email",
  "passwordHash",
  "mfaSecret",
  "accessCode",
  "inviteToken",
  "securityOfficerEmail",
  "dpoEmail",
  "recipientEmail",
  "recipient_email",
  "security_contact_email",
]);

/**
 * Recursively strips PII fields from a JSON-serializable object.
 * Replaces PII values with "[REDACTED]" for export compliance.
 */
export function scrubPiiFields(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map(scrubPiiFields);
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (PII_FIELD_NAMES.has(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = scrubPiiFields(val);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Forensic Bundle Signing
// ---------------------------------------------------------------------------

/**
 * Produces an HMAC-SHA256 signature over the canonical bundle content.
 * The signature allows the receiving auditor to verify that the bundle
 * has not been tampered with in transit.
 */
export function signBundle(canonicalContent: string): string {
  const secret =
    process.env.AUDIT_BUNDLE_SECRET ||
    process.env.CRON_SECRET ||
    "avra-forensic-bundle-unsigned";

  return createHmac("sha256", secret).update(canonicalContent, "utf8").digest("hex");
}
