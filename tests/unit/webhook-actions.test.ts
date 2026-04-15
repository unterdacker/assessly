import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockHeaders,
  mockGetAuthSession,
  mockRequirePremiumPlan,
  mockLogAuditEvent,
  mockIsRateLimited,
  mockRegisterFailure,
  mockReadClientIp,
  mockAssertWebhookUrlSafe,
  mockEncryptWebhookSecret,
  mockPrisma,
} = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  mockGetAuthSession: vi.fn(),
  mockRequirePremiumPlan: vi.fn(),
  mockLogAuditEvent: vi.fn(),
  mockIsRateLimited: vi.fn(),
  mockRegisterFailure: vi.fn(),
  mockReadClientIp: vi.fn(),
  mockAssertWebhookUrlSafe: vi.fn(),
  mockEncryptWebhookSecret: vi.fn().mockReturnValue("enc-secret"),
  mockPrisma: {
    webhook: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({ headers: mockHeaders }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/server", () => ({ getAuthSession: mockGetAuthSession }));
vi.mock("@/lib/auth/permissions", () => ({ ADMIN_ONLY_ROLES: ["ADMIN"] }));
vi.mock("@/lib/enterprise-bridge", () => ({ requirePremiumPlan: mockRequirePremiumPlan }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: mockIsRateLimited,
  registerFailure: mockRegisterFailure,
  readClientIp: mockReadClientIp,
}));
vi.mock("@/modules/webhooks/lib/ssrf-guard", () => ({
  assertWebhookUrlSafe: mockAssertWebhookUrlSafe,
  WebhookSsrfBlockedError: class extends Error {},
}));
vi.mock("@/modules/webhooks/lib/webhook-crypto", () => ({
  encryptWebhookSecret: mockEncryptWebhookSecret,
}));

import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  regenerateWebhookSecret,
  updateWebhook,
} from "@/modules/webhooks/actions/webhook-actions";
import { WebhookSsrfBlockedError } from "@/modules/webhooks/lib/ssrf-guard";

function buildCreateFormData(): FormData {
  const fd = new FormData();
  fd.set("name", "My Hook");
  fd.set("url", "https://hooks.example.com/events");
  fd.set("description", "desc");
  fd.append("events", "vendor.created");
  fd.set("isEnabled", "true");
  return fd;
}

function buildUpdateFormData(): FormData {
  const formData = new FormData();
  formData.set("webhookId", "wh_1");
  formData.set("name", "My Hook");
  formData.set("url", "https://hooks.example.com/events");
  formData.set("description", "");
  formData.append("events", "assessment.completed");
  formData.set("isEnabled", "true");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();

  mockHeaders.mockResolvedValue(new Headers());
  mockGetAuthSession.mockResolvedValue({
    userId: "u_1",
    role: "ADMIN",
    companyId: "co_1",
  });
  mockRequirePremiumPlan.mockResolvedValue(undefined);
  mockIsRateLimited.mockReturnValue(false);
  mockReadClientIp.mockReturnValue("127.0.0.1");
  mockAssertWebhookUrlSafe.mockResolvedValue(undefined);

  mockPrisma.webhook.findUnique.mockResolvedValue({
    companyId: "co_1",
    url: "https://hooks.example.com/events",
    name: "Hook",
  });
  mockPrisma.webhook.update.mockResolvedValue({ id: "wh_1" });
  mockPrisma.webhook.delete.mockResolvedValue({ id: "wh_1" });
});

describe("webhook-actions premium plan gate", () => {
  it("returns PLAN_REQUIRED from createWebhook when premium check throws", async () => {
    mockRequirePremiumPlan.mockRejectedValueOnce(new Error("PLAN_REQUIRED"));

    const result = await createWebhook(null, new FormData());

    expect(result).toEqual({ success: false, error: "PLAN_REQUIRED" });
  });

  it("returns PLAN_REQUIRED from updateWebhook when premium check throws", async () => {
    mockRequirePremiumPlan.mockRejectedValueOnce(new Error("PLAN_REQUIRED"));

    const result = await updateWebhook(null, new FormData());

    expect(result).toEqual({ success: false, error: "PLAN_REQUIRED" });
  });

  it("returns PLAN_REQUIRED from deleteWebhook when premium check throws", async () => {
    mockRequirePremiumPlan.mockRejectedValueOnce(new Error("PLAN_REQUIRED"));

    const result = await deleteWebhook(null, new FormData());

    expect(result).toEqual({ success: false, error: "PLAN_REQUIRED" });
  });

  it("returns PLAN_REQUIRED from regenerateWebhookSecret when premium check throws", async () => {
    mockRequirePremiumPlan.mockRejectedValueOnce(new Error("PLAN_REQUIRED"));

    const result = await regenerateWebhookSecret(null, new FormData());

    expect(result).toEqual({ success: false, error: "PLAN_REQUIRED" });
  });
});

