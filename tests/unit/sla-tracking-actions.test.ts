import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockRequireInternalWriteUser,
  mockRequireAdminUser,
  mockRequireAuthSession,
  mockIsAccessControlError,
  mockRequirePremiumPlan,
  mockCheckActionRateLimit,
  mockSendMail,
  mockAuditLogger,
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
    assessment: {
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    slaPolicy: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    assessmentReminder: {
      create: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    rateLimitEntry: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  mockRequireInternalWriteUser: vi.fn(),
  mockRequireAdminUser: vi.fn(),
  mockRequireAuthSession: vi.fn(),
  mockIsAccessControlError: vi.fn().mockReturnValue(false),
  mockRequirePremiumPlan: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockSendMail: vi.fn(),
  mockAuditLogger: {
    dataOp: vi.fn(),
    configuration: vi.fn(),
  },
  PremiumGateError,
  ActionRateLimitError,
};
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/server", () => ({
  requireInternalWriteUser: mockRequireInternalWriteUser,
  requireAdminUser: mockRequireAdminUser,
  requireAuthSession: mockRequireAuthSession,
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
vi.mock("@/lib/mail", () => ({ sendMail: mockSendMail }));
vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: mockAuditLogger,
}));
vi.mock("@/lib/env", () => ({ 
  appEnv: { 
    url: "https://test.example.com",
  } 
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/modules/sla-tracking/lib/sla-queries", () => ({
  getSlaComplianceRate: vi.fn().mockResolvedValue(66.67),
}));

import {
  setAssessmentDueDate,
  sendManualReminder,
  createSlaPolicy,
  updateSlaPolicy,
  deleteSlaPolicy,
  getSlaComplianceRateAction,
  getSlaPoliciesForCompany,
} from "@/modules/sla-tracking/actions/sla-actions";

beforeEach(() => {
  vi.clearAllMocks();

  mockRequireInternalWriteUser.mockResolvedValue({
    userId: "user-1",
    companyId: "company-1",
    role: "ADMIN",
  });

  mockRequireAdminUser.mockResolvedValue({
    userId: "user-1",
    companyId: "company-1",
    role: "ADMIN",
  });

  mockRequireAuthSession.mockResolvedValue({
    userId: "user-1",
    companyId: "company-1",
    role: "ADMIN",
  });

  mockRequirePremiumPlan.mockResolvedValue(undefined);
  mockCheckActionRateLimit.mockResolvedValue(undefined);
  mockSendMail.mockResolvedValue(undefined);

  mockPrisma.assessment.findFirst.mockResolvedValue({
    id: "assessment-1",
    companyId: "company-1",
    vendorId: "vendor-1",
    dueDate: null,
    vendor: { 
      id: "vendor-1", 
      name: "Test Vendor", 
      companyId: "company-1",
      email: "vendor@test.com",
      company: {
        id: "company-1",
        name: "Test Company",
      },
    },
  });

  mockPrisma.assessment.update.mockResolvedValue({
    id: "assessment-1",
    dueDate: new Date("2026-05-01"),
  });

  mockPrisma.slaPolicy.create.mockResolvedValue({
    id: "policy-1",
    companyId: "company-1",
    name: "Test Policy",
  });

  mockPrisma.slaPolicy.update.mockResolvedValue({
    id: "policy-1",
    name: "Updated Policy",
  });

  mockPrisma.slaPolicy.delete.mockResolvedValue({
    id: "policy-1",
  });

  mockPrisma.slaPolicy.findFirst.mockResolvedValue(null);
  mockPrisma.slaPolicy.findMany.mockResolvedValue([]);
  mockPrisma.slaPolicy.count.mockResolvedValue(0);

  mockPrisma.assessmentReminder.create.mockResolvedValue({
    id: "reminder-1",
  });

  mockPrisma.user.findFirst.mockResolvedValue({
    id: "user-1",
    email: "admin@test.com",
  });
});

describe("setAssessmentDueDate", () => {
  it("updates due date successfully", async () => {
    const result = await setAssessmentDueDate("assessment-1", new Date("2026-05-01"));

    expect(result.success).toBe(true);
    expect(mockPrisma.assessment.findFirst).toHaveBeenCalledWith({
      where: { id: "assessment-1", companyId: "company-1" },
    });
    expect(mockPrisma.assessment.update).toHaveBeenCalledWith({
      where: { id: "assessment-1" },
      data: { dueDate: expect.any(Date), slaBreached: false },
    });
  });

  it("allows null dueDate to clear the due date", async () => {
    mockPrisma.assessment.update.mockResolvedValueOnce({
      id: "assessment-1",
      dueDate: null,
    });

    const result = await setAssessmentDueDate("assessment-1", null);

    expect(result.success).toBe(true);
    expect(mockPrisma.assessment.update).toHaveBeenCalledWith({
      where: { id: "assessment-1" },
      data: { dueDate: null, slaBreached: undefined },
    });
  });

  it("rejects when assessment belongs to wrong company (IDOR protection)", async () => {
    mockPrisma.assessment.findFirst.mockResolvedValueOnce(null);

    const result = await setAssessmentDueDate("assessment-1", new Date("2026-05-01"));

    expect(result).toEqual({ success: false, error: "Not found" });
    expect(mockPrisma.assessment.update).not.toHaveBeenCalled();
  });

  it("returns unauthorized error when auth fails", async () => {
    const authError = new Error("FORBIDDEN");
    mockRequireInternalWriteUser.mockRejectedValueOnce(authError);
    mockIsAccessControlError.mockReturnValueOnce(true);

    await expect(setAssessmentDueDate("assessment-1", new Date("2026-05-01"))).rejects.toThrow("FORBIDDEN");
  });
});

