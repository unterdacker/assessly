import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditCategory, AuditLogger, LogLevel, scrubPii } from "@/lib/structured-logger";

let stdoutOutput = "";
let stderrOutput = "";

beforeEach(() => {
  stdoutOutput = "";
  stderrOutput = "";

  vi.spyOn(process.stdout, "write").mockImplementation(((data: unknown) => {
    stdoutOutput += String(data);
    return true;
  }) as typeof process.stdout.write);

  vi.spyOn(process.stderr, "write").mockImplementation(((data: unknown) => {
    stderrOutput += String(data);
    return true;
  }) as typeof process.stderr.write);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function parseLastJsonLine(output: string): Record<string, unknown> {
  const trimmed = output.trim();
  expect(trimmed.length).toBeGreaterThan(0);
  return JSON.parse(trimmed) as Record<string, unknown>;
}

describe("enum exports", () => {
  it("exposes all expected AuditCategory values", () => {
    expect(AuditCategory.AUTH).toBe("AUTH");
    expect(AuditCategory.ACCESS_CONTROL).toBe("ACCESS_CONTROL");
    expect(AuditCategory.CONFIGURATION).toBe("CONFIGURATION");
    expect(AuditCategory.DATA_OPERATIONS).toBe("DATA_OPERATIONS");
    expect(AuditCategory.SYSTEM_HEALTH).toBe("SYSTEM_HEALTH");
    expect(AuditCategory.AI_ACT).toBe("AI_ACT");
  });

  it("exposes all expected LogLevel values", () => {
    expect(LogLevel.DEBUG).toBe("debug");
    expect(LogLevel.INFO).toBe("info");
    expect(LogLevel.WARN).toBe("warn");
    expect(LogLevel.ERROR).toBe("error");
    expect(LogLevel.FATAL).toBe("fatal");
  });
});

describe("AuditLogger emit behavior", () => {
  it("writes successful AUTH events to stdout", () => {
    AuditLogger.log({ category: AuditCategory.AUTH, action: "auth.login", status: "success" });

    expect(stdoutOutput).not.toBe("");
    expect(stderrOutput).toBe("");

    const parsed = parseLastJsonLine(stdoutOutput);
    expect(parsed.event_type).toBe("AUTH");
  });

  it("writes failure events to stderr by default", () => {
    AuditLogger.log({ category: AuditCategory.AUTH, action: "auth.login", status: "failure" });

    expect(stderrOutput).not.toBe("");
    expect(stdoutOutput).toBe("");

    const parsed = parseLastJsonLine(stderrOutput);
    expect(parsed.level).toBe("error");
  });

  it("writes explicit ERROR on success to stderr", () => {
    AuditLogger.log({
      category: AuditCategory.AUTH,
      action: "auth.custom",
      status: "success",
      level: LogLevel.ERROR,
    });

    expect(stderrOutput).not.toBe("");
    expect(stdoutOutput).toBe("");
  });

  it("writes FATAL to stderr", () => {
    AuditLogger.log({
      category: AuditCategory.SYSTEM_HEALTH,
      action: "system.crash",
      status: "failure",
      level: LogLevel.FATAL,
    });

    expect(stderrOutput).not.toBe("");
    expect(stdoutOutput).toBe("");
  });

  it("truncates sourceIp when securityIncident is false", () => {
    AuditLogger.log({
      category: AuditCategory.AUTH,
      action: "auth.login",
      status: "success",
      sourceIp: "192.168.1.5",
    });

    const parsed = parseLastJsonLine(stdoutOutput);
    expect(parsed.source_ip).toBe("192.168.1.xxx");
  });

  it("preserves full sourceIp when securityIncident is true", () => {
    AuditLogger.log({
      category: AuditCategory.AUTH,
      action: "auth.login",
      status: "failure",
      sourceIp: "192.168.1.5",
      securityIncident: true,
    });

    const parsed = parseLastJsonLine(stderrOutput);
    expect(parsed.source_ip).toBe("192.168.1.5");
  });

  it("auth shorthand emits AUTH events", () => {
    AuditLogger.auth("auth.login", "success");

    const parsed = parseLastJsonLine(stdoutOutput);
    expect(parsed.event_type).toBe("AUTH");
  });

  it("systemHealth shorthand emits SYSTEM_HEALTH events", () => {
    AuditLogger.systemHealth("system.ping", "failure");

    const parsed = parseLastJsonLine(stderrOutput);
    expect(parsed.event_type).toBe("SYSTEM_HEALTH");
  });

  it("assigns LOW retention for SYSTEM_HEALTH", () => {
    AuditLogger.log({ category: AuditCategory.SYSTEM_HEALTH, action: "system.check", status: "success" });

    const parsed = parseLastJsonLine(stdoutOutput);
    expect(parsed.retention_priority).toBe("LOW");
  });

  it("assigns HIGH retention for AUTH", () => {
    AuditLogger.log({ category: AuditCategory.AUTH, action: "auth.login", status: "success" });

    const parsed = parseLastJsonLine(stdoutOutput);
    expect(parsed.retention_priority).toBe("HIGH");
  });

  it("assigns MEDIUM retention for AI_ACT", () => {
    AuditLogger.log({ category: AuditCategory.AI_ACT, action: "ai.analyze", status: "success" });

    const parsed = parseLastJsonLine(stdoutOutput);
    expect(parsed.retention_priority).toBe("MEDIUM");
  });
});

describe("scrubPii", () => {
  it("redacts password keys", () => {
    expect(scrubPii({ password: "secret" })).toEqual({ password: "[REDACTED]" });
  });

  it("returns null unchanged", () => {
    expect(scrubPii(null)).toBeNull();
  });

  it("returns primitive numbers unchanged", () => {
    expect(scrubPii(42)).toBe(42);
  });
});
