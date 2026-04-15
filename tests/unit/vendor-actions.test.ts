import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockRequireAdminUser,
  mockIsAccessControlError,
  mockGetDefaultCompanyId,
  mockCalculateRiskLevel,
  mockLogAuditEvent,
  mockRevalidatePath,
  mockRevalidateTag,
  mockFireWebhookEvent,
} = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
  },
  mockRequireAdminUser: vi.fn(),
  mockIsAccessControlError: vi.fn().mockReturnValue(false),
  mockGetDefaultCompanyId: vi.fn(),
  mockCalculateRiskLevel: vi.fn().mockReturnValue("LOW"),
  mockLogAuditEvent: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockFireWebhookEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/server", () => ({
  requireAdminUser: mockRequireAdminUser,
  isAccessControlError: mockIsAccessControlError,
}));
vi.mock("@/lib/queries/vendor-assessments", () => ({
  getDefaultCompanyId: mockGetDefaultCompanyId,
}));
vi.mock("@/lib/risk-level", () => ({
  calculateRiskLevel: mockCalculateRiskLevel,
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mockLogAuditEvent }));
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
vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return actual;
});
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed") } }));
vi.mock("@/lib/queries/dashboard-risk-posture", () => ({
  RISK_POSTURE_CACHE_TAG: "risk-posture",
}));

import { createVendorAction } from "@/app/actions/vendor-actions";

const FAKE_VENDOR = {
  id: "vendor-1",
  serviceType: "Pending classification",
  createdAt: new Date("2026-04-15T00:00:00.000Z"),
};

function makeFormData(name = "Acme Corp", email = "security@acme.com") {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("email", email);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();

  mockRequireAdminUser.mockResolvedValue({
    userId: "u1",
    companyId: "co1",
    role: "ADMIN",
  });

  mockCalculateRiskLevel.mockReturnValue("LOW");
  mockFireWebhookEvent.mockResolvedValue(undefined);
  mockLogAuditEvent.mockResolvedValue(undefined);

  // Default: transaction succeeds and creates the vendor
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const mockTx = {
      vendor: {
        create: vi.fn().mockResolvedValue(FAKE_VENDOR),
      },
      assessment: {
        create: vi.fn().mockResolvedValue({ id: "assessment-1" }),
      },
    };
    await mockLogAuditEvent({ companyId: "co1" }, { tx: mockTx });
    return fn(mockTx);
  });
});

describe("createVendorAction webhook behavior", () => {
  it("fires vendor.created with correct payload after successful transaction", async () => {
    const result = await createVendorAction(makeFormData());

    expect(result.ok).toBe(true);
    expect(mockFireWebhookEvent).toHaveBeenCalledOnce();
    expect(mockFireWebhookEvent).toHaveBeenCalledWith("co1", {
      event: "vendor.created",
      vendorId: FAKE_VENDOR.id,
      companyId: "co1",
      serviceType: FAKE_VENDOR.serviceType,
      createdAt: FAKE_VENDOR.createdAt.toISOString(),
    });
  });

  it("does not fire vendor.created when the transaction throws", async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("db-error"));

    const result = await createVendorAction(makeFormData());

    expect(result.ok).toBe(false);
    expect(mockFireWebhookEvent).not.toHaveBeenCalled();
  });

  it("does not fire when requireAdminUser throws an access control error", async () => {
    const err = new Error("FORBIDDEN");
    mockRequireAdminUser.mockRejectedValueOnce(err);
    mockIsAccessControlError.mockReturnValueOnce(true);

    await expect(createVendorAction(makeFormData())).rejects.toThrow("FORBIDDEN");
    expect(mockFireWebhookEvent).not.toHaveBeenCalled();
  });

  it("does not fire when name is missing", async () => {
    const fd = new FormData();
    fd.set("email", "security@acme.com");

    const result = await createVendorAction(fd);

    expect(result.ok).toBe(false);
    expect(mockFireWebhookEvent).not.toHaveBeenCalled();
  });
});
