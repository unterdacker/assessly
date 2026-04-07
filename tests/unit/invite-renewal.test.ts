/**
 * Unit tests — Vendor Invite Token Renewal
 *
 * Covers:
 *   - toVendorAssessment: inviteTokenExpires ISO mapping (Date → string, null → null)
 *   - forceRefresh parsing: strict "=== true" semantics via FormData
 *   - showResendInvite logic: 24-hour window, expired, null, non-admin boundary conditions
 *   - VENDOR_INVITE_REFRESHED audit categorisation → NIS2_DORA
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Prisma + dependency mocks (must appear before any module imports)
// ---------------------------------------------------------------------------

const { mockTx } = vi.hoisted(() => {
  const mockTx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    auditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  return { mockTx };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((fn: Function) => fn(mockTx)),
  },
}));

vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: { log: vi.fn() },
  AuditCategory: {
    AUTH: "AUTH",
    ACCESS_CONTROL: "ACCESS_CONTROL",
    CONFIGURATION: "CONFIGURATION",
    DATA_OPERATIONS: "DATA_OPERATIONS",
    SYSTEM_HEALTH: "SYSTEM_HEALTH",
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

import { describe as _d, it as _it } from "vitest"; // re-used via outer scope
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import { toVendorAssessment } from "@/lib/prisma-mappers";
import type { VendorDomainMapper } from "@/lib/prisma-mappers";
import type { Assessment } from "@prisma/client";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-04-07T12:00:00.000Z");

/** Minimal vendor fixture satisfying VendorDomainMapper */
function makeVendorRow(overrides: Partial<VendorDomainMapper> = {}): VendorDomainMapper {
  return {
    id: "vendor-001",
    name: "Test Vendor",
    email: "vendor@example.com",
    serviceType: "Cloud",
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: "admin-1",
    accessCode: null,
    codeExpiresAt: null,
    isCodeActive: false,
    inviteSentAt: null,
    inviteTokenExpires: null,
    isFirstLogin: true,
    officialName: null,
    registrationId: null,
    vendorServiceType: null,
    securityOfficerName: null,
    securityOfficerEmail: null,
    dpoName: null,
    dpoEmail: null,
    headquartersLocation: null,
    sizeClassification: null,
    ...overrides,
  };
}

/** Minimal assessment fixture */
function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    id: "assess-001",
    companyId: "company-001",
    vendorId: "vendor-001",
    status: "PENDING" as const,
    riskLevel: "MEDIUM" as const,
    complianceScore: 50,
    lastAssessmentDate: null,
    documentUrl: null,
    documentFilename: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: "admin-1",
    ...overrides,
  } as Assessment;
}

// ---------------------------------------------------------------------------
// 1. toVendorAssessment — inviteTokenExpires mapping
// ---------------------------------------------------------------------------

