import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTx } = vi.hoisted(() => {
  const mockTx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    auditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  return { mockTx };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((fn: Function) => fn(mockTx)),
  },
}));

vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: { log: vi.fn() },
  AuditCategory: {
    AUTH: "AUTH",
    ACCESS_CONTROL: "ACCESS_CONTROL",
    CONFIGURATION: "CONFIGURATION",
    DATA_OPERATIONS: "DATA_OPERATIONS",
    SYSTEM_HEALTH: "SYSTEM_HEALTH",
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { computeEventHash } from "@/lib/audit-sanitize";
import { computeFieldDiff, logAuditEvent } from "@/lib/audit-log";

const BASE_INPUT = {
  companyId: "company-abc",
  userId: "user-xyz",
  action: "VENDOR_CREATED" as const,
  entityType: "vendor",
  entityId: "vendor-001",
  timestamp: new Date("2026-04-01T10:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((fn: Function) => fn(mockTx));
  // Reset $executeRaw default since clearAllMocks wipes implementations
  mockTx.$executeRaw.mockResolvedValue(1);
});

describe("logAuditEvent", () => {
  it("creates a GENESIS entry when there is no prior hash", async () => {
    mockTx.auditLog.findFirst.mockResolvedValue(null);
    mockTx.auditLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    );

    await logAuditEvent(BASE_INPUT);

    const data = mockTx.auditLog.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.previousLogHash).toBeNull();
    expect(data.eventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.eventHash).toBe(
      computeEventHash({
        companyId: BASE_INPUT.companyId,
        userId: BASE_INPUT.userId,
        action: BASE_INPUT.action,
        entityType: BASE_INPUT.entityType,
        entityId: BASE_INPUT.entityId,
        timestamp: BASE_INPUT.timestamp.toISOString(),
        previousLogHash: null,
      }),
    );
    expect(data.complianceCategory).toBe("NIS2_DORA");
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("links to an existing chain tail when prior hash exists", async () => {
    mockTx.auditLog.findFirst.mockResolvedValue({ eventHash: "a".repeat(64) });
    mockTx.auditLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    );

    await logAuditEvent(BASE_INPUT);

    const data = mockTx.auditLog.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.previousLogHash).toBe("a".repeat(64));
    expect(data.eventHash).toBe(
      computeEventHash({
        companyId: BASE_INPUT.companyId,
        userId: BASE_INPUT.userId,
        action: BASE_INPUT.action,
        entityType: BASE_INPUT.entityType,
        entityId: BASE_INPUT.entityId,
        timestamp: BASE_INPUT.timestamp.toISOString(),
        previousLogHash: "a".repeat(64),
      }),
    );
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("treats legacy null eventHash as GENESIS", async () => {
    mockTx.auditLog.findFirst.mockResolvedValue({ eventHash: null });
    mockTx.auditLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    );

    await logAuditEvent(BASE_INPUT);

    const data = mockTx.auditLog.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.previousLogHash).toBeNull();
    expect(data.eventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("chains sequential calls with previousLogHash from the prior write", async () => {
    mockTx.auditLog.findFirst.mockResolvedValueOnce(null);
    let capturedFirst: Record<string, unknown> = {};
    mockTx.auditLog.create.mockImplementationOnce(({ data }: { data: Record<string, unknown> }) => {
      capturedFirst = data;
      return Promise.resolve(data);
    });

    await logAuditEvent(BASE_INPUT);

    const firstEventHash = capturedFirst.eventHash as string;

    mockTx.auditLog.findFirst.mockResolvedValueOnce({ eventHash: firstEventHash });
    let capturedSecond: Record<string, unknown> = {};
    mockTx.auditLog.create.mockImplementationOnce(({ data }: { data: Record<string, unknown> }) => {
      capturedSecond = data;
      return Promise.resolve(data);
    });

    await logAuditEvent({ ...BASE_INPUT, action: "ASSESSMENT_UPDATED" });

    expect(firstEventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(capturedSecond.previousLogHash as string).toBe(firstEventHash);
    expect(capturedSecond.eventHash).not.toBe(firstEventHash);
    expect(capturedSecond.eventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(capturedSecond.eventHash).toBe(
      computeEventHash({
        companyId: BASE_INPUT.companyId,
        userId: BASE_INPUT.userId,
        action: "ASSESSMENT_UPDATED",
        entityType: BASE_INPUT.entityType,
        entityId: BASE_INPUT.entityId,
        timestamp: BASE_INPUT.timestamp.toISOString(),
        previousLogHash: firstEventHash,
      }),
    );
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("uses caller-supplied tx and skips prisma.$transaction", async () => {
    mockTx.auditLog.findFirst.mockResolvedValue(null);
    mockTx.auditLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    );

    const result = await logAuditEvent(BASE_INPUT, { tx: mockTx as any });

    expect(vi.mocked(prisma.$transaction)).toHaveBeenCalledTimes(0);
    expect(mockTx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    expect((mockTx.auditLog.create.mock.calls[0][0].data as any).eventHash).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect((result as Record<string, unknown>).eventHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sets HIGH retention priority when securityIncident is true", async () => {
    mockTx.auditLog.findFirst.mockResolvedValue(null);
    mockTx.auditLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    );

    await logAuditEvent({ ...BASE_INPUT, securityIncident: true });

    const data = mockTx.auditLog.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.retentionPriority).toBe("HIGH");
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("gracefully handles header extraction failures when captureHeaders is enabled", async () => {
    mockTx.auditLog.findFirst.mockResolvedValue(null);
    mockTx.auditLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    );
    vi.mocked(headers).mockImplementationOnce(async () => {
      throw new Error("headers unavailable");
    });

    await expect(logAuditEvent(BASE_INPUT, { captureHeaders: true })).resolves.toBeTruthy();
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe("computeFieldDiff", () => {
  it("returns only changed fields for object diffs", () => {
    expect(computeFieldDiff({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({
      previous: { b: 2 },
      current: { b: 3 },
    });
  });

  it("returns null previous/current for identical objects", () => {
    expect(computeFieldDiff({ a: 1 }, { a: 1 })).toEqual({
      previous: null,
      current: null,
    });
  });

  it("returns scalar values directly for scalar inputs", () => {
    expect(computeFieldDiff("foo", "bar")).toEqual({
      previous: "foo",
      current: "bar",
    });
  });

  it("returns nulls when both inputs are null", () => {
    expect(computeFieldDiff(null, null)).toEqual({
      previous: null,
      current: null,
    });
  });
});