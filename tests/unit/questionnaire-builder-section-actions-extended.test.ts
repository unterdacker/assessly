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
  LogLevel: {
    DEBUG: "debug",
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
    FATAL: "fatal",
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/logger", () => ({ logErrorReport: mockLogErrorReport }));

import {
  updateSection,
  deleteSection,
  reorderSections,
} from "@/modules/questionnaire-builder/actions/section-actions";

describe("updateSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
  });

  it("should update a section title successfully", async () => {
    mockPrisma.templateSection.findFirst.mockResolvedValue({
      id: "clx0987654321zyxwvutsrq",
      templateId: "clxtemplate123456789",
      template: { companyId: "co1" },
    });
    mockPrisma.templateSection.update.mockResolvedValue({
      id: "clx0987654321zyxwvutsrq",
      title: "Updated Title",
    });

    const result = await updateSection({
      id: "clx0987654321zyxwvutsrq",
      title: "Updated Title",
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.templateSection.update).toHaveBeenCalled();
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "template_section.updated",
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should return not found when section does not exist", async () => {
    mockPrisma.templateSection.findFirst.mockResolvedValue(null);

    const result = await updateSection({
      id: "clx0987654321zyxwvutsrq",
      title: "Updated Title",
    });

    expect(result.error).toBe("Section not found.");
  });

  it("should reject when no update fields are provided", async () => {
    const result = await updateSection({ id: "clx0987654321zyxwvutsrq" });

    expect(result.error).toBe("No fields to update.");
  });

  it("should reject invalid input (missing id)", async () => {
    const result = await updateSection({ title: "Title" } as any);

    expect(result.error).toBe("Invalid input.");
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await updateSection({
      id: "clx0987654321zyxwvutsrq",
      title: "Title",
    });

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await updateSection({
      id: "clx0987654321zyxwvutsrq",
      title: "Title",
    });

    expect(result.error).toBe("Premium plan required.");
  });
});

describe("deleteSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
  });

  it("should delete a section successfully", async () => {
    mockPrisma.templateSection.findFirst.mockResolvedValue({
      id: "clx0987654321zyxwvutsrq",
      templateId: "clxtemplate123456789",
      template: { companyId: "co1" },
    });
    mockPrisma.templateSection.delete.mockResolvedValue({
      id: "clx0987654321zyxwvutsrq",
    });

    const result = await deleteSection("clx0987654321zyxwvutsrq");

    expect(result.success).toBe(true);
    expect(mockPrisma.templateSection.delete).toHaveBeenCalled();
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "template_section.deleted",
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should return not found when section does not exist", async () => {
    mockPrisma.templateSection.findFirst.mockResolvedValue(null);

    const result = await deleteSection("clx0987654321zyxwvutsrq");

    expect(result.error).toBe("Section not found.");
  });

  it("should reject invalid id (non-cuid)", async () => {
    const result = await deleteSection("not-a-cuid");

    expect(result.error).toBe("Invalid request.");
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await deleteSection("clx0987654321zyxwvutsrq");

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await deleteSection("clx0987654321zyxwvutsrq");

    expect(result.error).toBe("Premium plan required.");
  });
});

describe("reorderSections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
  });

  it("should reorder sections successfully", async () => {
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      return callback({
        questionnaireTemplate: {
          findFirst: vi.fn().mockResolvedValue({
            id: "clxtemplate123456789",
            companyId: "co1",
          }),
        },
        templateSection: {
          findMany: vi.fn().mockResolvedValue([
            { id: "clxsec1000000000001" },
            { id: "clxsec2000000000002" },
          ]),
          update: vi.fn(),
        },
      });
    });

    const result = await reorderSections({
      templateId: "clxtemplate123456789",
      sectionIds: ["clxsec1000000000001", "clxsec2000000000002"],
    });

    expect(result.success).toBe(true);
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "template_sections.reordered",
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should return not found when template does not exist", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("NOT_FOUND"));

    const result = await reorderSections({
      templateId: "clxtemplate123456789",
      sectionIds: ["clxsec1000000000001"],
    });

    expect(result.error).toBe("Template not found.");
  });

  it("should return error when section IDs are invalid", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("INVALID_IDS"));

    const result = await reorderSections({
      templateId: "clxtemplate123456789",
      sectionIds: ["clxsec1000000000001"],
    });

    expect(result.error).toBe("Invalid section IDs.");
  });

  it("should reject invalid input (non-cuid sectionIds)", async () => {
    const result = await reorderSections({
      templateId: "clxtemplate123456789",
      sectionIds: ["not-a-cuid"],
    });

    expect(result.error).toBe("Invalid input.");
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await reorderSections({
      templateId: "clxtemplate123456789",
      sectionIds: ["clxsec1000000000001"],
    });

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await reorderSections({
      templateId: "clxtemplate123456789",
      sectionIds: ["clxsec1000000000001"],
    });

    expect(result.error).toBe("Premium plan required.");
  });
});
