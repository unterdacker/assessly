import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

vi.mock("@/lib/auth/token", () => ({
  shouldSecureCookie: vi.fn().mockReturnValue(false),
}));

import {
  MFA_PENDING_COOKIE,
  clearMfaPendingCookie,
  getMfaPendingClaims,
  setMfaPendingCookie,
} from "@/lib/auth/mfa-pending";
import { shouldSecureCookie } from "@/lib/auth/token";

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
  const signature = encodeBase64Url(new Uint8Array(signatureBuffer));
  return `${payloadB64}.${signature}`;
}

beforeEach(() => {
  cookieStore.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("mfa-pending cookie", () => {
  it("round-trips setMfaPendingCookie and getMfaPendingClaims", async () => {
    await setMfaPendingCookie("user-1", "en", "/dashboard");

    const claims = await getMfaPendingClaims();

    expect(claims).not.toBeNull();
    expect(claims?.type).toBe("assessly-mfa-pending");
    expect(claims?.uid).toBe("user-1");
    expect(claims?.locale).toBe("en");
    expect(claims?.next).toBe("/dashboard");
    expect(typeof claims?.exp).toBe("number");
  });

  it("returns null when cookie is missing", async () => {
    const claims = await getMfaPendingClaims();

    expect(claims).toBeNull();
  });

  it("returns null when token is expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    await setMfaPendingCookie("user-1", "en", "/dashboard");
    vi.advanceTimersByTime(300_001);

    const claims = await getMfaPendingClaims();

    expect(claims).toBeNull();
  });

  it("returns null for a tampered payload", async () => {
    await setMfaPendingCookie("user-1", "en", "/dashboard");

    const token = cookieStore.get(MFA_PENDING_COOKIE);
    expect(token).toBeTruthy();

    const [payload, signature] = (token as string).split(".");
    const parsedPayload = JSON.parse(decodeBase64UrlToString(payload)) as {
      type: string;
      uid: string;
      locale: string;
      next: string;
      exp: number;
    };
    const forgedPayload = encodeBase64Url(
      new TextEncoder().encode(
        JSON.stringify({
          ...parsedPayload,
          uid: "attacker-user",
        }),
      ),
    );

    cookieStore.set(MFA_PENDING_COOKIE, `${forgedPayload}.${signature}`);

    const claims = await getMfaPendingClaims();

    expect(claims).toBeNull();
  });

  it("returns null for a tampered signature", async () => {
    await setMfaPendingCookie("user-1", "en", "/dashboard");

    const token = cookieStore.get(MFA_PENDING_COOKIE);
    expect(token).toBeTruthy();

    const [payload, signature] = (token as string).split(".");
    const first = signature[0];
    const flipped = first === "A" ? "B" : "A";
    const badSignature = `${flipped}${signature.slice(1)}`;

    cookieStore.set(MFA_PENDING_COOKIE, `${payload}.${badSignature}`);

    const claims = await getMfaPendingClaims();

    expect(claims).toBeNull();
  });

  it("returns null for a malformed token without dot", async () => {
    cookieStore.set(MFA_PENDING_COOKIE, "nodottoken");

    const claims = await getMfaPendingClaims();

    expect(claims).toBeNull();
  });

  it("returns null when token has wrong type", async () => {
    const secret = "dev-only-assessly-session-secret-change-me";
    vi.stubEnv("AUTH_SESSION_SECRET", secret);
    vi.stubEnv("NEXTAUTH_SECRET", "");

    const payloadB64 = encodeBase64Url(
      new TextEncoder().encode(
        JSON.stringify({
          type: "assessly-oidc-state",
          uid: "user-1",
          locale: "en",
          next: "/dashboard",
          exp: Date.now() + 60_000,
        }),
      ),
    );

    const token = await signToken(payloadB64, secret);
    cookieStore.set(MFA_PENDING_COOKIE, token);

    const claims = await getMfaPendingClaims();

    expect(claims).toBeNull();
  });

  it("clears pending cookie", async () => {
    await setMfaPendingCookie("user-1", "en", "/dashboard");
    expect(await getMfaPendingClaims()).not.toBeNull();

    await clearMfaPendingCookie();

    expect(await getMfaPendingClaims()).toBeNull();
  });

  it("uses NEXTAUTH_SECRET fallback when AUTH_SESSION_SECRET is empty", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "nextauth-test-secret-unit-only!!");

    await setMfaPendingCookie("user-1", "en", "/dashboard");

    const claims = await getMfaPendingClaims();

    expect(claims).not.toBeNull();
    expect(claims?.uid).toBe("user-1");
  });

  it("calls shouldSecureCookie when setting pending cookie", async () => {
    await setMfaPendingCookie("user-1", "en", "/dashboard");

    expect(shouldSecureCookie).toHaveBeenCalled();
  });
});
