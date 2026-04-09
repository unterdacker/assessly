import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildVendorAssessmentCreatedAuditEntry,
  buildVendorAssessmentDeletedAuditEntry,
  buildVendorAssessmentUpdatedAuditEntry,
  registerAuditLogSink,
  submitAuditLogEntry,
} from "@/lib/audit-trail";

afterEach(() => {
  registerAuditLogSink(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("audit-trail entry builders", () => {
  it("buildVendorAssessmentCreatedAuditEntry sets stable action and entity type", () => {
    const entry = buildVendorAssessmentCreatedAuditEntry({
      entityId: "va-001",
      occurredAt: "2026-04-09T10:00:00.000Z",
      actorId: "actor-001",
    });

    expect(entry.action).toBe("vendor_assessment.created");
    expect(entry.entityType).toBe("vendor_assessment");
    expect(entry.entityId).toBe("va-001");
    expect(entry.occurredAt).toBe("2026-04-09T10:00:00.000Z");
    expect(entry.actorId).toBe("actor-001");
  });

  it("buildVendorAssessmentUpdatedAuditEntry sets the update action", () => {
    const entry = buildVendorAssessmentUpdatedAuditEntry({
      entityId: "va-002",
      occurredAt: "2026-04-09T10:01:00.000Z",
      actorId: "actor-002",
    });

    expect(entry.action).toBe("vendor_assessment.updated");
  });

  it("buildVendorAssessmentDeletedAuditEntry sets the delete action", () => {
    const entry = buildVendorAssessmentDeletedAuditEntry({
      entityId: "va-003",
      occurredAt: "2026-04-09T10:02:00.000Z",
      actorId: "actor-003",
    });

    expect(entry.action).toBe("vendor_assessment.deleted");
  });

  it("generates id values as UUIDs or fallback audit- ids", () => {
    const entry = buildVendorAssessmentCreatedAuditEntry({
      entityId: "va-004",
      occurredAt: "2026-04-09T10:03:00.000Z",
      actorId: "actor-004",
    });

    expect(entry.id).toMatch(
      /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|audit-\d+)$/i,
    );
  });

  it("creates different ids on consecutive calls", () => {
    const first = buildVendorAssessmentCreatedAuditEntry({
      entityId: "va-005",
      occurredAt: "2026-04-09T10:04:00.000Z",
      actorId: "actor-005",
    });
    const second = buildVendorAssessmentCreatedAuditEntry({
      entityId: "va-006",
      occurredAt: "2026-04-09T10:05:00.000Z",
      actorId: "actor-006",
    });

    expect(first.id).not.toBe(second.id);
  });

  it("falls back to audit-* ids when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", undefined as unknown as Crypto);

    const entry = buildVendorAssessmentCreatedAuditEntry({
      entityId: "va-007",
      occurredAt: "2026-04-09T10:06:00.000Z",
      actorId: "actor-007",
    });

    expect(entry.id.startsWith("audit-")).toBe(true);
  });
});

describe("audit sink registration/submission", () => {
  it("calls the registered sink with submitted entries", () => {
    const sink = vi.fn();
    registerAuditLogSink(sink);

    const entry = buildVendorAssessmentUpdatedAuditEntry({
      entityId: "va-008",
      occurredAt: "2026-04-09T10:07:00.000Z",
      actorId: "actor-008",
    });

    submitAuditLogEntry(entry);

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(entry);
  });

  it("does not throw if no sink is registered", () => {
    registerAuditLogSink(null);

    const entry = buildVendorAssessmentDeletedAuditEntry({
      entityId: "va-009",
      occurredAt: "2026-04-09T10:08:00.000Z",
      actorId: "actor-009",
    });

    expect(() => submitAuditLogEntry(entry)).not.toThrow();
  });

  it("does not throw when sink is explicitly reset to null", () => {
    registerAuditLogSink(null);

    const entry = buildVendorAssessmentCreatedAuditEntry({
      entityId: "va-010",
      occurredAt: "2026-04-09T10:09:00.000Z",
      actorId: "actor-010",
    });

    expect(() => submitAuditLogEntry(entry)).not.toThrow();
  });
});
