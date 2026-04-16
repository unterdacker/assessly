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
    questionnaireTemplate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    templateSection: {
      create: vi.fn(),
    },
    templateQuestion: {
      create: vi.fn(),
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
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  exportTemplate,
  importTemplate,
} from "@/modules/questionnaire-builder/actions/template-actions";
import { ActionRateLimitError } from "@/lib/action-rate-limit";

describe("listTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
  });

  it("should return templates list successfully", async () => {
    const mockTemplates = [
      { id: "clx0987654321zyxwvutsrq", name: "Template 1", isActive: true },
      { id: "clx1234567890abcdefghij", name: "Template 2", isActive: false },
    ];
    mockPrisma.questionnaireTemplate.findMany.mockResolvedValue(mockTemplates);

    const result = await listTemplates();

    expect(result.data?.templates).toEqual(mockTemplates);
    expect(mockPrisma.questionnaireTemplate.findMany).toHaveBeenCalledWith({
      where: { companyId: "co1" },
      select: expect.any(Object),
      orderBy: expect.any(Object),
    });
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await listTemplates();

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await listTemplates();

    expect(result.error).toBe("Premium plan required.");
  });

  it("should return empty list when no templates exist", async () => {
    mockPrisma.questionnaireTemplate.findMany.mockResolvedValue([]);

    const result = await listTemplates();

    expect(result.data?.templates).toEqual([]);
  });
});

describe("createTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
    mockCheckActionRateLimit.mockResolvedValue(undefined);
  });

  it("should create a template successfully", async () => {
    const newTemplateId = "clx0987654321zyxwvutsrq";
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      return callback({
        questionnaireTemplate: {
          count: vi.fn().mockResolvedValue(5),
          create: vi.fn().mockResolvedValue({ id: newTemplateId }),
        },
      });
    });

    const result = await createTemplate({
      name: "New Template",
      description: "Template description",
    });

    expect(result.data?.id).toBe(newTemplateId);
    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      "template-create:co1",
      { maxAttempts: 10, windowMs: 60_000 }
    );
    expect(mockAuditLogger.log).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should reject invalid input (empty name)", async () => {
    const result = await createTemplate({ name: "", description: null });

    expect(result.error).toBe("Invalid input.");
  });

  it("should reject when rate limit is exceeded", async () => {
    mockCheckActionRateLimit.mockRejectedValue(new ActionRateLimitError(60_000));

    const result = await createTemplate({
      name: "New Template",
      description: null,
    });

    expect(result.error).toMatch(/Too many requests/);
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await createTemplate({
      name: "New Template",
      description: null,
    });

    expect(result.error).toBe("Premium plan required.");
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await createTemplate({
      name: "New Template",
      description: null,
    });

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when template cap is exceeded", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("CAP_EXCEEDED"));

    const result = await createTemplate({
      name: "New Template",
      description: null,
    });

    expect(result.error).toBe("Maximum of 20 templates per company reached.");
  });
});

describe("updateTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
  });

  it("should update a template name successfully", async () => {
    mockPrisma.questionnaireTemplate.updateMany.mockResolvedValue({ count: 1 });

    const result = await updateTemplate({
      id: "clx0987654321zyxwvutsrq",
      name: "Updated Name",
    });

    expect(result.success).toBe(true);
    expect(mockAuditLogger.log).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should return not found when template does not exist", async () => {
    mockPrisma.questionnaireTemplate.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateTemplate({
      id: "clx0987654321zyxwvutsrq",
      name: "Updated Name",
    });

    expect(result.error).toBe("Template not found.");
  });

  it("should reject when no update fields are provided", async () => {
    const result = await updateTemplate({ id: "clx0987654321zyxwvutsrq" });

    expect(result.error).toBe("No fields to update.");
  });

  it("should reject invalid input (missing id)", async () => {
    const result = await updateTemplate({ name: "Name" } as any);

    expect(result.error).toBe("Invalid input.");
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await updateTemplate({
      id: "clx0987654321zyxwvutsrq",
      name: "Name",
    });

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await updateTemplate({
      id: "clx0987654321zyxwvutsrq",
      name: "Name",
    });

    expect(result.error).toBe("Premium plan required.");
  });

  it("should update isActive field", async () => {
    mockPrisma.questionnaireTemplate.updateMany.mockResolvedValue({ count: 1 });

    const result = await updateTemplate({
      id: "clx0987654321zyxwvutsrq",
      isActive: false,
    });

    expect(result.success).toBe(true);
  });
});

