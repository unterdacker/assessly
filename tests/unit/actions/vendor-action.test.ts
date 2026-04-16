import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  mockRevalidatePath,
  mockRevalidateTag,
  mockVendorCreate,
  mockVendorFindFirst,
  mockVendorUpdate,
  mockVendorDelete,
  mockVendorDeleteMany,
  mockVendorFindMany,
  mockAssessmentCreate,
  mockPrismaTransaction,
  mockRequireAdminUser,
  mockIsAccessControlError,
  mockLogAuditEvent,
  mockGetDefaultCompanyId,
  mockCalculateRiskLevel,
  mockFireWebhookEvent,
  mockBcryptHash,
} = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockVendorCreate: vi.fn(),
  mockVendorFindFirst: vi.fn(),
  mockVendorUpdate: vi.fn(),
  mockVendorDelete: vi.fn(),
  mockVendorDeleteMany: vi.fn(),
  mockVendorFindMany: vi.fn(),
  mockAssessmentCreate: vi.fn(),
  mockPrismaTransaction: vi.fn(),
  mockRequireAdminUser: vi.fn(),
  mockIsAccessControlError: vi.fn(),
  mockLogAuditEvent: vi.fn(),
  mockGetDefaultCompanyId: vi.fn(),
  mockCalculateRiskLevel: vi.fn(),
  mockFireWebhookEvent: vi.fn(),
  mockBcryptHash: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("bcryptjs", () => ({ default: { hash: mockBcryptHash } }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath, revalidateTag: mockRevalidateTag }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vendor: {
      create: mockVendorCreate,
      findFirst: mockVendorFindFirst,
      update: mockVendorUpdate,
      delete: mockVendorDelete,
      deleteMany: mockVendorDeleteMany,
      findMany: mockVendorFindMany,
    },
    assessment: { create: mockAssessmentCreate },
    $transaction: mockPrismaTransaction,
  },
}));
vi.mock("@/lib/queries/vendor-assessments", () => ({ getDefaultCompanyId: mockGetDefaultCompanyId }));
vi.mock("@/lib/risk-level", () => ({ calculateRiskLevel: mockCalculateRiskLevel }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/auth/server", () => ({
  isAccessControlError: mockIsAccessControlError,
  requireAdminUser: mockRequireAdminUser,
}));
vi.mock("@/lib/structured-logger", () => ({ AuditLogger: { dataOp: vi.fn() } }));
vi.mock("@/modules/webhooks/lib/fire-webhook-event", () => ({ fireWebhookEvent: mockFireWebhookEvent }));
vi.mock("@/lib/queries/dashboard-risk-posture", () => ({ RISK_POSTURE_CACHE_TAG: "risk-posture" }));

import {
  createVendorAction,
  generateVendorAccessCodeAction,
  voidVendorAccessCodeAction,
  deleteVendorAction,
  deleteVendorsAction,
} from "@/app/actions/vendor-actions";

const ADMIN_SESSION = { userId: "admin1", companyId: "co1", role: "ADMIN" as const, email: "admin@example.com" };

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

