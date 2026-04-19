import { beforeEach, describe, expect, it, vi } from "vitest";
import { type NextRequest } from "next/server";

const {
  mockPrisma,
  mockSendMail,
  mockAuditLogger,
  mockDetectRegression,
  mockCalculateOverallScore,
  mockRegressionAlertEmail,
} = vi.hoisted(() => ({
  mockPrisma: {
    company: {
      findMany: vi.fn(),
    },
    complianceSnapshot: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    assessment: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  mockSendMail: vi.fn(),
  mockAuditLogger: {
    systemHealth: vi.fn(),
    log: vi.fn(),
  },
  mockDetectRegression: vi.fn(),
  mockCalculateOverallScore: vi.fn(),
  mockRegressionAlertEmail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/mail", () => ({ sendMail: mockSendMail }));
vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: mockAuditLogger,
  LogLevel: { INFO: "INFO", WARN: "WARN", ERROR: "ERROR" },
}));
vi.mock("@/lib/env", () => ({ 
  appEnv: { 
    cronSecret: "test-cron-secret-32-chars-long-here-ok",
  } 
}));
vi.mock("@/modules/continuous-monitoring/lib/regression-detection", () => ({
  detectRegression: mockDetectRegression,
  calculateOverallScore: mockCalculateOverallScore,
}));
vi.mock("@/modules/continuous-monitoring/lib/email-templates", () => ({
  regressionAlertEmail: mockRegressionAlertEmail,
}));

import { POST } from "@/app/api/cron/compliance-snapshot/route";

beforeEach(() => {
  vi.clearAllMocks();

  mockPrisma.company.findMany.mockResolvedValue([]);
  mockPrisma.complianceSnapshot.findFirst.mockResolvedValue(null);
  mockPrisma.complianceSnapshot.create.mockResolvedValue({ id: "snapshot-1" });
  mockPrisma.assessment.findMany.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  mockSendMail.mockResolvedValue(undefined);
  mockDetectRegression.mockReturnValue([]);
  mockCalculateOverallScore.mockReturnValue(0);
  mockRegressionAlertEmail.mockReturnValue({
    subject: "Compliance Alert",
    html: "<p>Alert</p>",
  });
});

describe("POST /api/cron/compliance-snapshot", () => {
  it("rejects missing Authorization header with 401", async () => {
    const request = new Request("http://localhost/api/cron/compliance-snapshot", {
      method: "POST",
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects wrong CRON_SECRET with 401", async () => {
    const request = new Request("http://localhost/api/cron/compliance-snapshot", {
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

  it("writes snapshot for company with assessments", async () => {
    mockPrisma.company.findMany.mockResolvedValueOnce([
      {
        id: "company-1",
        plan: "PREMIUM",
        name: "Test Company",
      },
    ]);

    mockPrisma.assessment.findMany.mockResolvedValueOnce([
      {
        id: "assessment-1",
        vendorId: "vendor-1",
        complianceScore: 85,
        createdAt: new Date("2026-04-15"),
      },
      {
        id: "assessment-2",
        vendorId: "vendor-2",
        complianceScore: 90,
        createdAt: new Date("2026-04-16"),
      },
    ]);

    const request = new Request("http://localhost/api/cron/compliance-snapshot", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.snapshots).toBe(1);

    expect(mockPrisma.complianceSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: "company-1",
        snapshotDate: expect.any(Date),
        overallScore: expect.any(Number),
        categoryScores: expect.any(Object),
        vendorCount: 2,
      }),
    });

    expect(mockAuditLogger.systemHealth).toHaveBeenCalledWith(
      "cron.compliance_snapshot.completed",
      "success",
      expect.objectContaining({
        details: expect.objectContaining({
          snapshots: 1,
          companiesEvaluated: 1,
        }),
      })
    );
  });

  it("skips company if snapshot already exists today", async () => {
    mockPrisma.company.findMany.mockResolvedValueOnce([
      {
        id: "company-2",
        plan: "PREMIUM",
        name: "Test Company 2",
      },
    ]);

    // Mock existing snapshot from today
    mockPrisma.complianceSnapshot.findFirst.mockResolvedValueOnce({
      id: "existing-snapshot",
      companyId: "company-2",
      snapshotDate: new Date(),
      overallScore: 85,
    });

    const request = new Request("http://localhost/api/cron/compliance-snapshot", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.snapshots).toBe(0);

    expect(mockPrisma.complianceSnapshot.create).not.toHaveBeenCalled();
  });

  it("skips company with no completed assessments", async () => {
    mockPrisma.company.findMany.mockResolvedValueOnce([
      {
        id: "company-3",
        plan: "PREMIUM",
        name: "Company No Assessments",
      },
    ]);

    mockPrisma.assessment.findMany.mockResolvedValueOnce([]);

    const request = new Request("http://localhost/api/cron/compliance-snapshot", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.snapshots).toBe(0);

    expect(mockPrisma.complianceSnapshot.create).not.toHaveBeenCalled();
  });

  it("sends regression alert email for Premium company when regression detected", async () => {
    mockPrisma.company.findMany.mockResolvedValueOnce([
      {
        id: "company-4",
        plan: "PREMIUM",
        name: "Regression Company",
      },
    ]);

    mockPrisma.assessment.findMany.mockResolvedValueOnce([
      {
        id: "assessment-3",
        vendorId: "vendor-3",
        complianceScore: 75,
        createdAt: new Date("2026-04-18"),
      },
    ]);

    // Mock previous snapshot with higher scores
    const previousSnapshot = {
      id: "prev-snapshot",
      companyId: "company-4",
      snapshotDate: new Date("2026-03-19"),
      overallScore: 90,
      categoryScores: { governance: 90, access: 85 },
    };
    mockPrisma.complianceSnapshot.findFirst
      .mockResolvedValueOnce(null) // First call checks if today's snapshot exists
      .mockResolvedValueOnce(previousSnapshot); // Second call fetches previous snapshot

    // Mock regression detection
    mockDetectRegression.mockReturnValueOnce(["governance"]);

    // Mock admins
    mockPrisma.user.findMany.mockResolvedValueOnce([
      {
        email: "admin1@test.com",
        displayName: "Admin One",
      },
      {
        email: "admin2@test.com",
        displayName: "Admin Two",
      },
    ]);

    mockRegressionAlertEmail.mockReturnValueOnce({
      subject: "Compliance Regression Alert",
      html: "<p>Regression detected in governance</p>",
    });

    const request = new Request("http://localhost/api/cron/compliance-snapshot", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);

    expect(mockDetectRegression).toHaveBeenCalledWith(
      previousSnapshot.categoryScores,
      expect.any(Object),
      10 // default threshold
    );

    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "DATA_OPERATIONS",
        action: "compliance.regression_detected",
        status: "success",
      })
    );

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: {
        companyId: "company-4",
        role: { in: ["ADMIN", "SUPER_ADMIN", "RISK_REVIEWER"] },
        isActive: true,
      },
      select: {
        email: true,
        displayName: true,
      },
    });

    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockSendMail).toHaveBeenCalledWith({
      to: "admin1@test.com",
      subject: "Compliance Regression Alert",
      html: expect.any(String),
    });

    expect(mockAuditLogger.systemHealth).toHaveBeenCalledWith(
      "cron.compliance_snapshot.regression_alerts_sent",
      "success",
      expect.objectContaining({
        details: expect.objectContaining({
          companyId: "company-4",
          categories: ["governance"],
          recipientCount: 2,
        }),
      })
    );
  });

  it("does not send regression alert for FREE plan company", async () => {
    mockPrisma.company.findMany.mockResolvedValueOnce([
      {
        id: "company-5",
        plan: "FREE",
        name: "Free Plan Company",
      },
    ]);

    mockPrisma.assessment.findMany.mockResolvedValueOnce([
      {
        id: "assessment-4",
        vendorId: "vendor-4",
        complianceScore: 70,
        createdAt: new Date("2026-04-18"),
      },
    ]);

    // Even with previous snapshot showing regression
    const previousSnapshot = {
      id: "prev-snapshot-2",
      companyId: "company-5",
      snapshotDate: new Date("2026-03-19"),
      overallScore: 90,
      categoryScores: { governance: 90 },
    };
    mockPrisma.complianceSnapshot.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(previousSnapshot);

    const request = new Request("http://localhost/api/cron/compliance-snapshot", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);

    // Regression detection should not be called for FREE plan
    expect(mockDetectRegression).not.toHaveBeenCalled();
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("returns 500 on internal error", async () => {
    mockPrisma.company.findMany.mockRejectedValueOnce(
      new Error("Database connection failed")
    );

    const request = new Request("http://localhost/api/cron/compliance-snapshot", {
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
      "cron.compliance_snapshot.error",
      "failure",
      expect.objectContaining({
        details: expect.objectContaining({
          error: expect.stringContaining("Database connection failed"),
        }),
      })
    );
  });
});
