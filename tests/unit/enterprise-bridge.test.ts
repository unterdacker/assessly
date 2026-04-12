import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockIsPremiumPlan } = vi.hoisted(() => ({
  mockIsPremiumPlan: vi.fn(),
}));

vi.mock("@/lib/plan-gate", () => ({
  isPremiumPlan: mockIsPremiumPlan,
}));

import {
  PremiumGateError,
  isPremiumFeatureEnabled,
  requirePremiumPlan,
} from "@/lib/enterprise-bridge";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requirePremiumPlan", () => {
  it("resolves when the plan is premium", async () => {
    mockIsPremiumPlan.mockResolvedValueOnce(true);
    await expect(requirePremiumPlan("ctest00000000000000000001")).resolves.toBeUndefined();
  });

  it("throws PremiumGateError for non-premium plans", async () => {
    mockIsPremiumPlan.mockResolvedValueOnce(false);

    await expect(requirePremiumPlan("ctest00000000000000000001")).rejects.toMatchObject({
      name: "PremiumGateError",
      companyId: "ctest00000000000000000001",
    });

    // Note: PremiumGateError.message includes companyId and should be sanitized before API response bodies.
    await expect(requirePremiumPlan("ctest00000000000000000001")).rejects.toThrow(
      "Premium plan required for companyId=ctest00000000000000000001",
    );
  });

  it("uses unknown when companyId is null", async () => {
    mockIsPremiumPlan.mockResolvedValueOnce(false);
    await expect(requirePremiumPlan(null)).rejects.toMatchObject({
      name: "PremiumGateError",
      companyId: "unknown",
    });
  });
});

describe("isPremiumFeatureEnabled", () => {
  it("returns delegated plan check result", async () => {
    mockIsPremiumPlan.mockResolvedValueOnce(true);
    await expect(isPremiumFeatureEnabled("ctest00000000000000000001")).resolves.toBe(true);

    mockIsPremiumPlan.mockResolvedValueOnce(false);
    await expect(isPremiumFeatureEnabled("ctest00000000000000000001")).resolves.toBe(false);
  });
});

describe("PremiumGateError", () => {
  it("sets name, companyId, and message", () => {
    const err = new PremiumGateError("ctest00000000000000000001");
    expect(err.name).toBe("PremiumGateError");
    expect(err.companyId).toBe("ctest00000000000000000001");
    expect(err.message).toContain("companyId=ctest00000000000000000001");
  });
});
