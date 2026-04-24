import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireInternalReadUser, mockIsAccessControlError, mockFindMany } = vi.hoisted(() => ({
  mockRequireInternalReadUser: vi.fn(),
  mockIsAccessControlError: vi.fn().mockReturnValue(false),
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireInternalReadUser: mockRequireInternalReadUser,
  isAccessControlError: mockIsAccessControlError,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vendor: {
      findMany: mockFindMany,
    },
  },
}));

import { GET } from "@/app/api/vendors/names/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireInternalReadUser.mockResolvedValue({ companyId: "co-1" });
  mockFindMany.mockResolvedValue([{ id: "v1", name: "Acme", serviceType: "SaaS" }]);
});

describe("GET /api/vendors/names", () => {
  it("returns tenant-scoped vendors with no-store cache header", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toEqual({
      ok: true,
      vendors: [{ id: "v1", name: "Acme", serviceType: "SaaS" }],
    });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { companyId: "co-1" },
      select: { id: true, name: true, serviceType: true },
      orderBy: { name: "asc" },
    });
  });

  it("returns 403 with no-store for access-control failures", async () => {
    const err = new Error("FORBIDDEN");
    mockRequireInternalReadUser.mockRejectedValue(err);
    mockIsAccessControlError.mockReturnValue(true);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toEqual({ ok: false, error: "Forbidden." });
  });
});
