import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = mockDeep<PrismaClient>();

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockPrisma;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: { log: vi.fn(), dataOp: vi.fn(), accessControl: vi.fn() },
  AuditCategory: { DATA_OPERATIONS: "DATA_OPERATIONS" },
  LogLevel: { INFO: "info", WARN: "warn", ERROR: "error" },
}));
vi.mock("@/lib/action-rate-limit", () => ({
  ActionRateLimitError: class ActionRateLimitError extends Error {
    retryAfterMs: number;
    constructor(retryAfterMs: number) {
      super("Rate limit exceeded");
      this.name = "ActionRateLimitError";
      this.retryAfterMs = retryAfterMs;
    }
  },
  checkActionRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/enterprise-bridge", () => {
  class PremiumGateError extends Error {
    companyId: string;
    constructor(companyId: string) {
      super(`Premium required for ${companyId}`);
      this.name = "PremiumGateError";
      this.companyId = companyId;
    }
  }
  return {
    PremiumGateError,
    requirePremiumPlan: vi.fn().mockResolvedValue(undefined),
    isPremiumFeatureEnabled: vi.fn().mockResolvedValue(true),
  };
});

vi.mock("@/lib/plan-gate", () => ({
  isPremiumPlan: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAdminUser: vi.fn().mockResolvedValue({
    userId: "clxuseradmin0000000001a",
    role: "ADMIN",
    companyId: "clxcompany00000000001a",
    displayName: "Admin",
    email: "admin@test.com",
  }),
  requireInternalWriteUser: vi.fn().mockResolvedValue({
    userId: "clxuseradmin0000000001a",
    role: "ADMIN",
    companyId: "clxcompany00000000001a",
    displayName: "Admin",
    email: "admin@test.com",
  }),
}));

// ── Import SUT AFTER mocks ─────────────────────────────────────────────────
import { reassignAssessmentReviewer } from "@/modules/approval-workflow/actions/approval-actions";
import { requirePremiumPlan, PremiumGateError } from "@/lib/enterprise-bridge";
import { requireAdminUser } from "@/lib/auth/server";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("reassignAssessmentReviewer", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
    vi.mocked(requireAdminUser).mockResolvedValue({
      userId: "clxuseradmin0000000001a",
      role: "ADMIN",
      companyId: "clxcompany00000000001a",
      displayName: "Admin",
      email: "admin@test.com",
    } as never);
    vi.mocked(requirePremiumPlan).mockResolvedValue(undefined);
  });

  it("allows ADMIN to reassign reviewer on PREMIUM plan", async () => {
    // Verify new reviewer exists in same company
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "clxuserreviewer00002a",
      displayName: "New Reviewer",
      email: "reviewer2@test.com",
    } as never);

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return fn(mockPrisma);
    });
    mockPrisma.assessment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.assessment.findUnique.mockResolvedValue({ status: "UNDER_REVIEW" } as never);
    mockPrisma.assessmentApprovalStep.create.mockResolvedValue({} as never);

    const result = await reassignAssessmentReviewer({
      assessmentId: "clxassessment0000001a",
      newReviewerUserId: "clxuserreviewer00002a",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.assessment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { reviewerUserId: "clxuserreviewer00002a" },
      }),
    );
  });

  it("blocks reassignment on FREE plan (PremiumGateError)", async () => {
    vi.mocked(requirePremiumPlan).mockRejectedValue(new PremiumGateError("clxcompany00000000001a"));

    const result = await reassignAssessmentReviewer({
      assessmentId: "clxassessment0000001a",
      newReviewerUserId: "clxuserreviewer00002a",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/premium/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects when new reviewer is not in the same company", async () => {
    // Reviewer not found in comp-1
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const result = await reassignAssessmentReviewer({
      assessmentId: "clxassessment0000001a",
      newReviewerUserId: "clxuserreviewer99999a",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid reviewer/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
