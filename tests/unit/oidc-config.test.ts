import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockFindUnique, mockFindFirst } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oidcConfig: { findUnique: mockFindUnique },
    user: { findFirst: mockFindFirst },
  },
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn((v: string) => `decrypted:${v}`),
}));

import { getOidcConfig, getOidcConfigForEmail } from "@/lib/oidc/config";

const MOCK_CONFIG = {
  companyId: "company-1",
  clientId: "client-id",
  clientSecretEncrypted: "encrypted-secret",
  issuerUrl: "https://idp.example.com",
  isEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOidcConfig", () => {
  it("returns null when config is not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await getOidcConfig("company-1");

    expect(result).toBeNull();
  });

  it("returns null when config is disabled", async () => {
    mockFindUnique.mockResolvedValue({ ...MOCK_CONFIG, isEnabled: false });

    const result = await getOidcConfig("company-1");

    expect(result).toBeNull();
  });

  it("returns decrypted enabled config", async () => {
    mockFindUnique.mockResolvedValue({ ...MOCK_CONFIG, isEnabled: true });

    const result = await getOidcConfig("company-1");

    expect(result).toEqual(
      expect.objectContaining({
        companyId: "company-1",
        clientId: "client-id",
        clientSecret: "decrypted:encrypted-secret",
        issuerUrl: "https://idp.example.com",
        isEnabled: true,
      }),
    );
    expect(result).not.toHaveProperty("clientSecretEncrypted");
  });
});

describe("getOidcConfigForEmail", () => {
  it("returns null when no qualifying user is found", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await getOidcConfigForEmail("admin@example.com");

    expect(result).toBeNull();
  });

  it("returns null when user has no companyId", async () => {
    mockFindFirst.mockResolvedValue({ companyId: null });

    const result = await getOidcConfigForEmail("admin@example.com");

    expect(result).toBeNull();
  });

  it("returns null when user exists but OIDC config is disabled or missing", async () => {
    mockFindFirst.mockResolvedValue({ companyId: "company-1" });
    mockFindUnique.mockResolvedValue(null);

    const result = await getOidcConfigForEmail("admin@example.com");

    expect(result).toBeNull();
  });

  it("returns merged config with companyId when user and config exist", async () => {
    mockFindFirst.mockResolvedValue({ companyId: "company-1" });
    mockFindUnique.mockResolvedValue({ ...MOCK_CONFIG, isEnabled: true });

    const result = await getOidcConfigForEmail("admin@example.com");

    expect(result).toEqual(
      expect.objectContaining({
        companyId: "company-1",
        clientId: "client-id",
        clientSecret: "decrypted:encrypted-secret",
        issuerUrl: "https://idp.example.com",
      }),
    );
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: ["ADMIN", "RISK_REVIEWER", "AUDITOR"] },
        }),
      }),
    );
  });
});