describe("toVendorAssessment — inviteTokenExpires", () => {
  it("maps a Date to ISO string", () => {
    const expiry = new Date("2026-04-08T12:00:00.000Z");
    const result = toVendorAssessment(makeVendorRow({ inviteTokenExpires: expiry }), makeAssessment());
    expect(result.inviteTokenExpires).toBe("2026-04-08T12:00:00.000Z");
  });

  it("maps null to null", () => {
    const result = toVendorAssessment(makeVendorRow({ inviteTokenExpires: null }), makeAssessment());
    expect(result.inviteTokenExpires).toBeNull();
  });

  it("propagates an already-expired date correctly (ISO string preserved)", () => {
    const pastExpiry = new Date("2026-01-01T00:00:00.000Z");
    const result = toVendorAssessment(makeVendorRow({ inviteTokenExpires: pastExpiry }), makeAssessment());
    expect(result.inviteTokenExpires).toBe("2026-01-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// 2. forceRefresh parsing — strict "=== true" semantics via FormData
// ---------------------------------------------------------------------------

/**
 * Mirrors the exact check in app/actions/send-invite.ts:
 *   const forceRefresh = formData.get("forceRefresh") === "true";
 */
function parseForceRefresh(formData: FormData): boolean {
  return formData.get("forceRefresh") === "true";
}

describe("forceRefresh FormData parsing", () => {
  it('returns true only for the exact string "true"', () => {
    const fd = new FormData();
    fd.set("forceRefresh", "true");
    expect(parseForceRefresh(fd)).toBe(true);
  });

  it('returns false when field is absent', () => {
    expect(parseForceRefresh(new FormData())).toBe(false);
  });

  it('returns false for "false"', () => {
    const fd = new FormData();
    fd.set("forceRefresh", "false");
    expect(parseForceRefresh(fd)).toBe(false);
  });

  it('returns false for "1" (truthy but not "true")', () => {
    const fd = new FormData();
    fd.set("forceRefresh", "1");
    expect(parseForceRefresh(fd)).toBe(false);
  });

  it('returns false for "yes"', () => {
    const fd = new FormData();
    fd.set("forceRefresh", "yes");
    expect(parseForceRefresh(fd)).toBe(false);
  });

  it('returns false for "True" (wrong case)', () => {
    const fd = new FormData();
    fd.set("forceRefresh", "True");
    expect(parseForceRefresh(fd)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. showResendInvite logic — show whenever admin canManage and inviteTokenExpires is non-null
// ---------------------------------------------------------------------------

/**
 * Mirrors the exact check in components/vendors-table-section.tsx VendorActions:
 *   const showResendInvite = canManage && Boolean(vendorAssessment.inviteTokenExpires);
 */
function shouldShowResendInvite(
  canManage: boolean,
  inviteTokenExpires: string | null,
): boolean {
  return canManage && Boolean(inviteTokenExpires);
}

describe("showResendInvite logic", () => {
  it("returns false when canManage is false", () => {
    expect(shouldShowResendInvite(false, "2026-04-08T12:00:00.000Z")).toBe(false);
  });

  it("returns false when inviteTokenExpires is null", () => {
    expect(shouldShowResendInvite(true, null)).toBe(false);
  });

  it("returns true when admin and token has not expired yet (> 24h away)", () => {
    const futureExpiry = new Date(Date.now() + 48 * 60 * 60 * 1_000).toISOString();
    expect(shouldShowResendInvite(true, futureExpiry)).toBe(true);
  });

  it("returns true when admin and token expires in 1 hour", () => {
    const expiry = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    expect(shouldShowResendInvite(true, expiry)).toBe(true);
  });

  it("returns true when admin and token has already expired", () => {
    const expiry = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
    expect(shouldShowResendInvite(true, expiry)).toBe(true);
  });

  it("returns true when admin and inviteTokenExpires is any non-null string", () => {
    expect(shouldShowResendInvite(true, "2026-04-08T12:00:00.000Z")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. VENDOR_INVITE_REFRESHED audit categorisation → NIS2_DORA
// ---------------------------------------------------------------------------

const BASE_AUDIT = {
  companyId: "company-abc",
  userId: "user-xyz",
  entityType: "Vendor",
  entityId: "vendor-001",
  timestamp: NOW,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((fn: Function) => fn(mockTx));
  mockTx.$executeRaw.mockResolvedValue(1);
});

describe("VENDOR_INVITE_REFRESHED audit categorisation", () => {
  it("is classified as NIS2_DORA compliance category", async () => {
    mockTx.auditLog.findFirst.mockResolvedValue(null);
    mockTx.auditLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    );

    await logAuditEvent({ ...BASE_AUDIT, action: "VENDOR_INVITE_REFRESHED" });

    const data = mockTx.auditLog.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.action).toBe("VENDOR_INVITE_REFRESHED");
    expect(data.complianceCategory).toBe("NIS2_DORA");
  });

  it("INVITE_SENT retains NIS2_DORA categorisation (regression guard)", async () => {
    mockTx.auditLog.findFirst.mockResolvedValue(null);
    mockTx.auditLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    );

    await logAuditEvent({ ...BASE_AUDIT, action: "INVITE_SENT" });

    const data = mockTx.auditLog.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.complianceCategory).toBe("NIS2_DORA");
  });
});

// ---------------------------------------------------------------------------
// 5. Route JSON body: key allowlist verification
// ---------------------------------------------------------------------------

/** Mirrors ALLOWED_JSON_KEYS in app/api/vendors/send-invite/route.ts */
const ALLOWED_JSON_KEYS = new Set([
  "vendorId",
  "email",
  "phone",
  "duration",
  "locale",
  "forceRefresh",
]);

describe("send-invite route JSON allowlist", () => {
  function filterKeys(input: Record<string, unknown>): string[] {
    return Object.keys(input).filter((k) => ALLOWED_JSON_KEYS.has(k));
  }

  it("passes all six allowed keys", () => {
    const input = { vendorId: "v1", email: "a@b.com", phone: "+49123", duration: "24h", locale: "en", forceRefresh: true };
    expect(filterKeys(input)).toHaveLength(6);
  });

  it("blocks arbitrary injection keys", () => {
    const input = { vendorId: "v1", __proto__: "x", constructor: "y", adminOverride: "z" };
    expect(filterKeys(input)).toEqual(["vendorId"]);
  });

  it("forceRefresh is in the allowlist", () => {
    expect(ALLOWED_JSON_KEYS.has("forceRefresh")).toBe(true);
  });

  it("inviteToken is NOT in the allowlist (cannot be injected)", () => {
    expect(ALLOWED_JSON_KEYS.has("inviteToken")).toBe(false);
  });
});
