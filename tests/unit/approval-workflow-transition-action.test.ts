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

vi.mock("@/lib/action-rate-limit", () => {
  class ActionRateLimitError extends Error {
    retryAfterMs: number;
    constructor(retryAfterMs: number) {
      super("Rate limit exceeded");
      this.name = "ActionRateLimitError";
      this.retryAfterMs = retryAfterMs;
    }
  }
  return {
    ActionRateLimitError,
    checkActionRateLimit: vi.fn().mockResolvedValue(undefined),
  };
});

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
    isPremiumFeatureEnabled: vi.fn().mockResolvedValue(false),
  };
});

vi.mock("@/lib/plan-gate", () => ({
  isPremiumPlan: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/auth/server", () => ({
  requireInternalWriteUser: vi.fn().mockResolvedValue({
    userId: "clxuseradmin0000000001a",
    role: "ADMIN",
    companyId: "clxcompany00000000001a",
    displayName: "Admin User",
    email: "admin@test.com",
  }),
  requireAdminUser: vi.fn().mockResolvedValue({
    userId: "clxuseradmin0000000001a",
    role: "ADMIN",
    companyId: "clxcompany00000000001a",
    displayName: "Admin User",
    email: "admin@test.com",
  }),
}));

// ── Import SUT AFTER all mocks ─────────────────────────────────────────────
import { transitionAssessmentStatus } from "@/modules/approval-workflow/actions/approval-actions";
import { checkActionRateLimit, ActionRateLimitError } from "@/lib/action-rate-limit";
import { requirePremiumPlan, PremiumGateError } from "@/lib/enterprise-bridge";
import { requireInternalWriteUser } from "@/lib/auth/server";
import { isPremiumPlan } from "@/lib/plan-gate";

// ── Helpers ────────────────────────────────────────────────────────────────

function mockAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: "clxassessment0000001a",
    status: "PENDING" as const,
    companyId: "clxcompany00000000001a",
    reviewerUserId: null,
    vendor: { name: "ACME Corp" },
    ...overrides,
  };
}

function setupTransaction() {
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
    return fn(mockPrisma);
  });
  mockPrisma.assessment.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.assessmentApprovalStep.create.mockResolvedValue({} as never);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("transitionAssessmentStatus", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
    // Reset mocks to defaults
    vi.mocked(requireInternalWriteUser).mockResolvedValue({
      userId: "clxuseradmin0000000001a",
      role: "ADMIN",
      companyId: "clxcompany00000000001a",
      displayName: "Admin User",
      email: "admin@test.com",
    } as never);
    vi.mocked(checkActionRateLimit).mockResolvedValue(undefined);
    vi.mocked(isPremiumPlan).mockResolvedValue(false);
    vi.mocked(requirePremiumPlan).mockResolvedValue(undefined);
  });

  it("allows PENDING → UNDER_REVIEW for RISK_REVIEWER on FREE plan", async () => {
    vi.mocked(requireInternalWriteUser).mockResolvedValue({
      userId: "clxuserreviewer00001a",
      role: "RISK_REVIEWER",
      companyId: "clxcompany00000000001a",
      displayName: "Reviewer",
      email: "reviewer@test.com",
    } as never);
    mockPrisma.assessment.findFirst.mockResolvedValue(mockAssessment() as never);
    setupTransaction();

    const result = await transitionAssessmentStatus({
      assessmentId: "clxassessment0000001a",
      toStatus: "UNDER_REVIEW",
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe("UNDER_REVIEW");
    expect(mockPrisma.assessment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "UNDER_REVIEW" } }),
    );
  });

  it("blocks PENDING → SUBMITTED on FREE plan (PremiumGateError)", async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(mockAssessment() as never);
    vi.mocked(requirePremiumPlan).mockRejectedValue(new PremiumGateError("clxcompany00000000001a"));

    const result = await transitionAssessmentStatus({
      assessmentId: "clxassessment0000001a",
      toStatus: "SUBMITTED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/premium/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects REJECTED transition when comment is missing", async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(
      mockAssessment({ status: "UNDER_REVIEW" }) as never,
    );

    const result = await transitionAssessmentStatus({
      assessmentId: "clxassessment0000001a",
      toStatus: "REJECTED",
      comment: null,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/comment/i);
  });

  it("rejects REJECTED transition when comment is too short (< 10 chars)", async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(
      mockAssessment({ status: "UNDER_REVIEW" }) as never,
    );

    const result = await transitionAssessmentStatus({
      assessmentId: "clxassessment0000001a",
      toStatus: "REJECTED",
      comment: "Too short",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/comment/i);
  });

  it("allows REJECTED with sufficient comment", async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(
      mockAssessment({ status: "UNDER_REVIEW" }) as never,
    );
    setupTransaction();

    const result = await transitionAssessmentStatus({
      assessmentId: "clxassessment0000001a",
      toStatus: "REJECTED",
      comment: "This needs more documentation before proceeding.",
    });

    expect(result.success).toBe(true);
  });

  it("blocks UNDER_REVIEW → COMPLETED for RISK_REVIEWER (ADMIN only)", async () => {
    vi.mocked(requireInternalWriteUser).mockResolvedValue({
      userId: "clxuserreviewer00001a",
      role: "RISK_REVIEWER",
      companyId: "clxcompany00000000001a",
      displayName: "Reviewer",
      email: "reviewer@test.com",
    } as never);
    mockPrisma.assessment.findFirst.mockResolvedValue(
      mockAssessment({ status: "UNDER_REVIEW" }) as never,
    );

    const result = await transitionAssessmentStatus({
      assessmentId: "clxassessment0000001a",
      toStatus: "COMPLETED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/permission/i);
  });

  it("returns error when rate limit is exceeded", async () => {
    vi.mocked(checkActionRateLimit).mockRejectedValue(new ActionRateLimitError(60000));
    mockPrisma.assessment.findFirst.mockResolvedValue(mockAssessment() as never);

    const result = await transitionAssessmentStatus({
      assessmentId: "clxassessment0000001a",
      toStatus: "UNDER_REVIEW",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rate limit/i);
  });

  it("returns error when assessment not found (multi-tenant isolation)", async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    const result = await transitionAssessmentStatus({
      assessmentId: "clxassess999otherco1a",
      toStatus: "UNDER_REVIEW",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