describe("sendManualReminder", () => {
  it("sends manual reminder successfully", async () => {
    const result = await sendManualReminder("assessment-1");

    expect(result.success).toBe(true);
    expect(mockCheckActionRateLimit).toHaveBeenCalledTimes(2);
    expect(mockSendMail).toHaveBeenCalled();
    expect(mockPrisma.assessmentReminder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assessmentId: "assessment-1",
        type: "MANUAL",
        sentAt: expect.any(Date),
      }),
    });
  });

  it("enforces rate limit and returns error", async () => {
    const rateLimitError = new ActionRateLimitError("Rate limit exceeded", 60000);
    mockCheckActionRateLimit.mockRejectedValueOnce(rateLimitError);

    const result = await sendManualReminder("assessment-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rate limit");
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("does not throw when email send fails (fire-and-forget)", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("Email service down"));

    const result = await sendManualReminder("assessment-1");

    expect(result.success).toBe(true);
    expect(mockPrisma.assessmentReminder.create).toHaveBeenCalled();
  });

  it("rejects when assessment belongs to wrong company", async () => {
    mockPrisma.assessment.findFirst.mockResolvedValueOnce(null);

    const result = await sendManualReminder("assessment-1");

    expect(result).toEqual({ success: false, error: "Not found" });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("logs failure when email send fails", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("SMTP connection failed"));

    const result = await sendManualReminder("assessment-1");

    expect(result.success).toBe(true);
    expect(mockPrisma.assessmentReminder.create).toHaveBeenCalled();

    // Wait for the async catch handler to run
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockAuditLogger.dataOp).toHaveBeenCalledWith(
      "manual_reminder.email_failed",
      "failure",
      expect.objectContaining({
        details: expect.objectContaining({
          assessmentId: "assessment-1",
          error: expect.stringContaining("SMTP connection failed"),
        }),
      })
    );
  });
});

describe("createSlaPolicy", () => {
  it("creates policy successfully for ADMIN on Premium plan", async () => {
    const result = await createSlaPolicy({
      name: "Standard 30-day SLA",
      responseDays: 30,
      reminderIntervals: [7, 3, 1],
      escalationDays: 7,
      escalationRecipientUserId: null,
      isDefault: true,
    });

    expect(result.success).toBe(true);
    expect(mockRequireAdminUser).toHaveBeenCalled();
    expect(mockRequirePremiumPlan).toHaveBeenCalledWith("company-1");
    expect(mockPrisma.slaPolicy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: "company-1",
        name: "Standard 30-day SLA",
        responseDays: 30,
        reminderIntervals: [7, 3, 1],
        escalationDays: 7,
        isDefault: true,
      }),
    });
  });

  it("rejects when user is not ADMIN", async () => {
    const authError = new Error("FORBIDDEN");
    mockRequireAdminUser.mockRejectedValueOnce(authError);
    mockIsAccessControlError.mockReturnValueOnce(true);

    await expect(createSlaPolicy({ name: "Test Policy", responseDays: 30, reminderIntervals: [], escalationDays: 0, escalationRecipientUserId: null, isDefault: false })).rejects.toThrow("FORBIDDEN");
    expect(mockPrisma.slaPolicy.create).not.toHaveBeenCalled();
  });

  it("throws PremiumGateError on FREE plan", async () => {
    const premiumError = new PremiumGateError("Premium plan required");
    mockRequirePremiumPlan.mockRejectedValueOnce(premiumError);

    const result = await createSlaPolicy({ name: "Test Policy", responseDays: 30, reminderIntervals: [], escalationDays: 0, escalationRecipientUserId: null, isDefault: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Premium plan required for SLA policies");
    expect(mockPrisma.slaPolicy.create).not.toHaveBeenCalled();
  });

  it("returns error when duplicate policy name exists", async () => {
    mockPrisma.slaPolicy.findFirst.mockResolvedValueOnce({
      id: "existing-policy",
      name: "Standard 30-day SLA",
      companyId: "company-1",
    });

    const result = await createSlaPolicy({ name: "Standard 30-day SLA", responseDays: 30, reminderIntervals: [], escalationDays: 0, escalationRecipientUserId: null, isDefault: false });

    expect(result).toEqual({ success: false, error: "A policy with this name already exists" });
    expect(mockPrisma.slaPolicy.create).not.toHaveBeenCalled();
  });

  it("validates required fields", async () => {
    const result = await createSlaPolicy({ name: "", responseDays: 30, reminderIntervals: [], escalationDays: 0, escalationRecipientUserId: null, isDefault: false });

    expect(result.success).toBe(false);
    expect(result.error).toContain("required");
  });

  it("clears other default policies when isDefault is true", async () => {
    mockPrisma.slaPolicy.updateMany = vi.fn().mockResolvedValue({ count: 2 });

    const result = await createSlaPolicy({ name: "New Default Policy", responseDays: 30, reminderIntervals: [], escalationDays: 0, escalationRecipientUserId: null, isDefault: true });

    expect(result.success).toBe(true);
    expect(mockPrisma.slaPolicy.updateMany).toHaveBeenCalledWith({
      where: { companyId: "company-1", isDefault: true },
      data: { isDefault: false },
    });
    expect(mockPrisma.slaPolicy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isDefault: true,
      }),
    });
  });
});

