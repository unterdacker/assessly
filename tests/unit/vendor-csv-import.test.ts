import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockRequireAdminUser,
  mockIsAccessControlError,
  mockIsRateLimited,
  mockRegisterFailure,
  mockResetFailures,
  mockCalculateRiskLevel,
  mockParseRfc4180,
  mockRevalidatePath,
  mockRevalidateTag,
  mockFireWebhookEvent,
} = vi.hoisted(() => ({
  mockPrisma: {
    vendor: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
  mockRequireAdminUser: vi.fn(),
  mockIsAccessControlError: vi.fn().mockReturnValue(false),
  mockIsRateLimited: vi.fn().mockReturnValue(false),
  mockRegisterFailure: vi.fn(),
  mockResetFailures: vi.fn(),
  mockCalculateRiskLevel: vi.fn().mockReturnValue("LOW"),
  mockParseRfc4180: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockFireWebhookEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/server", () => ({
  requireAdminUser: mockRequireAdminUser,
  isAccessControlError: mockIsAccessControlError,
}));
vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: mockIsRateLimited,
  registerFailure: mockRegisterFailure,
  resetFailures: mockResetFailures,
}));
vi.mock("@/lib/risk-level", () => ({
  calculateRiskLevel: mockCalculateRiskLevel,
}));
vi.mock("@/lib/csv-parse", () => ({ parseRfc4180: mockParseRfc4180 }));
vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: { dataOp: vi.fn() },
}));
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
  revalidateTag: mockRevalidateTag,
}));
vi.mock("@/modules/webhooks/lib/fire-webhook-event", () => ({
  fireWebhookEvent: mockFireWebhookEvent,
}));
vi.mock("@/lib/queries/dashboard-risk-posture", () => ({
  RISK_POSTURE_CACHE_TAG: "risk-posture",
}));

import { importVendorsCsvAction } from "@/app/actions/vendor-csv-import";

const HEADER_ROW = ["name", "email", "serviceType"];

function makeVendorRow(index: number) {
  return [`Vendor ${index}`, `vendor${index}@example.com`, `SaaS ${index}`];
}

function makeCsvRows(count: number): string[][] {
  return [HEADER_ROW, ...Array.from({ length: count }, (_, i) => makeVendorRow(i + 1))];
}

function makeCreatedVendor(i: number) {
  return {
    id: `vendor-id-${i}`,
    serviceType: `SaaS ${i}`,
    createdAt: new Date(`2026-04-15T00:00:0${i % 10}.000Z`),
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockRequireAdminUser.mockResolvedValue({ userId: "u1", companyId: "co1", role: "ADMIN" });
  mockIsRateLimited.mockReturnValue(false);
  mockCalculateRiskLevel.mockReturnValue("LOW");
  mockFireWebhookEvent.mockResolvedValue(undefined);
  mockPrisma.vendor.findMany.mockResolvedValue([]);
});

function setupTransactionForRows(count: number) {
  let callCount = 0;
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    callCount++;
    const i = callCount;
    const mockTx = {
      vendor: {
        create: vi.fn().mockResolvedValue(makeCreatedVendor(i)),
      },
      assessment: {
        create: vi.fn().mockResolvedValue({ id: `assessment-${i}` }),
      },
    };
    return fn(mockTx);
  });
}

describe("importVendorsCsvAction webhook behavior", () => {
  it("fires vendor.created once per successfully created vendor", async () => {
    const rows = makeCsvRows(3);
    mockParseRfc4180.mockReturnValue(rows);
    setupTransactionForRows(3);

    const result = await importVendorsCsvAction({ csvContent: "csv-content" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.created).toBe(3);
    expect(mockFireWebhookEvent).toHaveBeenCalledTimes(3);
    expect(mockFireWebhookEvent).toHaveBeenNthCalledWith(1, "co1", {
      event: "vendor.created",
      vendorId: "vendor-id-1",
      companyId: "co1",
      serviceType: "SaaS 1",
      createdAt: expect.any(String),
    });
  });

  it("does not fire for skipped (duplicate) rows", async () => {
    // Make row 2 a duplicate of row 1 by pre-populating existingEmails
    const rows = [
      HEADER_ROW,
      ["Vendor 1", "vendor1@example.com", "SaaS"],
      ["Vendor 2", "vendor1@example.com", "SaaS"], // same email = duplicate
    ];
    mockParseRfc4180.mockReturnValue(rows);
    let callCount = 0;
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      callCount++;
      const mockTx = {
        vendor: { create: vi.fn().mockResolvedValue(makeCreatedVendor(callCount)) },
        assessment: { create: vi.fn().mockResolvedValue({ id: "assessment-1" }) },
      };
      return fn(mockTx);
    });

    const result = await importVendorsCsvAction({ csvContent: "csv-content" });

    expect(result.ok).toBe(true);
    // Only 1 created, 1 skipped
    expect(mockFireWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("does not fire for rows where the transaction fails", async () => {
    const rows = makeCsvRows(2);
    mockParseRfc4180.mockReturnValue(rows);
    let callCount = 0;
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      callCount++;
      if (callCount === 1) throw new Error("db-error");
      const mockTx = {
        vendor: { create: vi.fn().mockResolvedValue(makeCreatedVendor(2)) },
        assessment: { create: vi.fn().mockResolvedValue({ id: "assessment-2" }) },
      };
      return fn(mockTx);
    });

    const result = await importVendorsCsvAction({ csvContent: "csv-content" });

    expect(result.ok).toBe(true);
    // Row 1 failed, row 2 succeeded
    expect(mockFireWebhookEvent).toHaveBeenCalledTimes(1);
    expect(mockFireWebhookEvent).toHaveBeenCalledWith("co1", expect.objectContaining({ vendorId: "vendor-id-2" }));
  });

  it("caps webhook deliveries at 50 even when more rows are created", async () => {
    const rows = makeCsvRows(55);
    mockParseRfc4180.mockReturnValue(rows);
    setupTransactionForRows(55);

    const result = await importVendorsCsvAction({ csvContent: "csv-content" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.created).toBe(55);
    // Budget is 50 - only 50 webhook calls despite 55 created
    expect(mockFireWebhookEvent).toHaveBeenCalledTimes(50);
  });
});
