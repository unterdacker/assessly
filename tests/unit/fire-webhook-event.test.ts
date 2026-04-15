import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockDeliverWebhook } = vi.hoisted(() => ({
  mockPrisma: {
    webhook: {
      findMany: vi.fn(),
    },
  },
  mockDeliverWebhook: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/modules/webhooks/lib/delivery", () => ({
  deliverWebhook: mockDeliverWebhook,
}));

import { prisma } from "@/lib/prisma";
import { fireWebhookEvent } from "@/modules/webhooks/lib/fire-webhook-event";
import { deliverWebhook } from "@/modules/webhooks/lib/delivery";

const payload = {
  event: "vendor.created" as const,
  vendorId: "v_1",
  companyId: "co_1",
  serviceType: "SaaS",
  createdAt: "2026-04-15T00:00:00.000Z",
};

describe("fireWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.webhook.findMany.mockResolvedValue([]);
    mockDeliverWebhook.mockResolvedValue(undefined);
  });

  it("queries enabled webhooks subscribed to the payload event", async () => {
    await fireWebhookEvent("co_1", payload);

    expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: "co_1",
          isEnabled: true,
          events: { has: payload.event },
        },
      }),
    );
  });

  it("delivers to each matching webhook", async () => {
    const wh1 = {
      id: "wh_1",
      url: "https://hooks.example.com/one",
      secretEncrypted: "enc-1",
      companyId: "co_1",
    };
    const wh2 = {
      id: "wh_2",
      url: "https://hooks.example.com/two",
      secretEncrypted: "enc-2",
      companyId: "co_1",
    };
    mockPrisma.webhook.findMany.mockResolvedValueOnce([wh1, wh2]);

    await fireWebhookEvent("co_1", payload);

    expect(mockDeliverWebhook).toHaveBeenCalledTimes(2);
    expect(mockDeliverWebhook).toHaveBeenNthCalledWith(1, wh1, payload);
    expect(mockDeliverWebhook).toHaveBeenNthCalledWith(2, wh2, payload);
  });

  it("does not deliver when no matching webhooks exist", async () => {
    mockPrisma.webhook.findMany.mockResolvedValueOnce([]);

    await fireWebhookEvent("co_1", payload);

    expect(mockDeliverWebhook).not.toHaveBeenCalled();
  });

  it("swallows database query errors", async () => {
    mockPrisma.webhook.findMany.mockRejectedValueOnce(new Error("db-down"));

    await expect(fireWebhookEvent("co_1", payload)).resolves.toBeUndefined();
  });

  it("swallows deliverWebhook errors", async () => {
    mockPrisma.webhook.findMany.mockResolvedValueOnce([
      {
        id: "wh_1",
        url: "https://hooks.example.com/one",
        secretEncrypted: "enc-1",
        companyId: "co_1",
      },
    ]);
    mockDeliverWebhook.mockRejectedValueOnce(new Error("delivery-failed"));

    await expect(fireWebhookEvent("co_1", payload)).resolves.toBeUndefined();
  });

  it("uses prisma and delivery module bindings", async () => {
    await fireWebhookEvent("co_1", payload);

    expect(prisma.webhook.findMany).toHaveBeenCalled();
    expect(deliverWebhook).not.toHaveBeenCalled();
  });
});