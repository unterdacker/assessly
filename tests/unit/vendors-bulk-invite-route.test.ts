import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdminUser,
  mockIsAccessControlError,
  mockIsRateLimited,
  mockRegisterFailure,
  mockSendOutOfBandInviteAction,
  mockFindMany,
} = vi.hoisted(() => ({
  mockRequireAdminUser: vi.fn(),
  mockIsAccessControlError: vi.fn().mockReturnValue(false),
  mockIsRateLimited: vi.fn().mockReturnValue(false),
  mockRegisterFailure: vi.fn(),
  mockSendOutOfBandInviteAction: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAdminUser: mockRequireAdminUser,
  isAccessControlError: mockIsAccessControlError,
}));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: mockIsRateLimited,
  registerFailure: mockRegisterFailure,
}));

vi.mock("@/app/actions/send-invite", () => ({
  sendOutOfBandInviteAction: mockSendOutOfBandInviteAction,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vendor: {
      findMany: mockFindMany,
    },
  },
}));

import { POST } from "@/app/api/vendors/bulk-invite/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminUser.mockResolvedValue({ companyId: "co-1" });
  mockIsRateLimited.mockReturnValue(false);
  mockFindMany.mockResolvedValue([
    { id: "v1", email: "a@example.com" },
    { id: "v2", email: null },
  ]);
  mockSendOutOfBandInviteAction
    .mockResolvedValueOnce({ status: "sent", error: null })
    .mockResolvedValueOnce({ status: "error", error: "failed" });
});

describe("POST /api/vendors/bulk-invite", () => {
  it("returns 429 when rate-limited", async () => {
    mockIsRateLimited.mockReturnValue(true);
    const request = new Request("http://localhost/api/vendors/bulk-invite", {
      method: "POST",
      body: JSON.stringify({ vendorIds: ["v1"] }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("300");
  });

  it("returns 400 when vendor list exceeds cap", async () => {
    const vendorIds = Array.from({ length: 51 }, (_, i) => `v${i}`);
    const request = new Request("http://localhost/api/vendors/bulk-invite", {
      method: "POST",
      body: JSON.stringify({ vendorIds }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("counts sent/skipped/failed and increments rate-limit counter only on sent", async () => {
    const request = new Request("http://localhost/api/vendors/bulk-invite", {
      method: "POST",
      body: JSON.stringify({ vendorIds: ["v1", "v2", "v3"] }),
      headers: { "Content-Type": "application/json" },
    });

    mockFindMany.mockResolvedValue([
      { id: "v1", email: "a@example.com" },
      { id: "v2", email: null },
      { id: "v3", email: "b@example.com" },
    ]);

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toEqual({ sent: 1, skipped: 1, failed: 1 });
    expect(mockRegisterFailure).toHaveBeenCalledTimes(1);
    expect(mockRegisterFailure).toHaveBeenCalledWith("bulk-invite:co-1", {
      maxFailures: 20,
      blockMs: 300_000,
    });
  });
});
