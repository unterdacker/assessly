import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  mockRedirect,
  mockHeaders,
  mockCookies,
  mockRevalidatePath,
  mockUserFindUnique,
  mockUserFindUniqueOrThrow,
  mockUserUpdate,
  mockUserUpdateMany,
  mockCompanyUpdate,
  mockVendorFindUnique,
  mockVendorUpdate,
  mockRequireAuthSession,
  mockRequireUserRole,
  mockCreateSessionForUser,
  mockSetAuthSessionCookie,
  mockGetLocalizedLandingPath,
  mockShouldSecureCookie,
  mockVerifyTotpToken,
  mockVerifyAndConsumeRecoveryCode,
  mockGenerateRecoveryCodes,
  mockEncryptMfaSecret,
  mockGenerateTotpSecret,
  mockGenerateTotpUri,
  mockGetMfaPendingClaims,
  mockClearMfaPendingCookie,
  mockGetMfaSetupPendingClaims,
  mockClearMfaSetupPendingCookie,
  mockGetVendorMfaPendingClaims,
  mockClearVendorMfaPendingCookie,
  mockIsRateLimited,
  mockRegisterFailure,
  mockResetFailures,
  mockReadClientIp,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  mockHeaders: vi.fn(),
  mockCookies: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserFindUniqueOrThrow: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserUpdateMany: vi.fn(),
  mockCompanyUpdate: vi.fn(),
  mockVendorFindUnique: vi.fn(),
  mockVendorUpdate: vi.fn(),
  mockRequireAuthSession: vi.fn(),
  mockRequireUserRole: vi.fn(),
  mockCreateSessionForUser: vi.fn(),
  mockSetAuthSessionCookie: vi.fn(),
  mockGetLocalizedLandingPath: vi.fn(),
  mockShouldSecureCookie: vi.fn(),
  mockVerifyTotpToken: vi.fn(),
  mockVerifyAndConsumeRecoveryCode: vi.fn(),
  mockGenerateRecoveryCodes: vi.fn(),
  mockEncryptMfaSecret: vi.fn(),
  mockGenerateTotpSecret: vi.fn(),
  mockGenerateTotpUri: vi.fn(),
  mockGetMfaPendingClaims: vi.fn(),
  mockClearMfaPendingCookie: vi.fn(),
  mockGetMfaSetupPendingClaims: vi.fn(),
  mockClearMfaSetupPendingCookie: vi.fn(),
  mockGetVendorMfaPendingClaims: vi.fn(),
  mockClearVendorMfaPendingCookie: vi.fn(),
  mockIsRateLimited: vi.fn(),
  mockRegisterFailure: vi.fn(),
  mockResetFailures: vi.fn(),
  mockReadClientIp: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("next/headers", () => ({
  headers: mockHeaders,
  cookies: mockCookies,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findUniqueOrThrow: mockUserFindUniqueOrThrow,
      update: mockUserUpdate,
      updateMany: mockUserUpdateMany,
    },
    company: { update: mockCompanyUpdate },
    vendor: { findUnique: mockVendorFindUnique, update: mockVendorUpdate },
  },
}));
vi.mock("@/lib/auth/server", () => ({
  requireAuthSession: mockRequireAuthSession,
  requireUserRole: mockRequireUserRole,
  createSessionForUser: mockCreateSessionForUser,
  setAuthSessionCookie: mockSetAuthSessionCookie,
  getLocalizedLandingPath: mockGetLocalizedLandingPath,
}));
vi.mock("@/lib/auth/token", () => ({ shouldSecureCookie: mockShouldSecureCookie }));
vi.mock("@/lib/mfa", () => ({
  verifyTotpToken: mockVerifyTotpToken,
  generateRecoveryCodes: mockGenerateRecoveryCodes,
  verifyAndConsumeRecoveryCode: mockVerifyAndConsumeRecoveryCode,
  encryptMfaSecret: mockEncryptMfaSecret,
  generateTotpSecret: mockGenerateTotpSecret,
  generateTotpUri: mockGenerateTotpUri,
  decryptMfaSecret: vi.fn(),
}));
vi.mock("@/lib/auth/permissions", () => ({
  ADMIN_ONLY_ROLES: ["ADMIN", "SUPER_ADMIN"],
  canAccessPath: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/auth/mfa-pending", () => ({
  getMfaPendingClaims: mockGetMfaPendingClaims,
  clearMfaPendingCookie: mockClearMfaPendingCookie,
}));
vi.mock("@/lib/auth/mfa-setup-pending", () => ({
  getMfaSetupPendingClaims: mockGetMfaSetupPendingClaims,
  clearMfaSetupPendingCookie: mockClearMfaSetupPendingCookie,
}));
vi.mock("@/lib/auth/vendor-mfa-pending", () => ({
  getVendorMfaPendingClaims: mockGetVendorMfaPendingClaims,
  clearVendorMfaPendingCookie: mockClearVendorMfaPendingCookie,
}));
vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: mockIsRateLimited,
  registerFailure: mockRegisterFailure,
  resetFailures: mockResetFailures,
  readClientIp: mockReadClientIp,
}));
vi.mock("@/lib/structured-logger", () => ({ AuditLogger: { auth: vi.fn() } }));
vi.mock("@/lib/audit-sanitize", () => ({ truncateIp: (ip: string) => ip }));

