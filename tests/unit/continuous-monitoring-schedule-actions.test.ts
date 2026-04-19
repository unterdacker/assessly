import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockRequireInternalWriteUser,
  mockRequireAdminUser,
  mockRequireInternalReadUser,
  mockIsAccessControlError,
  mockRequirePremiumPlan,
  mockCheckActionRateLimit,
  mockAuditLogger,
  mockRevalidatePath,
  mockGetComplianceTimelineQuery,
  PremiumGateError,
  ActionRateLimitError,
} = vi.hoisted(() => {
  class PremiumGateError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "PremiumGateError";
    }
  }
  
  class ActionRateLimitError extends Error {
    retryAfterMs: number;
    constructor(message: string, retryAfterMs: number) {
      super(message);
      this.name = "ActionRateLimitError";
      this.retryAfterMs = retryAfterMs;
    }
  }
  
  return {
    mockPrisma: {
      vendor: {
        findUnique: vi.fn(),
      },
      questionnaireTemplate: {
        findUnique: vi.fn(),
      },
      recurrenceSchedule: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      complianceSnapshot: {
        findMany: vi.fn(),
      },
      auditLog: {
        findMany: vi.fn(),
      },
    },
    mockRequireInternalWriteUser: vi.fn(),
    mockRequireAdminUser: vi.fn(),
    mockRequireInternalReadUser: vi.fn(),
    mockIsAccessControlError: vi.fn().mockReturnValue(false),
    mockRequirePremiumPlan: vi.fn(),
    mockCheckActionRateLimit: vi.fn(),
    mockAuditLogger: {
      dataOp: vi.fn(),
      configuration: vi.fn(),
    },
    mockRevalidatePath: vi.fn(),
    mockGetComplianceTimelineQuery: vi.fn(),
    PremiumGateError,
    ActionRateLimitError,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/server", () => ({
  requireInternalWriteUser: mockRequireInternalWriteUser,
  requireAdminUser: mockRequireAdminUser,
  requireInternalReadUser: mockRequireInternalReadUser,
  isAccessControlError: mockIsAccessControlError,
}));
vi.mock("@/lib/enterprise-bridge", () => ({
  requirePremiumPlan: mockRequirePremiumPlan,
  PremiumGateError,
}));
vi.mock("@/lib/action-rate-limit", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  ActionRateLimitError,
}));
vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: mockAuditLogger,
  AuditCategory: { CONFIGURATION: "CONFIGURATION", DATA_OPERATIONS: "DATA_OPERATIONS" },
  LogLevel: { INFO: "INFO", WARN: "WARN", ERROR: "ERROR" },
}));
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));
vi.mock("@/modules/continuous-monitoring/lib/queries", () => ({
  getScheduleByVendor: vi.fn().mockResolvedValue(null),
  getComplianceTimeline: mockGetComplianceTimelineQuery,
}));
vi.mock("@/modules/continuous-monitoring/lib/next-due-calculator", () => ({
  calculateNextDueDate: vi.fn((interval: string, date: Date) => {
    const next = new Date(date);
    if (interval === "MONTHLY") next.setMonth(next.getMonth() + 1);
    else if (interval === "QUARTERLY") next.setMonth(next.getMonth() + 3);
    else if (interval === "SEMI_ANNUAL") next.setMonth(next.getMonth() + 6);
    else if (interval === "ANNUAL") next.setFullYear(next.getFullYear() + 1);
    return next;
  }),
}));

import {
  createRecurrenceSchedule,
  updateRecurrenceSchedule,
  deleteRecurrenceSchedule,
  triggerManualReassessment,
  getComplianceTimeline,
} from "@/modules/continuous-monitoring/actions/schedule-actions";

