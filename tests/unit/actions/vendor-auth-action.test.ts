import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  mockRedirect,
  mockHeaders,
  mockCookies,
  mockVendorFindFirst,
  mockVendorUpdate,
  mockUserFindFirst,
  mockUserUpsert,
  mockCompanyFindUnique,
  mockBcryptCompare,
  mockHasLocale,
  mockCreateSessionForUser,
  mockSetAuthSessionCookie,
  mockShouldSecureCookie,
  mockIsRateLimited,
  mockRegisterFailure,
  mockResetFailures,
  mockReadClientIp,
  mockSetVendorMfaPendingCookie,
  mockSetMfaSetupPendingCookie,
  mockWithLocalePath,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  mockHeaders: vi.fn(),
  mockCookies: vi.fn(),
  mockVendorFindFirst: vi.fn(),
  mockVendorUpdate: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUserUpsert: vi.fn(),
  mockCompanyFindUnique: vi.fn(),
  mockBcryptCompare: vi.fn(),
  mockHasLocale: vi.fn(),
  mockCreateSessionForUser: vi.fn(),
  mockSetAuthSessionCookie: vi.fn(),
  mockShouldSecureCookie: vi.fn(),
  mockIsRateLimited: vi.fn(),
  mockRegisterFailure: vi.fn(),
  mockResetFailures: vi.fn(),
  mockReadClientIp: vi.fn(),
  mockSetVendorMfaPendingCookie: vi.fn(),
  mockSetMfaSetupPendingCookie: vi.fn(),
  mockWithLocalePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("bcryptjs", () => ({ default: { compare: mockBcryptCompare } }));
vi.mock("next/headers", () => ({ headers: mockHeaders, cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("next-intl", () => ({ hasLocale: mockHasLocale }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vendor: { findFirst: mockVendorFindFirst, update: mockVendorUpdate },
    user: { findFirst: mockUserFindFirst, upsert: mockUserUpsert },
    company: { findUnique: mockCompanyFindUnique },
  },
}));
vi.mock("@/lib/auth/server", () => ({
  createSessionForUser: mockCreateSessionForUser,
  setAuthSessionCookie: mockSetAuthSessionCookie,
}));
vi.mock("@/lib/auth/token", () => ({ shouldSecureCookie: mockShouldSecureCookie }));
vi.mock("@/i18n/routing", () => ({ routing: { locales: ["en", "de"], defaultLocale: "en" } }));
vi.mock("@/lib/auth/permissions", () => ({ withLocalePath: mockWithLocalePath }));
vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: mockIsRateLimited,
  registerFailure: mockRegisterFailure,
  resetFailures: mockResetFailures,
  readClientIp: mockReadClientIp,
}));
vi.mock("@/lib/structured-logger", () => ({ AuditLogger: { auth: vi.fn() } }));
vi.mock("@/lib/audit-sanitize", () => ({ truncateIp: (ip: string) => ip }));
vi.mock("@/lib/auth/vendor-mfa-pending", () => ({ setVendorMfaPendingCookie: mockSetVendorMfaPendingCookie }));
vi.mock("@/lib/auth/mfa-setup-pending", () => ({ setMfaSetupPendingCookie: mockSetMfaSetupPendingCookie }));

import { authenticateVendorAccessCode } from "@/app/actions/vendor-auth";

// Vendor fixture - field names match the prisma select in vendor-auth.ts
const VENDOR = {
  id: "v1",
  companyId: "co1",
  inviteToken: "old-token",
  inviteTokenExpires: new Date(Date.now() + 86400000),
  setupToken: null,
  setupTokenExpires: null,
  codeExpiresAt: new Date(Date.now() + 86400000),
  passwordHash: "$2b$12$validhash",
  isFirstLogin: false,
};

const PREV_STATE = { error: null as string | null };

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

