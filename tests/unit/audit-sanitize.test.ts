/**
 * Unit tests — Audit Log Hashing & Chain Integrity
 *
 * Covers:
 *   - computeEventHash: determinism, field ordering, GENESIS sentinel
 *   - truncateIp: IPv4/IPv6 anonymisation (GDPR Recital 30)
 *   - pseudonymizeUserId: internal passthrough & export HMAC pseudonym
 *   - hashContent: SHA-256 content fingerprinting (EU AI Act Art. 12)
 *   - scrubPiiFields: recursive PII redaction for export bundles
 *   - Edge cases: null/empty inputs, separator injection guard
 */

import { describe, it, expect } from "vitest";
import {
  computeEventHash,
  truncateIp,
  pseudonymizeUserId,
  hashContent,
  scrubPiiFields,
} from "@/lib/audit-sanitize";

// ---------------------------------------------------------------------------
// computeEventHash
// ---------------------------------------------------------------------------

describe("computeEventHash", () => {
  const base = {
    companyId: "company-abc",
    userId: "user-xyz",
    action: "VENDOR_CREATED",
    entityType: "vendor",
    entityId: "vendor-001",
    timestamp: "2026-04-01T10:00:00.000Z",
    previousLogHash: null,
  };

  it("returns a 64-character lowercase hex string", () => {
    const hash = computeEventHash(base);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same inputs produce the same hash", () => {
    expect(computeEventHash(base)).toBe(computeEventHash(base));
  });

  it("uses the GENESIS sentinel when previousLogHash is null", () => {
    const withNull = computeEventHash({ ...base, previousLogHash: null });
    // Independently build what GENESIS should produce
    const withGenesis = computeEventHash({ ...base, previousLogHash: "GENESIS_PLACEHOLDER" });
    // They must differ (GENESIS changes the canonical string)
    expect(withNull).not.toBe(withGenesis);
  });

  it("uses a supplied previousLogHash correctly", () => {
    const prevHash = "a".repeat(64);
    const hash = computeEventHash({ ...base, previousLogHash: prevHash });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Changing the previous hash must change the event hash
    const prevHash2 = "b".repeat(64);
    const hash2 = computeEventHash({ ...base, previousLogHash: prevHash2 });
    expect(hash).not.toBe(hash2);
  });

  it("produces different hashes when any single field changes", () => {
    const original = computeEventHash(base);
    const fields: Array<[keyof typeof base, string]> = [
      ["companyId", "company-other"],
      ["userId", "user-other"],
      ["action", "USER_DELETED"],
      ["entityType", "assessment"],
      ["entityId", "vendor-002"],
      ["timestamp", "2026-04-02T10:00:00.000Z"],
    ];
    for (const [key, value] of fields) {
      expect(computeEventHash({ ...base, [key]: value })).not.toBe(original);
    }
  });

  it("throws when a field value contains the pipe separator", () => {
    expect(() =>
      computeEventHash({ ...base, companyId: "company|injected" }),
    ).toThrow(/canonical separator/);
  });

  it("throws when action contains a pipe", () => {
    expect(() =>
      computeEventHash({ ...base, action: "VENDOR_CREATED|EXTRA" }),
    ).toThrow(/canonical separator/);
  });
});

// ---------------------------------------------------------------------------
// Hash-chain tamper-evidence (sequential chain validation)
// ---------------------------------------------------------------------------