describe("updateSlaPolicy", () => {
  it("updates policy successfully", async () => {
    mockPrisma.slaPolicy.findFirst.mockResolvedValueOnce({
      id: "policy-1",
      companyId: "company-1",
      name: "Old Name",
    });

    const result = await updateSlaPolicy("policy-1", { name: "Updated Name", responseDays: 45 });

    expect(result.success).toBe(true);
    expect(mockPrisma.slaPolicy.update).toHaveBeenCalledWith({
      where: { id: "policy-1" },
      data: expect.objectContaining({
        name: "Updated Name",
        responseDays: 45,
      }),
    });
  });

  it("rejects when policy belongs to wrong company (IDOR protection)", async () => {
    mockPrisma.slaPolicy.findFirst.mockResolvedValueOnce(null);

    const result = await updateSlaPolicy("policy-1", { name: "Updated Name", responseDays: 45 });

    expect(result).toEqual({ success: false, error: "Policy not found" });
    expect(mockPrisma.slaPolicy.update).not.toHaveBeenCalled();
  });
});

describe("deleteSlaPolicy", () => {
  it("deletes policy successfully", async () => {
    mockPrisma.slaPolicy.findFirst.mockResolvedValueOnce({
      id: "policy-1",
      companyId: "company-1",
      name: "Test Policy",
    });

    const result = await deleteSlaPolicy("policy-1");

    expect(result.success).toBe(true);
    expect(mockPrisma.slaPolicy.delete).toHaveBeenCalledWith({
      where: { id: "policy-1" },
    });
  });

  it("rejects when policy belongs to wrong company (IDOR protection)", async () => {
    mockPrisma.slaPolicy.findFirst.mockResolvedValueOnce(null);

    const result = await deleteSlaPolicy("policy-1");

    expect(result).toEqual({ success: false, error: "Policy not found" });
    expect(mockPrisma.slaPolicy.delete).not.toHaveBeenCalled();
  });
});

describe("getSlaComplianceRateAction", () => {
  it("returns correct compliance rate", async () => {
    mockPrisma.assessment.findMany = vi.fn().mockResolvedValue([
      { id: "a1", completedAt: new Date("2026-04-01"), dueDate: new Date("2026-04-02") }, // on time
      { id: "a2", completedAt: new Date("2026-04-05"), dueDate: new Date("2026-04-01") }, // late
      { id: "a3", completedAt: new Date("2026-04-10"), dueDate: new Date("2026-04-15") }, // on time
    ]);

    const result = await getSlaComplianceRateAction();

    expect(result.success).toBe(true);
    expect(result.rate).toBeCloseTo(66.67, 1);
  });

  it("returns error on FREE plan", async () => {
    const premiumError = new PremiumGateError("Premium plan required");
    mockRequirePremiumPlan.mockRejectedValueOnce(premiumError);

    const result = await getSlaComplianceRateAction();

    expect(result.success).toBe(false);
    expect(result.error).toBe("Premium plan required for SLA metrics");
  });
});

describe("getSlaPoliciesForCompany", () => {
  it("returns policies for ADMIN user", async () => {
    mockPrisma.slaPolicy.findMany.mockResolvedValueOnce([
      { id: "p1", name: "Policy 1", companyId: "company-1", responseDays: 30, reminderIntervals: [7, 3], escalationDays: 7, escalationRecipientUserId: null, isDefault: true },
      { id: "p2", name: "Policy 2", companyId: "company-1", responseDays: 60, reminderIntervals: [14, 7], escalationDays: 14, escalationRecipientUserId: null, isDefault: false },
    ]);

    const result = await getSlaPoliciesForCompany();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Policy 1");
    expect(mockPrisma.slaPolicy.findMany).toHaveBeenCalledWith({
      where: { companyId: "company-1" },
      select: expect.any(Object),
      orderBy: { name: "asc" },
    });
  });

  it("throws when user is not ADMIN", async () => {
    const authError = new Error("FORBIDDEN");
    mockRequireAdminUser.mockRejectedValueOnce(authError);
    mockIsAccessControlError.mockReturnValueOnce(true);

    await expect(getSlaPoliciesForCompany()).rejects.toThrow("FORBIDDEN");
  });
});
