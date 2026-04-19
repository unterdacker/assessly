import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListPendingReminders,
  mockPrisma,
  mockSendMail,
  mockAuditLogger,
  mockIsPremiumPlan,
} = vi.hoisted(() => ({
  mockListPendingReminders: vi.fn(),
  mockPrisma: {
    assessmentReminder: {
      update: vi.fn().mockResolvedValue({ id: "reminder-1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    assessment: {
      update: vi.fn().mockResolvedValue({ id: "assessment-1" }),
    },
    user: {
      findFirst: vi.fn(),
    },
  },
  mockSendMail: vi.fn().mockResolvedValue(undefined),
  mockAuditLogger: {
    systemHealth: vi.fn(),
    dataOp: vi.fn(),
  },
  mockIsPremiumPlan: vi.fn(),
}));

vi.mock("@/modules/sla-tracking/lib/sla-queries", () => ({
  listPendingReminders: mockListPendingReminders,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/mail", () => ({ sendMail: mockSendMail }));
vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: mockAuditLogger,
}));
vi.mock("@/lib/plan-gate", () => ({
  isPremiumPlan: mockIsPremiumPlan,
}));
vi.mock("@/lib/env", () => ({ 
  appEnv: { 
    cronSecret: "test-cron-secret-32-chars-long-here-ok",
    url: "https://test.example.com",
  } 
}));

import { POST } from "@/app/api/cron/sla-reminders/route";

beforeEach(() => {
  vi.clearAllMocks();

  mockListPendingReminders.mockResolvedValue([]);
  mockPrisma.assessmentReminder.update.mockResolvedValue({ id: "reminder-1" });
  mockPrisma.assessmentReminder.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.assessment.update.mockResolvedValue({ id: "assessment-1" });
  mockPrisma.user.findFirst.mockResolvedValue({ id: "user-1", email: "admin@test.com", displayName: "Admin User" });
  mockSendMail.mockResolvedValue(undefined);
  mockIsPremiumPlan.mockResolvedValue(true);
});

describe("POST /api/cron/sla-reminders", () => {
  it("rejects missing Authorization header with 401", async () => {
    const request = new Request("http://localhost/api/cron/sla-reminders", {
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects wrong CRON_SECRET with 401", async () => {
    const request = new Request("http://localhost/api/cron/sla-reminders", {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-secret-value-here",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("accepts correct CRON_SECRET", async () => {
    const request = new Request("http://localhost/api/cron/sla-reminders", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  it("processes PRE_DUE reminder: sends email and marks sentAt", async () => {
    mockListPendingReminders.mockResolvedValueOnce([
      {
        id: "reminder-1",
        type: "PRE_DUE",
        assessmentId: "assessment-1",
        recipientEmail: "vendor@test.com",
        scheduledAt: new Date(),
        assessment: {
          id: "assessment-1",
          companyId: "company-1",
          slaPolicyId: "policy-1",
          slaBreached: false,
          dueDate: new Date("2026-04-26"),
          vendor: {
            id: "vendor-1",
            name: "Test Vendor",
            company: {
              id: "company-1",
              plan: "PREMIUM",
              name: "Test Company",
            },
          },
          slaPolicy: {
            id: "policy-1",
            name: "Standard SLA",
            escalationDays: 7,
            escalationRecipientUserId: null,
          },
        },
      },
    ]);

    const request = new Request("http://localhost/api/cron/sla-reminders", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(1);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "vendor@test.com",
        subject: expect.stringContaining("Reminder: Security Assessment Due in"),
      })
    );

    expect(mockPrisma.assessmentReminder.update).toHaveBeenCalledWith({
      where: { id: "reminder-1" },
      data: { sentAt: expect.any(Date) },
    });
  });

  it("processes OVERDUE reminder: sets slaBreached=true BEFORE email, marks sentAt", async () => {
    mockListPendingReminders.mockResolvedValueOnce([
      {
        id: "reminder-2",
        type: "OVERDUE",
        assessmentId: "assessment-2",
        recipientEmail: "overdue@test.com",
        scheduledAt: new Date(),
        assessment: {
          id: "assessment-2",
          companyId: "company-1",
          slaPolicyId: "policy-1",
          slaBreached: false,
          dueDate: new Date("2026-04-10"),
          vendor: {
            id: "vendor-2",
            name: "Overdue Vendor",
            company: {
              id: "company-1",
              plan: "PREMIUM",
              name: "Test Company",
            },
          },
          slaPolicy: {
            id: "policy-1",
            name: "Standard SLA",
            escalationDays: 7,
            escalationRecipientUserId: null,
          },
        },
      },
    ]);

    const request = new Request("http://localhost/api/cron/sla-reminders", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    await POST(request);

    expect(mockPrisma.assessment.update).toHaveBeenCalledWith({
      where: { id: "assessment-2" },
      data: { slaBreached: true },
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "overdue@test.com",
        subject: expect.stringMatching(/^OVERDUE:/),
      })
    );

    expect(mockPrisma.assessmentReminder.update).toHaveBeenCalledWith({
      where: { id: "reminder-2" },
      data: { sentAt: expect.any(Date) },
    });
  });

  it("skips ESCALATION when no recipient (marks sentAt, logs)", async () => {
    mockListPendingReminders.mockResolvedValueOnce([
      {
        id: "reminder-3",
        type: "ESCALATION",
        assessmentId: "assessment-3",
        recipientEmail: "vendor@test.com",
        scheduledAt: new Date(),
        assessment: {
          id: "assessment-3",
          companyId: "company-1",
          slaPolicyId: "policy-1",
          slaBreached: true,
          dueDate: new Date("2026-04-05"),
          vendor: {
            id: "vendor-3",
            name: "Escalated Vendor",
            company: {
              id: "company-1",
              plan: "PREMIUM",
              name: "Test Company",
            },
          },
          slaPolicy: {
            id: "policy-1",
            name: "Standard SLA",
            escalationDays: 7,
            escalationRecipientUserId: null,
          },
        },
      },
    ]);

    const request = new Request("http://localhost/api/cron/sla-reminders", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    await POST(request);

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockPrisma.assessmentReminder.update).toHaveBeenCalledWith({
      where: { id: "reminder-3" },
      data: { sentAt: expect.any(Date) },
    });
  });

  it("FREE plan reminders: marks sentAt without sending email", async () => {
    mockIsPremiumPlan.mockResolvedValueOnce(false);
    mockListPendingReminders.mockResolvedValueOnce([
      {
        id: "reminder-4",
        type: "PRE_DUE",
        assessmentId: "assessment-4",
        recipientEmail: "free@test.com",
        scheduledAt: new Date(),
        assessment: {
          id: "assessment-4",
          companyId: "company-2",
          slaPolicyId: "policy-1",
          slaBreached: false,
          dueDate: new Date("2026-04-26"),
          vendor: {
            id: "vendor-4",
            name: "Free Plan Vendor",
            company: {
              id: "company-2",
              plan: "FREE",
              name: "Free Company",
            },
          },
          slaPolicy: {
            id: "policy-1",
            name: "Standard SLA",
            escalationDays: 7,
            escalationRecipientUserId: null,
          },
        },
      },
    ]);

    const request = new Request("http://localhost/api/cron/sla-reminders", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    await POST(request);

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockPrisma.assessmentReminder.update).toHaveBeenCalledWith({
      where: { id: "reminder-4" },
      data: { sentAt: expect.any(Date) },
    });
  });

  it("batch cap (50): logs SYSTEM_HEALTH when result.length == 50", async () => {
    const reminders = Array.from({ length: 50 }, (_, i) => ({
      id: `reminder-${i}`,
      type: "PRE_DUE",
      assessmentId: `assessment-${i}`,
      recipientEmail: `vendor${i}@test.com`,
      scheduledAt: new Date(),
      assessment: {
        id: `assessment-${i}`,
        companyId: "company-1",
        slaPolicyId: "policy-1",
        slaBreached: false,
        dueDate: new Date("2026-04-26"),
        vendor: {
          id: `vendor-${i}`,
          name: `Vendor ${i}`,
          company: {
            id: "company-1",
            plan: "PREMIUM",
            name: "Test Company",
          },
        },
        slaPolicy: {
          id: "policy-1",
          name: "Standard SLA",
          escalationDays: 7,
          escalationRecipientUserId: null,
        },
      },
    }));

    mockListPendingReminders.mockResolvedValueOnce(reminders);

    const request = new Request("http://localhost/api/cron/sla-reminders", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    await POST(request);

    expect(mockAuditLogger.systemHealth).toHaveBeenCalledWith(
      "cron.sla_reminders.batch_capped",
      "success",
      expect.objectContaining({
        details: expect.objectContaining({
          batchSize: 50,
          message: "Batch cap reached — more reminders may be pending",
        }),
      })
    );
  });

  it("empty pending list: returns { ok: true, processed: 0 }", async () => {
    mockListPendingReminders.mockResolvedValueOnce([]);

    const request = new Request("http://localhost/api/cron/sla-reminders", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, processed: 0 });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("handles email send failure gracefully (does not throw)", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("SMTP server down"));
    mockListPendingReminders.mockResolvedValueOnce([
      {
        id: "reminder-5",
        type: "PRE_DUE",
        assessmentId: "assessment-5",
        recipientEmail: "vendor@test.com",
        scheduledAt: new Date(),
        assessment: {
          id: "assessment-5",
          companyId: "company-1",
          slaPolicyId: "policy-1",
          slaBreached: false,
          dueDate: new Date("2026-04-26"),
          vendor: {
            id: "vendor-5",
            name: "Test Vendor",
            company: {
              id: "company-1",
              plan: "PREMIUM",
              name: "Test Company",
            },
          },
          slaPolicy: {
            id: "policy-1",
            name: "Standard SLA",
            escalationDays: 7,
            escalationRecipientUserId: null,
          },
        },
      },
    ]);

    const request = new Request("http://localhost/api/cron/sla-reminders", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(1);

    expect(mockPrisma.assessmentReminder.update).toHaveBeenCalledWith({
      where: { id: "reminder-5" },
      data: { sentAt: expect.any(Date) },
    });
  });

  it("calls isPremiumPlan with the correct assessment company ID", async () => {
    mockListPendingReminders.mockResolvedValueOnce([
      {
        id: "reminder-6",
        type: "PRE_DUE",
        assessmentId: "assessment-6",
        recipientEmail: "vendor@test.com",
        scheduledAt: new Date(),
        assessment: {
          id: "assessment-6",
          companyId: "company-1",
          slaPolicyId: "policy-1",
          slaBreached: false,
          dueDate: new Date("2026-04-26"),
          vendor: {
            id: "vendor-6",
            name: "Test Vendor",
            company: {
              id: "company-1",
              plan: "PREMIUM",
              name: "Test Company",
            },
          },
          slaPolicy: {
            id: "policy-1",
            name: "Standard SLA",
            escalationDays: 7,
            escalationRecipientUserId: null,
          },
        },
      },
    ]);

    const request = new Request("http://localhost/api/cron/sla-reminders", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret-32-chars-long-here-ok",
      },
    });

    await POST(request);

    expect(mockIsPremiumPlan).toHaveBeenCalledWith("company-1");
  });
});