describe("vendor actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue(ADMIN_SESSION);
    mockPrismaTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          vendor: {
            create: mockVendorCreate,
            update: mockVendorUpdate,
            findFirst: mockVendorFindFirst,
            delete: mockVendorDelete,
            deleteMany: mockVendorDeleteMany,
            findMany: mockVendorFindMany,
          },
          assessment: { create: mockAssessmentCreate },
        }),
    );
    mockGetDefaultCompanyId.mockResolvedValue("co1");
    mockCalculateRiskLevel.mockReturnValue("LOW");
    mockIsAccessControlError.mockReturnValue(false);
    mockBcryptHash.mockResolvedValue("$2b$12$hashedpassword");
    mockLogAuditEvent.mockResolvedValue(undefined);
    mockFireWebhookEvent.mockResolvedValue(undefined);
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  describe("createVendorAction", () => {
    it("returns error when name is missing", async () => {
      const result = await createVendorAction(makeFormData({ name: "", email: "vendor@example.com" }));
      expect(result).toEqual({ ok: false, error: "Organization name is required." });
    });

    it("returns error when email is missing", async () => {
      const result = await createVendorAction(makeFormData({ name: "Test Vendor", email: "" }));
      expect(result).toEqual({ ok: false, error: "Security contact email is required." });
    });

    it("creates vendor and assessment in transaction, returns { ok: true }", async () => {
      const createdVendor = { id: "v1", serviceType: "SaaS", createdAt: new Date() };
      mockVendorCreate.mockResolvedValue(createdVendor);
      mockAssessmentCreate.mockResolvedValue({ id: "a1" });
      const result = await createVendorAction(makeFormData({ name: "Test Vendor", email: "vendor@example.com" }));
      expect(result).toEqual({ ok: true });
      expect(mockVendorCreate).toHaveBeenCalled();
      expect(mockAssessmentCreate).toHaveBeenCalled();
    });

    it("returns { ok: false, error: 'Unauthorized.' } when isAccessControlError", async () => {
      const accessError = new Error("Access denied");
      mockPrismaTransaction.mockRejectedValue(accessError);
      mockIsAccessControlError.mockReturnValue(true);
      const result = await createVendorAction(makeFormData({ name: "Test Vendor", email: "vendor@example.com" }));
      expect(result).toEqual({ ok: false, error: "Unauthorized." });
    });

    it("calls fireWebhookEvent with companyId and vendor.created event", async () => {
      mockVendorCreate.mockResolvedValue({ id: "v1", serviceType: "SaaS", createdAt: new Date() });
      mockAssessmentCreate.mockResolvedValue({ id: "a1" });
      await createVendorAction(makeFormData({ name: "Test Vendor", email: "vendor@example.com" }));
      // fireWebhookEvent is called fire-and-forget (void), wait a tick
      await new Promise((r) => setTimeout(r, 0));
      expect(mockFireWebhookEvent).toHaveBeenCalledWith(
        "co1",
        expect.objectContaining({ event: "vendor.created" }),
      );
    });
  });

  describe("generateVendorAccessCodeAction", () => {
    it("returns error when vendorId is empty", async () => {
      const result = await generateVendorAccessCodeAction("", "24h");
      expect(result).toEqual({ ok: false, error: "Invalid vendor identifier." });
    });

    it("returns error when vendor not found in company", async () => {
      mockVendorFindFirst.mockResolvedValue(null);
      const result = await generateVendorAccessCodeAction("v999", "24h");
      expect(result).toEqual({ ok: false, error: "Could not generate access code. Try again." });
    });

    it("generates access code in XXXX-XXXX format and returns ok: true", async () => {
      mockVendorFindFirst.mockResolvedValue({ id: "v1", name: "Test Vendor", companyId: "co1" });
      mockVendorUpdate.mockResolvedValue({ id: "v1" });
      const result = await generateVendorAccessCodeAction("v1", "24h");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.accessCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
        expect(result.tempPassword).toBeDefined();
        expect(result.codeExpiresAt).toBeDefined();
      }
    });

    it("resolves 30d duration to ~30 days expiry", async () => {
      mockVendorFindFirst.mockResolvedValue({ id: "v1", name: "Test Vendor", companyId: "co1" });
      mockVendorUpdate.mockResolvedValue({ id: "v1" });
      const result = await generateVendorAccessCodeAction("v1", "30d");
      expect(result.ok).toBe(true);
      if (result.ok) {
        const expiresAt = new Date(result.codeExpiresAt);
        const diffDays = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        expect(diffDays).toBeGreaterThan(29);
        expect(diffDays).toBeLessThan(31);
      }
    });

    it("retries once on unique collision (P2002) then succeeds", async () => {
      mockVendorFindFirst.mockResolvedValue({ id: "v1", name: "Test Vendor", companyId: "co1" });
      mockVendorUpdate
        .mockRejectedValueOnce({ code: "P2002" })
        .mockResolvedValueOnce({ id: "v1" });

      const result = await generateVendorAccessCodeAction("v1", "24h");

      expect(result.ok).toBe(true);
      expect(mockVendorUpdate).toHaveBeenCalledTimes(2);
    });

    it("returns generic error when all 10 retries are exhausted", async () => {
      mockVendorFindFirst.mockResolvedValue({ id: "v1", name: "Test Vendor", companyId: "co1" });
      mockVendorUpdate.mockImplementation(() => Promise.reject({ code: "P2002" }));

      const result = await generateVendorAccessCodeAction("v1", "24h");

      expect(result).toEqual({ ok: false, error: "Could not generate access code. Try again." });
      expect(mockVendorUpdate).toHaveBeenCalledTimes(10);
    });

    it("returns schema-not-ready error when access-code columns are missing", async () => {
      mockVendorFindFirst.mockResolvedValue({ id: "v1", name: "Test Vendor", companyId: "co1" });
      mockVendorUpdate.mockRejectedValue(new Error("Unknown argument `accessCode`"));

      const result = await generateVendorAccessCodeAction("v1", "24h");

      expect(result).toEqual({
        ok: false,
        error: "Access code feature is not ready yet. Run: npx prisma migrate dev && npx prisma generate",
      });
    });
  });

  describe("voidVendorAccessCodeAction", () => {
    it("returns error when vendorId is empty", async () => {
      const result = await voidVendorAccessCodeAction("");
      expect(result).toEqual({ ok: false, error: "Invalid vendor identifier." });
    });

    it("clears access code fields, returns { ok: true }", async () => {
      mockVendorFindFirst.mockResolvedValue({ id: "v1", isFirstLogin: false });
      mockVendorUpdate.mockResolvedValue({ id: "v1" });
      const result = await voidVendorAccessCodeAction("v1");
      expect(result).toEqual({ ok: true });
      expect(mockVendorUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "v1" },
          data: expect.objectContaining({ accessCode: null, codeExpiresAt: null, isCodeActive: false }),
        }),
      );
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "ACCESS_CODE_VOIDED", entityId: "v1" }),
        expect.anything(),
      );
    });

    it("clears passwordHash/inviteSentAt when isFirstLogin=true", async () => {
      mockVendorFindFirst.mockResolvedValue({ id: "v1", isFirstLogin: true });
      mockVendorUpdate.mockResolvedValue({ id: "v1" });
      await voidVendorAccessCodeAction("v1");
      expect(mockVendorUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: null, inviteSentAt: null }),
        }),
      );
    });
  });

  describe("deleteVendorAction", () => {
    it("returns error when vendor not found", async () => {
      mockVendorFindFirst.mockResolvedValue(null);
      const result = await deleteVendorAction("v999");
      expect(result).toEqual({ ok: false, error: "Could not delete vendor. Try again." });
    });

    it("deletes vendor and logs audit event", async () => {
      mockVendorFindFirst.mockResolvedValue({ id: "v1", name: "Test Vendor" });
      mockVendorDelete.mockResolvedValue({ id: "v1" });
      const result = await deleteVendorAction("v1");
      expect(result).toEqual({ ok: true });
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "VENDOR_DELETED" }),
        expect.anything(),
      );
    });
  });

  describe("deleteVendorsAction", () => {
    it("deletes selected vendors and returns deleted count", async () => {
      mockVendorFindMany.mockResolvedValue([
        { id: "v1", name: "Vendor One" },
        { id: "v2", name: "Vendor Two" },
      ]);
      mockVendorDeleteMany.mockResolvedValue({ count: 2 });

      const result = await deleteVendorsAction(["v1", "v2"]);

      expect(result).toEqual({ ok: true, deletedCount: 2 });
      expect(mockVendorDeleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ["v1", "v2"] }, companyId: "co1" } }),
      );
    });

    it("returns partial success when only some requested vendors exist", async () => {
      mockVendorFindMany.mockResolvedValue([{ id: "v1", name: "Vendor One" }]);
      mockVendorDeleteMany.mockResolvedValue({ count: 1 });

      const result = await deleteVendorsAction(["v1", "v-missing"]);

      expect(result).toEqual({ ok: true, deletedCount: 1 });
    });

    it("returns unauthorized error when access control fails", async () => {
      const accessError = new Error("Access denied");
      mockPrismaTransaction.mockRejectedValue(accessError);
      mockIsAccessControlError.mockReturnValue(true);

      const result = await deleteVendorsAction(["v1"]);

      expect(result).toEqual({ ok: false, error: "Unauthorized." });
    });
  });
});
