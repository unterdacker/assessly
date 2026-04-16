import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  mockRedirect,
  mockHeaders,
  mockCookies,
  mockUserFindFirst,
  mockAuthSessionUpdateMany,
  mockCompanyFindUnique,
  mockWithDbRetry,
  mockBcryptCompare,
  mockCreateSessionForUser,
  mockClearAuthSessionCookie,
  mockGetLocalizedLandingPath,
  mockSetAuthSessionCookie,
  mockHashSessionToken,
  mockVerifySessionToken,
  mockCanAccessPath,
  mockSetMfaPendingCookie,
  mockSetMfaSetupPendingCookie,
  mockLogAuditEvent,
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
  mockUserFindFirst: vi.fn(),
  mockAuthSessionUpdateMany: vi.fn(),
  mockCompanyFindUnique: vi.fn(),
  mockWithDbRetry: vi.fn(),
  mockBcryptCompare: vi.fn(),
  mockCreateSessionForUser: vi.fn(),
  mockClearAuthSessionCookie: vi.fn(),
  mockGetLocalizedLandingPath: vi.fn(),
  mockSetAuthSessionCookie: vi.fn(),
  mockHashSessionToken: vi.fn(),
  mockVerifySessionToken: vi.fn(),
  mockCanAccessPath: vi.fn(),
  mockSetMfaPendingCookie: vi.fn(),
  mockSetMfaSetupPendingCookie: vi.fn(),
  mockLogAuditEvent: vi.fn(),
  mockIsRateLimited: vi.fn(),
  mockRegisterFailure: vi.fn(),
  mockResetFailures: vi.fn(),
  mockReadClientIp: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("bcryptjs", () => ({ default: { compare: mockBcryptCompare } }));
vi.mock("next/headers", () => ({ headers: mockHeaders, cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mockUserFindFirst },
    authSession: { updateMany: mockAuthSessionUpdateMany },
    company: { findUnique: mockCompanyFindUnique },
  },
  withDbRetry: mockWithDbRetry,
}));
vi.mock("@/lib/auth/server", () => ({
  createSessionForUser: mockCreateSessionForUser,
  clearAuthSessionCookie: mockClearAuthSessionCookie,
  getLocalizedLandingPath: mockGetLocalizedLandingPath,
  setAuthSessionCookie: mockSetAuthSessionCookie,
}));
vi.mock("@/lib/auth/token", () => ({
  AUTH_SESSION_COOKIE_NAME: "assessly-session",
  hashSessionToken: mockHashSessionToken,
  verifySessionToken: mockVerifySessionToken,
}));
vi.mock("@/lib/auth/permissions", () => ({ canAccessPath: mockCanAccessPath }));
vi.mock("@/lib/auth/mfa-pending", () => ({ setMfaPendingCookie: mockSetMfaPendingCookie }));
vi.mock("@/lib/auth/mfa-setup-pending", () => ({ setMfaSetupPendingCookie: mockSetMfaSetupPendingCookie }));
vi.mock("@/lib/structured-logger", () => ({ AuditLogger: { auth: vi.fn() } }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/audit-sanitize", () => ({ truncateIp: (ip: string) => ip }));
vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: mockIsRateLimited,
  registerFailure: mockRegisterFailure,
  resetFailures: mockResetFailures,
  readClientIp: mockReadClientIp,
}));

import { authenticateInternalUser, signOutAction } from "@/app/actions/internal-auth";

const PREV_STATE = { error: null };

const ACTIVE_USER = {
  id: "u1",
  email: "test@example.com",
  passwordHash: "$2b$12$validhash",
  role: "AUDITOR" as const,
  companyId: "co1",
  vendorId: null,
  ssoProviderId: null,
  mfaEnabled: false,
  mfaEnforced: false,
};

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

