import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    OIDC_STATE_SECRET: "test-unit-only-oidc-state-secret-for-vitest!!",
    APP_URL: "https://app.example.com",
  },
}));

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (name: string) =>
      cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined,
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

import {
  clearOidcStateCookie,
  getOidcStateClaims,
  setOidcStateCookie,
  validateNextParam,
} from "@/lib/oidc/state-cookie";

const APP_URL = "https://app.example.com";
const OIDC_STATE_COOKIE = "assessly-oidc-state";

function encodeBase64Url(input: Uint8Array): string {
  const binary = Array.from(input, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64UrlToString(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(`${normalized}${padding}`);
}

async function signToken(payloadB64: string, secret: string): Promise<string> {
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
    new TextEncoder().encode(payloadB64),
  );
  return `${payloadB64}.${encodeBase64Url(new Uint8Array(signatureBuffer))}`;
}

beforeEach(() => {
  cookieStore.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("validateNextParam", () => {
  it("returns empty string for undefined input", () => {
    expect(validateNextParam(undefined, APP_URL)).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(validateNextParam("", APP_URL)).toBe("");
  });

  it("returns empty string for open redirect shorthand", () => {
    expect(validateNextParam("//", APP_URL)).toBe("");
  });

  it("returns empty string for javascript URL", () => {
    expect(validateNextParam("javascript:alert(1)", APP_URL)).toBe("");
  });

  it("returns empty string for external absolute URL", () => {
    expect(validateNextParam("https://evil.com/path", APP_URL)).toBe("");
  });

  it("accepts safe relative paths", () => {
    expect(validateNextParam("/dashboard", APP_URL)).toBe("/dashboard");
    expect(validateNextParam("/dashboard?q=1", APP_URL)).toBe("/dashboard?q=1");
  });

  it("returns empty string when appUrl is malformed", () => {
    expect(validateNextParam("/dashboard", "not-a-url")).toBe("");
  });

  it("returns empty string for path that resolves to a different origin", () => {
    expect(validateNextParam("/\\evil.com/path", APP_URL)).toBe("");
  });
});

describe("OIDC state cookie", () => {
  it("round-trips setOidcStateCookie and getOidcStateClaims", async () => {
    await setOidcStateCookie({
      state: "state-1",
      nonce: "nonce-1",
      pkceVerifier: "pkce-1",
      locale: "en",
      next: "/dashboard",
      companyId: "company-1",
    });

    const claims = await getOidcStateClaims();

    expect(claims).not.toBeNull();
    expect(claims?.type).toBe("assessly-oidc-state");
    expect(claims?.state).toBe("state-1");
    expect(claims?.nonce).toBe("nonce-1");
    expect(claims?.pkceVerifier).toBe("pkce-1");
    expect(claims?.locale).toBe("en");
    expect(claims?.next).toBe("/dashboard");
    expect(claims?.companyId).toBe("company-1");
  });

  it("returns null when cookie is missing", async () => {
    expect(await getOidcStateClaims()).toBeNull();
  });

  it("returns null when token is expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    await setOidcStateCookie({
      state: "state-1",
      nonce: "nonce-1",
      pkceVerifier: "pkce-1",
      locale: "en",
      next: "/dashboard",
      companyId: "company-1",
    });

    vi.advanceTimersByTime(600_001);

    expect(await getOidcStateClaims()).toBeNull();
  });

  it("returns null for tampered payload", async () => {
    await setOidcStateCookie({
      state: "state-1",
      nonce: "nonce-1",
      pkceVerifier: "pkce-1",
      locale: "en",
      next: "/dashboard",
      companyId: "company-1",
    });

    const token = cookieStore.get(OIDC_STATE_COOKIE);
    expect(token).toBeTruthy();

    const [payload, signature] = (token as string).split(".");
    const parsedPayload = JSON.parse(decodeBase64UrlToString(payload)) as {
      type: string;
      state: string;
      nonce: string;
      pkceVerifier: string;
      locale: string;
      next: string;
      companyId: string;
      exp: number;
    };

    const forgedPayload = encodeBase64Url(
      new TextEncoder().encode(
        JSON.stringify({
          ...parsedPayload,
          companyId: "company-2",
        }),
      ),
    );

    cookieStore.set(OIDC_STATE_COOKIE, `${forgedPayload}.${signature}`);

    expect(await getOidcStateClaims()).toBeNull();
  });

  it("returns null for malformed token without dot", async () => {
    cookieStore.set(OIDC_STATE_COOKIE, "nodottoken");

    expect(await getOidcStateClaims()).toBeNull();
  });

  it("returns null for token with wrong type", async () => {
    const secret = "test-unit-only-oidc-state-secret-for-vitest!!";
    const payloadB64 = encodeBase64Url(
      new TextEncoder().encode(
        JSON.stringify({
          type: "assessly-mfa-pending",
          state: "state-1",
          nonce: "nonce-1",
          pkceVerifier: "pkce-1",
          locale: "en",
          next: "/dashboard",
          companyId: "company-1",
          exp: Date.now() + 60_000,
        }),
      ),
    );

    cookieStore.set(OIDC_STATE_COOKIE, await signToken(payloadB64, secret));

    expect(await getOidcStateClaims()).toBeNull();
  });

  it("clears OIDC state cookie", async () => {
    await setOidcStateCookie({
      state: "state-1",
      nonce: "nonce-1",
      pkceVerifier: "pkce-1",
      locale: "en",
      next: "/dashboard",
      companyId: "company-1",
    });
    expect(await getOidcStateClaims()).not.toBeNull();

    await clearOidcStateCookie();

    expect(await getOidcStateClaims()).toBeNull();
  });
});
