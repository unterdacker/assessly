import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockTx } = vi.hoisted(() => {
  const mockTx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    auditLog: {
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

import { prisma } from "@/lib/prisma";
import { computeEventHash, pseudonymizeUserId } from "@/lib/audit-sanitize";
import { redactUserFromAuditLogs, scrubUserLogs } from "@/lib/gdpr-erasure";

const COMPANY_ID = "company-abc";
const TARGET_USER = "user-target-123";
const OTHER_USER = "user-other-456";
const ERASURE_INPUT = { companyId: COMPANY_ID, targetUserId: TARGET_USER };

function makeMockLog(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    companyId: COMPANY_ID,
    userId: TARGET_USER,
    actorId: TARGET_USER,
    createdBy: TARGET_USER,
    action: "VENDOR_CREATED",
    entityType: "vendor",
    entityId: "vendor-001",
    timestamp: new Date("2026-04-01T10:00:00.000Z"),
    hitlVerifiedBy: null,
    previousValue: null,
    newValue: null,
    metadata: null,
    ...overrides,
  };
}

function makeScrubLog(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-2",
    actorId: TARGET_USER,
    createdBy: TARGET_USER,
    hitlVerifiedBy: null,
    previousValue: { someField: "original" },
    newValue: { anotherField: "value" },
    metadata: { existingKey: "data" },
    reason: "original reason",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.AUDIT_ERASURE_KEY = "test-erasure-key";
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((fn: Function) => fn(mockTx));
  mockTx.$executeRaw.mockResolvedValue(1);
});

afterEach(() => {
  delete process.env.AUDIT_ERASURE_KEY;
});

describe("redactUserFromAuditLogs", () => {
  it("replaces userId/actorId/createdBy with deterministic pseudonym", async () => {
    const PSEUDONYM = pseudonymizeUserId(TARGET_USER, "export", "test-erasure-key");
    mockTx.auditLog.findMany.mockResolvedValue([makeMockLog()]);
    mockTx.auditLog.update.mockResolvedValue({});

    await redactUserFromAuditLogs(ERASURE_INPUT);

    const updateCall = mockTx.auditLog.update.mock.calls[0][0];
    expect(updateCall.data.userId).toBe(PSEUDONYM);
    expect(updateCall.data.actorId).toBe(PSEUDONYM);
    expect(updateCall.data.createdBy).toBe(PSEUDONYM);
    expect(updateCall.where.id).toBe("log-1");
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("writes metadata.gdprRedaction marker", async () => {
    const PSEUDONYM = pseudonymizeUserId(TARGET_USER, "export", "test-erasure-key");
    mockTx.auditLog.findMany.mockResolvedValue([makeMockLog()]);
    mockTx.auditLog.update.mockResolvedValue({});

    await redactUserFromAuditLogs(ERASURE_INPUT);

    const updateCall = mockTx.auditLog.update.mock.calls[0][0];
    const metadata = updateCall.data.metadata as Record<string, any>;
    expect(metadata.gdprRedaction.article).toBe("GDPR Art. 17");
    expect(metadata.gdprRedaction.target).toBe(PSEUDONYM);
    expect(typeof metadata.gdprRedaction.redactedAt).toBe("string");
    expect(metadata.gdprRedaction.redactedAt.length).toBeGreaterThan(0);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("recomputes eventHash and preserves chain linkage", async () => {
    const PSEUDONYM = pseudonymizeUserId(TARGET_USER, "export", "test-erasure-key");
    const log = makeMockLog();
    mockTx.auditLog.findMany.mockResolvedValue([log]);
    mockTx.auditLog.update.mockResolvedValue({});

    await redactUserFromAuditLogs(ERASURE_INPUT);

    const expectedHash = computeEventHash({
      companyId: COMPANY_ID,
      userId: PSEUDONYM,
      action: "VENDOR_CREATED",
      entityType: "vendor",
      entityId: "vendor-001",
      timestamp: "2026-04-01T10:00:00.000Z",
      previousLogHash: null,
    });
    const updateCall = mockTx.auditLog.update.mock.calls[0][0];
    expect(updateCall.data.eventHash).toBe(expectedHash);
    expect(updateCall.data.previousLogHash).toBeNull();
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("returns expected result shape", async () => {
    const PSEUDONYM = pseudonymizeUserId(TARGET_USER, "export", "test-erasure-key");
    mockTx.auditLog.findMany.mockResolvedValue([makeMockLog()]);
    mockTx.auditLog.update.mockResolvedValue({});

    const result = await redactUserFromAuditLogs(ERASURE_INPUT);

    expect(result.pseudonym).toBe(PSEUDONYM);
    expect(result.redactedEntries).toBe(1);
    expect(result.rehashedEntries).toBe(1);
    expect(result.companyId).toBe(COMPANY_ID);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("counts only targeted rows as redacted while rehashing all rows", async () => {
    mockTx.auditLog.findMany.mockResolvedValue([
      makeMockLog(),
      makeMockLog({
        id: "log-2",
        userId: OTHER_USER,
        actorId: OTHER_USER,
        createdBy: OTHER_USER,
      }),
    ]);
    mockTx.auditLog.update.mockResolvedValue({});

    const result = await redactUserFromAuditLogs(ERASURE_INPUT);

    expect(result.redactedEntries).toBe(1);
    expect(result.rehashedEntries).toBe(2);
    expect(mockTx.auditLog.update).toHaveBeenCalledTimes(2);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("never deletes records during redaction", async () => {
    mockTx.auditLog.findMany.mockResolvedValue([makeMockLog()]);
    mockTx.auditLog.update.mockResolvedValue({});

    await redactUserFromAuditLogs(ERASURE_INPUT);

    expect(mockTx.auditLog.delete).toHaveBeenCalledTimes(0);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("replaces hitlVerifiedBy when it matches target user", async () => {
    const PSEUDONYM = pseudonymizeUserId(TARGET_USER, "export", "test-erasure-key");
    mockTx.auditLog.findMany.mockResolvedValue([makeMockLog({ hitlVerifiedBy: TARGET_USER })]);
    mockTx.auditLog.update.mockResolvedValue({});

    await redactUserFromAuditLogs(ERASURE_INPUT);

    expect(mockTx.auditLog.update.mock.calls[0][0].data.hitlVerifiedBy).toBe(PSEUDONYM);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("rewrites entityId when it equals the target user", async () => {
    const PSEUDONYM = pseudonymizeUserId(TARGET_USER, "export", "test-erasure-key");
    mockTx.auditLog.findMany.mockResolvedValue([makeMockLog({ entityId: TARGET_USER })]);
    mockTx.auditLog.update.mockResolvedValue({});

    await redactUserFromAuditLogs(ERASURE_INPUT);

    expect(mockTx.auditLog.update.mock.calls[0][0].data.entityId).toBe(`redacted:${PSEUDONYM}`);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("returns zero counts when no logs are found", async () => {
    mockTx.auditLog.findMany.mockResolvedValue([]);

    const result = await redactUserFromAuditLogs(ERASURE_INPUT);

    expect(result.redactedEntries).toBe(0);
    expect(result.rehashedEntries).toBe(0);
    expect(mockTx.auditLog.update).toHaveBeenCalledTimes(0);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe("scrubUserLogs", () => {
  it("replaces payload fields with GDPR Art. 17 marker", async () => {
    mockTx.auditLog.findMany.mockResolvedValue([makeScrubLog()]);
    mockTx.auditLog.update.mockResolvedValue({});

    await scrubUserLogs(ERASURE_INPUT);

    const data = mockTx.auditLog.update.mock.calls[0][0].data;
    expect(data.previousValue).toBe("[REDACTED_BY_REQUEST_ART17]");
    expect(data.newValue).toBe("[REDACTED_BY_REQUEST_ART17]");
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("replaces actorId when it matches target user", async () => {
    mockTx.auditLog.findMany.mockResolvedValue([makeScrubLog()]);
    mockTx.auditLog.update.mockResolvedValue({});

    await scrubUserLogs(ERASURE_INPUT);

    const data = mockTx.auditLog.update.mock.calls[0][0].data;
    expect(data.actorId).toBe("[REDACTED_BY_REQUEST_ART17]");
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("keeps actorId unchanged when it does not match target user", async () => {
    mockTx.auditLog.findMany.mockResolvedValue([makeScrubLog({ actorId: OTHER_USER })]);
    mockTx.auditLog.update.mockResolvedValue({});

    await scrubUserLogs(ERASURE_INPUT);

    const data = mockTx.auditLog.update.mock.calls[0][0].data;
    expect(data.actorId).toBe(OTHER_USER);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("writes metadata.gdprScrub marker fields", async () => {
    mockTx.auditLog.findMany.mockResolvedValue([makeScrubLog()]);
    mockTx.auditLog.update.mockResolvedValue({});

    await scrubUserLogs(ERASURE_INPUT);

    const data = mockTx.auditLog.update.mock.calls[0][0].data;
    expect(data.metadata.gdprScrub.article).toBe("GDPR Art. 17");
    expect(data.metadata.gdprScrub.marker).toBe("[REDACTED_BY_REQUEST_ART17]");
    expect(typeof data.metadata.gdprScrub.scrubbedAt).toBe("string");
    expect(data.metadata.redactedPayload).toBe("[REDACTED_BY_REQUEST_ART17]");
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("does not include hash fields or userId in scrub updates", async () => {
    mockTx.auditLog.findMany.mockResolvedValue([makeScrubLog()]);
    mockTx.auditLog.update.mockResolvedValue({});

    await scrubUserLogs(ERASURE_INPUT);

    const data = mockTx.auditLog.update.mock.calls[0][0].data as Record<string, unknown>;
    expect("eventHash" in data).toBe(false);
    expect("previousLogHash" in data).toBe(false);
    expect("userId" in data).toBe(false);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("returns expected result shape", async () => {
    mockTx.auditLog.findMany.mockResolvedValue([makeScrubLog()]);
    mockTx.auditLog.update.mockResolvedValue({});

    const result = await scrubUserLogs(ERASURE_INPUT);

    expect(result.redactedEntries).toBe(1);
    expect(result.hashPreservedEntries).toBe(1);
    expect(result.companyId).toBe(COMPANY_ID);
    expect(result.targetUserId).toBe(TARGET_USER);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("never deletes records during scrub", async () => {
    mockTx.auditLog.findMany.mockResolvedValue([makeScrubLog()]);
    mockTx.auditLog.update.mockResolvedValue({});

    await scrubUserLogs(ERASURE_INPUT);

    expect(mockTx.auditLog.delete).toHaveBeenCalledTimes(0);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("preserves null reason", async () => {
    mockTx.auditLog.findMany.mockResolvedValue([makeScrubLog({ reason: null })]);
    mockTx.auditLog.update.mockResolvedValue({});

    await scrubUserLogs(ERASURE_INPUT);

    const data = mockTx.auditLog.update.mock.calls[0][0].data;
    expect(data.reason).toBeNull();
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});