describe("internal-auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRateLimited.mockReturnValue(false);
    mockReadClientIp.mockReturnValue("127.0.0.1");
    mockWithDbRetry.mockImplementation((fn: () => unknown) => fn());
    mockHeaders.mockResolvedValue(new Map([["x-forwarded-for", "127.0.0.1"]]));
    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
      delete: vi.fn(),
    });
    mockCreateSessionForUser.mockResolvedValue({ token: "tok", expiresAt: new Date() });
    mockGetLocalizedLandingPath.mockReturnValue("/en/dashboard");
    mockCanAccessPath.mockReturnValue(true);
    mockLogAuditEvent.mockResolvedValue(undefined);
    mockHashSessionToken.mockResolvedValue("test-hash");
    mockVerifySessionToken.mockResolvedValue({ uid: "u1" });
    mockClearAuthSessionCookie.mockResolvedValue(undefined);
    mockSetAuthSessionCookie.mockResolvedValue(undefined);
    mockSetMfaPendingCookie.mockResolvedValue(undefined);
    mockSetMfaSetupPendingCookie.mockResolvedValue(undefined);
    mockCompanyFindUnique.mockResolvedValue({ mfaRequired: false });
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  describe("authenticateInternalUser", () => {
    it("returns REQUIRED when email is empty", async () => {
      const fd = makeFormData({ email: "", password: "pass123" });
      const result = await authenticateInternalUser(PREV_STATE, fd);
      expect(result).toEqual({ error: "REQUIRED" });
      expect(mockUserFindFirst).not.toHaveBeenCalled();
    });

    it("returns REQUIRED when password is empty", async () => {
      const fd = makeFormData({ email: "test@example.com", password: "" });
      const result = await authenticateInternalUser(PREV_STATE, fd);
      expect(result).toEqual({ error: "REQUIRED" });
    });

    it("returns TOO_MANY_REQUESTS when rate limit exceeded", async () => {
      mockIsRateLimited.mockReturnValueOnce(true);
      const fd = makeFormData({ email: "test@example.com", password: "pass123" });
      const result = await authenticateInternalUser(PREV_STATE, fd);
      expect(result).toEqual({ error: "TOO_MANY_REQUESTS" });
      expect(mockUserFindFirst).not.toHaveBeenCalled();
    });

    it("returns INVALID_CREDENTIALS and calls registerFailure when user not found", async () => {
      mockUserFindFirst.mockResolvedValue(null);
      const fd = makeFormData({ email: "test@example.com", password: "pass123" });
      const result = await authenticateInternalUser(PREV_STATE, fd);
      expect(result).toEqual({ error: "INVALID_CREDENTIALS" });
      expect(mockRegisterFailure).toHaveBeenCalledWith("ial:127.0.0.1", expect.any(Object));
    });

    it("returns ACCOUNT_NOT_ACTIVATED when passwordHash is null", async () => {
      mockUserFindFirst.mockResolvedValue({ ...ACTIVE_USER, passwordHash: null });
      const fd = makeFormData({ email: "test@example.com", password: "pass123" });
      const result = await authenticateInternalUser(PREV_STATE, fd);
      expect(result).toEqual({ error: "ACCOUNT_NOT_ACTIVATED" });
      expect(mockRegisterFailure).toHaveBeenCalledWith("ial:127.0.0.1", expect.any(Object));
    });

    it("returns INVALID_CREDENTIALS and calls registerFailure when password is wrong", async () => {
      mockUserFindFirst.mockResolvedValue(ACTIVE_USER);
      mockBcryptCompare.mockResolvedValue(false);
      const fd = makeFormData({ email: "test@example.com", password: "wrongpass" });
      const result = await authenticateInternalUser(PREV_STATE, fd);
      expect(result).toEqual({ error: "INVALID_CREDENTIALS" });
      expect(mockRegisterFailure).toHaveBeenCalledWith("ial:127.0.0.1", expect.any(Object));
    });

    it("calls logAuditEvent on wrong password when user has companyId", async () => {
      mockUserFindFirst.mockResolvedValue(ACTIVE_USER);
      mockBcryptCompare.mockResolvedValue(false);
      const fd = makeFormData({ email: "test@example.com", password: "wrongpass" });
      await authenticateInternalUser(PREV_STATE, fd);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "co1", action: "LOGIN_FAILED" }),
        expect.anything(),
      );
    });

    it("redirects to mfa-verify when user has MFA enabled", async () => {
      mockUserFindFirst.mockResolvedValue({ ...ACTIVE_USER, mfaEnabled: true });
      mockBcryptCompare.mockResolvedValue(true);
      const fd = makeFormData({ email: "test@example.com", password: "pass123", locale: "en" });
      await expect(authenticateInternalUser(PREV_STATE, fd)).rejects.toMatchObject({
        message: "NEXT_REDIRECT",
        url: "/en/auth/mfa-verify",
      });
      expect(mockSetMfaPendingCookie).toHaveBeenCalled();
    });

    it("redirects to mfa-setup-required when companyMfaRequired and user not MFA enrolled", async () => {
      mockUserFindFirst.mockResolvedValue(ACTIVE_USER);
      mockBcryptCompare.mockResolvedValue(true);
      mockCompanyFindUnique.mockResolvedValue({ mfaRequired: true });
      const fd = makeFormData({ email: "test@example.com", password: "pass123", locale: "en" });
      await expect(authenticateInternalUser(PREV_STATE, fd)).rejects.toMatchObject({
        message: "NEXT_REDIRECT",
        url: "/en/auth/mfa-setup-required",
      });
      expect(mockSetMfaSetupPendingCookie).toHaveBeenCalled();
    });

    it("redirects to mfa-setup-required when user mfaEnforced=true", async () => {
      mockUserFindFirst.mockResolvedValue({ ...ACTIVE_USER, mfaEnforced: true });
      mockBcryptCompare.mockResolvedValue(true);
      mockCompanyFindUnique.mockResolvedValue({ mfaRequired: false });
      const fd = makeFormData({ email: "test@example.com", password: "pass123", locale: "en" });
      await expect(authenticateInternalUser(PREV_STATE, fd)).rejects.toMatchObject({
        message: "NEXT_REDIRECT",
        url: "/en/auth/mfa-setup-required",
      });
      expect(mockSetMfaSetupPendingCookie).toHaveBeenCalled();
    });

    it("SSO user skips MFA setup even if mfaEnforced=true → creates session", async () => {
      mockUserFindFirst.mockResolvedValue({ ...ACTIVE_USER, mfaEnforced: true, ssoProviderId: "sso-1" });
      mockBcryptCompare.mockResolvedValue(true);
      mockCompanyFindUnique.mockResolvedValue({ mfaRequired: false });
      const fd = makeFormData({ email: "test@example.com", password: "pass123", locale: "en" });
      const result = await authenticateInternalUser(PREV_STATE, fd);
      expect(result).toEqual({ error: null, redirectTo: "/en/dashboard" });
      expect(mockCreateSessionForUser).toHaveBeenCalled();
      expect(mockSetMfaSetupPendingCookie).not.toHaveBeenCalled();
    });

    it("returns redirectTo on successful login", async () => {
      mockUserFindFirst.mockResolvedValue(ACTIVE_USER);
      mockBcryptCompare.mockResolvedValue(true);
      const fd = makeFormData({ email: "test@example.com", password: "pass123", locale: "en" });
      const result = await authenticateInternalUser(PREV_STATE, fd);
      expect(result).toEqual({ error: null, redirectTo: "/en/dashboard" });
      expect(mockCreateSessionForUser).toHaveBeenCalled();
      expect(mockSetAuthSessionCookie).toHaveBeenCalled();
      expect(mockResetFailures).toHaveBeenCalledWith("ial:127.0.0.1");
    });

    it("uses safe nextPath when canAccessPath returns true", async () => {
      mockUserFindFirst.mockResolvedValue(ACTIVE_USER);
      mockBcryptCompare.mockResolvedValue(true);
      mockCanAccessPath.mockReturnValue(true);
      const fd = makeFormData({ email: "test@example.com", password: "pass123", locale: "en", next: "/vendors" });
      const result = await authenticateInternalUser(PREV_STATE, fd);
      expect(mockCanAccessPath).toHaveBeenCalledWith("AUDITOR", "/vendors");
      expect(result.redirectTo).toBe("/en/vendors");
    });

    it("falls back to landing path when canAccessPath returns false", async () => {
      mockUserFindFirst.mockResolvedValue(ACTIVE_USER);
      mockBcryptCompare.mockResolvedValue(true);
      mockCanAccessPath.mockReturnValue(false);
      const fd = makeFormData({ email: "test@example.com", password: "pass123", locale: "en", next: "/admin" });
      const result = await authenticateInternalUser(PREV_STATE, fd);
      expect(result.redirectTo).toBe("/en/dashboard");
    });

    it("normalizes invalid locale to 'de'", async () => {
      mockUserFindFirst.mockResolvedValue(ACTIVE_USER);
      mockBcryptCompare.mockResolvedValue(true);
      mockGetLocalizedLandingPath.mockReturnValue("/de/dashboard");
      const fd = makeFormData({ email: "test@example.com", password: "pass123", locale: "fr" });
      const result = await authenticateInternalUser(PREV_STATE, fd);
      expect(result.redirectTo).toBe("/de/dashboard");
    });
  });

  describe("signOutAction", () => {
    it("revokes session and calls clearAuthSessionCookie", async () => {
      const mockCookieStore = { get: vi.fn().mockReturnValue({ value: "session-token" }) };
      mockCookies.mockResolvedValue(mockCookieStore);
      mockAuthSessionUpdateMany.mockResolvedValue({ count: 1 });
      const fd = makeFormData({ locale: "en" });
      await expect(signOutAction(fd)).rejects.toMatchObject({ message: "NEXT_REDIRECT" });
      expect(mockAuthSessionUpdateMany).toHaveBeenCalledWith({
        where: { tokenHash: "test-hash", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockClearAuthSessionCookie).toHaveBeenCalled();
    });

    it("clears cookie and redirects even when no auth cookie is present", async () => {
      const mockCookieStore = { get: vi.fn().mockReturnValue(undefined) };
      mockCookies.mockResolvedValue(mockCookieStore);
      const fd = makeFormData({ locale: "en" });

      await expect(signOutAction(fd)).rejects.toMatchObject({ message: "NEXT_REDIRECT" });

      expect(mockAuthSessionUpdateMany).not.toHaveBeenCalled();
      expect(mockClearAuthSessionCookie).toHaveBeenCalled();
    });
  });
});