beforeEach(() => {
  vi.clearAllMocks();

  mockRequireInternalWriteUser.mockResolvedValue({
    userId: "clxuser00001",
    companyId: "clxcompany001",
    role: "ADMIN",
  });

  mockRequireAdminUser.mockResolvedValue({
    userId: "clxuser00001",
    companyId: "clxcompany001",
    role: "ADMIN",
  });

  mockRequireInternalReadUser.mockResolvedValue({
    userId: "clxuser00001",
    companyId: "clxcompany001",
    role: "ADMIN",
  });

  mockRequirePremiumPlan.mockResolvedValue(undefined);
  mockCheckActionRateLimit.mockResolvedValue(undefined);

  mockPrisma.vendor.findUnique.mockResolvedValue({
    id: "clxvendor0001",
    companyId: "clxcompany001",
  });

  mockPrisma.recurrenceSchedule.create.mockResolvedValue({
    id: "clxsched00001",
    vendorId: "clxvendor0001",
    companyId: "clxcompany001",
    interval: "MONTHLY",
    templateId: null,
    autoSend: false,
    regressionThreshold: 10,
    isActive: true,
    nextDueAt: new Date("2026-05-19"),
    lastAssessmentId: null,
    createdAt: new Date("2026-04-19"),
    updatedAt: new Date("2026-04-19"),
    createdByUserId: "clxuser00001",
    vendor: {
      name: "Test Vendor",
    },
    template: null,
  });

  mockPrisma.recurrenceSchedule.update.mockResolvedValue({
    id: "clxsched00001",
    vendorId: "clxvendor0001",
    companyId: "clxcompany001",
    interval: "MONTHLY",
    templateId: null,
    autoSend: false,
    regressionThreshold: 10,
    isActive: true,
    nextDueAt: new Date("2026-05-19"),
    lastAssessmentId: null,
    createdAt: new Date("2026-04-19"),
    updatedAt: new Date("2026-04-19"),
    createdByUserId: "clxuser00001",
    vendor: {
      name: "Test Vendor",
    },
    template: null,
  });

  mockPrisma.recurrenceSchedule.findUnique.mockResolvedValue({
    id: "clxsched00001",
    vendorId: "clxvendor0001",
    companyId: "clxcompany001",
    interval: "MONTHLY",
    templateId: null,
    autoSend: false,
    regressionThreshold: 10,
    isActive: true,
    nextDueAt: new Date("2026-05-19"),
    lastAssessmentId: null,
    createdAt: new Date("2026-04-19"),
    updatedAt: new Date("2026-04-19"),
    createdByUserId: "clxuser00001",
  });
});