import {
  generateMfaSecret,
  verifyAndEnableMfa,
  disableMfa,
  regenerateRecoveryCodes,
  generateMfaSecretForSetup,
  completeForcedMfaSetup,
  verifyMfaAndAuthenticate,
  verifyVendorMfaAndAuthenticate,
  setUserMfaEnforced,
  setOrgMfaRequired,
} from "@/app/actions/mfa";

const DEFAULT_SESSION = {
  userId: "u1",
  email: "test@example.com",
  role: "ADMIN" as const,
  companyId: "co1",
  vendorId: null,
};

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

describe("mfa server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Map([["x-forwarded-for", "127.0.0.1"]]));
    mockCookies.mockResolvedValue({ get: vi.fn(), set: vi.fn(), delete: vi.fn() });
    mockRequireAuthSession.mockResolvedValue(DEFAULT_SESSION);
    mockRequireUserRole.mockResolvedValue(DEFAULT_SESSION);
    mockCreateSessionForUser.mockResolvedValue({ token: "tok", expiresAt: new Date() });
    mockSetAuthSessionCookie.mockResolvedValue(undefined);
    mockGetLocalizedLandingPath.mockReturnValue("/en/dashboard");
    mockShouldSecureCookie.mockReturnValue(false);
    mockGetMfaPendingClaims.mockResolvedValue(null);
    mockClearMfaPendingCookie.mockResolvedValue(undefined);
    mockGetVendorMfaPendingClaims.mockResolvedValue(null);
    mockClearVendorMfaPendingCookie.mockResolvedValue(undefined);
    mockClearMfaSetupPendingCookie.mockResolvedValue(undefined);
    mockVerifyAndConsumeRecoveryCode.mockResolvedValue(-1);
    mockIsRateLimited.mockReturnValue(false);
    mockReadClientIp.mockReturnValue("127.0.0.1");
    mockGenerateRecoveryCodes.mockResolvedValue({
      plaintext: ["CODE1", "CODE2", "CODE3"],
      hashed: ["hash1", "hash2", "hash3"],
    });
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  describe("generateMfaSecret", () => {
    it("throws when requireAuthSession rejects", async () => {
      mockRequireAuthSession.mockRejectedValue(new Error("Unauthorized"));
      await expect(generateMfaSecret()).rejects.toThrow("Unauthorized");
    });

    it("generates and stores encrypted TOTP secret, returns { uri, secret }", async () => {
      mockGenerateTotpSecret.mockReturnValue("JBSWY3DPEHPK3PXP");
      mockEncryptMfaSecret.mockReturnValue("encrypted-secret");
      mockGenerateTotpUri.mockReturnValue("otpauth://totp/App:test@example.com?secret=JBSWY3DPEHPK3PXP");
      mockUserUpdate.mockResolvedValue({});

      const result = await generateMfaSecret();

      expect(result).toEqual({
        uri: "otpauth://totp/App:test@example.com?secret=JBSWY3DPEHPK3PXP",
        secret: "JBSWY3DPEHPK3PXP",
      });
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "u1" }, data: { mfaSecret: "encrypted-secret" } }),
      );
    });
  });

  describe("verifyAndEnableMfa", () => {
    it("throws NO_MFA_SECRET when user has no mfaSecret", async () => {
      mockUserFindUniqueOrThrow.mockResolvedValue({ mfaSecret: null, role: "AUDITOR" });
      await expect(verifyAndEnableMfa("123456")).rejects.toThrow("NO_MFA_SECRET");
    });

    it("throws INVALID_MFA_TOKEN when verifyTotpToken returns false", async () => {
      mockUserFindUniqueOrThrow.mockResolvedValue({ mfaSecret: "encrypted-secret", role: "AUDITOR" });
      mockVerifyTotpToken.mockReturnValue(false);
      await expect(verifyAndEnableMfa("000000")).rejects.toThrow("INVALID_MFA_TOKEN");
    });

    it("enables MFA, stores recovery codes, returns plaintext codes", async () => {
      mockUserFindUniqueOrThrow.mockResolvedValue({ mfaSecret: "encrypted-secret", role: "AUDITOR" });
      mockVerifyTotpToken.mockReturnValue(true);
      mockUserUpdateMany.mockResolvedValue({ count: 1 });

      const result = await verifyAndEnableMfa("123456");

      expect(result).toEqual({ success: true, recoveryCodes: ["CODE1", "CODE2", "CODE3"] });
      expect(mockUserUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u1", mfaEnabled: false },
          data: expect.objectContaining({ mfaEnabled: true, mfaRecoveryCodes: ["hash1", "hash2", "hash3"] }),
        }),
      );
    });

    it("throws ALREADY_ENROLLED when updateMany count is 0", async () => {
      mockUserFindUniqueOrThrow.mockResolvedValue({ mfaSecret: "encrypted-secret", role: "AUDITOR" });
      mockVerifyTotpToken.mockReturnValue(true);
      mockUserUpdateMany.mockResolvedValue({ count: 0 });
      await expect(verifyAndEnableMfa("123456")).rejects.toThrow("ALREADY_ENROLLED");
    });
  });

  describe("disableMfa", () => {
    it("throws MFA_NOT_ENABLED when user mfaEnabled is false", async () => {
      mockUserFindUniqueOrThrow.mockResolvedValue({ mfaSecret: "enc", mfaEnabled: false, role: "AUDITOR" });
      await expect(disableMfa("123456")).rejects.toThrow("MFA_NOT_ENABLED");
    });

    it("throws INVALID_MFA_TOKEN when verifyTotpToken returns false", async () => {
      mockUserFindUniqueOrThrow.mockResolvedValue({ mfaSecret: "enc", mfaEnabled: true, role: "AUDITOR" });
      mockVerifyTotpToken.mockReturnValue(false);
      await expect(disableMfa("000000")).rejects.toThrow("INVALID_MFA_TOKEN");
    });

    it("disables MFA and returns { success: true }", async () => {
      mockUserFindUniqueOrThrow.mockResolvedValue({ mfaSecret: "enc", mfaEnabled: true, role: "AUDITOR" });
      mockVerifyTotpToken.mockReturnValue(true);
      mockUserUpdateMany.mockResolvedValue({ count: 1 });

      const result = await disableMfa("123456");

      expect(result).toEqual({ success: true });
      expect(mockUserUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u1", mfaEnabled: true },
          data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: [] },
        }),
      );
    });
  });

  describe("regenerateRecoveryCodes", () => {
    it("throws MFA_NOT_ENABLED when user has no mfaEnabled", async () => {
      mockUserFindUnique.mockResolvedValue({ mfaEnabled: false, mfaSecret: null });
      await expect(regenerateRecoveryCodes("123456")).rejects.toThrow("MFA_NOT_ENABLED");
    });

    it("throws INVALID_MFA_TOKEN on bad token", async () => {
      mockUserFindUnique.mockResolvedValue({ mfaEnabled: true, mfaSecret: "enc", role: "AUDITOR" });
      mockVerifyTotpToken.mockReturnValue(false);
      await expect(regenerateRecoveryCodes("000000")).rejects.toThrow("INVALID_MFA_TOKEN");
    });

    it("regenerates codes and returns plaintext", async () => {
      mockUserFindUnique.mockResolvedValue({ mfaEnabled: true, mfaSecret: "enc", role: "AUDITOR" });
      mockVerifyTotpToken.mockReturnValue(true);
      mockUserUpdate.mockResolvedValue({});

      const result = await regenerateRecoveryCodes("123456");

      expect(result).toEqual({ success: true, recoveryCodes: ["CODE1", "CODE2", "CODE3"] });
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u1" },
          data: { mfaRecoveryCodes: ["hash1", "hash2", "hash3"] },
        }),
      );
    });
  });

  describe("generateMfaSecretForSetup", () => {
    it("throws SETUP_SESSION_EXPIRED when getMfaSetupPendingClaims returns null", async () => {
      mockGetMfaSetupPendingClaims.mockResolvedValue(null);
      await expect(generateMfaSecretForSetup()).rejects.toThrow("SETUP_SESSION_EXPIRED");
    });

    it("throws USER_NOT_FOUND when user does not exist", async () => {
      mockGetMfaSetupPendingClaims.mockResolvedValue({ uid: "u1", locale: "en" });
      mockUserFindUnique.mockResolvedValue(null);
      await expect(generateMfaSecretForSetup()).rejects.toThrow("USER_NOT_FOUND");
    });

    it("returns { uri, secret } for forced setup flow", async () => {
      mockGetMfaSetupPendingClaims.mockResolvedValue({ uid: "u1", locale: "en" });
      mockUserFindUnique.mockResolvedValue({ email: "test@example.com" });
      mockGenerateTotpSecret.mockReturnValue("JBSWY3DPEHPK3PXP");
      mockEncryptMfaSecret.mockReturnValue("encrypted-secret");
      mockGenerateTotpUri.mockReturnValue("otpauth://totp/App:test@example.com?secret=JBSWY3DPEHPK3PXP");
      mockUserUpdate.mockResolvedValue({});

      const result = await generateMfaSecretForSetup();

      expect(result).toEqual({
        uri: "otpauth://totp/App:test@example.com?secret=JBSWY3DPEHPK3PXP",
        secret: "JBSWY3DPEHPK3PXP",
      });
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "u1" }, data: { mfaSecret: "encrypted-secret" } }),
      );
    });
  });

  describe("setOrgMfaRequired", () => {
    it("throws ADMIN_MFA_NOT_ENROLLED when enabling org MFA and admin has no MFA", async () => {
      mockRequireUserRole.mockResolvedValue(DEFAULT_SESSION);
      // Source: prisma.user.findUnique({ where: { id: session.userId } }) to check admin's mfaEnabled
      mockUserFindUnique.mockResolvedValue({ mfaEnabled: false });
      await expect(setOrgMfaRequired(true)).rejects.toThrow("ADMIN_MFA_NOT_ENROLLED");
    });

    it("returns success when required=true and admin has MFA enabled", async () => {
      mockUserFindUnique.mockResolvedValue({ mfaEnabled: true });
      const result = await setOrgMfaRequired(true);
      expect(result).toEqual({ success: true });
      expect(mockCompanyUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "co1" }, data: { mfaRequired: true } }),
      );
    });

    it("returns success when required=false", async () => {
      mockUserFindUnique.mockResolvedValue({ mfaEnabled: false });
      const result = await setOrgMfaRequired(false);
      expect(result).toEqual({ success: true });
      expect(mockCompanyUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "co1" }, data: { mfaRequired: false } }),
      );
    });

    it("throws FORBIDDEN when session has no companyId", async () => {
      mockRequireUserRole.mockResolvedValue({ ...DEFAULT_SESSION, companyId: null });
      await expect(setOrgMfaRequired(true)).rejects.toThrow("FORBIDDEN");
    });
  });

  describe("completeForcedMfaSetup", () => {
    it("returns SETUP_SESSION_EXPIRED when pending setup claims are missing", async () => {
      mockGetMfaSetupPendingClaims.mockResolvedValue(null);
      const result = await completeForcedMfaSetup(null, makeFormData({ token: "123456" }));
      expect(result).toEqual({ error: "SETUP_SESSION_EXPIRED" });
    });

    it("returns ACCOUNT_DISABLED when user is missing or inactive", async () => {
      mockGetMfaSetupPendingClaims.mockResolvedValue({ uid: "u1", locale: "en" });
      mockUserFindUnique.mockResolvedValue(null);
      const result = await completeForcedMfaSetup(null, makeFormData({ token: "123456" }));
      expect(result).toEqual({ error: "ACCOUNT_DISABLED" });
    });

    it("returns NO_MFA_SECRET when user has no stored secret", async () => {
      mockGetMfaSetupPendingClaims.mockResolvedValue({ uid: "u1", locale: "en" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        mfaSecret: null,
        mfaEnabled: false,
        role: "ADMIN",
        companyId: "co1",
        vendorId: null,
      });
      const result = await completeForcedMfaSetup(null, makeFormData({ token: "123456" }));
      expect(result).toEqual({ error: "NO_MFA_SECRET" });
    });

    it("returns INVALID_MFA_TOKEN when TOTP verification fails", async () => {
      mockGetMfaSetupPendingClaims.mockResolvedValue({ uid: "u1", locale: "en" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        mfaSecret: "enc",
        mfaEnabled: false,
        role: "ADMIN",
        companyId: "co1",
        vendorId: null,
      });
      mockVerifyTotpToken.mockReturnValue(false);
      const result = await completeForcedMfaSetup(null, makeFormData({ token: "000000" }));
      expect(result).toEqual({ error: "INVALID_MFA_TOKEN" });
    });

    it("returns ALREADY_ENROLLED when updateMany affects zero rows", async () => {
      mockGetMfaSetupPendingClaims.mockResolvedValue({ uid: "u1", locale: "en" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        mfaSecret: "enc",
        mfaEnabled: false,
        role: "ADMIN",
        companyId: "co1",
        vendorId: null,
      });
      mockVerifyTotpToken.mockReturnValue(true);
      mockUserUpdateMany.mockResolvedValue({ count: 0 });
      const result = await completeForcedMfaSetup(null, makeFormData({ token: "123456" }));
      expect(result).toEqual({ error: "ALREADY_ENROLLED" });
    });

    it("returns recovery codes on success", async () => {
      mockGetMfaSetupPendingClaims.mockResolvedValue({ uid: "u1", locale: "en" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        mfaSecret: "enc",
        mfaEnabled: false,
        role: "ADMIN",
        companyId: "co1",
        vendorId: null,
      });
      mockVerifyTotpToken.mockReturnValue(true);
      mockUserUpdateMany.mockResolvedValue({ count: 1 });
      const result = await completeForcedMfaSetup(null, makeFormData({ token: "123456" }));
      expect(result).toEqual({ error: null, recoveryCodes: ["CODE1", "CODE2", "CODE3"] });
      expect(mockCreateSessionForUser).toHaveBeenCalled();
      expect(mockSetAuthSessionCookie).toHaveBeenCalled();
      expect(mockClearMfaSetupPendingCookie).toHaveBeenCalled();
    });
  });

  describe("verifyMfaAndAuthenticate", () => {
    it("returns MFA_SESSION_EXPIRED when pending claims are missing", async () => {
      mockGetMfaPendingClaims.mockResolvedValue(null);
      const result = await verifyMfaAndAuthenticate({ error: null }, makeFormData({ token: "123456" }));
      expect(result).toEqual({ error: "MFA_SESSION_EXPIRED" });
    });

    it("returns ACCOUNT_DISABLED when account no longer exists", async () => {
      mockGetMfaPendingClaims.mockResolvedValue({ uid: "u1", locale: "en", next: "/vendors" });
      mockUserFindUnique.mockResolvedValue(null);
      const result = await verifyMfaAndAuthenticate({ error: null }, makeFormData({ token: "123456" }));
      expect(result).toEqual({ error: "ACCOUNT_DISABLED" });
      expect(mockClearMfaPendingCookie).toHaveBeenCalled();
    });

    it("returns MFA_NOT_CONFIGURED when user has no active MFA setup", async () => {
      mockGetMfaPendingClaims.mockResolvedValue({ uid: "u1", locale: "en", next: "/vendors" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        role: "ADMIN",
        companyId: "co1",
        vendorId: null,
        mfaSecret: null,
        mfaEnabled: false,
        mfaRecoveryCodes: [],
      });
      const result = await verifyMfaAndAuthenticate({ error: null }, makeFormData({ token: "123456" }));
      expect(result).toEqual({ error: "MFA_NOT_CONFIGURED" });
    });

    it("returns INVALID_MFA_TOKEN for bad TOTP", async () => {
      mockGetMfaPendingClaims.mockResolvedValue({ uid: "u1", locale: "en", next: "/vendors" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        role: "ADMIN",
        companyId: "co1",
        vendorId: null,
        mfaSecret: "enc",
        mfaEnabled: true,
        mfaRecoveryCodes: ["h1", "h2"],
      });
      mockVerifyTotpToken.mockReturnValue(false);
      const result = await verifyMfaAndAuthenticate({ error: null }, makeFormData({ token: "000000" }));
      expect(result).toEqual({ error: "INVALID_MFA_TOKEN" });
    });

    it("rate limits recovery-code attempts", async () => {
      mockGetMfaPendingClaims.mockResolvedValue({ uid: "u1", locale: "en", next: "/vendors" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        role: "ADMIN",
        companyId: "co1",
        vendorId: null,
        mfaSecret: "enc",
        mfaEnabled: true,
        mfaRecoveryCodes: ["h1", "h2"],
      });
      mockIsRateLimited.mockReturnValue(true);
      const result = await verifyMfaAndAuthenticate(
        { error: null },
        makeFormData({ token: "RCODE", mode: "recovery" }),
      );
      expect(result).toEqual({ error: "RECOVERY_CODE_INVALID" });
      expect(mockVerifyAndConsumeRecoveryCode).not.toHaveBeenCalled();
    });

    it("supports recovery-code login path and redirects on success", async () => {
      mockGetMfaPendingClaims.mockResolvedValue({ uid: "u1", locale: "en", next: "/vendors" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        role: "ADMIN",
        companyId: "co1",
        vendorId: null,
        mfaSecret: "enc",
        mfaEnabled: true,
        mfaRecoveryCodes: ["h1", "h2", "h3"],
      });
      mockVerifyAndConsumeRecoveryCode.mockResolvedValue(1);
      mockUserUpdateMany.mockResolvedValue({ count: 1 });

      await expect(
        verifyMfaAndAuthenticate({ error: null }, makeFormData({ token: "RCODE", mode: "recovery" })),
      ).rejects.toMatchObject({ message: "NEXT_REDIRECT", url: "/vendors" });

      expect(mockResetFailures).toHaveBeenCalledWith("rcv:u1");
      expect(mockCreateSessionForUser).toHaveBeenCalled();
      expect(mockSetAuthSessionCookie).toHaveBeenCalled();
      expect(mockClearMfaPendingCookie).toHaveBeenCalled();
    });

    it("creates session and redirects on successful TOTP verification", async () => {
      mockGetMfaPendingClaims.mockResolvedValue({ uid: "u1", locale: "en", next: "/vendors" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        role: "ADMIN",
        companyId: "co1",
        vendorId: null,
        mfaSecret: "enc",
        mfaEnabled: true,
        mfaRecoveryCodes: ["h1", "h2"],
      });
      mockVerifyTotpToken.mockReturnValue(true);

      await expect(
        verifyMfaAndAuthenticate({ error: null }, makeFormData({ token: "123456" })),
      ).rejects.toMatchObject({ message: "NEXT_REDIRECT", url: "/vendors" });

      expect(mockCreateSessionForUser).toHaveBeenCalled();
      expect(mockSetAuthSessionCookie).toHaveBeenCalled();
      expect(mockClearMfaPendingCookie).toHaveBeenCalled();
    });
  });

  describe("verifyVendorMfaAndAuthenticate", () => {
    it("returns ACCOUNT_DISABLED when user has no vendorId", async () => {
      mockGetVendorMfaPendingClaims.mockResolvedValue({ uid: "u1", locale: "en" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        role: "VENDOR",
        companyId: "co1",
        vendorId: null,
        mfaSecret: "enc",
        mfaEnabled: true,
        mfaRecoveryCodes: ["h1"],
      });
      mockVerifyTotpToken.mockReturnValue(true);

      const result = await verifyVendorMfaAndAuthenticate({ error: null }, makeFormData({ token: "123456" }));
      expect(result).toEqual({ error: "ACCOUNT_DISABLED" });
      expect(mockClearVendorMfaPendingCookie).toHaveBeenCalled();
    });

    it("returns ACCOUNT_DISABLED when vendor record is missing", async () => {
      mockGetVendorMfaPendingClaims.mockResolvedValue({ uid: "u1", locale: "en" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        role: "VENDOR",
        companyId: "co1",
        vendorId: "v1",
        mfaSecret: "enc",
        mfaEnabled: true,
        mfaRecoveryCodes: ["h1"],
      });
      mockVerifyTotpToken.mockReturnValue(true);
      mockVendorFindUnique.mockResolvedValue(null);

      const result = await verifyVendorMfaAndAuthenticate({ error: null }, makeFormData({ token: "123456" }));
      expect(result).toEqual({ error: "ACCOUNT_DISABLED" });
    });

    it("returns ACCOUNT_DISABLED when vendor access code is expired", async () => {
      mockGetVendorMfaPendingClaims.mockResolvedValue({ uid: "u1", locale: "en" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        role: "VENDOR",
        companyId: "co1",
        vendorId: "v1",
        mfaSecret: "enc",
        mfaEnabled: true,
        mfaRecoveryCodes: ["h1"],
      });
      mockVerifyTotpToken.mockReturnValue(true);
      mockVendorFindUnique.mockResolvedValue({ id: "v1", codeExpiresAt: new Date(Date.now() - 1_000) });

      const result = await verifyVendorMfaAndAuthenticate({ error: null }, makeFormData({ token: "123456" }));
      expect(result).toEqual({ error: "ACCOUNT_DISABLED" });
    });

    it("supports TOTP path and writes 3 cookies before redirect", async () => {
      const cookieSet = vi.fn();
      mockCookies.mockResolvedValue({ get: vi.fn(), set: cookieSet, delete: vi.fn() });
      mockGetVendorMfaPendingClaims.mockResolvedValue({ uid: "u1", locale: "en" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        role: "VENDOR",
        companyId: "co1",
        vendorId: "v1",
        mfaSecret: "enc",
        mfaEnabled: true,
        mfaRecoveryCodes: ["h1", "h2"],
      });
      mockVerifyTotpToken.mockReturnValue(true);
      mockVendorFindUnique.mockResolvedValue({ id: "v1", codeExpiresAt: new Date(Date.now() + 60_000) });
      mockVendorUpdate.mockResolvedValue({ id: "v1" });

      await expect(
        verifyVendorMfaAndAuthenticate({ error: null }, makeFormData({ token: "123456" })),
      ).rejects.toMatchObject({ message: "NEXT_REDIRECT" });

      expect(cookieSet).toHaveBeenCalledTimes(3);
      expect(mockCreateSessionForUser).toHaveBeenCalled();
      expect(mockSetAuthSessionCookie).toHaveBeenCalled();
    });

    it("supports recovery-code path for vendor MFA login", async () => {
      mockGetVendorMfaPendingClaims.mockResolvedValue({ uid: "u1", locale: "en" });
      mockUserFindUnique.mockResolvedValue({
        id: "u1",
        role: "VENDOR",
        companyId: "co1",
        vendorId: "v1",
        mfaSecret: "enc",
        mfaEnabled: true,
        mfaRecoveryCodes: ["h1", "h2"],
      });
      mockVerifyAndConsumeRecoveryCode.mockResolvedValue(0);
      mockUserUpdateMany.mockResolvedValue({ count: 1 });
      mockVendorFindUnique.mockResolvedValue({ id: "v1", codeExpiresAt: new Date(Date.now() + 60_000) });
      mockVendorUpdate.mockResolvedValue({ id: "v1" });

      await expect(
        verifyVendorMfaAndAuthenticate(
          { error: null },
          makeFormData({ token: "RCODE", mode: "recovery" }),
        ),
      ).rejects.toMatchObject({ message: "NEXT_REDIRECT" });

      expect(mockResetFailures).toHaveBeenCalledWith("rcv:u1");
      expect(mockCreateSessionForUser).toHaveBeenCalled();
    });
  });

  describe("setUserMfaEnforced", () => {
    it("throws FORBIDDEN when target user is outside admin scope", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      await expect(setUserMfaEnforced("u2", true)).rejects.toThrow("FORBIDDEN");
    });

    it("throws CANNOT_ENFORCE_ADMIN for admin-role target", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "u2", companyId: "co1", role: "ADMIN" });
      await expect(setUserMfaEnforced("u2", true)).rejects.toThrow("CANNOT_ENFORCE_ADMIN");
    });

    it("updates target user enforcement and returns success", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "u2", companyId: "co1", role: "AUDITOR" });
      mockUserUpdate.mockResolvedValue({ id: "u2" });
      const result = await setUserMfaEnforced("u2", true);
      expect(result).toEqual({ success: true });
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "u2" }, data: { mfaEnforced: true } }),
      );
    });
  });
});
