import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  mockVerifySessionToken,
  mockHashSessionToken,
  mockSignSessionClaims,
  mockShouldSecureCookie,
  mockFindUnique,
  mockUpdate,
  mockCreate,
  mockCookiesGet,
  mockCookiesSet,
  mockCookiesDelete,
  mockRedirect,
} = vi.hoisted(() => {
  const mockVerifySessionToken = vi.fn();
  const mockHashSessionToken = vi.fn();
  const mockSignSessionClaims = vi.fn();
  const mockShouldSecureCookie = vi.fn();
  const mockFindUnique = vi.fn();
  const mockUpdate = vi.fn();
  const mockCreate = vi.fn();
  const mockCookiesGet = vi.fn();
  const mockCookiesSet = vi.fn();
  const mockCookiesDelete = vi.fn();
  const mockRedirect = vi.fn();
  return {
    mockVerifySessionToken,
    mockHashSessionToken,
    mockSignSessionClaims,
    mockShouldSecureCookie,
    mockFindUnique,
    mockUpdate,
    mockCreate,
    mockCookiesGet,
    mockCookiesSet,
    mockCookiesDelete,
    mockRedirect,
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: mockCookiesGet,
    set: mockCookiesSet,
    delete: mockCookiesDelete,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    authSession: {
      findUnique: mockFindUnique,
      update: mockUpdate,
      create: mockCreate,
    },
  },
  withDbRetry: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("@/lib/auth/token", () => ({
  AUTH_SESSION_COOKIE_NAME: "venshield-session",
  verifySessionToken: mockVerifySessionToken,
  hashSessionToken: mockHashSessionToken,
  signSessionClaims: mockSignSessionClaims,
  shouldSecureCookie: mockShouldSecureCookie,
}));

import {
  clearAuthSessionCookie,
  createSessionForUser,
  getAuthSessionFromRequest,
  getLocalizedLandingPath,
  requirePageRole,
  setAuthSessionCookie,
} from "@/lib/auth/server";

function makeDbSession(role: UserRole) {
  return {
    id: "session-1",
    userId: "user-1",
    role,
    companyId: "ctest00000000000000000001",
    vendorId: role === "VENDOR" ? "vendor-1" : null,
    expiresAt: new Date(Date.now() + 3_600_000),
    revokedAt: null,
    user: {
      id: "user-1",
      role,
      email: "test@example.com",
      displayName: "Test User",
      isActive: true,
      companyId: "ctest00000000000000000001",
      vendorId: role === "VENDOR" ? "vendor-1" : null,
    },
  };
}

function stubSession(role: UserRole) {
  mockCookiesGet.mockReturnValue({ value: "token-1" });
  mockVerifySessionToken.mockResolvedValue({
    type: "venshield-session",
    sid: "session-1",
    uid: "user-1",
    role,
    cid: "ctest00000000000000000001",
    vid: role === "VENDOR" ? "vendor-1" : null,
    exp: Date.now() + 3_600_000,
  });
  mockHashSessionToken.mockResolvedValue("hash-1");
  mockFindUnique.mockResolvedValue(makeDbSession(role));
  mockUpdate.mockResolvedValue({});
}

beforeEach(() => {
  vi.clearAllMocks();
  mockShouldSecureCookie.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSessionForUser", () => {
  it("creates a signed persisted session and returns token with expiry", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-0000-0000-000000000123");
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    mockSignSessionClaims.mockResolvedValue("signed-token");
    mockHashSessionToken.mockResolvedValue("token-hash");
    mockCreate.mockResolvedValue({});

    const result = await createSessionForUser({
      userId: "user-1",
      role: "ADMIN",
      companyId: "ctest00000000000000000001",
      vendorId: null,
    });

    expect(result.token).toBe("signed-token");
    expect(result.expiresAt.getTime()).toBe(1_700_043_200_000);
    expect(mockSignSessionClaims).toHaveBeenCalledWith({
      type: "venshield-session",
            sid: "00000000-0000-0000-0000-000000000123",
      uid: "user-1",
      role: "ADMIN",
      cid: "ctest00000000000000000001",
      vid: null,
      exp: 1_700_043_200_000,
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
          id: "00000000-0000-0000-0000-000000000123",
        userId: "user-1",
        role: "ADMIN",
        companyId: "ctest00000000000000000001",
        vendorId: null,
        tokenHash: "token-hash",
        createdBy: "user-1",
      }),
    });
  });
});

describe("session cookies", () => {
  it("sets auth session cookie with secure options", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    mockShouldSecureCookie.mockReturnValue(true);

    await setAuthSessionCookie("signed-token", expiresAt);

    expect(mockCookiesSet).toHaveBeenCalledWith("venshield-session", "signed-token", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  });

  it("clears auth session cookie", async () => {
    await clearAuthSessionCookie();
    expect(mockCookiesDelete).toHaveBeenCalledWith("venshield-session");
  });
});

describe("getAuthSessionFromRequest", () => {
  it("returns null when token verification fails", async () => {
    mockVerifySessionToken.mockResolvedValue(null);

    const request = {
      cookies: {
        get: vi.fn().mockReturnValue({ value: "invalid" }),
      },
    } as unknown as import("next/server").NextRequest;

    await expect(getAuthSessionFromRequest(request)).resolves.toBeNull();
  });

  it("returns mapped auth session for a valid request token", async () => {
    mockVerifySessionToken.mockResolvedValue({
      type: "venshield-session",
      sid: "session-1",
      uid: "user-1",
      role: "ADMIN",
      cid: "ctest00000000000000000001",
      vid: null,
      exp: Date.now() + 60_000,
    });
    mockHashSessionToken.mockResolvedValue("hash-1");
    mockFindUnique.mockResolvedValue(makeDbSession("ADMIN"));
    mockUpdate.mockResolvedValue({});

    const request = {
      cookies: {
        get: vi.fn().mockReturnValue({ value: "token-1" }),
      },
    } as unknown as import("next/server").NextRequest;

    await expect(getAuthSessionFromRequest(request)).resolves.toMatchObject({
      sessionId: "session-1",
      userId: "user-1",
      role: "ADMIN",
      companyId: "ctest00000000000000000001",
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { lastSeenAt: expect.any(Date) },
    });
  });
});

describe("requirePageRole", () => {
  it("returns the session when role is allowed", async () => {
    stubSession("ADMIN");
    await expect(requirePageRole(["ADMIN"], "en")).resolves.toMatchObject({ role: "ADMIN" });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects vendor users to external portal when role is disallowed", async () => {
    stubSession("VENDOR");
    await requirePageRole(["ADMIN"], "en");
    expect(mockRedirect).toHaveBeenCalledWith("/en/external/portal");
  });

  it("redirects non-vendor users to unauthorized page when role is disallowed", async () => {
    stubSession("AUDITOR");
    await requirePageRole(["ADMIN"], "de");
    expect(mockRedirect).toHaveBeenCalledWith("/de/unauthorized");
  });
});

describe("getLocalizedLandingPath", () => {
  it("returns internal landing path with locale", () => {
    expect(getLocalizedLandingPath("ADMIN", "en")).toBe("/en/dashboard");
  });

  it("returns vendor landing path with locale", () => {
    expect(getLocalizedLandingPath("VENDOR", "de")).toBe("/de/external/portal");
  });
});
