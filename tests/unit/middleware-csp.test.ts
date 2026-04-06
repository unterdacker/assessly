/**
 * Unit tests — CSP nonce generation and header construction
 *
 * Tests the two pure utility functions exported from middleware.ts:
 *   - generateNonce: 16-byte cryptographically random base64 nonce
 *   - buildCspHeader: per-request CSP header string with nonce in script-src
 *
 * Manual verification steps (for the full middleware flow):
 *   1. Run `docker-compose up -d` and open browser DevTools → Network.
 *   2. Inspect any page response: Content-Security-Policy header must contain
 *      `'nonce-XXXX'` in script-src and must NOT contain `'unsafe-inline'` in script-src.
 *   3. Inspect x-nonce response header — must match the nonce in the CSP.
 *   4. Reload the page — the nonce must change on every request.
 *   5. Confirm no CSP console errors on pages where no inline scripts exist.
 *      (Inline scripts in layout.tsx will be blocked until they receive the nonce
 *       prop — that is the mandatory follow-up task, out of scope for this PR.)
 */

import { vi, describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Mock all Next.js and next-intl dependencies so middleware.ts can be imported
// in the Vitest node environment. vi.mock calls are hoisted before imports.
// ---------------------------------------------------------------------------
vi.mock("next-intl/middleware", () => ({ default: () => vi.fn() }));
vi.mock("next-intl", () => ({ hasLocale: vi.fn(() => false) }));
vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn(() => ({
      headers: { set: vi.fn(), get: vi.fn(), forEach: vi.fn() },
      cookies: { set: vi.fn(), delete: vi.fn(), get: vi.fn(), getAll: vi.fn(() => []) },
      status: 200,
    })),
    json: vi.fn(),
    redirect: vi.fn(),
  },
  NextRequest: vi.fn(),
}));
vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["de", "en"], defaultLocale: "de" },
}));
vi.mock("@/lib/auth/permissions", () => ({
  canAccessPath: vi.fn(),
  getRoleLandingPath: vi.fn(),
  isExternalPath: vi.fn(() => false),
  isProtectedInternalPath: vi.fn(() => false),
  withLocalePath: vi.fn((p: string) => p),
}));
vi.mock("@/lib/auth/token", () => ({
  AUTH_SESSION_COOKIE_NAME: "avra-session",
  shouldSecureCookie: vi.fn(() => false),
  verifySessionToken: vi.fn(() => null),
}));

import { generateNonce, buildCspHeader } from "../../middleware";

// ---------------------------------------------------------------------------
// generateNonce
// ---------------------------------------------------------------------------

describe("generateNonce", () => {
  it("returns a string", () => {
    expect(typeof generateNonce()).toBe("string");
  });

  it("produces a valid base64 string (24 characters for 16 bytes)", () => {
    const nonce = generateNonce();
    // 16 bytes → 24-character base64 (including trailing padding)
    expect(nonce).toHaveLength(24);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("generates unique nonces across 50 consecutive calls", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => generateNonce()));
    expect(nonces.size).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// buildCspHeader
// ---------------------------------------------------------------------------

describe("buildCspHeader", () => {
  const testNonce = "dGVzdG5vbmNlMTIzNA==";

  it("includes the nonce in script-src", () => {
    expect(buildCspHeader(testNonce)).toContain(`'nonce-${testNonce}'`);
  });

  it("does not include 'unsafe-inline' in script-src", () => {
    const scriptSrc = buildCspHeader(testNonce)
      .split(";")
      .find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("retains 'unsafe-inline' in style-src (required for Tailwind)", () => {
    const csp = buildCspHeader(testNonce);
    const styleSrc = csp.split(";").find((d) => d.trim().startsWith("style-src"));
    expect(styleSrc).toBeDefined();
    expect(styleSrc).toContain("'unsafe-inline'");
  });

  it("includes default-src 'self'", () => {
    expect(buildCspHeader(testNonce)).toContain("default-src 'self'");
  });

  it("includes frame-ancestors 'none' to block clickjacking", () => {
    expect(buildCspHeader(testNonce)).toContain("frame-ancestors 'none'");
  });

  it("includes object-src 'none' to block plugin embedding", () => {
    expect(buildCspHeader(testNonce)).toContain("object-src 'none'");
  });
});
