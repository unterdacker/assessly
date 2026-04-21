import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { company: { findUnique: mockFindUnique } },
}));

vi.mock("@/lib/env", () => ({
  env: { LICENSE_PUBLIC_KEY: undefined },
}));

vi.mock("@/lib/license/gate", () => ({
  checkLicense: vi.fn().mockResolvedValue({ allowed: false }),
}));

import { getCompanyPlan, isPremiumPlan } from "@/lib/plan-gate";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCompanyPlan", () => {
  it("returns FREE when companyId is nullish", async () => {
    await expect(getCompanyPlan(null)).resolves.toBe("FREE");
    await expect(getCompanyPlan(undefined)).resolves.toBe("FREE");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns FREE when company is not found", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await expect(getCompanyPlan("ctest00000000000000000001")).resolves.toBe("FREE");
  });

  it("returns PREMIUM when company plan is premium", async () => {
    mockFindUnique.mockResolvedValueOnce({ plan: "PREMIUM" });
    await expect(getCompanyPlan("ctest00000000000000000001")).resolves.toBe("PREMIUM");
  });
});

describe("isPremiumPlan", () => {
  it("returns true only for PREMIUM plans", async () => {
    mockFindUnique.mockResolvedValueOnce({ plan: "PREMIUM" });
    await expect(isPremiumPlan("ctest00000000000000000001")).resolves.toBe(true);

    mockFindUnique.mockResolvedValueOnce({ plan: "FREE" });
    await expect(isPremiumPlan("ctest00000000000000000001")).resolves.toBe(false);
  });
});
