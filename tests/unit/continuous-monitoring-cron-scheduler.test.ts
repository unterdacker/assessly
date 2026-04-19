import { beforeEach, describe, expect, it, vi } from "vitest";
import { type NextRequest } from "next/server";

const {
  mockPrisma,
  mockAuditLogger,
  mockCalculateNextDueDate,
} = vi.hoisted(() => ({
  mockPrisma: {
    recurrenceSchedule: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    assessment: {
      findUnique: vi.fn(),
    },
  },
  mockAuditLogger: {
    systemHealth: vi.fn(),
    dataOp: vi.fn(),
  },
  mockCalculateNextDueDate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: mockAuditLogger,
}));
vi.mock("@/lib/env", () => ({ 
  appEnv: { 
    cronSecret: "test-cron-secret-32-chars-long-here-ok",
  } 
}));
vi.mock("@/modules/continuous-monitoring/lib/next-due-calculator", () => ({
  calculateNextDueDate: mockCalculateNextDueDate,
}));

import { POST } from "@/app/api/cron/compliance-scheduler/route";

beforeEach(() => {
  vi.clearAllMocks();

  mockPrisma.recurrenceSchedule.findMany.mockResolvedValue([]);
  mockPrisma.recurrenceSchedule.update.mockResolvedValue({ id: "schedule-1" });
  mockPrisma.assessment.findUnique.mockResolvedValue(null);
  
  mockCalculateNextDueDate.mockImplementation((interval: string, date: Date) => {
    const next = new Date(date);
    if (interval === "MONTHLY") next.setMonth(next.getMonth() + 1);
    else if (interval === "QUARTERLY") next.setMonth(next.getMonth() + 3);
    else if (interval === "SEMI_ANNUAL") next.setMonth(next.getMonth() + 6);
    else if (interval === "ANNUAL") next.setFullYear(next.getFullYear() + 1);
    return next;
  });
});

