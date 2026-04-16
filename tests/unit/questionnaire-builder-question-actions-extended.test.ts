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
  mockAuditLogger: { log: vi.fn() },
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
    DATA_OPERATIONS: "DATA_OPERATIONS",
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/logger", () => ({ logErrorReport: mockLogErrorReport }));

import {
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
} from "@/modules/questionnaire-builder/actions/question-actions";

describe("updateQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
  });

  it("should update a question text successfully", async () => {
    mockPrisma.templateQuestion.findFirst.mockResolvedValue({
      id: "clx0987654321zyxwvutsrq",
      sectionId: "clxsection123456789",
      section: {
        templateId: "clxtemplate123456789",
        template: { companyId: "co1" },
      },
    });
    mockPrisma.templateQuestion.update.mockResolvedValue({
      id: "clx0987654321zyxwvutsrq",
      text: "Updated Question",
    });

    const result = await updateQuestion({
      id: "clx0987654321zyxwvutsrq",
      text: "Updated Question",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.templateQuestion.update).toHaveBeenCalled();
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action_name: "template_question.updated",
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should return not found when question does not exist", async () => {
    mockPrisma.templateQuestion.findFirst.mockResolvedValue(null);

    const result = await updateQuestion({
      id: "clx0987654321zyxwvutsrq",
      text: "Updated Question",
    });

    expect(result.error).toBe("Question not found.");
  });

  it("should reject when no update fields are provided", async () => {
    const result = await updateQuestion({ id: "clx0987654321zyxwvutsrq" });

    expect(result.error).toBe("No fields to update.");
  });

  it("should reject invalid input (missing id)", async () => {
    const result = await updateQuestion({ text: "Text" } as any);

    expect(result.error).toBe("Invalid input.");
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await updateQuestion({
      id: "clx0987654321zyxwvutsrq",
      text: "Text",
    });

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await updateQuestion({
      id: "clx0987654321zyxwvutsrq",
      text: "Text",
    });

    expect(result.error).toBe("Premium plan required.");
  });
});

describe("deleteQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
  });

  it("should delete a question successfully", async () => {
    mockPrisma.templateQuestion.findFirst.mockResolvedValue({
      id: "clx0987654321zyxwvutsrq",
      sectionId: "clxsection123456789",
      section: {
        templateId: "clxtemplate123456789",
        template: { companyId: "co1" },
      },
    });
    mockPrisma.templateQuestion.delete.mockResolvedValue({
      id: "clx0987654321zyxwvutsrq",
    });

    const result = await deleteQuestion("clx0987654321zyxwvutsrq");

    expect(result.success).toBe(true);
    expect(mockPrisma.templateQuestion.delete).toHaveBeenCalled();
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action_name: "template_question.deleted",
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should return not found when question does not exist", async () => {
    mockPrisma.templateQuestion.findFirst.mockResolvedValue(null);

    const result = await deleteQuestion("clx0987654321zyxwvutsrq");

    expect(result.error).toBe("Question not found.");
  });

  it("should reject invalid id (non-cuid)", async () => {
    const result = await deleteQuestion("not-a-cuid");

    expect(result.error).toBe("Invalid request.");
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await deleteQuestion("clx0987654321zyxwvutsrq");

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await deleteQuestion("clx0987654321zyxwvutsrq");

    expect(result.error).toBe("Premium plan required.");
  });
});

describe("reorderQuestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
  });

  it("should reorder questions successfully", async () => {
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      return callback({
        templateSection: {
          findFirst: vi.fn().mockResolvedValue({
            id: "clxsection123456789",
            templateId: "clxtemplate123456789",
            template: { companyId: "co1" },
          }),
        },
        templateQuestion: {
          findMany: vi.fn().mockResolvedValue([
            { id: "clxq1000000000000001" },
            { id: "clxq2000000000000002" },
          ]),
          update: vi.fn(),
        },
      });
    });

    const result = await reorderQuestions({
      sectionId: "clxsection123456789",
      questionIds: ["clxq1000000000000001", "clxq2000000000000002"],
    });

    expect(result.success).toBe(true);
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action_name: "template_questions.reordered",
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should return not found when section does not exist", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("NOT_FOUND"));

    const result = await reorderQuestions({
      sectionId: "clxsection123456789",
      questionIds: ["clxq1000000000000001"],
    });

    expect(result.error).toBe("Section not found.");
  });

  it("should return error when question IDs are invalid", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("INVALID_IDS"));

    const result = await reorderQuestions({
      sectionId: "clxsection123456789",
      questionIds: ["clxq1000000000000001"],
    });

    expect(result.error).toBe("Invalid question IDs.");
  });

  it("should reject invalid input (non-cuid questionIds)", async () => {
    const result = await reorderQuestions({
      sectionId: "clxsection123456789",
      questionIds: ["not-a-cuid"],
    });

    expect(result.error).toBe("Invalid input.");
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await reorderQuestions({
      sectionId: "clxsection123456789",
      questionIds: ["clxq1000000000000001"],
    });

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await reorderQuestions({
      sectionId: "clxsection123456789",
      questionIds: ["clxq1000000000000001"],
    });

    expect(result.error).toBe("Premium plan required.");
  });
});
