import { vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: { log: vi.fn() },
  AuditCategory: { SYSTEM_HEALTH: "SYSTEM_HEALTH" },
}));

vi.mock("@/lib/logger", () => ({
  logErrorReport: vi.fn(),
}));

import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "@/app/api/cron/audit-log-retention/route";
import { prisma } from "@/lib/prisma";
import { AuditLogger } from "@/lib/structured-logger";
import { NextRequest } from "next/server";

function makeRequest(secret = "test-secret"): NextRequest {
  return new NextRequest("http://localhost/api/cron/audit-log-retention", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  vi.clearAllMocks();
});

describe("GET /api/cron/audit-log-retention", () => {
  it("returns 401 when CRON_SECRET is not set", async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
  });

  it("returns 401 when bearer token does not match", async () => {
    const res = await GET(makeRequest("wrong-secret"));

    expect(res.status).toBe(401);
  });

  it("HIGH-priority rows are never included in the delete query", async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue(
      [] as { id: string }[] as any,
    );
    vi.mocked(prisma.auditLog.deleteMany).mockResolvedValue({ count: 0 });

    await GET(makeRequest());

    const where = vi.mocked(prisma.auditLog.findMany).mock.calls[0]?.[0]?.where;
    expect(where?.retentionPriority).toBe("LOW");
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it("rows with retentionUntil in the future are excluded", async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue(
      [] as { id: string }[] as any,
    );
    vi.mocked(prisma.auditLog.deleteMany).mockResolvedValue({ count: 0 });

    await GET(makeRequest());

    const where = vi.mocked(prisma.auditLog.findMany).mock.calls[0]?.[0]?.where;
    expect(where?.retentionUntil).toEqual({ lt: expect.any(Date) });
  });

  it("returns correct deleted count and calls AuditLogger once", async () => {
    vi.mocked(prisma.auditLog.findMany)
      .mockResolvedValueOnce(
        [{ id: "a" }, { id: "b" }, { id: "c" }] as { id: string }[] as any,
      )
      .mockResolvedValueOnce([] as { id: string }[] as any);
    vi.mocked(prisma.auditLog.deleteMany).mockResolvedValue({ count: 3 });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.deleted).toBe(3);
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["a", "b", "c"] },
        retentionPriority: "LOW",
        retentionUntil: { lt: expect.any(Date) },
      },
    });

    const auditLogMock = vi.mocked(AuditLogger.log);
    expect(auditLogMock).toHaveBeenCalledTimes(1);
    expect(auditLogMock.mock.calls[0]?.[0]).toMatchObject({
      action: "AUDIT_LOG_PURGE",
      details: { deleted: 3 },
    });
  });

  it("accumulates count across multiple batches", async () => {
    vi.mocked(prisma.auditLog.findMany)
      .mockResolvedValueOnce(
        [{ id: "a" }, { id: "b" }, { id: "c" }] as { id: string }[] as any,
      )
      .mockResolvedValueOnce([{ id: "d" }, { id: "e" }] as { id: string }[] as any)
      .mockResolvedValueOnce([] as { id: string }[] as any);
    vi.mocked(prisma.auditLog.deleteMany)
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 2 });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.deleted).toBe(5);
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledTimes(2);
  });

  it("returns deleted: 0 and still calls AuditLogger when no rows are expired", async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue(
      [] as { id: string }[] as any,
    );

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.deleted).toBe(0);
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();

    const auditLogMock = vi.mocked(AuditLogger.log);
    expect(auditLogMock).toHaveBeenCalledTimes(1);
    expect(auditLogMock.mock.calls[0]?.[0]).toMatchObject({
      action: "AUDIT_LOG_PURGE",
      details: { deleted: 0 },
    });
  });
});
