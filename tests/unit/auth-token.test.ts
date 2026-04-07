import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  hashSessionToken,
  shouldSecureCookie,
  signSessionClaims,
  verifySessionToken,
  type SessionClaims,
} from "@/lib/auth/token";

function makeClaims(overrides: Partial<SessionClaims> = {}): SessionClaims {
  return {
    type: "assessly-session",
    sid: "test-sid",
    uid: "test-uid",
    role: "ADMIN" as SessionClaims["role"],
    cid: null,
    vid: null,
    exp: Date.now() + 60_000,
    ...overrides,
  };
}

const TEST_SECRET = "test-unit-only-hmac-secret-for-vitest-1"; // test-only fixture
const TEST_NEXTAUTH_SECRET = "nextauth-unit-only-secret-for-vitest!"; // test-only fixture

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("signSessionClaims", () => {
  it("produces a two-part base64url token", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", TEST_SECRET);

    const token = await signSessionClaims(makeClaims());

    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(token.split(".")).toHaveLength(2);
    expect(token.match(/\./g) ?? []).toHaveLength(1);
  });
});

describe("verifySessionToken", () => {
  it("accepts a freshly signed valid token", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", TEST_SECRET);
    const claims = makeClaims();
    const token = await signSessionClaims(claims);

    const result = await verifySessionToken(token);

    expect(result?.uid).toBe(claims.uid);
    expect(result?.role).toBe(claims.role);
  });

  it("rejects an expired token", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", TEST_SECRET);
    const claims = makeClaims({ exp: Date.now() - 1 });
    const token = await signSessionClaims(claims);

    const result = await verifySessionToken(token);

    expect(result).toBeNull();
  });

  it("rejects a token signed with a different key", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "key-A-32chars-padding-xxxxxxxxxx");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    const token = await signSessionClaims(makeClaims());

    vi.stubEnv("AUTH_SESSION_SECRET", "key-B-32chars-padding-xxxxxxxxxx");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    const result = await verifySessionToken(token);

    expect(result).toBeNull();
  });

  it("rejects a token with a tampered payload", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", TEST_SECRET);
    const token = await signSessionClaims(
      makeClaims({ role: "AUDITOR" as SessionClaims["role"] }),
    );
    const [, originalSig] = token.split(".");
    const forgedPayload = btoa(
      JSON.stringify({ ...makeClaims(), role: "ADMIN" as SessionClaims["role"] }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const result = await verifySessionToken(`${forgedPayload}.${originalSig}`);

    expect(result).toBeNull();
  });

  it("rejects a token with a non-assessly-session type", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", TEST_SECRET);
    const token = await signSessionClaims(makeClaims());
    const [, originalSig] = token.split(".");
    const forgedPayload = btoa(
      JSON.stringify({ ...makeClaims(), type: "bad-type" }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const result = await verifySessionToken(`${forgedPayload}.${originalSig}`);

    expect(result).toBeNull();
  });

  it("rejects a token where the payload JSON is not base64url", async () => {
    const secret = TEST_SECRET;
    vi.stubEnv("AUTH_SESSION_SECRET", secret);
    const payload = "***";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload),
    );
    const signature = btoa(
      Array.from(new Uint8Array(signatureBuffer), (byte) => String.fromCharCode(byte)).join(""),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const result = await verifySessionToken(`${payload}.${signature}`);

    expect(result).toBeNull();
  });

  it("returns null for null input", async () => {
    const result = await verifySessionToken(null);

    expect(result).toBeNull();
  });

  it("returns null for undefined input", async () => {
    const result = await verifySessionToken(undefined);

    expect(result).toBeNull();
  });

  it("returns null for a malformed token (no dot)", async () => {
    const result = await verifySessionToken("nodottoken");

    expect(result).toBeNull();
  });
});

describe("getSessionSecret", () => {
  it("uses NEXTAUTH_SECRET as fallback when AUTH_SESSION_SECRET is absent", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", TEST_NEXTAUTH_SECRET);
    const claims = makeClaims();
    const token = await signSessionClaims(claims);

    const result = await verifySessionToken(token);

    expect(result).not.toBeNull();
  });

  it("throws in production when no secret env vars are set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SESSION_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");

    await expect(signSessionClaims(makeClaims())).rejects.toThrow("AUTH_SESSION_SECRET");
  });

  it("throws when the secret is shorter than 32 characters", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "short");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    await expect(signSessionClaims(makeClaims())).rejects.toThrow("32 characters");
  });
});

describe("hashSessionToken", () => {
  it("is deterministic", async () => {
    const first = await hashSessionToken("same-input");
    const second = await hashSessionToken("same-input");

    expect(first).toBe(second);
  });

  it("returns a 43-character base64url string", async () => {
    const result = await hashSessionToken("input");

    expect(result).toHaveLength(43);
    expect(result).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("produces different hashes for different inputs", async () => {
    const first = await hashSessionToken("input-A");
    const second = await hashSessionToken("input-B");

    expect(first).not.toBe(second);
  });
});

describe("shouldSecureCookie", () => {
  it("returns false when ALLOW_INSECURE_LOCALHOST is 'true'", () => {
    vi.stubEnv("ALLOW_INSECURE_LOCALHOST", "true");
    vi.stubEnv("NODE_ENV", "production");

    expect(shouldSecureCookie()).toBe(false);
  });

  it("returns true in production without the insecure flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_INSECURE_LOCALHOST", "false");

    expect(shouldSecureCookie()).toBe(true);
  });

  it("returns false in non-production regardless of insecure flag", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(shouldSecureCookie()).toBe(false);
  });
});