describe("deleteTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
  });

  it("should delete a template successfully", async () => {
    mockPrisma.questionnaireTemplate.deleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteTemplate("clx0987654321zyxwvutsrq");

    expect(result.success).toBe(true);
    expect(mockAuditLogger.log).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should return not found when template does not exist", async () => {
    mockPrisma.questionnaireTemplate.deleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteTemplate("clx0987654321zyxwvutsrq");

    expect(result.error).toBe("Template not found.");
  });

  it("should reject invalid id (non-cuid)", async () => {
    const result = await deleteTemplate("not-a-cuid");

    expect(result.error).toBe("Invalid request.");
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await deleteTemplate("clx0987654321zyxwvutsrq");

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await deleteTemplate("clx0987654321zyxwvutsrq");

    expect(result.error).toBe("Premium plan required.");
  });
});

describe("duplicateTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
    mockCheckActionRateLimit.mockResolvedValue(undefined);
  });

  it("should duplicate a template with sections and questions", async () => {
    const newTemplateId = "clx9999999999newtemplate";
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      return callback({
        questionnaireTemplate: {
          count: vi.fn().mockResolvedValue(5),
          findFirst: vi.fn().mockResolvedValue({
            id: "clx0987654321zyxwvutsrq",
            name: "Original",
            description: null,
            isActive: true,
            sections: [
              {
                id: "clxsec1111111111111111",
                title: "Section 1",
                description: null,
                orderIndex: 0,
                questions: [
                  {
                    id: "clxq11111111111111111",
                    text: "Q1",
                    helpText: null,
                    type: "BOOLEAN",
                    isRequired: true,
                    orderIndex: 0,
                    options: null,
                    scaleMin: null,
                    scaleMax: null,
                  },
                ],
              },
            ],
          }),
          create: vi.fn().mockResolvedValue({ id: newTemplateId }),
        },
        templateSection: {
          create: vi.fn().mockResolvedValue({ id: "clxnewsec11111111111" }),
        },
        templateQuestion: {
          create: vi.fn().mockResolvedValue({ id: "clxnewq1111111111111" }),
        },
      });
    });

    const result = await duplicateTemplate({
      id: "clx0987654321zyxwvutsrq",
      newName: "Duplicated Template",
    });

    expect(result.data?.id).toBe(newTemplateId);
    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      "template-duplicate:co1",
      { maxAttempts: 5, windowMs: 60_000 }
    );
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "questionnaire_template.duplicated",
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should reject when original template is not found", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("NOT_FOUND"));

    const result = await duplicateTemplate({
      id: "clx0987654321zyxwvutsrq",
      newName: "Duplicated Template",
    });

    expect(result.error).toBe("Template not found.");
  });

  it("should reject when template cap is exceeded", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("CAP_EXCEEDED"));

    const result = await duplicateTemplate({
      id: "clx0987654321zyxwvutsrq",
      newName: "Duplicated Template",
    });

    expect(result.error).toBe("Maximum of 20 templates per company reached.");
  });

  it("should reject when rate limit is exceeded", async () => {
    mockCheckActionRateLimit.mockRejectedValue(new ActionRateLimitError(60_000));

    const result = await duplicateTemplate({
      id: "clx0987654321zyxwvutsrq",
      newName: "Duplicated Template",
    });

    expect(result.error).toMatch(/Too many requests/);
  });

  it("should reject invalid input (empty newName)", async () => {
    const result = await duplicateTemplate({
      id: "clx0987654321zyxwvutsrq",
      newName: "",
    });

    expect(result.error).toBe("Invalid input.");
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await duplicateTemplate({
      id: "clx0987654321zyxwvutsrq",
      newName: "Duplicated Template",
    });

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await duplicateTemplate({
      id: "clx0987654321zyxwvutsrq",
      newName: "Duplicated Template",
    });

    expect(result.error).toBe("Premium plan required.");
  });
});

