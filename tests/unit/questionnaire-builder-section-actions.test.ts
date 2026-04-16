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
    templateSection: {
      findFirst: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    questionnaireTemplate: {
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
}));
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));
vi.mock("@/lib/logger", () => ({
  logErrorReport: mockLogErrorReport,
}));

import { createSection } from "@/modules/questionnaire-builder/actions/section-actions";
import { ActionRateLimitError } from "@/lib/action-rate-limit";

describe("createSection", () => {
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

  it("should create a section successfully", async () => {
    const mockSection = {
      id: "clx1234567890abcdefghij",
      templateId: "clx0987654321zyxwvutsrq",
      title: "Security Section",
      description: "Test description",
      orderIndex: 0,
    };

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          questionnaireTemplate: {
            findFirst: vi.fn().mockResolvedValue({ id: "clx0987654321zyxwvutsrq", companyId: "co1" }),
          },
          templateSection: {
            count: vi.fn().mockResolvedValue(0),
            aggregate: vi.fn().mockResolvedValue({ _max: { orderIndex: null } }),
            create: vi.fn().mockResolvedValue(mockSection),
          },
        };
        return fn(mockTx);
      }
    );

    const result = await createSection({
      templateId: "clx0987654321zyxwvutsrq",
      title: "Security Section",
      description: "Test description",
    });

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("clx1234567890abcdefghij");
    expect(mockCheckActionRateLimit).toHaveBeenCalledWith("section-create:co1", {
      maxAttempts: 20,
      windowMs: 60_000,
    });
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action_name: "template_section.created",
        status: "success",
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should reject when rate limit is exceeded", async () => {
    mockCheckActionRateLimit.mockRejectedValue(new ActionRateLimitError(60_000));

    const result = await createSection({
      templateId: "clx0987654321zyxwvutsrq",
      title: "Security Section",
      description: "Test description",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Too many requests");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await createSection({
      templateId: "clx0987654321zyxwvutsrq",
      title: "Security Section",
      description: "Test description",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Premium plan required.");
    expect(mockCheckActionRateLimit).not.toHaveBeenCalled();
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValueOnce(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await createSection({
      templateId: "clx0987654321zyxwvutsrq",
      title: "Security Section",
      description: "Test description",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when section cap is exceeded", async () => {
    mockPrisma.$transaction.mockImplementation(async () => {
      throw new Error("CAP_EXCEEDED");
    });

    const result = await createSection({
      templateId: "clx0987654321zyxwvutsrq",
      title: "Security Section",
      description: "Test description",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Maximum of");
    expect(result.error).toContain("sections per template reached");
  });
});
