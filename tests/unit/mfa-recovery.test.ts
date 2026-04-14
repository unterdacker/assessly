import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateRecoveryCodes, verifyAndConsumeRecoveryCode } from "@/lib/mfa";

// Use a valid 64-hex key so encryptMfaSecret (imported transitively) doesn't throw
const TEST_KEY = "aa".repeat(32);

beforeEach(() => {
  vi.stubEnv("MFA_ENCRYPTION_KEY", TEST_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generateRecoveryCodes", () => {
  it("returns exactly 10 plaintext codes", async () => {
    const { plaintext } = await generateRecoveryCodes();
    expect(plaintext).toHaveLength(10);
  });

  it("returns exactly 10 hashed codes", async () => {
    const { hashed } = await generateRecoveryCodes();
    expect(hashed).toHaveLength(10);
  });

  it("each plaintext code matches XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX (32 uppercase hex + 3 dashes)", async () => {
    const { plaintext } = await generateRecoveryCodes();
    const pattern = /^[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/;
    for (const code of plaintext) {
      expect(code).toMatch(pattern);
    }
  });

  it("contains 128 bits of entropy: 32 hex chars per code excluding dashes", async () => {
    const { plaintext } = await generateRecoveryCodes();
    for (const code of plaintext) {
      expect(code.replace(/-/g, "")).toHaveLength(32);
    }
  });

  it("all 10 plaintext codes are unique within a single batch", async () => {
    const { plaintext } = await generateRecoveryCodes();
    expect(new Set(plaintext).size).toBe(10);
  });

  it("each hash starts with $2b$10$ (bcrypt cost 10)", async () => {
    const { hashed } = await generateRecoveryCodes();
    for (const hash of hashed) {
      expect(hash).toMatch(/^\$2b\$10\$/);
    }
  });

  it("each hash verifies against its corresponding plaintext code", async () => {
    const bcrypt = await import("bcryptjs");
    const { plaintext, hashed } = await generateRecoveryCodes();
    for (let i = 0; i < plaintext.length; i++) {
      expect(await bcrypt.default.compare(plaintext[i], hashed[i])).toBe(true);
    }
  });

  it("two successive calls produce entirely different code sets", async () => {
    const first = await generateRecoveryCodes();
    const second = await generateRecoveryCodes();
    const setA = new Set(first.plaintext);
    const intersection = second.plaintext.filter((c) => setA.has(c));
    expect(intersection).toHaveLength(0);
  });
}, 60_000); // bcrypt cost 10 × 10 codes × 2 = ~20s; give ample headroom

describe("verifyAndConsumeRecoveryCode", () => {
  // Pre-hash 3 known codes once for the entire describe block.
  // bcrypt at cost 10 is intentional - matches production security.
  const CODES = [
    "AABBCCDD-11223344-55667788-99AABBCC",
    "BBCCDDEE-22334455-66778899-AABBCCDD",
    "CCDDEE00-33445566-778899AA-BBCCDDEE",
  ] as const;

  let hashedCodes: string[];

  beforeAll(async () => {
    const bcrypt = await import("bcryptjs");
    hashedCodes = await Promise.all(CODES.map((c) => bcrypt.default.hash(c, 10)));
  }, 30_000);

  it("returns 0 when the first code matches", async () => {
    const idx = await verifyAndConsumeRecoveryCode(CODES[0], hashedCodes);
    expect(idx).toBe(0);
  });

  it("returns 1 when the middle code matches", async () => {
    const idx = await verifyAndConsumeRecoveryCode(CODES[1], hashedCodes);
    expect(idx).toBe(1);
  });

  it("returns 2 when the last code matches", async () => {
    const idx = await verifyAndConsumeRecoveryCode(CODES[2], hashedCodes);
    expect(idx).toBe(2);
  });

  it("returns -1 for a completely wrong code", async () => {
    const idx = await verifyAndConsumeRecoveryCode("00000000-00000000-00000000-00000000", hashedCodes);
    expect(idx).toBe(-1);
  });

  it("returns -1 for an empty hashed array", async () => {
    const idx = await verifyAndConsumeRecoveryCode(CODES[0], []);
    expect(idx).toBe(-1);
  });

  it("normalizes lowercase input to uppercase before comparison", async () => {
    const lower = CODES[0].toLowerCase();
    const idx = await verifyAndConsumeRecoveryCode(lower, hashedCodes);
    expect(idx).toBe(0);
  });

  it("accepts a code input without dashes (strips non-hex chars)", async () => {
    const noDashes = CODES[0].replace(/-/g, "");
    const idx = await verifyAndConsumeRecoveryCode(noDashes, hashedCodes);
    expect(idx).toBe(0);
  });

  it("returns only the first matching index (no duplicate match side-effects)", async () => {
    const idx = await verifyAndConsumeRecoveryCode(CODES[0], hashedCodes);
    expect(idx).toBe(0);
    expect(hashedCodes).toHaveLength(3); // non-mutation confirmed
  });

  it("does not mutate the hashedCodes input array", async () => {
    const original = [...hashedCodes];
    await verifyAndConsumeRecoveryCode(CODES[0], hashedCodes);
    expect(hashedCodes).toStrictEqual(original);
  });
}, 30_000);