describe("exportTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
    mockCheckActionRateLimit.mockResolvedValue(undefined);
  });

  it("should export a template as JSON successfully", async () => {
    const mockTemplate = {
      name: "Export Template",
      description: "Description",
      sections: [
        {
          title: "Section 1",
          orderIndex: 0,
          questions: [
            { text: "Q1", type: "BOOLEAN", orderIndex: 0, isRequired: true },
          ],
        },
      ],
    };
    mockPrisma.questionnaireTemplate.findFirst.mockResolvedValue(mockTemplate);

    const result = await exportTemplate("clx0987654321zyxwvutsrq");

    expect(result.data?.json).toBeDefined();
    const parsed = JSON.parse(result.data!.json);
    expect(parsed.name).toBe("Export Template");
    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      "template-export:co1",
      { maxAttempts: 20, windowMs: 60_000 }
    );
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "questionnaire_template.exported",
        category: "DATA_OPERATIONS",
        status: "success",
      })
    );
  });

  it("should return not found when template does not exist", async () => {
    mockPrisma.questionnaireTemplate.findFirst.mockResolvedValue(null);

    const result = await exportTemplate("clx0987654321zyxwvutsrq");

    expect(result.error).toBe("Template not found.");
  });

  it("should reject when rate limit is exceeded", async () => {
    mockCheckActionRateLimit.mockRejectedValue(new ActionRateLimitError(60_000));

    const result = await exportTemplate("clx0987654321zyxwvutsrq");

    expect(result.error).toMatch(/Too many requests/);
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await exportTemplate("clx0987654321zyxwvutsrq");

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await exportTemplate("clx0987654321zyxwvutsrq");

    expect(result.error).toBe("Premium plan required.");
  });

  it("should log failure audit entry on DB error", async () => {
    mockPrisma.questionnaireTemplate.findFirst.mockRejectedValue(
      new Error("DB error")
    );

    const result = await exportTemplate("clx0987654321zyxwvutsrq");

    expect(result.error).toBeDefined();
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "questionnaire_template.export_failed",
        status: "failure",
      })
    );
  });
});

describe("importTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue({ companyId: "co1", userId: "u1" });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
    mockCheckActionRateLimit.mockResolvedValue(undefined);
  });

  it("should import a template successfully", async () => {
    // Use empty sections to keep the $transaction mock simple
    const validJson = JSON.stringify({
      name: "Imported Template",
      description: null,
      sections: [],
    });

    const newTemplateId = "clx8888888888imported";
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      return callback({
        questionnaireTemplate: {
          count: vi.fn().mockResolvedValue(5),
          create: vi.fn().mockResolvedValue({ id: newTemplateId }),
        },
        templateSection: {
          create: vi.fn().mockResolvedValue({ id: "clxsec1111111111111" }),
        },
        templateQuestion: {
          create: vi.fn().mockResolvedValue({ id: "clxq111111111111111" }),
        },
      });
    });

    const result = await importTemplate(validJson);

    expect(result.data?.id).toBe(newTemplateId);
    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      "template-import:co1",
      { maxAttempts: 5, windowMs: 60_000 }
    );
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "questionnaire_template.imported",
        category: "DATA_OPERATIONS",
        status: "success",
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
  });

  it("should reject invalid JSON", async () => {
    const result = await importTemplate("not-valid-json{{{");

    expect(result.error).toBe("Invalid JSON.");
  });

  it("should reject file exceeding 512 KB size limit", async () => {
    const largeJson = "x".repeat(512 * 1024 + 1);

    const result = await importTemplate(largeJson);

    expect(result.error).toBe("Import file exceeds the 512 KB limit.");
  });

  it("should reject invalid template schema (missing sections key)", async () => {
    const invalidJson = JSON.stringify({ name: "T" });

    const result = await importTemplate(invalidJson);

    expect(result.error).toBe(
      "Invalid template file. Please check the format and try again."
    );
  });

  it("should reject schema with unknown fields (strict mode)", async () => {
    const invalidJson = JSON.stringify({
      name: "T",
      sections: [],
      extra: "x",
    });

    const result = await importTemplate(invalidJson);

    expect(result.error).toBe(
      "Invalid template file. Please check the format and try again."
    );
  });

  it("should reject when template cap is exceeded", async () => {
    const validJson = JSON.stringify({
      name: "Imported Template",
      description: null,
      sections: [],
    });

    mockPrisma.$transaction.mockRejectedValue(new Error("CAP_EXCEEDED"));

    const result = await importTemplate(validJson);

    expect(result.error).toBe("Maximum of 20 templates per company reached.");
  });

  it("should reject when rate limit is exceeded", async () => {
    mockCheckActionRateLimit.mockRejectedValue(new ActionRateLimitError(60_000));

    const result = await importTemplate("{}");

    expect(result.error).toMatch(/Too many requests/);
  });

  it("should reject when user is unauthorized", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));

    const result = await importTemplate("{}");

    expect(result.error).toBe("Unauthorized.");
  });

  it("should reject when premium plan is not available", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new Error("Premium required"));

    const result = await importTemplate("{}");

    expect(result.error).toBe("Premium plan required.");
  });
});