describe("createRecurrenceSchedule", () => {
  it("creates schedule successfully for FREE plan with autoSend=false", async () => {
    const result = await createRecurrenceSchedule("clxvendor0001", {
      vendorId: "clxvendor0001",
      companyId: "clxcompany001",
      interval: "MONTHLY",
      templateId: null,
      autoSend: false,
      regressionThreshold: 10,
      isActive: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      vendorId: "clxvendor0001",
      companyId: "clxcompany001",
      interval: "MONTHLY",
      autoSend: false,
    });

    expect(mockRequirePremiumPlan).not.toHaveBeenCalled();
    expect(mockPrisma.vendor.findUnique).toHaveBeenCalledWith({
      where: { id: "clxvendor0001" },
      select: { companyId: true },
    });
    expect(mockPrisma.recurrenceSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendorId: "clxvendor0001",
          companyId: "clxcompany001",
          autoSend: false,
        }),
      })
    );
    expect(mockAuditLogger.configuration).toHaveBeenCalledWith(
      "recurrence.schedule_created",
      "success",
      expect.objectContaining({
        userId: "clxuser00001",
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects autoSend=true on FREE plan", async () => {
    mockRequirePremiumPlan.mockRejectedValueOnce(new PremiumGateError("clxcompany001"));

    const result = await createRecurrenceSchedule("clxvendor0001", {
      vendorId: "clxvendor0001",
      companyId: "clxcompany001",
      interval: "MONTHLY",
      autoSend: true,
      regressionThreshold: 10,
      isActive: true,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("PREMIUM_REQUIRED");
    expect(mockRequirePremiumPlan).toHaveBeenCalledWith("clxcompany001");
    expect(mockPrisma.recurrenceSchedule.create).not.toHaveBeenCalled();
  });

  it("rejects vendor from different company (IDOR protection)", async () => {
    mockPrisma.vendor.findUnique.mockResolvedValueOnce({
      id: "clxvendor0001",
      companyId: "clxothercomp1",
    });

    const result = await createRecurrenceSchedule("clxvendor0001", {
      vendorId: "clxvendor0001",
      companyId: "clxcompany001",
      interval: "MONTHLY",
      autoSend: false,
      regressionThreshold: 10,
      isActive: true,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Vendor not found");
    expect(mockPrisma.recurrenceSchedule.create).not.toHaveBeenCalled();
  });

  it("rejects when rate limit exceeded", async () => {
    mockCheckActionRateLimit.mockRejectedValueOnce(
      new ActionRateLimitError("Rate limit exceeded", 300000)
    );

    const result = await createRecurrenceSchedule("clxvendor0001", {
      vendorId: "clxvendor0001",
      companyId: "clxcompany001",
      interval: "MONTHLY",
      autoSend: false,
      regressionThreshold: 10,
      isActive: true,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Rate limit");
    expect(mockPrisma.recurrenceSchedule.create).not.toHaveBeenCalled();
  });

  it("verifies template ownership when templateId provided", async () => {
    mockPrisma.questionnaireTemplate.findUnique.mockResolvedValueOnce({
      id: "clxtemplt0001",
      companyId: "clxcompany001",
    });

    const result = await createRecurrenceSchedule("clxvendor0001", {
      vendorId: "clxvendor0001",
      companyId: "clxcompany001",
      interval: "MONTHLY",
      templateId: "clxtemplt0001",
      autoSend: false,
      regressionThreshold: 10,
      isActive: true,
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.questionnaireTemplate.findUnique).toHaveBeenCalledWith({
      where: { id: "clxtemplt0001" },
      select: { companyId: true },
    });
  });

  it("rejects when template belongs to different company", async () => {
    mockPrisma.questionnaireTemplate.findUnique.mockResolvedValueOnce({
      id: "clxtemplt0001",
      companyId: "clxothercomp1",
    });

    const result = await createRecurrenceSchedule("clxvendor0001", {
      vendorId: "clxvendor0001",
      companyId: "clxcompany001",
      interval: "MONTHLY",
      templateId: "clxtemplt0001",
      autoSend: false,
      regressionThreshold: 10,
      isActive: true,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Template not found");
    expect(mockPrisma.recurrenceSchedule.create).not.toHaveBeenCalled();
  });
});

describe("updateRecurrenceSchedule", () => {
  it("updates schedule successfully", async () => {
    const result = await updateRecurrenceSchedule("clxsched00001", {
      isActive: false,
      regressionThreshold: 15,
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.recurrenceSchedule.findUnique).toHaveBeenCalledWith({
      where: { id: "clxsched00001" },
      select: {
        companyId: true,
        interval: true,
        nextDueAt: true,
      },
    });
    expect(mockPrisma.recurrenceSchedule.update).toHaveBeenCalled();
    expect(mockAuditLogger.configuration).toHaveBeenCalledWith(
      "recurrence.schedule_updated",
      "success",
      expect.any(Object)
    );
  });

  it("enforces premium gate when enabling autoSend", async () => {
    mockRequirePremiumPlan.mockRejectedValueOnce(new PremiumGateError("clxcompany001"));

    const result = await updateRecurrenceSchedule("clxsched00001", {
      autoSend: true,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("PREMIUM_REQUIRED");
    expect(mockRequirePremiumPlan).toHaveBeenCalledWith("clxcompany001");
  });

  it("rejects when schedule belongs to different company (IDOR protection)", async () => {
    mockPrisma.recurrenceSchedule.findUnique.mockResolvedValueOnce({
      id: "clxsched00001",
      companyId: "clxothercomp1",
      interval: "MONTHLY",
      nextDueAt: new Date(),
    });

    const result = await updateRecurrenceSchedule("clxsched00001", {
      isActive: false,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Schedule not found");
    expect(mockPrisma.recurrenceSchedule.update).not.toHaveBeenCalled();
  });

  it("rejects when schedule not found", async () => {
    mockPrisma.recurrenceSchedule.findUnique.mockResolvedValueOnce(null);

    const result = await updateRecurrenceSchedule("clxsched00001", {
      isActive: false,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Schedule not found");
    expect(mockPrisma.recurrenceSchedule.update).not.toHaveBeenCalled();
  });
});

describe("deleteRecurrenceSchedule", () => {
  it("deletes schedule successfully", async () => {
    mockPrisma.recurrenceSchedule.delete.mockResolvedValueOnce({
      id: "clxsched00001",
    });

    const result = await deleteRecurrenceSchedule("clxsched00001");

    expect(result.success).toBe(true);
    expect(mockRequireAdminUser).toHaveBeenCalled();
    expect(mockPrisma.recurrenceSchedule.delete).toHaveBeenCalledWith({
      where: { id: "clxsched00001" },
    });
    expect(mockAuditLogger.configuration).toHaveBeenCalledWith(
      "recurrence.schedule_deleted",
      "success",
      expect.any(Object)
    );
  });

  it("rejects when schedule belongs to different company", async () => {
    mockPrisma.recurrenceSchedule.findUnique.mockResolvedValueOnce({
      id: "clxsched00001",
      companyId: "clxothercomp1",
      vendorId: "clxvendor0001",
    });

    const result = await deleteRecurrenceSchedule("clxsched00001");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Schedule not found");
    expect(mockPrisma.recurrenceSchedule.delete).not.toHaveBeenCalled();
  });
});

describe("triggerManualReassessment", () => {
  it("triggers reassessment successfully", async () => {
    const result = await triggerManualReassessment("clxsched00001");

    expect(result.success).toBe(true);
    expect(mockPrisma.recurrenceSchedule.findUnique).toHaveBeenCalledWith({
      where: { id: "clxsched00001" },
      select: {
        companyId: true,
        vendorId: true,
        interval: true,
        lastAssessmentId: true,
      },
    });
    expect(mockPrisma.recurrenceSchedule.update).toHaveBeenCalledWith({
      where: { id: "clxsched00001" },
      data: {
        nextDueAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    });
    expect(mockAuditLogger.dataOp).toHaveBeenCalledWith(
      "recurrence.manual_trigger",
      "success",
      expect.objectContaining({
        userId: "clxuser00001",
      })
    );
  });

  it("rejects when schedule not found", async () => {
    mockPrisma.recurrenceSchedule.findUnique.mockResolvedValueOnce(null);

    const result = await triggerManualReassessment("clxsched00001");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Schedule not found");
    expect(mockPrisma.recurrenceSchedule.update).not.toHaveBeenCalled();
  });

  it("rejects when schedule from different company (IDOR protection)", async () => {
    mockPrisma.recurrenceSchedule.findUnique.mockResolvedValueOnce({
      id: "clxsched00001",
      companyId: "clxothercomp1",
      vendorId: "clxvendor0001",
      interval: "MONTHLY",
      lastAssessmentId: null,
    });

    const result = await triggerManualReassessment("clxsched00001");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Schedule not found");
    expect(mockPrisma.recurrenceSchedule.update).not.toHaveBeenCalled();
  });

  it("rejects when rate limit exceeded", async () => {
    mockCheckActionRateLimit.mockRejectedValueOnce(
      new ActionRateLimitError("Rate limit exceeded", 3600000)
    );

    const result = await triggerManualReassessment("clxsched00001");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Rate limit");
    expect(mockPrisma.recurrenceSchedule.update).not.toHaveBeenCalled();
  });
});

describe("getComplianceTimeline", () => {
  it("returns snapshots for Premium company", async () => {
    const mockSnapshots = [
      {
        id: "clxsnapshot01",
        companyId: "clxcompany001",
        snapshotDate: new Date("2026-03-01"),
        overallScore: 85,
        categoryScores: { governance: 85, access: 80 },
        frameworkKey: null,
        vendorCount: 5,
        createdAt: new Date("2026-03-01"),
      },
      {
        id: "clxsnapshot02",
        companyId: "clxcompany001",
        snapshotDate: new Date("2026-04-01"),
        overallScore: 88,
        categoryScores: { governance: 90, access: 86 },
        frameworkKey: null,
        vendorCount: 5,
        createdAt: new Date("2026-04-01"),
      },
    ];

    mockGetComplianceTimelineQuery.mockResolvedValueOnce(mockSnapshots);

    const result = await getComplianceTimeline(12);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(mockSnapshots);
    expect(mockRequirePremiumPlan).toHaveBeenCalledWith("clxcompany001");
    expect(mockGetComplianceTimelineQuery).toHaveBeenCalledWith("clxcompany001", 12);
  });

  it("throws PremiumGateError for FREE plan", async () => {
    mockRequirePremiumPlan.mockRejectedValueOnce(new PremiumGateError("clxcompany001"));

    const result = await getComplianceTimeline(12);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("PREMIUM_REQUIRED");
    expect(mockGetComplianceTimelineQuery).not.toHaveBeenCalled();
  });

  it("returns empty array when no snapshots exist", async () => {
    mockGetComplianceTimelineQuery.mockResolvedValueOnce([]);

    const result = await getComplianceTimeline(12);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([]);
  });

  it("defaults to 12 months when no parameter provided", async () => {
    mockGetComplianceTimelineQuery.mockResolvedValueOnce([]);

    await getComplianceTimeline();

    expect(mockGetComplianceTimelineQuery).toHaveBeenCalledWith("clxcompany001", 12);
  });

  it("validates months parameter correctly", async () => {
    mockGetComplianceTimelineQuery.mockResolvedValueOnce([]);

    const result = await getComplianceTimeline(24);

    expect(result.success).toBe(true);
    expect(mockGetComplianceTimelineQuery).toHaveBeenCalledWith("clxcompany001", 24);
  });
});
