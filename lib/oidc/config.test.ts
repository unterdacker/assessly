import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";

const { mockUserFindFirst, mockOidcConfigFindUnique, mockDecrypt } = vi.hoisted(() => ({
  mockUserFindFirst: vi.fn(),
  mockOidcConfigFindUnique: vi.fn(),
  mockDecrypt: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mockUserFindFirst },
    oidcConfig: { findUnique: mockOidcConfigFindUnique },
  },
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: mockDecrypt,
}));

import { getOidcConfigForEmail } from "@/lib/oidc/config";

const MOCK_OIDC_CONFIG = {
  id: "config-1",
  companyId: "company-1",
  issuerUrl: "https://idp.example.com",
  clientId: "client-id",
  clientSecretEncrypted: "encrypted-secret",
  isEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function stubUserWithRole(role: UserRole) {
  mockUserFindFirst.mockResolvedValue({ companyId: "company-1" });
  mockOidcConfigFindUnique.mockResolvedValue(MOCK_OIDC_CONFIG);
  mockDecrypt.mockReturnValue("decrypted-secret");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOidcConfigForEmail", () => {
  describe("succeeds for all internal roles", () => {
    const internalRoles: UserRole[] = ["SUPER_ADMIN", "ADMIN", "RISK_REVIEWER", "AUDITOR"];

    for (const role of internalRoles) {
      it(`resolves OIDC config when user has role ${role}`, async () => {
        stubUserWithRole(role);
        const result = await getOidcConfigForEmail("user@example.com");
        expect(result).not.toBeNull();
        expect(result?.companyId).toBe("company-1");
        expect(result?.clientSecret).toBe("decrypted-secret");
      });
    }
  });

  it("returns null when user is not found", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    const result = await getOidcConfigForEmail("unknown@example.com");
    expect(result).toBeNull();
  });

  it("returns null when user has no companyId", async () => {
    mockUserFindFirst.mockResolvedValue({ companyId: null });
    const result = await getOidcConfigForEmail("user@example.com");
    expect(result).toBeNull();
  });

  it("returns null when OIDC config is not found", async () => {
    mockUserFindFirst.mockResolvedValue({ companyId: "company-1" });
    mockOidcConfigFindUnique.mockResolvedValue(null);
    const result = await getOidcConfigForEmail("user@example.com");
    expect(result).toBeNull();
  });

  it("returns null when OIDC config is disabled", async () => {
    mockUserFindFirst.mockResolvedValue({ companyId: "company-1" });
    mockOidcConfigFindUnique.mockResolvedValue({ ...MOCK_OIDC_CONFIG, isEnabled: false });
    const result = await getOidcConfigForEmail("user@example.com");
    expect(result).toBeNull();
  });

  it("queries only internal roles — VENDOR users cannot SSO-authenticate", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    await getOidcConfigForEmail("vendor@example.com");
    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: expect.objectContaining({
            in: expect.not.arrayContaining(["VENDOR"]),
          }),
        }),
      }),
    );
  });
});