describe("vendor-auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRateLimited.mockReturnValue(false);
    mockReadClientIp.mockReturnValue("127.0.0.1");
    mockHeaders.mockResolvedValue(new Map([["x-forwarded-for", "127.0.0.1"]]));
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined), set: vi.fn(), delete: vi.fn() });
    mockCreateSessionForUser.mockResolvedValue({ token: "tok", expiresAt: new Date() });
    mockShouldSecureCookie.mockReturnValue(false);
    mockHasLocale.mockReturnValue(true);
    mockWithLocalePath.mockImplementation((path: string, locale: string) => `/${locale}${path}`);
    mockUserFindFirst.mockResolvedValue({ id: "u1", mfaEnabled: false, mfaEnforced: false });
    mockCompanyFindUnique.mockResolvedValue({ mfaRequired: false });
    mockVendorUpdate.mockResolvedValue(VENDOR);
    mockUserUpsert.mockResolvedValue({ id: "u1", role: "VENDOR", companyId: "co1", vendorId: "v1" });
    mockSetAuthSessionCookie.mockResolvedValue(undefined);
    mockSetVendorMfaPendingCookie.mockResolvedValue(undefined);
    mockSetMfaSetupPendingCookie.mockResolvedValue(undefined);
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  describe("authenticateVendorAccessCode", () => {
    describe("failure paths with delayed response", () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      async function runFailure(fd: FormData) {
        const pending = authenticateVendorAccessCode(PREV_STATE, fd);
        await vi.runAllTimersAsync();
        return pending;
      }

      it("returns error immediately when IP rate limited", async () => {
        mockIsRateLimited.mockReturnValueOnce(true);
        const fd = makeFormData({ accessCode: "ABCD-1234", password: "pass123" });
        const result = await runFailure(fd);
        expect(result).toEqual({ error: "Invalid credentials." });
        expect(mockVendorFindFirst).not.toHaveBeenCalled();
      });

      it("returns error when code rate limited", async () => {
        mockIsRateLimited.mockReturnValueOnce(false).mockReturnValueOnce(true);
        const fd = makeFormData({ accessCode: "ABCD-1234", password: "pass123" });
        const result = await runFailure(fd);
        expect(result).toEqual({ error: "Invalid credentials." });
      });

      it("returns error and registers failure when accessCode is empty", async () => {
        const fd = makeFormData({ accessCode: "", password: "pass123" });
        const result = await runFailure(fd);
        expect(result).toEqual({ error: "Invalid credentials." });
        expect(mockRegisterFailure).toHaveBeenCalledWith("vpi:127.0.0.1");
        expect(mockRegisterFailure).toHaveBeenCalledWith("vpc:EMPTY", expect.any(Object));
      });

      it("returns error and registers failure when password is empty", async () => {
        const fd = makeFormData({ accessCode: "ABCD-1234", password: "" });
        const result = await runFailure(fd);
        expect(result).toEqual({ error: "Invalid credentials." });
        expect(mockRegisterFailure).toHaveBeenCalledWith("vpi:127.0.0.1");
        expect(mockRegisterFailure).toHaveBeenCalledWith("vpc:ABCD1234", expect.any(Object));
      });

      it("returns error when vendor not found", async () => {
        mockVendorFindFirst.mockResolvedValue(null);
        const fd = makeFormData({ accessCode: "ABCD-1234", password: "pass123" });
        const result = await runFailure(fd);
        expect(result).toEqual({ error: "Invalid credentials." });
        expect(mockRegisterFailure).toHaveBeenCalledWith("vpi:127.0.0.1");
        expect(mockRegisterFailure).toHaveBeenCalledWith("vpc:ABCD1234", expect.any(Object));
      });

      it("expires access code and clears invite state when isFirstLogin=true", async () => {
        mockVendorFindFirst.mockResolvedValue({
          ...VENDOR,
          codeExpiresAt: new Date(Date.now() - 1000),
          isFirstLogin: true,
        });
        const fd = makeFormData({ accessCode: "ABCD-1234", password: "pass123" });
        const result = await runFailure(fd);
        expect(result).toEqual({ error: "Invalid credentials." });
        expect(mockVendorUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              accessCode: null,
              isCodeActive: false,
              inviteSentAt: null,
              passwordHash: null,
            }),
          }),
        );
      });

      it("expires access code without clearing invite state when isFirstLogin=false", async () => {
        mockVendorFindFirst.mockResolvedValue({
          ...VENDOR,
          codeExpiresAt: new Date(Date.now() - 1000),
          isFirstLogin: false,
        });
        const fd = makeFormData({ accessCode: "ABCD-1234", password: "pass123" });
        const result = await runFailure(fd);
        expect(result).toEqual({ error: "Invalid credentials." });
        const updateCall = mockVendorUpdate.mock.calls[0][0];
        expect(updateCall.data).not.toHaveProperty("inviteSentAt");
        expect(updateCall.data).not.toHaveProperty("passwordHash");
      });

      it("returns generic error when passwordHash is null and no pending setup", async () => {
        mockVendorFindFirst.mockResolvedValue({ ...VENDOR, passwordHash: null, setupToken: null });
        const fd = makeFormData({ accessCode: "ABCD-1234", password: "pass123" });
        const result = await runFailure(fd);
        expect(result).toEqual({ error: "Invalid credentials." });
      });

      it("returns error and registers failure when password is wrong", async () => {
        mockVendorFindFirst.mockResolvedValue(VENDOR);
        mockBcryptCompare.mockResolvedValue(false);
        const fd = makeFormData({ accessCode: "ABCD-1234", password: "wrongpass" });
        const result = await runFailure(fd);
        expect(result).toEqual({ error: "Invalid credentials." });
        expect(mockRegisterFailure).toHaveBeenCalledWith("vpi:127.0.0.1");
        expect(mockRegisterFailure).toHaveBeenCalledWith("vpc:ABCD1234", expect.any(Object));
      });
    });

    it("findFirst is called with formatted (hyphenated) access code", async () => {
      mockVendorFindFirst.mockResolvedValue(VENDOR);
      mockBcryptCompare.mockResolvedValue(true);
      const fd = makeFormData({ accessCode: "abcd-1234", password: "pass123", locale: "en" });
      // Will either succeed (redirect) or fail - either way findFirst was called with formatted code
      try { await authenticateVendorAccessCode(PREV_STATE, fd); } catch {}
      expect(mockVendorFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ accessCode: "ABCD-1234" }) }),
      );
    });

    it("returns pending setup error when passwordHash is null and setup token is valid", async () => {
      const futureDate = new Date(Date.now() + 86400000);
      mockVendorFindFirst.mockResolvedValue({
        ...VENDOR,
        passwordHash: null,
        setupToken: "valid-setup-token",
        setupTokenExpires: futureDate,
      });
      const fd = makeFormData({ accessCode: "ABCD-1234", password: "pass123" });
      const result = await authenticateVendorAccessCode(PREV_STATE, fd);
      expect(result).toEqual({
        error: "Please set your password using the invite link sent to your email before logging in.",
      });
    });

    it("redirects to external/mfa-verify when linked user has MFA enabled", async () => {
      mockVendorFindFirst.mockResolvedValue(VENDOR);
      mockBcryptCompare.mockResolvedValue(true);
      mockUserFindFirst.mockResolvedValue({ id: "u1", mfaEnabled: true, mfaEnforced: false });
      const fd = makeFormData({ accessCode: "ABCD-1234", password: "pass123", locale: "en" });
      await expect(authenticateVendorAccessCode(PREV_STATE, fd)).rejects.toMatchObject({
        message: "NEXT_REDIRECT",
        url: "/en/external/mfa-verify",
      });
      expect(mockSetVendorMfaPendingCookie).toHaveBeenCalled();
    });

    it("redirects to mfa-setup when linkedUser.mfaEnforced is true", async () => {
      mockVendorFindFirst.mockResolvedValue(VENDOR);
      mockBcryptCompare.mockResolvedValue(true);
      mockUserFindFirst.mockResolvedValue({ id: "u1", mfaEnabled: false, mfaEnforced: true });
      const fd = makeFormData({ accessCode: "ABCD-1234", password: "pass123", locale: "en" });
      await expect(authenticateVendorAccessCode(PREV_STATE, fd)).rejects.toMatchObject({
        message: "NEXT_REDIRECT",
      });
      expect(mockSetMfaSetupPendingCookie).toHaveBeenCalled();
    });

    it("on successful login: resets failures, sets 3 cookies, upserts user, creates session", async () => {
      const mockCookieSet = vi.fn();
      mockCookies.mockResolvedValue({ get: vi.fn(), set: mockCookieSet, delete: vi.fn() });
      mockVendorFindFirst.mockResolvedValue(VENDOR);
      mockBcryptCompare.mockResolvedValue(true);
      const fd = makeFormData({ accessCode: "ABCD-1234", password: "pass123", locale: "en" });
      await expect(authenticateVendorAccessCode(PREV_STATE, fd)).rejects.toMatchObject({ message: "NEXT_REDIRECT" });
      expect(mockResetFailures).toHaveBeenCalledWith("vpi:127.0.0.1");
      expect(mockResetFailures).toHaveBeenCalledWith("vpc:ABCD1234");
      expect(mockVendorUpdate).toHaveBeenCalled();
      expect(mockCookieSet).toHaveBeenCalledTimes(3);
      expect(mockUserUpsert).toHaveBeenCalled();
      expect(mockCreateSessionForUser).toHaveBeenCalled();
    });
  });
});
