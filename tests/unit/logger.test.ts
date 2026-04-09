import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: {
    log: vi.fn(),
    systemHealth: vi.fn(),
  },
  AuditCategory: {
    AUTH: "AUTH",
    ACCESS_CONTROL: "ACCESS_CONTROL",
    CONFIGURATION: "CONFIGURATION",
    DATA_OPERATIONS: "DATA_OPERATIONS",
    SYSTEM_HEALTH: "SYSTEM_HEALTH",
  },
  LogLevel: {
    DEBUG: "debug",
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
    FATAL: "fatal",
  },
}));

import { logErrorReport, logInfo, logWarn } from "@/lib/logger";
import { AuditCategory, AuditLogger } from "@/lib/structured-logger";

describe("logErrorReport", () => {
  it("logs errors through AuditLogger.systemHealth", () => {
    logErrorReport("ctx", new Error("msg"));

    expect(vi.mocked(AuditLogger.systemHealth)).toHaveBeenCalledTimes(1);

    const [action, status, payload] = vi.mocked(AuditLogger.systemHealth).mock.calls[0];
    expect(action).toBe("system.error");
    expect(status).toBe("failure");
    expect(payload?.message).toContain("[ctx] msg");
  });

  it("redacts URL credentials from message", () => {
    logErrorReport("x", new Error("https://user:pass@host/"));

    const [, , payload] = vi.mocked(AuditLogger.systemHealth).mock.calls.at(-1) ?? [];
    const message = String(payload?.message ?? "");
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain("pass");
  });

  it("redacts sensitive query params", () => {
    logErrorReport("x", new Error("/api?password=hunter2"));

    const [, , payload] = vi.mocked(AuditLogger.systemHealth).mock.calls.at(-1) ?? [];
    const message = String(payload?.message ?? "");
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain("hunter2");
  });

  it("accepts non-Error values without throwing", () => {
    expect(() => logErrorReport("ctx", "not an Error")).not.toThrow();
  });

  it("keeps plain messages unchanged when no secrets are present", () => {
    logErrorReport("clean", new Error("simple message"));

    const [, , payload] = vi.mocked(AuditLogger.systemHealth).mock.calls.at(-1) ?? [];
    const message = String(payload?.message ?? "");
    expect(message).toContain("[clean] simple message");
    expect(message).not.toContain("[REDACTED]");
  });
});

describe("logInfo/logWarn", () => {
  it("logInfo emits success/info payload", () => {
    logInfo(AuditCategory.AUTH, "auth.login", "ok");

    expect(vi.mocked(AuditLogger.log)).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "AUTH",
        action: "auth.login",
        status: "success",
        level: "info",
        message: "ok",
      }),
    );
  });

  it("logWarn emits failure/warn payload", () => {
    logWarn(AuditCategory.AUTH, "auth.warning", "warn");

    expect(vi.mocked(AuditLogger.log)).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "AUTH",
        action: "auth.warning",
        status: "failure",
        level: "warn",
        message: "warn",
      }),
    );
  });
});
