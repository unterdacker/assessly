import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";

// Hoist mock factories so they are available when vi.mock() is called
const {
  mockVerifySessionToken,
  mockHashSessionToken,
  mockFindUnique,
  mockUpdate,
  mockCookiesGet,
} = vi.hoisted(() => {
  const mockVerifySessionToken = vi.fn();
  const mockHashSessionToken = vi.fn();
  const mockFindUnique = vi.fn();
  const mockUpdate = vi.fn();
  const mockCookiesGet = vi.fn();
  return { mockVerifySessionToken, mockHashSessionToken, mockFindUnique, mockUpdate, mockCookiesGet };
});

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: mockCookiesGet,
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    authSession: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
  withDbRetry: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("@/lib/auth/token", () => ({
  AUTH_SESSION_COOKIE_NAME: "assessly-session",
  verifySessionToken: mockVerifySessionToken,
  hashSessionToken: mockHashSessionToken,
  shouldSecureCookie: vi.fn().mockReturnValue(false),
  signSessionClaims: vi.fn(),
}));

import {
  isAccessControlError,
  requireAdminUser,
  requireInternalReadUser,
  requireInternalWriteUser,
  requireSuperAdminUser,
} from "@/lib/auth/server";

function makeDbSession(role: UserRole) {
  return {
    id: "test-session-id",
    userId: "test-user-id",
    role,
    companyId: "test-company-id",
    vendorId: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    revokedAt: null,
    user: {
      id: "test-user-id",
      role,
      email: "test@example.com",
      displayName: "Test User",
      isActive: true,
      companyId: "test-company-id",
      vendorId: null,
    },
  };
}

function stubSession(role: UserRole) {
  mockCookiesGet.mockReturnValue({ value: "mock-token" });
  mockHashSessionToken.mockResolvedValue("mock-hash");
  mockVerifySessionToken.mockResolvedValue({
    type: "assessly-session",
    sid: "test-session-id",
    uid: "test-user-id",
    role,
    cid: "test-company-id",
    vid: null,
    exp: Date.now() + 3_600_000,
  });
  mockFindUnique.mockResolvedValue(makeDbSession(role));
  mockUpdate.mockResolvedValue({});
}

function stubNoSession() {
  mockCookiesGet.mockReturnValue(undefined);
  mockVerifySessionToken.mockResolvedValue(null);
  mockFindUnique.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAdminUser", () => {
  it("resolves for SUPER_ADMIN", async () => {
    stubSession("SUPER_ADMIN");
    await expect(requireAdminUser()).resolves.toMatchObject({ role: "SUPER_ADMIN" });
  });

  it("resolves for ADMIN", async () => {
    stubSession("ADMIN");
    await expect(requireAdminUser()).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("throws FORBIDDEN for RISK_REVIEWER", async () => {
    stubSession("RISK_REVIEWER");
    await expect(requireAdminUser()).rejects.toThrow("FORBIDDEN");
  });

  it("throws FORBIDDEN for AUDITOR", async () => {
    stubSession("AUDITOR");
    await expect(requireAdminUser()).rejects.toThrow("FORBIDDEN");
  });

  it("throws FORBIDDEN for VENDOR", async () => {
    stubSession("VENDOR");
    await expect(requireAdminUser()).rejects.toThrow("FORBIDDEN");
  });
});

describe("requireInternalReadUser", () => {
  it("resolves for SUPER_ADMIN", async () => {
    stubSession("SUPER_ADMIN");
    await expect(requireInternalReadUser()).resolves.toMatchObject({ role: "SUPER_ADMIN" });
  });

  it("resolves for ADMIN", async () => {
    stubSession("ADMIN");
    await expect(requireInternalReadUser()).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("resolves for RISK_REVIEWER", async () => {
    stubSession("RISK_REVIEWER");
    await expect(requireInternalReadUser()).resolves.toMatchObject({ role: "RISK_REVIEWER" });
  });

  it("resolves for AUDITOR", async () => {
    stubSession("AUDITOR");
    await expect(requireInternalReadUser()).resolves.toMatchObject({ role: "AUDITOR" });
  });

  it("throws FORBIDDEN for VENDOR", async () => {
    stubSession("VENDOR");
    await expect(requireInternalReadUser()).rejects.toThrow("FORBIDDEN");
  });
});

describe("requireInternalWriteUser", () => {
  it("resolves for SUPER_ADMIN", async () => {
    stubSession("SUPER_ADMIN");
    await expect(requireInternalWriteUser()).resolves.toMatchObject({ role: "SUPER_ADMIN" });
  });

  it("resolves for ADMIN", async () => {
    stubSession("ADMIN");
    await expect(requireInternalWriteUser()).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("resolves for RISK_REVIEWER", async () => {
    stubSession("RISK_REVIEWER");
    await expect(requireInternalWriteUser()).resolves.toMatchObject({ role: "RISK_REVIEWER" });
  });

  it("throws FORBIDDEN for AUDITOR", async () => {
    stubSession("AUDITOR");
    await expect(requireInternalWriteUser()).rejects.toThrow("FORBIDDEN");
  });

  it("throws FORBIDDEN for VENDOR", async () => {
    stubSession("VENDOR");
    await expect(requireInternalWriteUser()).rejects.toThrow("FORBIDDEN");
  });
});

describe("requireSuperAdminUser", () => {
  it("resolves for SUPER_ADMIN", async () => {
    stubSession("SUPER_ADMIN");
    await expect(requireSuperAdminUser()).resolves.toMatchObject({ role: "SUPER_ADMIN" });
  });

  it("throws FORBIDDEN for ADMIN", async () => {
    stubSession("ADMIN");
    await expect(requireSuperAdminUser()).rejects.toThrow("FORBIDDEN");
  });

  it("throws FORBIDDEN for RISK_REVIEWER", async () => {
    stubSession("RISK_REVIEWER");
    await expect(requireSuperAdminUser()).rejects.toThrow("FORBIDDEN");
  });

  it("throws FORBIDDEN for AUDITOR", async () => {
    stubSession("AUDITOR");
    await expect(requireSuperAdminUser()).rejects.toThrow("FORBIDDEN");
  });

  it("throws FORBIDDEN for VENDOR", async () => {
    stubSession("VENDOR");
    await expect(requireSuperAdminUser()).rejects.toThrow("FORBIDDEN");
  });
});

describe("isAccessControlError", () => {
  it("returns true for UNAUTHENTICATED error", () => {
    expect(isAccessControlError(new Error("UNAUTHENTICATED"))).toBe(true);
  });

  it("returns true for FORBIDDEN error", () => {
    expect(isAccessControlError(new Error("FORBIDDEN"))).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isAccessControlError(new Error("Something else"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isAccessControlError(null)).toBe(false);
    expect(isAccessControlError("string")).toBe(false);
    expect(isAccessControlError(42)).toBe(false);
  });
});