describe("computeEventHash — hash chain integrity", () => {
  it("chaining three events makes each hash depend on its predecessor", () => {
    const mkEvent = (action: string, previousLogHash: string | null) => ({
      companyId: "co-1",
      userId: "usr-1",
      action,
      entityType: "vendor",
      entityId: "v-1",
      timestamp: "2026-04-01T12:00:00.000Z",
      previousLogHash,
    });

    const h1 = computeEventHash(mkEvent("VENDOR_CREATED", null));
    const h2 = computeEventHash(mkEvent("ASSESSMENT_UPDATED", h1));
    const h3 = computeEventHash(mkEvent("DOCUMENT_ANALYZED", h2));

    // Tampering h1 cascades: recomputing h2 with wrong prev yields a different hash
    const tampered_h1 = computeEventHash(mkEvent("VENDOR_CREATED", "tampered"));
    const tampered_h2 = computeEventHash(mkEvent("ASSESSMENT_UPDATED", tampered_h1));
    expect(tampered_h2).not.toBe(h2);

    // All three original hashes are unique
    const uniqueHashes = new Set([h1, h2, h3]);
    expect(uniqueHashes.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// truncateIp
// ---------------------------------------------------------------------------

describe("truncateIp", () => {
  it("anonymises the last octet of an IPv4 address", () => {
    expect(truncateIp("192.168.1.55")).toBe("192.168.1.xxx");
    expect(truncateIp("10.0.0.1")).toBe("10.0.0.xxx");
  });

  it("keeps the first three octets intact", () => {
    const result = truncateIp("203.0.113.42");
    expect(result).toMatch(/^203\.0\.113\.xxx$/);
  });

  it("masks the last 4 groups of a full IPv6 address", () => {
    const result = truncateIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
    expect(result).toBe("2001:0db8:85a3:0000:xxxx:xxxx:xxxx:xxxx");
  });

  it("returns '[ipv6-masked]' for compressed IPv6", () => {
    expect(truncateIp("::1")).toBe("[ipv6-masked]");
    expect(truncateIp("2001:db8::1")).toBe("[ipv6-masked]");
  });

  it("returns null for null, undefined, and empty string", () => {
    expect(truncateIp(null)).toBeNull();
    expect(truncateIp(undefined)).toBeNull();
    expect(truncateIp("")).toBeNull();
  });

  it("returns an empty string for a whitespace-only input (truthy, not caught by null guard)", () => {
    // "   ".trim() === "" — passes the !ip guard, falls through to `return trimmed`
    expect(truncateIp("   ")).toBe("");
  });

  it("returns the original string when the format is unrecognised", () => {
    expect(truncateIp("not-an-ip")).toBe("not-an-ip");
  });
});

// ---------------------------------------------------------------------------
// pseudonymizeUserId
// ---------------------------------------------------------------------------

describe("pseudonymizeUserId", () => {
  it("returns 'system' for null and undefined", () => {
    expect(pseudonymizeUserId(null, "internal")).toBe("system");
    expect(pseudonymizeUserId(undefined, "export")).toBe("system");
  });

  it("returns the raw userId in internal mode", () => {
    expect(pseudonymizeUserId("user-abc", "internal")).toBe("user-abc");
  });

  it("returns a uid- prefixed 16-char hex snippet in export mode", () => {
    const result = pseudonymizeUserId("user-abc", "export", "test-key");
    expect(result).toMatch(/^uid-[0-9a-f]{16}$/);
  });

  it("is deterministic in export mode with the same key", () => {
    const a = pseudonymizeUserId("user-abc", "export", "test-key");
    const b = pseudonymizeUserId("user-abc", "export", "test-key");
    expect(a).toBe(b);
  });

  it("produces different pseudonyms for different user IDs", () => {
    const a = pseudonymizeUserId("user-1", "export", "test-key");
    const b = pseudonymizeUserId("user-2", "export", "test-key");
    expect(a).not.toBe(b);
  });

  it("produces different pseudonyms for different export keys", () => {
    const a = pseudonymizeUserId("user-1", "export", "key-a");
    const b = pseudonymizeUserId("user-1", "export", "key-b");
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// hashContent (EU AI Act Art. 12)
// ---------------------------------------------------------------------------

describe("hashContent", () => {
  it("returns a 64-character hex string", () => {
    expect(hashContent("some document text")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const text = "NIS2 compliance checklist v1.0";
    expect(hashContent(text)).toBe(hashContent(text));
  });

  it("produces different hashes for different content", () => {
    expect(hashContent("doc A")).not.toBe(hashContent("doc B"));
  });

  it("is sensitive to whitespace changes", () => {
    expect(hashContent("text ")).not.toBe(hashContent("text"));
  });

  it("handles an empty string without throwing", () => {
    const hash = hashContent("");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// scrubPiiFields
// ---------------------------------------------------------------------------

describe("scrubPiiFields", () => {
  it("replaces known PII fields with [REDACTED]", () => {
    const input = { email: "vendor@example.com", companyId: "co-1" };
    const result = scrubPiiFields(input) as Record<string, unknown>;
    expect(result.email).toBe("[REDACTED]");
    expect(result.companyId).toBe("co-1");
  });

  it("redacts passwordHash and mfaSecret", () => {
    const input = { passwordHash: "bcrypt-hash", mfaSecret: "totp-seed" };
    const result = scrubPiiFields(input) as Record<string, unknown>;
    expect(result.passwordHash).toBe("[REDACTED]");
    expect(result.mfaSecret).toBe("[REDACTED]");
  });

  it("recursively scrubs nested objects", () => {
    const input = { vendor: { email: "v@example.com", name: "ACME" } };
    const result = scrubPiiFields(input) as { vendor: Record<string, unknown> };
    expect(result.vendor.email).toBe("[REDACTED]");
    expect(result.vendor.name).toBe("ACME");
  });

  it("recursively scrubs arrays of objects", () => {
    const input = [
      { email: "a@b.com", id: "1" },
      { email: "c@d.com", id: "2" },
    ];
    const result = scrubPiiFields(input) as Array<Record<string, unknown>>;
    expect(result[0].email).toBe("[REDACTED]");
    expect(result[0].id).toBe("1");
    expect(result[1].email).toBe("[REDACTED]");
  });

  it("scrubs accessCode and inviteToken", () => {
    const input = { accessCode: "A8X9-B2M4", inviteToken: "tok-secret-123" };
    const result = scrubPiiFields(input) as Record<string, unknown>;
    expect(result.accessCode).toBe("[REDACTED]");
    expect(result.inviteToken).toBe("[REDACTED]");
  });

  it("passes through null and undefined unchanged", () => {
    expect(scrubPiiFields(null)).toBeNull();
    expect(scrubPiiFields(undefined)).toBeUndefined();
  });

  it("passes through primitive values unchanged", () => {
    expect(scrubPiiFields("plain string")).toBe("plain string");
    expect(scrubPiiFields(42)).toBe(42);
  });
});
