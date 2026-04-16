import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockRequireInternalWriteUser,
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
      create: vi.fn(),
    },
  },
  mockRequireInternalWriteUser: vi.fn(),
  mockIsAccessControlError: vi.fn().mockReturnValue(false),
  mockRequirePremiumPlan: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockAuditLogger: { log: vi.fn() },
  mockRevalidatePath: vi.fn(),
  mockLogErrorReport: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/server", () => ({
  requireInternalWriteUser: mockRequireInternalWriteUser,
  isAccessControlError: mockIsAccessControlError,
}));
vi.mock("@/lib/enterprise-bridge", () => ({
  requirePremiumPlan: mockRequirePremiumPlan,
  PremiumGateError: class PremiumGateError extends Error {
    constructor(public readonly companyId: string) {
      super(`Premium plan required for companyId=${companyId}`);
      this.name = "PremiumGateError";
      this.companyId = companyId;
    }
  },
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
    DATA_OPERATIONS: "DATA_OPERATIONS",
  },
  LogLevel: {
    INFO: "INFO",
    WARN: "WARN",
    ERROR: "ERROR",
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/logger", () => ({ logErrorReport: mockLogErrorReport }));

vi.mock("@/modules/compliance-library/data/system-templates", () => ({
  SYSTEM_TEMPLATES: [
    {
      key: "nis2",
      name: "NIS2 Directive",
      description: "EU Network and Information Security directive",
      isPremium: false,
      sections: [
        {
          title: "Governance",
          description: "Governance controls",
          questions: [
            {
              text: "Has the organization designated a management body?",
              type: "BOOLEAN",
              isRequired: true,
            },
          ],
        },
      ],
    },
    {
      key: "iso27001",
      name: "ISO 27001",
      description: "International standard for ISMS",
      isPremium: true,
      sections: [
        {
          title: "Policies",
          description: "Policy framework",
          questions: [
            {
              text: "Is there a documented security policy?",
              type: "BOOLEAN",
              isRequired: true,
            },
          ],
        },
      ],
    },
  ],
}));

import { deploySystemTemplate } from "@/modules/compliance-library/actions/deploy-template-action";
import { ActionRateLimitError } from "@/lib/action-rate-limit";
import { PremiumGateError } from "@/lib/enterprise-bridge";

describe("deploySystemTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireInternalWriteUser.mockResolvedValue({
      companyId: "company-123",
      userId: "user-123",
      role: "ADMIN",
    });
    mockRequirePremiumPlan.mockResolvedValue(undefined);
    mockCheckActionRateLimit.mockResolvedValue(undefined);
  });

  it("should successfully deploy a free template", async () => {
    const mockTemplate = {
      id: "clx_new_template_id",
      companyId: "company-123",
      name: "NIS2 Directive",
      systemTemplateKey: "nis2",
    };

    mockPrisma.$transaction.mockImplementation(async (fn) => {
      return fn({
        questionnaireTemplate: {
          create: vi.fn().mockResolvedValue(mockTemplate),
        },
      });
    });

    const result = await deploySystemTemplate("nis2");

    expect(result).toEqual({
      success: true,
      data: { id: mockTemplate.id },
    });
    expect(mockRequireInternalWriteUser).toHaveBeenCalled();
    expect(mockCheckActionRateLimit).toHaveBeenCalledWith("compliance-deploy:company-123", {
      maxAttempts: 10,
      windowMs: 300_000,
    });
    expect(mockRequirePremiumPlan).not.toHaveBeenCalled(); // Free template
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "compliance_template.deployed",
        status: "success",
        userId: "user-123",
        entityType: "questionnaire_template",
        entityId: mockTemplate.id,
        details: { companyId: "company-123", templateKey: "nis2" },
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaires");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/compliance-library");
  });

  it("should successfully deploy a premium template when company has PREMIUM plan", async () => {
    const mockTemplate = {
      id: "clx_premium_template_id",
      companyId: "company-123",
      name: "ISO 27001",
      systemTemplateKey: "iso27001",
    };

    mockPrisma.$transaction.mockImplementation(async (fn) => {
      return fn({
        questionnaireTemplate: {
          create: vi.fn().mockResolvedValue(mockTemplate),
        },
      });
    });

    const result = await deploySystemTemplate("iso27001");

    expect(result).toEqual({
      success: true,
      data: { id: mockTemplate.id },
    });
    expect(mockRequirePremiumPlan).toHaveBeenCalledWith("company-123");
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "compliance_template.deployed",
        entityId: mockTemplate.id,
        details: { companyId: "company-123", templateKey: "iso27001" },
      })
    );
  });

  it("should reject premium template when company does not have PREMIUM plan", async () => {
    mockRequirePremiumPlan.mockRejectedValue(new PremiumGateError("company-123"));

    const result = await deploySystemTemplate("iso27001");

    expect(result).toEqual({
      success: false,
      error: "Premium plan required.",
    });
    expect(mockRequirePremiumPlan).toHaveBeenCalledWith("company-123");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockAuditLogger.log).not.toHaveBeenCalled();
  });

  it("should handle duplicate deploy (P2002 error)", async () => {
    const p2002Error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.0.0",
      meta: { target: ["companyId", "systemTemplateKey"] },
    });

    mockPrisma.$transaction.mockRejectedValue(p2002Error);

    const result = await deploySystemTemplate("nis2");

    expect(result).toEqual({
      success: false,
      error: "This template has already been deployed.",
    });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockAuditLogger.log).not.toHaveBeenCalled();
  });

  it("should handle rate limit exceeded", async () => {
    mockCheckActionRateLimit.mockRejectedValue(new ActionRateLimitError(60000));

    const result = await deploySystemTemplate("nis2");

    expect(result).toEqual({
      success: false,
      error: "Too many requests. Please wait.",
    });
    expect(mockCheckActionRateLimit).toHaveBeenCalledWith("compliance-deploy:company-123", {
      maxAttempts: 10,
      windowMs: 300_000,
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockAuditLogger.log).not.toHaveBeenCalled();
  });

  it("should reject invalid template key", async () => {
    const result = await deploySystemTemplate("not_a_real_key");

    expect(result).toEqual({
      success: false,
      error: "Invalid request.",
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockAuditLogger.log).not.toHaveBeenCalled();
  });

  it("should handle unauthorized user", async () => {
    mockIsAccessControlError.mockReturnValue(true);
    mockRequireInternalWriteUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    const result = await deploySystemTemplate("nis2");

    expect(result).toEqual({
      success: false,
      error: "Unauthorized.",
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockAuditLogger.log).not.toHaveBeenCalled();
  });

  it("should handle transaction error gracefully", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("Database connection failed"));

    const result = await deploySystemTemplate("nis2");

    expect(result).toEqual({
      success: false,
      error: "Failed to deploy template.",
    });
    expect(mockLogErrorReport).toHaveBeenCalledWith(
      "deploySystemTemplate:transaction",
      expect.any(Error)
    );
    expect(mockAuditLogger.log).not.toHaveBeenCalled();
  });
});
