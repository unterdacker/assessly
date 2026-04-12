import { afterEach, describe, expect, it, vi } from "vitest";
import { LogSmsProvider } from "@/lib/sms/providers/log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LogSmsProvider", () => {
  it("masks phone and never logs message body", async () => {
    const provider = new LogSmsProvider();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const tempPasswordBody = "Your temporary password is S3cr3t!";
    await expect(provider.send("+4915123456789", tempPasswordBody)).resolves.toEqual({ ok: true });

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("[SIMULATED SMS -> **********6789]");
    expect(output).toContain("[SMS BODY REDACTED");
    expect(output).not.toContain(tempPasswordBody);
    expect(output).not.toContain("S3cr3t!");

    consoleSpy.mockRestore();
  });

  it("fully masks very short phone numbers", async () => {
    const provider = new LogSmsProvider();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await provider.send("1234", "ignored");

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("[SIMULATED SMS -> ****]");

    consoleSpy.mockRestore();
  });
});