describe("POST /api/cron/compliance-scheduler", () => {
  it("rejects missing Authorization header with 401", async () => {
    const request = new Request("http://localhost/api/cron/compliance-scheduler", {
      method: "POST",
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects wrong CRON_SECRET with 401", async () => {
    const request = new Request("http://localhost/api/cron/compliance-scheduler", {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-secret-value-here",
      },
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("accepts correct CRON_SECRET", async () => {
    const request = new Request("http://localhost/api/cron/compliance-scheduler", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  it("creates assessments for due schedules (PREMIUM company, autoSend=true)", async () => {
    const pastDueDate = new Date("2026-04-10");
    const futureNextDueAt = new Date("2026-05-10");

    mockPrisma.recurrenceSchedule.findMany.mockResolvedValueOnce([
      {
        id: "schedule-1",
        vendorId: "vendor-1",
        companyId: "company-1",
        interval: "MONTHLY",
        isActive: true,
        autoSend: true,
        nextDueAt: pastDueDate,
        lastAssessmentId: null,
        vendor: {
          id: "vendor-1",
          name: "Test Vendor",
          companyId: "company-1",
        },
        company: {
          id: "company-1",
          plan: "PREMIUM",
        },
      },
    ]);

    mockCalculateNextDueDate.mockReturnValueOnce(futureNextDueAt);

    const request = new Request("http://localhost/api/cron/compliance-scheduler", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(1);

    expect(mockPrisma.recurrenceSchedule.update).toHaveBeenCalledWith({
      where: { id: "schedule-1" },
      data: {
        nextDueAt: futureNextDueAt,
        updatedAt: expect.any(Date),
      },
    });

    expect(mockAuditLogger.dataOp).toHaveBeenCalledWith(
      "recurrence.schedule_triggered",
      "success",
      expect.objectContaining({
        details: expect.objectContaining({
          scheduleId: "schedule-1",
          vendorId: "vendor-1",
          companyId: "company-1",
          interval: "MONTHLY",
        }),
      })
    );
  });

  it("skips non-Premium companies", async () => {
    mockPrisma.recurrenceSchedule.findMany.mockResolvedValueOnce([
      {
        id: "schedule-2",
        vendorId: "vendor-2",
        companyId: "company-2",
        interval: "MONTHLY",
        isActive: true,
        autoSend: true,
        nextDueAt: new Date("2026-04-10"),
        lastAssessmentId: null,
        vendor: {
          id: "vendor-2",
          name: "Free Plan Vendor",
          companyId: "company-2",
        },
        company: {
          id: "company-2",
          plan: "FREE",
        },
      },
    ]);

    const request = new Request("http://localhost/api/cron/compliance-scheduler", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(0);

    expect(mockPrisma.recurrenceSchedule.update).not.toHaveBeenCalled();
  });

  it("updates nextDueAt based on MONTHLY interval correctly", async () => {
    const currentDueDate = new Date("2026-04-15T00:00:00Z");
    const expectedNextDueDate = new Date("2026-05-15T00:00:00Z");

    mockPrisma.recurrenceSchedule.findMany.mockResolvedValueOnce([
      {
        id: "schedule-3",
        vendorId: "vendor-3",
        companyId: "company-3",
        interval: "MONTHLY",
        isActive: true,
        autoSend: true,
        nextDueAt: currentDueDate,
        lastAssessmentId: null,
        vendor: {
          id: "vendor-3",
          name: "Monthly Vendor",
          companyId: "company-3",
        },
        company: {
          id: "company-3",
          plan: "PREMIUM",
        },
      },
    ]);

    mockCalculateNextDueDate.mockReturnValueOnce(expectedNextDueDate);

    const request = new Request("http://localhost/api/cron/compliance-scheduler", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    await POST(request as unknown as NextRequest);

    expect(mockCalculateNextDueDate).toHaveBeenCalledWith("MONTHLY", currentDueDate);
    expect(mockPrisma.recurrenceSchedule.update).toHaveBeenCalledWith({
      where: { id: "schedule-3" },
      data: {
        nextDueAt: expectedNextDueDate,
        updatedAt: expect.any(Date),
      },
    });
  });

  it("updates nextDueAt based on QUARTERLY interval correctly", async () => {
    const currentDueDate = new Date("2026-04-15T00:00:00Z");
    const expectedNextDueDate = new Date("2026-07-15T00:00:00Z");

    mockPrisma.recurrenceSchedule.findMany.mockResolvedValueOnce([
      {
        id: "schedule-4",
        vendorId: "vendor-4",
        companyId: "company-4",
        interval: "QUARTERLY",
        isActive: true,
        autoSend: true,
        nextDueAt: currentDueDate,
        lastAssessmentId: null,
        vendor: {
          id: "vendor-4",
          name: "Quarterly Vendor",
          companyId: "company-4",
        },
        company: {
          id: "company-4",
          plan: "PREMIUM",
        },
      },
    ]);

    mockCalculateNextDueDate.mockReturnValueOnce(expectedNextDueDate);

    const request = new Request("http://localhost/api/cron/compliance-scheduler", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    await POST(request as unknown as NextRequest);

    expect(mockCalculateNextDueDate).toHaveBeenCalledWith("QUARTERLY", currentDueDate);
    expect(mockPrisma.recurrenceSchedule.update).toHaveBeenCalledWith({
      where: { id: "schedule-4" },
      data: {
        nextDueAt: expectedNextDueDate,
        updatedAt: expect.any(Date),
      },
    });
  });

  it("skips already processed cycles (idempotency check)", async () => {
    const currentDueDate = new Date("2026-04-15T00:00:00Z");
    const recentAssessmentDate = new Date("2026-04-12T00:00:00Z");
    const expectedNextDueDate = new Date("2026-05-15T00:00:00Z");

    mockPrisma.recurrenceSchedule.findMany.mockResolvedValueOnce([
      {
        id: "schedule-5",
        vendorId: "vendor-5",
        companyId: "company-5",
        interval: "MONTHLY",
        isActive: true,
        autoSend: true,
        nextDueAt: currentDueDate,
        lastAssessmentId: "assessment-recent",
        vendor: {
          id: "vendor-5",
          name: "Already Processed Vendor",
          companyId: "company-5",
        },
        company: {
          id: "company-5",
          plan: "PREMIUM",
        },
      },
    ]);

    // Mock the assessment that was already created for this cycle
    mockPrisma.assessment.findUnique.mockResolvedValueOnce({
      id: "assessment-recent",
      createdAt: recentAssessmentDate,
    });

    mockCalculateNextDueDate.mockReturnValueOnce(expectedNextDueDate);

    const request = new Request("http://localhost/api/cron/compliance-scheduler", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(1);

    // Should update nextDueAt but skip assessment creation
    expect(mockPrisma.recurrenceSchedule.update).toHaveBeenCalledWith({
      where: { id: "schedule-5" },
      data: {
        nextDueAt: expectedNextDueDate,
        updatedAt: expect.any(Date),
      },
    });

    expect(mockAuditLogger.systemHealth).toHaveBeenCalledWith(
      "cron.compliance_scheduler.already_processed",
      "success",
      expect.objectContaining({
        details: expect.objectContaining({
          scheduleId: "schedule-5",
        }),
      })
    );
  });

  it("processes multiple schedules in one run", async () => {
    mockPrisma.recurrenceSchedule.findMany.mockResolvedValueOnce([
      {
        id: "schedule-6",
        vendorId: "vendor-6",
        companyId: "company-6",
        interval: "MONTHLY",
        isActive: true,
        autoSend: true,
        nextDueAt: new Date("2026-04-10"),
        lastAssessmentId: null,
        vendor: { id: "vendor-6", name: "Vendor 6", companyId: "company-6" },
        company: { id: "company-6", plan: "PREMIUM" },
      },
      {
        id: "schedule-7",
        vendorId: "vendor-7",
        companyId: "company-7",
        interval: "QUARTERLY",
        isActive: true,
        autoSend: true,
        nextDueAt: new Date("2026-04-10"),
        lastAssessmentId: null,
        vendor: { id: "vendor-7", name: "Vendor 7", companyId: "company-7" },
        company: { id: "company-7", plan: "PREMIUM" },
      },
    ]);

    mockCalculateNextDueDate
      .mockReturnValueOnce(new Date("2026-05-10"))
      .mockReturnValueOnce(new Date("2026-07-10"));

    const request = new Request("http://localhost/api/cron/compliance-scheduler", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(2);
    expect(mockPrisma.recurrenceSchedule.update).toHaveBeenCalledTimes(2);
  });

  it("logs system health on completion", async () => {
    mockPrisma.recurrenceSchedule.findMany.mockResolvedValueOnce([]);

    const request = new Request("http://localhost/api/cron/compliance-scheduler", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    await POST(request as unknown as NextRequest);

    expect(mockAuditLogger.systemHealth).toHaveBeenCalledWith(
      "cron.compliance_scheduler.completed",
      "success",
      expect.objectContaining({
        details: expect.objectContaining({
          processed: 0,
          schedulesFound: 0,
        }),
      })
    );
  });

  it("returns 500 on internal error", async () => {
    mockPrisma.recurrenceSchedule.findMany.mockRejectedValueOnce(
      new Error("Database connection failed")
    );

    const request = new Request("http://localhost/api/cron/compliance-scheduler", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Internal server error");

    expect(mockAuditLogger.systemHealth).toHaveBeenCalledWith(
      "cron.compliance_scheduler.error",
      "failure",
      expect.objectContaining({
        details: expect.objectContaining({
          error: expect.stringContaining("Database connection failed"),
        }),
      })
    );
  });
});
