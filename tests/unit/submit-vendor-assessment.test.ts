import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockRevalidatePath,
  mockFireWebhookEvent,
} = vi.hoisted(() => ({
  mockPrisma: {
    vendor: { findFirst: vi.fn() },
    assessment: { update: vi.fn() },
  },
  mockRevalidatePath: vi.fn(),
  mockFireWebhookEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/modules/webhooks/lib/fire-webhook-event", () => ({
  fireWebhookEvent: mockFireWebhookEvent,
}));

import { submitExternalAssessment } from "@/app/actions/submit-vendor-assessment";

const FUTURE_DATE = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

const FAKE_VENDOR = {
  id: "vendor-1",
  companyId: "co1",
  inviteToken: "fake-token-hash", // will be matched via sha256 in actual code
  isCodeActive: true,
  inviteTokenExpires: FUTURE_DATE,
  codeExpiresAt: FUTURE_DATE,
  assessment: {
    id: "assessment-1",
    riskLevel: "MEDIUM",
    complianceScore: 55,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFireWebhookEvent.mockResolvedValue(undefined);
  mockPrisma.assessment.update.mockResolvedValue({ id: "assessment-1", status: "COMPLETED" });
});

describe("submitExternalAssessment webhook behavior", () => {
  it("fires assessment.completed with fields from vendor.companyId and vendor.assessment after successful update", async () => {
    // The action hashes the token and queries by hash. We mock findFirst to return vendor when called.
    mockPrisma.vendor.findFirst.mockResolvedValueOnce(FAKE_VENDOR);

    const result = await submitExternalAssessment({
      vendorId: "vendor-1",
      assessmentId: "assessment-1",
      token: "any-token", // actual hash computed inside action; we mock the DB response
    });

    expect(result.ok).toBe(true);
    expect(mockFireWebhookEvent).toHaveBeenCalledOnce();
    expect(mockFireWebhookEvent).toHaveBeenCalledWith("co1", {
      event: "assessment.completed",
      assessmentId: "assessment-1",
      vendorId: "vendor-1",
      companyId: "co1",
      riskLevel: "MEDIUM",
      complianceScore: 55,
      completedAt: expect.any(String),
    });
  });

  it("uses vendor.companyId (from DB row) - not any user-supplied value", async () => {
    mockPrisma.vendor.findFirst.mockResolvedValueOnce({
      ...FAKE_VENDOR,
      companyId: "co-from-db",
    });

    await submitExternalAssessment({
      vendorId: "vendor-1",
      assessmentId: "assessment-1",
      token: "any-token",
    });

    expect(mockFireWebhookEvent).toHaveBeenCalledWith(
      "co-from-db",
      expect.objectContaining({ companyId: "co-from-db" }),
    );
  });

  it("does not fire when vendor is not found (invalid token)", async () => {
    mockPrisma.vendor.findFirst.mockResolvedValueOnce(null);

    const result = await submitExternalAssessment({
      vendorId: "vendor-1",
      assessmentId: "assessment-1",
      token: "bad-token",
    });

    expect(result.ok).toBe(false);
    expect(mockFireWebhookEvent).not.toHaveBeenCalled();
  });

  it("does not fire when the invite link is expired", async () => {
    const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    mockPrisma.vendor.findFirst.mockResolvedValueOnce({
      ...FAKE_VENDOR,
      inviteTokenExpires: pastDate,
      codeExpiresAt: pastDate,
    });

    const result = await submitExternalAssessment({
      vendorId: "vendor-1",
      assessmentId: "assessment-1",
      token: "any-token",
    });

    expect(result.ok).toBe(false);
    expect(mockFireWebhookEvent).not.toHaveBeenCalled();
  });

  it("does not fire when assessmentId does not match vendor's assessment", async () => {
    mockPrisma.vendor.findFirst.mockResolvedValueOnce({
      ...FAKE_VENDOR,
      assessment: { id: "different-assessment-id", riskLevel: "LOW", complianceScore: 10 },
    });

    const result = await submitExternalAssessment({
      vendorId: "vendor-1",
      assessmentId: "assessment-1", // mismatch
      token: "any-token",
    });

    expect(result.ok).toBe(false);
    expect(mockFireWebhookEvent).not.toHaveBeenCalled();
  });
});
