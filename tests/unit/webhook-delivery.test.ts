import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockLogAuditEvent,
  mockAssertWebhookUrlSafe,
  mockDecryptWebhookSecret,
} = vi.hoisted(() => ({
  mockLogAuditEvent: vi.fn(),
  mockAssertWebhookUrlSafe: vi.fn(),
  mockDecryptWebhookSecret: vi.fn(),
}));

vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: mockLogAuditEvent,
}));

vi.mock("@/modules/webhooks/lib/ssrf-guard", () => ({
  assertWebhookUrlSafe: mockAssertWebhookUrlSafe,
  WebhookSsrfBlockedError: class WebhookSsrfBlockedError extends Error {
    readonly code = "SSRF_BLOCKED" as const;

    constructor(readonly url: string) {
      super(`SSRF: blocked webhook URL ${url}`);
      this.name = "WebhookSsrfBlockedError";
    }
  },
}));

vi.mock("@/modules/webhooks/lib/webhook-crypto", () => ({
  decryptWebhookSecret: mockDecryptWebhookSecret,
}));

import { logAuditEvent } from "@/lib/audit-log";
import { deliverWebhook } from "@/modules/webhooks/lib/delivery";
import { assertWebhookUrlSafe, WebhookSsrfBlockedError } from "@/modules/webhooks/lib/ssrf-guard";
import { decryptWebhookSecret } from "@/modules/webhooks/lib/webhook-crypto";

const webhook = {
  id: "wh_1",
  url: "https://hooks.example.com/event",
  secretEncrypted: "iv:tag:data",
  companyId: "co_1",
};

const payload = {
  event: "vendor.created" as const,
  vendorId: "v_1",
  companyId: "co_1",
  serviceType: "SaaS",
  createdAt: "2026-04-15T00:00:00.000Z",
};

function buildFetchResponse(status: number): Response {
  return {
    status,
    body: {
      cancel: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Response;
}

describe("deliverWebhook", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch as unknown as typeof fetch);

    mockDecryptWebhookSecret.mockReturnValue("decrypted-signing-secret");
    mockAssertWebhookUrlSafe.mockResolvedValue(undefined);
    mockLogAuditEvent.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue(buildFetchResponse(200));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls fetch with POST, redirect error, and signing headers", async () => {
    await deliverWebhook(webhook, payload);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(webhook.url);
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("error");

    const headers = options.headers as Record<string, string>;
    expect(headers["X-Venshield-Signature"]).toMatch(/^sha256=/);
    expect(headers["X-Venshield-Timestamp"]).toMatch(/^\d+$/);
  });

  it("generates a verifiable HMAC signature", async () => {
    const decryptedSecret = "my-signing-secret";
    mockDecryptWebhookSecret.mockReturnValueOnce(decryptedSecret);

    await deliverWebhook(webhook, payload);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    const signature = headers["X-Venshield-Signature"];
    const timestamp = headers["X-Venshield-Timestamp"];

    const bodyHex = Buffer.from(JSON.stringify(payload), "utf8").toString("hex");
    const expected = crypto
      .createHmac("sha256", decryptedSecret)
      .update(`${timestamp}.${bodyHex}`)
      .digest("hex");

    expect(signature).toBe(`sha256=${expected}`);
  });

  it("handles SSRF block by skipping fetch and logging failure", async () => {
    mockAssertWebhookUrlSafe.mockImplementationOnce(() => {
      throw new WebhookSsrfBlockedError(webhook.url);
    });

    await expect(deliverWebhook(webhook, payload)).resolves.toBeUndefined();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WEBHOOK_DELIVERY_ATTEMPTED",
        newValue: expect.objectContaining({ success: false }),
      }),
    );
  });

  it("handles network errors by logging failure and resolving", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(deliverWebhook(webhook, payload)).resolves.toBeUndefined();

    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WEBHOOK_DELIVERY_ATTEMPTED",
        newValue: expect.objectContaining({ success: false }),
      }),
    );
  });

  it("writes success audit log for 200 response", async () => {
    mockFetch.mockResolvedValueOnce(buildFetchResponse(200));

    await deliverWebhook(webhook, payload);

    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WEBHOOK_DELIVERY_ATTEMPTED",
        newValue: expect.objectContaining({ httpStatus: 200, success: true }),
      }),
    );
  });

  it("writes failure audit log for non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce(buildFetchResponse(500));

    await deliverWebhook(webhook, payload);

    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WEBHOOK_DELIVERY_ATTEMPTED",
        newValue: expect.objectContaining({ httpStatus: 500, success: false }),
      }),
    );
  });

  it("never throws even when both fetch and logAuditEvent fail", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network-down"));
    mockLogAuditEvent.mockRejectedValueOnce(new Error("audit-write-failed"));

    await expect(deliverWebhook(webhook, payload)).resolves.toBeUndefined();
  });

  it("handles decrypt failure by skipping fetch and logging failure", async () => {
    mockDecryptWebhookSecret.mockImplementationOnce(() => {
      throw new Error("decrypt-failed");
    });

    await expect(deliverWebhook(webhook, payload)).resolves.toBeUndefined();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WEBHOOK_DELIVERY_ATTEMPTED",
        newValue: expect.objectContaining({ success: false }),
      }),
    );
  });

  it("calls decryptWebhookSecret and assertWebhookUrlSafe for each delivery", async () => {
    await deliverWebhook(webhook, payload);

    expect(decryptWebhookSecret).toHaveBeenCalledWith(webhook.secretEncrypted);
    expect(assertWebhookUrlSafe).toHaveBeenCalledWith(webhook.url);
    expect(logAuditEvent).toHaveBeenCalled();
  });
});