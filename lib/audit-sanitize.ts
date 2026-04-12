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

type TruncateIpOptions = {
  securityIncident?: boolean;
};

// ---------------------------------------------------------------------------
// IP Address Anonymization
// ---------------------------------------------------------------------------

/**
 * Truncates the last octet of an IPv4 address (192.168.1.5 → 192.168.1.xxx)
 * or the last 64 bits of an IPv6 address per GDPR Recital 30.
 * Returns the original string unchanged if it cannot be parsed.
 */
export function truncateIp(
  ip: string | null | undefined,
  options: TruncateIpOptions = {},
): string | null {
  if (!ip) return null;

  const trimmed = ip.trim();
  if (!trimmed) return trimmed;

  if (options.securityIncident) {
    return trimmed;
  }

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

/**
 * For high-risk security incidents, use a short retention horizon for full-IP data.
 */
export function computeIncidentRetentionUntil(now = new Date()): Date {
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
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

  const key = exportKey || process.env.AUDIT_EXPORT_KEY || "assessly-audit-pseudonymize";
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

// ---------------------------------------------------------------------------
// Forensic Hash-Chain — canonical event hash
// NIS2 Art. 21 / DORA Art. 9 / BSI Grundschutz OPS.1.1.5
// ---------------------------------------------------------------------------

/**
 * The separator character used to delimit fields in the canonical event string.
 *
 * INVARIANT: No field value in the canonical form may contain this character.
 * All of the fields passed to computeEventHash are either:
 *   - Database auto-generated IDs (CUID / UUID  — no pipe character)
 *   - Fixed enum values defined in AuditAction   — no pipe character
 *   - ISO-8601 timestamps                        — no pipe character
 *   - The sentinel literal "GENESIS"             — no pipe character
 *   - A previous eventHash (hex string)          — no pipe character
 *
 * If a caller ever supplies a value containing this separator, computeEventHash
 * raises an Error rather than silently producing an ambiguous hash.
 */
const CANONICAL_SEPARATOR = "|";

/**
 * Throws if any string in `values` contains the canonical separator.
 * Called at the start of computeEventHash to enforce the collision-free
 * invariant before hashing.
 *
 * Auditor note: This guard turns a theoretical ambiguity into a hard failure.
 * If you encounter this error, a field value was supplied that could allow
 * two distinct inputs to map to the same canonical string — which would break
 * the chain's integrity property.
 */
function assertNoPipeInFields(values: string[]): void {
  for (const v of values) {
    if (v.includes(CANONICAL_SEPARATOR)) {
      throw new Error(
        `[computeEventHash] Field value contains the canonical separator '${CANONICAL_SEPARATOR}': "${v}". ` +
          "The canonical form would be ambiguous. Use opaque IDs and fixed enum values only.",
      );
    }
  }
}

/**
 * Computes the canonical event hash for a single audit log entry.
 *
 * ── Hash-chain construction (NIS2/DORA tamper evidence) ──────────────────────
 *
 * Each audit log row stores two hash fields:
 *   • previousLogHash — SHA-256 of the PREVIOUS row's eventHash in the same
 *                       company's chain, or null for the first row (GENESIS).
 *   • eventHash       — SHA-256 of this row's own canonical string (see below).
 *
 * The chain forms a singly-linked list where each node commits to the identity
 * of the node before it.  Deleting or reordering any row breaks all subsequent
 * hashes, making tampering immediately detectable during a chain walk.
 *
 * ── Canonical string format ──────────────────────────────────────────────────
 *
 *   companyId | userId | action | entityType | entityId | timestamp | previousLogHash
 *
 * Fields are joined with the pipe character (U+007C).
 * All fields must be pipe-free (see assertNoPipeInFields above).
 * The timestamp MUST be an ISO-8601 string in UTC (e.g. "2026-04-01T10:00:00.000Z").
 * When there is no previous entry, the literal string "GENESIS" is used.
 *
 * ── Auditor verification steps ───────────────────────────────────────────────
 *
 *   1. Read the chain rows for a company ordered by `createdAt ASC`.
 *   2. For the first row: verify that `previousLogHash` is NULL in the database.
 *   3. For the first row: reconstruct canonicalStr with "GENESIS" in position 7,
 *      run SHA-256, compare to stored `eventHash`.
 *   4. For every subsequent row N: verify that `previousLogHash` equals the
 *      `eventHash` of row N-1.
 *   5. Reconstruct canonicalStr using the stored field values and run SHA-256;
 *      compare to stored `eventHash`.
 *   6. Any mismatch indicates a deleted, inserted, or modified row.
 *
 * ── Algorithm ────────────────────────────────────────────────────────────────
 *
 *   canonicalStr = join(fields, "|")
 *   eventHash    = hex(SHA-256(UTF-8(canonicalStr)))
 *
 * SHA-256 is used per NIST FIPS 180-4.  Output is lowercase hex (64 chars).
 * The Node.js `crypto.createHash("sha256")` implementation is the native
 * OpenSSL binding — no JavaScript loop, maximum throughput.
 *
 * The canonical form includes only immutable fields (`updatedAt` is excluded).
 * Re-computing this from the stored fields lets auditors verify integrity
 * without accessing any secret key.
 */
export function computeEventHash(fields: {
  companyId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  /** Must be a UTC ISO-8601 string, e.g. "2026-04-01T10:00:00.000Z". */
  timestamp: string;
  /**
   * SHA-256 hex of the previous row's eventHash, or null for the first entry.
   * The sentinel literal "GENESIS" is substituted when this is null.
   */
  previousLogHash: string | null;
}): string {
  // The seven canonical fields — order is fixed and part of the specification.
  const fieldValues = [
    fields.companyId,
    fields.userId,
    fields.action,
    fields.entityType,
    fields.entityId,
    fields.timestamp,
    fields.previousLogHash ?? "GENESIS",
  ];

  // Guard: reject any value that contains the separator character.
  // Failing loudly here prevents silent hash collisions.
  assertNoPipeInFields(fieldValues);

  // Build the canonical string and hash it with SHA-256 via native OpenSSL.
  // A single update() call hashes the complete buffer in one pass — no
  // partial-update overhead.
  const canonical = fieldValues.join(CANONICAL_SEPARATOR);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// PII Field Scrubbing
// ---------------------------------------------------------------------------

/** Fields that are considered PII and must be scrubbed in export mode. */
const PII_FIELD_NAMES = new Set([
  "email",
  "fullName",
  "full_name",
  "firstName",
  "lastName",
  "displayName",
  "passwordHash",
  "password",
  "mfaSecret",
  "accessCode",
  "inviteToken",
  "securityOfficerEmail",
  "dpoEmail",
  "recipientEmail",
  "recipient_email",
  "security_contact_email",
  "token",
  "secret",
  "credit_card",
  "creditCard",
  "iban",
  "authorization",
  "cookie",
  "set-cookie",
]);

/** Keys that must never be written as properties — blocks prototype pollution. */
const PROTOTYPE_POISONING_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const PII_FIELD_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /credit[_-]?card/i,
  /iban/i,
  /email/i,
  /authorization/i,
  /cookie/i,
];

const SPECIAL_CATEGORY_KEYWORDS = [
  "health",
  "medical",
  "diagnosis",
  "religion",
  "faith",
  "political",
  "union",
  "biometric",
  "genetic",
  "sexual",
  "ethnicity",
  "race",
];

const SPECIAL_CATEGORY_VALUE_PATTERNS = [
  /\b(diabetes|cancer|hiv|depression|anxiety|diagnosed)\b/i,
  /\b(christian|muslim|jewish|hindu|buddhist|atheist)\b/i,
  /\b(left-wing|right-wing|party member|political affiliation)\b/i,
  /\b(fingerprint|facial scan|iris scan|biometric)\b/i,
  /\b(genetic profile|dna)\b/i,
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function hasSpecialCategoryKeyword(key: string): boolean {
  const lowered = key.toLowerCase();
  return SPECIAL_CATEGORY_KEYWORDS.some((kw) => lowered.includes(kw));
}

function hasSpecialCategoryValue(text: string): boolean {
  return SPECIAL_CATEGORY_VALUE_PATTERNS.some((pattern) => pattern.test(text));
}

function isPiiKey(key: string): boolean {
  if (PII_FIELD_NAMES.has(key)) return true;
  return PII_FIELD_PATTERNS.some((pattern) => pattern.test(key));
}

function pseudonymizeIdentifier(value: string): string {
  const key =
    process.env.AUDIT_PSEUDONYMIZATION_KEY ||
    process.env.AUDIT_EXPORT_KEY ||
    "assessly-gdpr-pseudonymization";
  const hmac = createHmac("sha256", key).update(value, "utf8").digest("hex");
  return `pid-${hmac.slice(0, 16)}`;
}

function sanitizeStringValue(key: string, raw: string): string {
  const trimmed = raw.trim();

  if (hasSpecialCategoryKeyword(key) || hasSpecialCategoryValue(trimmed)) {
    return "[BLOCKED_SPECIAL_CATEGORY_ART9]";
  }

  if (EMAIL_PATTERN.test(trimmed)) {
    return pseudonymizeIdentifier(trimmed.toLowerCase());
  }


  return raw;
}

/**
 * Recursively strips PII fields from a JSON-serializable object.
 * Replaces PII values with "[REDACTED]" for export compliance.
 */
export function scrubPiiFields(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return sanitizeStringValue("value", value);
  }
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map(scrubPiiFields);
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (PROTOTYPE_POISONING_KEYS.has(key)) continue;
    if (hasSpecialCategoryKeyword(key)) {
      result[key] = "[BLOCKED_SPECIAL_CATEGORY_ART9]";
    } else if (isPiiKey(key)) {
      result[key] = "[REDACTED]";
    } else if (typeof val === "string") {
      result[key] = sanitizeStringValue(key, val);
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
  const secret = process.env.AUDIT_BUNDLE_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    throw new Error(
      "signBundle: AUDIT_BUNDLE_SECRET or CRON_SECRET must be set — refusing to sign with a known fallback key"
    );
  }

  return createHmac("sha256", secret).update(canonicalContent, "utf8").digest("hex");
}
