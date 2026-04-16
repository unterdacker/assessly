import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockRequireAdminUser,
  mockIsAccessControlError,
  mockRequirePremiumPlan,
  mockCheckActionRateLimit,
  mockAuditLogger,
  mockRevalidatePath,
  mockLogErrorReport,
} = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    templateQuestion: {
      findFirst: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    templateSection: {
      findFirst: vi.fn(),
    },
  },
  mockRequireAdminUser: vi.fn(),
  mockIsAccessControlError: vi.fn().mockReturnValue(false),
  mockRequirePremiumPlan: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockAuditLogger: {
    log: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockLogErrorReport: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/server", () => ({
  requireAdminUser: mockRequireAdminUser,
  isAccessControlError: mockIsAccessControlError,
}));
vi.mock("@/lib/enterprise-bridge", () => ({
  requirePremiumPlan: mockRequirePremiumPlan,
}));
vi.mock("@/lib/action-rate-limit", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  ActionRateLimitError: class ActionRateLimitError extends Error {
    constructor(public readonly retryAfterMs: number) {
      super("Rate limit exceeded");
      this.name = "ActionRateLimitError";
    }
  },
}));
vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: mockAuditLogger,
  AuditCategory: {
    CONFIGURATION: "CONFIGURATION",
  },
  LogLevel: {
    DEBUG: "debug",
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
    FATAL: "fatal",
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));
vi.mock("@/lib/logger", () => ({
  logErrorReport: mockLogErrorReport,
}));

import { createQuestion } from "@/modules/questionnaire-builder/actions/question-actions";
import { ActionRateLimitError } from "@/lib/action-rate-limit";

describe("createQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireAdminUser.mockResolvedValue({
      userId: "u1",
      companyId: "co1",
      role: "ADMIN",
    });

    mockRequirePremiumPlan.mockResolvedValue(undefined);
    mockCheckActionRateLimit.mockResolvedValue(undefined);
  });

  it("should create a question successfully", async () => {
    const mockQuestion = {
      id: "clx1111111111111111111",
      sectionId: "clx2222222222222222222",
      text: "Do you have MFA enabled?",
      helpText: "Multi-factor authentication",
      type: "BOOLEAN",
      isRequired: true,
      orderIndex: 0,
      options: null,
      scaleMin: null,
      scaleMax: null,
    };

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          templateSection: {
            findFirst: vi.fn().mockResolvedValue({
              id: "clx2222222222222222222",
              templateId: "clx0987654321zyxwvutsrq",
              template: { companyId: "co1" },
            }),
          },
          templateQuestion: {
            count: vi.fn().mockResolvedValue(0),
            aggregate: vi.fn().mockResolvedValue({ _max: { orderIndex: null } }),
            create: vi.fn().mockResolvedValue(mockQuestion),
          },
        };
        return fn(mockTx);
      }
    );

    const result = await createQuestion({
      sectionId: "clx2222222222222222222",
      text: "Do you have MFA enabled?",
      helpText: "Multi-factor authentication",
      type: "BOOLEAN",
      isRequired: true,
      options: null,
      scaleMin: null,
      scaleMax: null,
    });

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("clx1111111111111111111");
    expect(mockCheckActionRateLimit).toHaveBeenCalledWith("question-create:co1", {
      maxAttempts: 30,
      windowMs: 60_000,
    });
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "template_question.created",
        status: "success",
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should reject when rate limit is exceeded", async () => {
    mockCheckActionRateLimit.mockRejectedValue(new ActionRateLimitError(60_000));

    const result = await createQuestion({
      sectionId: "clx2222222222222222222",
      text: "Do you have MFA enabled?",
      helpText: null,
      type: "BOOLEAN",
      isRequired: true,
      options: null,
      scaleMin: null,
      scaleMax: null,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Too many requests");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await createQuestion({
      sectionId: "clx2222222222222222222",
      text: "Do you have MFA enabled?",
      helpText: null,
      type: "BOOLEAN",
      isRequired: true,
      options: null,
      scaleMin: null,
      scaleMax: null,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Premium plan required.");
    expect(mockCheckActionRateLimit).not.toHaveBeenCalled();
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValueOnce(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await createQuestion({
      sectionId: "clx2222222222222222222",
      text: "Do you have MFA enabled?",
      helpText: null,
      type: "BOOLEAN",
      isRequired: true,
      options: null,
      scaleMin: null,
      scaleMax: null,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when question cap is exceeded", async () => {
    mockPrisma.$transaction.mockImplementation(async () => {
      throw new Error("CAP_EXCEEDED");
    });

    const result = await createQuestion({
      sectionId: "clx2222222222222222222",
      text: "Do you have MFA enabled?",
      helpText: null,
      type: "BOOLEAN",
      isRequired: true,
      options: null,
      scaleMin: null,
      scaleMax: null,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Maximum of");
    expect(result.error).toContain("questions per section reached");
  });

  it("should create a question with scale options", async () => {
    const mockQuestion = {
      id: "clx3333333333333333333",
      sectionId: "clx2222222222222222222",
      text: "Rate your security maturity",
      helpText: null,
      type: "SCALE",
      isRequired: true,
      orderIndex: 0,
      options: null,
      scaleMin: 1,
      scaleMax: 5,
    };

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          templateSection: {
            findFirst: vi.fn().mockResolvedValue({
              id: "clx2222222222222222222",
              templateId: "clx0987654321zyxwvutsrq",
              template: { companyId: "co1" },
            }),
          },
          templateQuestion: {
            count: vi.fn().mockResolvedValue(0),
            aggregate: vi.fn().mockResolvedValue({ _max: { orderIndex: null } }),
            create: vi.fn().mockResolvedValue(mockQuestion),
          },
        };
        return fn(mockTx);
      }
    );

    const result = await createQuestion({
      sectionId: "clx2222222222222222222",
      text: "Rate your security maturity",
      helpText: null,
      type: "SCALE",
      isRequired: true,
      options: null,
      scaleMin: 1,
      scaleMax: 5,
    });

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("clx3333333333333333333");
  });
});