describe("webhook-actions tenant-scoped mutations", () => {
  it("uses id + companyId in updateWebhook mutation where clause", async () => {
    await updateWebhook(null, buildUpdateFormData());

    expect(mockPrisma.webhook.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.webhook.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wh_1", companyId: "co_1" },
      }),
    );
  });

  it("uses id + companyId in deleteWebhook mutation and returns webhookId", async () => {
    const formData = new FormData();
    formData.set("webhookId", "wh_1");

    const result = await deleteWebhook(null, formData);

    expect(mockPrisma.webhook.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.webhook.delete).toHaveBeenCalledWith({
      where: { id: "wh_1", companyId: "co_1" },
    });
    expect(result).toEqual({ success: true, webhookId: "wh_1" });
  });

  it("uses id + companyId in regenerateWebhookSecret mutation where clause", async () => {
    const formData = new FormData();
    formData.set("webhookId", "wh_1");

    await regenerateWebhookSecret(null, formData);

    expect(mockPrisma.webhook.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wh_1", companyId: "co_1" },
      }),
    );
  });
});

describe("createWebhook - happy path + errors", () => {
  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation(async (fn) =>
      fn({
        webhook: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({ id: "wh_new" }),
        },
      }),
    );
  });

  it("returns success, webhookId, and rawSecret on happy path", async () => {
    const result = await createWebhook(null, buildCreateFormData());

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        webhookId: "wh_new",
        rawSecret: expect.any(String),
      }),
    );
  });

  it("returns rawSecret as a 64-char hex string", async () => {
    const result = await createWebhook(null, buildCreateFormData());

    expect(result.success).toBe(true);
    expect(result.rawSecret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("enforces per-company webhook cap", async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (fn) =>
      fn({
        webhook: {
          count: vi.fn().mockResolvedValue(25),
          create: vi.fn(),
        },
      }),
    );

    const result = await createWebhook(null, buildCreateFormData());

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("limit"),
    });
  });

  it("returns validation error when SSRF guard blocks URL", async () => {
    mockAssertWebhookUrlSafe.mockRejectedValueOnce(
      new WebhookSsrfBlockedError("https://hooks.example.com/events"),
    );

    const result = await createWebhook(null, buildCreateFormData());

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("not allowed"),
    });
  });

  it("returns rate limit error when mutation key is blocked", async () => {
    mockIsRateLimited.mockReturnValueOnce(true);

    const result = await createWebhook(null, buildCreateFormData());

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("Rate limit"),
    });
  });

  it("returns name validation error when name is missing", async () => {
    const result = await createWebhook(null, new FormData());

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("Name"),
    });
  });

  it("returns event validation error when no events are selected", async () => {
    const fd = new FormData();
    fd.set("name", "My Hook");
    fd.set("url", "https://hooks.example.com/events");

    const result = await createWebhook(null, fd);

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("event"),
    });
  });
});

describe("listWebhooks - tenant isolation", () => {
  it("queries only webhooks for session companyId", async () => {
    mockPrisma.webhook.findMany.mockResolvedValueOnce([]);

    await listWebhooks();

    expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: "co_1" },
      }),
    );
  });
});

describe("updateWebhook - cross-tenant rejection", () => {
  it("returns webhook not found when record belongs to another company", async () => {
    mockPrisma.webhook.findUnique.mockResolvedValueOnce({
      companyId: "co_OTHER",
      url: "https://hooks.example.com/events",
    });

    const result = await updateWebhook(null, buildUpdateFormData());

    expect(result).toEqual({ success: false, error: "Webhook not found." });
  });
});

describe("regenerateWebhookSecret - returns rawSecret", () => {
  it("returns success, webhookId, and 64-char hex rawSecret", async () => {
    const fd = new FormData();
    fd.set("webhookId", "wh_1");

    const result = await regenerateWebhookSecret(null, fd);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        webhookId: "wh_1",
        rawSecret: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });
});
