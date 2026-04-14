import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// --- Hoisted mock references ------------------------------------------------
const {
  mockRedirect,
  mockRevalidatePath,
  mockHeaders,
  mockCookies,
  mockUserFindUnique,
  mockUserUpdate,
  mockUserUpdateMany,
  mockCompanyUpdate,
  mockVendorFindUnique,
  mockVendorUpdate,
  mockRequireUserRole,
  mockRequireAuthSession,
  mockCanAccessPath,
  mockGetLocalizedLandingPath,
  mockCreateSessionForUser,
  mockSetAuthSessionCookie,
  mockGetMfaPendingClaims,
  mockClearMfaPendingCookie,
  mockGetMfaSetupPendingClaims,
  mockClearMfaSetupPendingCookie,
  mockGetVendorMfaPendingClaims,
  mockClearVendorMfaPendingCookie,
  mockVerifyTotpToken,
  mockGenerateRecoveryCodes,
  mockVerifyAndConsumeRecoveryCode,
  mockEncryptMfaSecret,
  mockGenerateTotpSecret,
  mockGenerateTotpUri,
  mockIsRateLimited,
  mockRegisterFailure,
  mockResetFailures,
  mockReadClientIp,
  mockShouldSecureCookie,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  mockRevalidatePath: vi.fn(),
  mockHeaders: vi.fn(),
  mockCookies: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserUpdateMany: vi.fn(),
  mockCompanyUpdate: vi.fn(),
  mockVendorFindUnique: vi.fn(),
  mockVendorUpdate: vi.fn(),
  mockRequireUserRole: vi.fn(),
  mockRequireAuthSession: vi.fn(),
  mockCanAccessPath: vi.fn().mockReturnValue(true),
  mockGetLocalizedLandingPath: vi.fn().mockReturnValue("/en/dashboard"),
  mockCreateSessionForUser: vi.fn(),
  mockSetAuthSessionCookie: vi.fn(),
  mockGetMfaPendingClaims: vi.fn(),
  mockClearMfaPendingCookie: vi.fn(),
  mockGetMfaSetupPendingClaims: vi.fn(),
  mockClearMfaSetupPendingCookie: vi.fn(),
  mockGetVendorMfaPendingClaims: vi.fn(),
  mockClearVendorMfaPendingCookie: vi.fn(),
  mockVerifyTotpToken: vi.fn(),
  mockGenerateRecoveryCodes: vi.fn(),
  mockVerifyAndConsumeRecoveryCode: vi.fn(),
  mockEncryptMfaSecret: vi.fn(),
  mockGenerateTotpSecret: vi.fn(),
  mockGenerateTotpUri: vi.fn(),
  mockIsRateLimited: vi.fn().mockReturnValue(false),
  mockRegisterFailure: vi.fn(),
  mockResetFailures: vi.fn(),
  mockReadClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  mockShouldSecureCookie: vi.fn().mockReturnValue(false),
}));

// --- Module mocks -----------------------------------------------------------
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
      update: mockUserUpdate,
      updateMany: mockUserUpdateMany,
    },
    company: { update: mockCompanyUpdate },
    vendor: {
      findUnique: mockVendorFindUnique,
      update: mockVendorUpdate,
    },
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
  canAccessPath: mockCanAccessPath,
}));
vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: mockIsRateLimited,
  registerFailure: mockRegisterFailure,
  resetFailures: mockResetFailures,
  readClientIp: mockReadClientIp,
}));
vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: { auth: vi.fn() },
}));
vi.mock("@/lib/audit-sanitize", () => ({
  truncateIp: (ip: string) => ip,
}));

// --- Import action functions ------------------------------------------------
import {
  setUserMfaEnforced,
  setOrgMfaRequired,
  completeForcedMfaSetup,
  verifyMfaAndAuthenticate,
  verifyVendorMfaAndAuthenticate,
} from "@/app/actions/mfa";

// --- Shared fixtures --------------------------------------------------------
function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

const DEFAULT_SESSION = {
  userId: "admin-1",
  companyId: "co-1",
  role: "ADMIN" as const,
  email: "admin@example.com",
  vendorId: null,
};

const DEFAULT_PENDING_CLAIMS = {
  uid: "user-1",
  next: "/en/dashboard",
  locale: "en",
  exp: Date.now() + 300_000,
};

const DEFAULT_VENDOR_PENDING_CLAIMS = {
  uid: "vendor-user-1",
  locale: "en",
  exp: Date.now() + 300_000,
};

const DEFAULT_MFA_USER = {
  id: "user-1",
  role: "AUDITOR" as const,
  companyId: "co-1",
  vendorId: null,
  mfaEnabled: true,
  mfaSecret: "encrypted-secret",
  mfaRecoveryCodes: ["hash1", "hash2", "hash3"],
};

// --- beforeEach / afterEach -------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  // Restore defaults after clearAllMocks
  mockCanAccessPath.mockReturnValue(true);
  mockGetLocalizedLandingPath.mockReturnValue("/en/dashboard");
  mockIsRateLimited.mockReturnValue(false);
  mockReadClientIp.mockReturnValue("127.0.0.1");
  mockShouldSecureCookie.mockReturnValue(false);
  mockCreateSessionForUser.mockResolvedValue({ token: "session-token", expiresAt: new Date() });
  mockSetAuthSessionCookie.mockResolvedValue(undefined);
  mockClearMfaPendingCookie.mockResolvedValue(undefined);
  mockClearMfaSetupPendingCookie.mockResolvedValue(undefined);
  mockClearVendorMfaPendingCookie.mockResolvedValue(undefined);
  mockRevalidatePath.mockReturnValue(undefined);
  mockVerifyAndConsumeRecoveryCode.mockResolvedValue(-1);
  mockGenerateRecoveryCodes.mockResolvedValue({
    plaintext: Array.from({ length: 10 }, (_, i) => `CODE${i}-00000000-00000000-00000000`),
    hashed: Array.from({ length: 10 }, (_, i) => `$2b$10$hash${i}`),
  });
  mockHeaders.mockResolvedValue({ get: vi.fn().mockReturnValue(null) });
  mockCookies.mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    delete: vi.fn(),
  });
  vi.stubEnv("MFA_ENCRYPTION_KEY", "aa".repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// describe("setUserMfaEnforced")
// ---------------------------------------------------------------------------
describe("setUserMfaEnforced", () => {
  it("throws FORBIDDEN when targetUser is not found", async () => {
    mockRequireUserRole.mockResolvedValue(DEFAULT_SESSION);
    mockUserFindUnique.mockResolvedValue(null);
    await expect(setUserMfaEnforced("unknown-id", true)).rejects.toThrow("FORBIDDEN");
  });

  it("throws FORBIDDEN when target user is in a different company (tenant isolation)", async () => {
    mockRequireUserRole.mockResolvedValue(DEFAULT_SESSION);
    mockUserFindUnique.mockResolvedValue({ id: "user-2", companyId: "co-OTHER", role: "AUDITOR" });
    await expect(setUserMfaEnforced("user-2", true)).rejects.toThrow("FORBIDDEN");
  });

  it("throws FORBIDDEN when session has no companyId", async () => {
    mockRequireUserRole.mockResolvedValue({ ...DEFAULT_SESSION, companyId: null });
    mockUserFindUnique.mockResolvedValue({ id: "user-2", companyId: "co-1", role: "AUDITOR" });
    await expect(setUserMfaEnforced("user-2", true)).rejects.toThrow("FORBIDDEN");
  });

  it("throws CANNOT_ENFORCE_ADMIN when target user has ADMIN role", async () => {
    mockRequireUserRole.mockResolvedValue(DEFAULT_SESSION);
    mockUserFindUnique.mockResolvedValue({ id: "user-2", companyId: "co-1", role: "ADMIN" });
    await expect(setUserMfaEnforced("user-2", true)).rejects.toThrow("CANNOT_ENFORCE_ADMIN");
  });

  it("throws CANNOT_ENFORCE_ADMIN when target user has SUPER_ADMIN role", async () => {
    mockRequireUserRole.mockResolvedValue(DEFAULT_SESSION);
    mockUserFindUnique.mockResolvedValue({ id: "user-2", companyId: "co-1", role: "SUPER_ADMIN" });
    await expect(setUserMfaEnforced("user-2", true)).rejects.toThrow("CANNOT_ENFORCE_ADMIN");
  });

  it("updates mfaEnforced to true and returns { success: true }", async () => {
    mockRequireUserRole.mockResolvedValue(DEFAULT_SESSION);
    mockUserFindUnique.mockResolvedValue({ id: "user-2", companyId: "co-1", role: "AUDITOR" });
    mockUserUpdate.mockResolvedValue({});

    const result = await setUserMfaEnforced("user-2", true);

    expect(result).toEqual({ success: true });
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-2" }, data: { mfaEnforced: true } }),
    );
  });

  it("updates mfaEnforced to false and returns { success: true }", async () => {
    mockRequireUserRole.mockResolvedValue(DEFAULT_SESSION);
    mockUserFindUnique.mockResolvedValue({ id: "user-2", companyId: "co-1", role: "AUDITOR" });
    mockUserUpdate.mockResolvedValue({});

    const result = await setUserMfaEnforced("user-2", false);

    expect(result).toEqual({ success: true });
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mfaEnforced: false } }),
    );
  });

  it("propagates error when requireUserRole rejects (caller lacks privilege)", async () => {
    mockRequireUserRole.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(setUserMfaEnforced("user-2", true)).rejects.toThrow("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// describe("setOrgMfaRequired")
// ---------------------------------------------------------------------------
describe("setOrgMfaRequired", () => {
  it("throws FORBIDDEN when session has no companyId", async () => {
    mockRequireUserRole.mockResolvedValue({ ...DEFAULT_SESSION, companyId: null });
    await expect(setOrgMfaRequired(true)).rejects.toThrow("FORBIDDEN");
  });

  it("throws ADMIN_MFA_NOT_ENROLLED when required=true and admin has no MFA", async () => {
    mockRequireUserRole.mockResolvedValue(DEFAULT_SESSION);
    mockUserFindUnique.mockResolvedValue({ mfaEnabled: false });
    await expect(setOrgMfaRequired(true)).rejects.toThrow("ADMIN_MFA_NOT_ENROLLED");
  });

  it("enables org MFA when admin has MFA enrolled", async () => {
    mockRequireUserRole.mockResolvedValue(DEFAULT_SESSION);
    mockUserFindUnique.mockResolvedValue({ mfaEnabled: true });
    mockCompanyUpdate.mockResolvedValue({});

    const result = await setOrgMfaRequired(true);

    expect(result).toEqual({ success: true });
    expect(mockCompanyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "co-1" }, data: { mfaRequired: true } }),
    );
  });

  it("disables org MFA regardless of admin MFA enrollment status", async () => {
    mockRequireUserRole.mockResolvedValue(DEFAULT_SESSION);
    mockUserFindUnique.mockResolvedValue({ mfaEnabled: false });
    mockCompanyUpdate.mockResolvedValue({});

    const result = await setOrgMfaRequired(false);

    expect(result).toEqual({ success: true });
    expect(mockCompanyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mfaRequired: false } }),
    );
  });
});

// ---------------------------------------------------------------------------
// describe("completeForcedMfaSetup")
// ---------------------------------------------------------------------------
describe("completeForcedMfaSetup", () => {
  const makeSetupForm = (token = "123456") =>
    makeFormData({ token });

  it("returns SETUP_SESSION_EXPIRED when no setup-pending cookie", async () => {
    mockGetMfaSetupPendingClaims.mockResolvedValue(null);
    const result = await completeForcedMfaSetup(null, makeSetupForm());
    expect(result).toEqual({ error: "SETUP_SESSION_EXPIRED" });
  });

  it("returns ACCOUNT_DISABLED when user not found", async () => {
    mockGetMfaSetupPendingClaims.mockResolvedValue({ uid: "user-1", locale: "en", exp: Date.now() + 300_000 });
    mockUserFindUnique.mockResolvedValue(null);
    const result = await completeForcedMfaSetup(null, makeSetupForm());
    expect(result).toEqual({ error: "ACCOUNT_DISABLED" });
  });

  it("returns NO_MFA_SECRET when user has no stored MFA secret", async () => {
    mockGetMfaSetupPendingClaims.mockResolvedValue({ uid: "user-1", locale: "en", exp: Date.now() + 300_000 });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1", mfaSecret: null, mfaEnabled: false, role: "AUDITOR", companyId: "co-1", vendorId: null,
    });
    const result = await completeForcedMfaSetup(null, makeSetupForm());
    expect(result).toEqual({ error: "NO_MFA_SECRET" });
  });

  it("returns INVALID_MFA_TOKEN when TOTP token is wrong", async () => {
    mockGetMfaSetupPendingClaims.mockResolvedValue({ uid: "user-1", locale: "en", exp: Date.now() + 300_000 });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1", mfaSecret: "enc", mfaEnabled: false, role: "AUDITOR", companyId: "co-1", vendorId: null,
    });
    mockVerifyTotpToken.mockReturnValue(false);
    const result = await completeForcedMfaSetup(null, makeSetupForm());
    expect(result).toEqual({ error: "INVALID_MFA_TOKEN" });
  });

  it("returns ALREADY_ENROLLED when optimistic lock fails (user already enrolled concurrently)", async () => {
    mockGetMfaSetupPendingClaims.mockResolvedValue({ uid: "user-1", locale: "en", exp: Date.now() + 300_000 });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1", mfaSecret: "enc", mfaEnabled: false, role: "AUDITOR", companyId: "co-1", vendorId: null,
    });
    mockVerifyTotpToken.mockReturnValue(true);
    mockUserUpdateMany.mockResolvedValue({ count: 0 });
    const result = await completeForcedMfaSetup(null, makeSetupForm());
    expect(result).toEqual({ error: "ALREADY_ENROLLED" });
  });

  it("returns recovery codes and clears setup cookie on success (non-replayable)", async () => {
    mockGetMfaSetupPendingClaims.mockResolvedValue({ uid: "user-1", locale: "en", exp: Date.now() + 300_000 });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1", mfaSecret: "enc", mfaEnabled: false, role: "AUDITOR", companyId: "co-1", vendorId: null,
    });
    mockVerifyTotpToken.mockReturnValue(true);
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    const result = await completeForcedMfaSetup(null, makeSetupForm());

    expect(result.error).toBeNull();
    expect(result.recoveryCodes).toHaveLength(10);
    expect(mockClearMfaSetupPendingCookie).toHaveBeenCalledTimes(1);
    expect(mockCreateSessionForUser).toHaveBeenCalledTimes(1);
    expect(mockSetAuthSessionCookie).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// describe("verifyMfaAndAuthenticate - TOTP mode")
// ---------------------------------------------------------------------------
describe("verifyMfaAndAuthenticate - TOTP mode", () => {
  const makeTotpForm = (token = "123456") =>
    makeFormData({ mode: "totp", token });

  it("returns MFA_SESSION_EXPIRED when no pending cookie", async () => {
    mockGetMfaPendingClaims.mockResolvedValue(null);
    const result = await verifyMfaAndAuthenticate({ error: null }, makeTotpForm());
    expect(result).toEqual({ error: "MFA_SESSION_EXPIRED" });
  });

  it("returns ACCOUNT_DISABLED and clears cookie when user not found", async () => {
    mockGetMfaPendingClaims.mockResolvedValue(DEFAULT_PENDING_CLAIMS);
    mockUserFindUnique.mockResolvedValue(null);
    const result = await verifyMfaAndAuthenticate({ error: null }, makeTotpForm());
    expect(result).toEqual({ error: "ACCOUNT_DISABLED" });
    expect(mockClearMfaPendingCookie).toHaveBeenCalledTimes(1);
  });

  it("returns MFA_NOT_CONFIGURED and clears cookie when mfaEnabled is false", async () => {
    mockGetMfaPendingClaims.mockResolvedValue(DEFAULT_PENDING_CLAIMS);
    mockUserFindUnique.mockResolvedValue({ ...DEFAULT_MFA_USER, mfaEnabled: false });
    const result = await verifyMfaAndAuthenticate({ error: null }, makeTotpForm());
    expect(result).toEqual({ error: "MFA_NOT_CONFIGURED" });
    expect(mockClearMfaPendingCookie).toHaveBeenCalledTimes(1);
  });

  it("returns INVALID_MFA_TOKEN when TOTP code is wrong", async () => {
    mockGetMfaPendingClaims.mockResolvedValue(DEFAULT_PENDING_CLAIMS);
    mockUserFindUnique.mockResolvedValue(DEFAULT_MFA_USER);
    mockVerifyTotpToken.mockReturnValue(false);
    const result = await verifyMfaAndAuthenticate({ error: null }, makeTotpForm());
    expect(result).toEqual({ error: "INVALID_MFA_TOKEN" });
  });

  it("redirects to safe next path on successful TOTP auth", async () => {
    mockGetMfaPendingClaims.mockResolvedValue(DEFAULT_PENDING_CLAIMS);
    mockUserFindUnique.mockResolvedValue(DEFAULT_MFA_USER);
    mockVerifyTotpToken.mockReturnValue(true);

    await expect(
      verifyMfaAndAuthenticate({ error: null }, makeTotpForm()),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT", url: "/en/dashboard" });
  });

  it("clears pending cookie exactly once on successful TOTP auth (anti-replay via serial cookie lifecycle)", async () => {
    mockGetMfaPendingClaims.mockResolvedValue(DEFAULT_PENDING_CLAIMS);
    mockUserFindUnique.mockResolvedValue(DEFAULT_MFA_USER);
    mockVerifyTotpToken.mockReturnValue(true);

    await expect(
      verifyMfaAndAuthenticate({ error: null }, makeTotpForm()),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT" });

    expect(mockClearMfaPendingCookie).toHaveBeenCalledTimes(1);
  });

  it("post-clear replay: second call with no pending claims returns MFA_SESSION_EXPIRED", async () => {
    // First call succeeds (cookie present)
    mockGetMfaPendingClaims.mockResolvedValueOnce(DEFAULT_PENDING_CLAIMS);
    mockUserFindUnique.mockResolvedValue(DEFAULT_MFA_USER);
    mockVerifyTotpToken.mockReturnValue(true);

    await expect(
      verifyMfaAndAuthenticate({ error: null }, makeTotpForm()),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT" });

    // Second call: cookie cleared (null)
    mockGetMfaPendingClaims.mockResolvedValueOnce(null);
    const result = await verifyMfaAndAuthenticate({ error: null }, makeTotpForm());
    expect(result).toEqual({ error: "MFA_SESSION_EXPIRED" });
  });

  it.fails(
    "TOTP replay: concurrent reuse - same claims presented on both calls both succeed (known gap)",
    async () => {
      // This test documents that the current implementation lacks a per-token
      // consumed flag. Two concurrent requests with the same pending claims and
      // same valid TOTP code will both succeed. The natural protection is serial
      // access through the pending cookie lifecycle; concurrent replay within the
      // 30-second TOTP window is a known risk.
      //
      // A production-grade fix: add User.mfaLastUsedToken + mfaLastUsedAt
      // (DB-level token consumed check) or a per-user in-memory TTL set.
      //
      // it.fails() semantics (Vitest): PASSES CI when the test body fails
      // (documenting the vulnerability is present). FAILS CI when the test body
      // passes (i.e., the vulnerability has been fixed - prompting removal of
      // this it.fails marker).
      mockGetMfaPendingClaims.mockResolvedValue(DEFAULT_PENDING_CLAIMS); // same claims both calls
      mockUserFindUnique.mockResolvedValue(DEFAULT_MFA_USER);
      mockVerifyTotpToken.mockReturnValue(true);

      // First call succeeds
      await expect(
        verifyMfaAndAuthenticate({ error: null }, makeTotpForm()),
      ).rejects.toMatchObject({ message: "NEXT_REDIRECT" });

      // Second call with same claims - should fail if replay is prevented
      // Currently also throws NEXT_REDIRECT (vulnerability present), causing
      // this it.fails() block to PASS CI.
      const result = await verifyMfaAndAuthenticate({ error: null }, makeTotpForm());
      expect(result).toEqual({ error: "INVALID_MFA_TOKEN" }); // will fail -> it.fails() passes
    },
  );
});

// ---------------------------------------------------------------------------
// describe("verifyMfaAndAuthenticate - open-redirect guard")
// ---------------------------------------------------------------------------
describe("verifyMfaAndAuthenticate - open-redirect guard", () => {
  const makeTotpForm = () => makeFormData({ mode: "totp", token: "123456" });

  beforeEach(() => {
    mockUserFindUnique.mockResolvedValue(DEFAULT_MFA_USER);
    mockVerifyTotpToken.mockReturnValue(true);
  });

  it("redirects to claims.next when it is a valid internal path", async () => {
    mockGetMfaPendingClaims.mockResolvedValue({
      ...DEFAULT_PENDING_CLAIMS,
      next: "/en/vendors",
    });
    mockCanAccessPath.mockReturnValue(true);

    await expect(
      verifyMfaAndAuthenticate({ error: null }, makeTotpForm()),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT", url: "/en/vendors" });
  });

  it("redirects to landing page when canAccessPath returns false for claims.next", async () => {
    mockGetMfaPendingClaims.mockResolvedValue({
      ...DEFAULT_PENDING_CLAIMS,
      next: "/en/admin/secret",
    });
    mockCanAccessPath.mockReturnValue(false);

    await expect(
      verifyMfaAndAuthenticate({ error: null }, makeTotpForm()),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT", url: "/en/dashboard" });
  });

  it("blocks absolute URL open-redirect: https://evil.com -> landing page", async () => {
    mockGetMfaPendingClaims.mockResolvedValue({
      ...DEFAULT_PENDING_CLAIMS,
      next: "https://evil.com",
    });
    // No canAccessPath mock needed - getSafeNextPath startsWith("/") guard blocks this before canAccessPath

    await expect(
      verifyMfaAndAuthenticate({ error: null }, makeTotpForm()),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT", url: "/en/dashboard" });
    expect(mockRedirect).not.toHaveBeenCalledWith("https://evil.com");
  });

  it("blocks protocol-relative open-redirect: //evil.com -> landing page (fixed by !startsWith('//'))", async () => {
    mockGetMfaPendingClaims.mockResolvedValue({
      ...DEFAULT_PENDING_CLAIMS,
      next: "//evil.com/dashboard",
    });
    // The production getSafeNextPath guard runs end-to-end here.
    // Note: canAccessPath is still mocked (default true) — only the protocol check is the focus.

    await expect(
      verifyMfaAndAuthenticate({ error: null }, makeTotpForm()),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT", url: "/en/dashboard" });
    expect(mockRedirect).not.toHaveBeenCalledWith("//evil.com/dashboard");
  });
});

// ---------------------------------------------------------------------------
// describe("verifyMfaAndAuthenticate - recovery code mode")
// ---------------------------------------------------------------------------
describe("verifyMfaAndAuthenticate - recovery code mode", () => {
  const makeRecoveryForm = (code = "AABBCCDD-11223344-55667788-99AABBCC") =>
    makeFormData({ mode: "recovery", token: code });

  beforeEach(() => {
    mockGetMfaPendingClaims.mockResolvedValue(DEFAULT_PENDING_CLAIMS);
    mockUserFindUnique.mockResolvedValue(DEFAULT_MFA_USER);
  });

  it("returns MFA_SESSION_EXPIRED when no pending cookie in recovery mode", async () => {
    mockGetMfaPendingClaims.mockResolvedValue(null);
    const result = await verifyMfaAndAuthenticate({ error: null }, makeRecoveryForm());
    expect(result).toEqual({ error: "MFA_SESSION_EXPIRED" });
  });

  it("returns RECOVERY_CODE_INVALID immediately when bucket is rate-limited", async () => {
    mockIsRateLimited.mockReturnValue(true);
    const result = await verifyMfaAndAuthenticate({ error: null }, makeRecoveryForm());
    expect(result).toEqual({ error: "RECOVERY_CODE_INVALID" });
    expect(mockVerifyAndConsumeRecoveryCode).not.toHaveBeenCalled();
  });

  it("registers failure with correct args and returns RECOVERY_CODE_INVALID for invalid code", async () => {
    mockVerifyAndConsumeRecoveryCode.mockResolvedValue(-1);
    const result = await verifyMfaAndAuthenticate({ error: null }, makeRecoveryForm());
    expect(result).toEqual({ error: "RECOVERY_CODE_INVALID" });
    expect(mockRegisterFailure).toHaveBeenCalledWith("rcv:user-1", {
      maxFailures: 3,
      blockMs: 900_000,
    });
  });

  it("registers failure and returns RECOVERY_CODE_INVALID when optimistic lock loses race (count=0)", async () => {
    mockVerifyAndConsumeRecoveryCode.mockResolvedValue(0);
    mockUserUpdateMany.mockResolvedValue({ count: 0 });
    const result = await verifyMfaAndAuthenticate({ error: null }, makeRecoveryForm());
    expect(result).toEqual({ error: "RECOVERY_CODE_INVALID" });
    expect(mockRegisterFailure).toHaveBeenCalledWith("rcv:user-1", {
      maxFailures: 3,
      blockMs: 900_000,
    });
  });

  it("rate-limit sequence: blocked on 4th attempt after 3 wrong codes register failures", async () => {
    mockVerifyAndConsumeRecoveryCode.mockResolvedValue(-1);

    // Attempts 1-3: wrong code, isRateLimited stays false
    for (let i = 0; i < 3; i++) {
      mockIsRateLimited.mockReturnValueOnce(false);
      const r = await verifyMfaAndAuthenticate({ error: null }, makeRecoveryForm("WRONG"));
      expect(r).toEqual({ error: "RECOVERY_CODE_INVALID" });
    }
    expect(mockRegisterFailure).toHaveBeenCalledTimes(3);

    // Attempt 4: bucket now full
    mockIsRateLimited.mockReturnValueOnce(true);
    const blocked = await verifyMfaAndAuthenticate({ error: null }, makeRecoveryForm("WRONG"));
    expect(blocked).toEqual({ error: "RECOVERY_CODE_INVALID" });
    expect(mockVerifyAndConsumeRecoveryCode).toHaveBeenCalledTimes(3); // NOT called on 4th
  });

  it("resets failures and redirects on successful recovery code consumption", async () => {
    mockVerifyAndConsumeRecoveryCode.mockResolvedValue(1);
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      verifyMfaAndAuthenticate({ error: null }, makeRecoveryForm()),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT" });

    expect(mockResetFailures).toHaveBeenCalledWith("rcv:user-1");
    expect(mockClearMfaPendingCookie).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// describe("verifyVendorMfaAndAuthenticate - TOTP mode")
// ---------------------------------------------------------------------------
describe("verifyVendorMfaAndAuthenticate - TOTP mode", () => {
  const FUTURE = new Date(Date.now() + 1_000_000_000);
  const makeTotpForm = (token = "123456") =>
    makeFormData({ mode: "totp", token });

  const VENDOR_USER = {
    id: "vendor-user-1",
    role: "VENDOR" as const,
    companyId: "co-1",
    vendorId: "vendor-1",
    mfaEnabled: true,
    mfaSecret: "vendor-enc-secret",
    mfaRecoveryCodes: ["vh1", "vh2"],
  };

  beforeEach(() => {
    mockGetVendorMfaPendingClaims.mockResolvedValue(DEFAULT_VENDOR_PENDING_CLAIMS);
    mockUserFindUnique.mockResolvedValue(VENDOR_USER);
    mockVerifyTotpToken.mockReturnValue(true);
    mockVendorFindUnique.mockResolvedValue({ id: "vendor-1", codeExpiresAt: FUTURE });
    mockVendorUpdate.mockResolvedValue({});
  });

  it("returns MFA_SESSION_EXPIRED when no vendor pending cookie", async () => {
    mockGetVendorMfaPendingClaims.mockResolvedValue(null);
    const result = await verifyVendorMfaAndAuthenticate({ error: null }, makeTotpForm());
    expect(result).toEqual({ error: "MFA_SESSION_EXPIRED" });
  });

  it("returns ACCOUNT_DISABLED and clears cookie when user not found", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const result = await verifyVendorMfaAndAuthenticate({ error: null }, makeTotpForm());
    expect(result).toEqual({ error: "ACCOUNT_DISABLED" });
    expect(mockClearVendorMfaPendingCookie).toHaveBeenCalledTimes(1);
  });

  it("returns MFA_NOT_CONFIGURED and clears cookie when mfaEnabled is false", async () => {
    mockUserFindUnique.mockResolvedValue({ ...VENDOR_USER, mfaEnabled: false });
    const result = await verifyVendorMfaAndAuthenticate({ error: null }, makeTotpForm());
    expect(result).toEqual({ error: "MFA_NOT_CONFIGURED" });
    expect(mockClearVendorMfaPendingCookie).toHaveBeenCalledTimes(1);
  });

  it("returns INVALID_MFA_TOKEN when TOTP code is wrong", async () => {
    mockVerifyTotpToken.mockReturnValue(false);
    const result = await verifyVendorMfaAndAuthenticate({ error: null }, makeTotpForm());
    expect(result).toEqual({ error: "INVALID_MFA_TOKEN" });
  });

  it("returns ACCOUNT_DISABLED when user has no vendorId", async () => {
    mockUserFindUnique.mockResolvedValue({ ...VENDOR_USER, vendorId: null });
    const result = await verifyVendorMfaAndAuthenticate({ error: null }, makeTotpForm());
    expect(result).toEqual({ error: "ACCOUNT_DISABLED" });
  });

  it("returns ACCOUNT_DISABLED when vendor access code is expired", async () => {
    mockVendorFindUnique.mockResolvedValue({
      id: "vendor-1",
      codeExpiresAt: new Date(Date.now() - 1000),
    });
    const result = await verifyVendorMfaAndAuthenticate({ error: null }, makeTotpForm());
    expect(result).toEqual({ error: "ACCOUNT_DISABLED" });
  });

  it("redirects to /[locale]/external/assessment/[token] on success (destination is server-generated, not user input)", async () => {
    await expect(
      verifyVendorMfaAndAuthenticate({ error: null }, makeTotpForm()),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT" });

    const redirectUrl: string = (mockRedirect.mock.calls[0] as [string])[0];
    expect(redirectUrl).toMatch(/^\/en\/external\/assessment\//);
    // Verify the URL is NOT the vendor pending claims uid or any user-supplied value
    expect(redirectUrl).not.toContain("vendor-user-1");
  });
});

// ---------------------------------------------------------------------------
// describe("verifyVendorMfaAndAuthenticate - recovery code mode")
// ---------------------------------------------------------------------------
describe("verifyVendorMfaAndAuthenticate - recovery code mode", () => {
  const FUTURE = new Date(Date.now() + 1_000_000_000);
  const makeRecoveryForm = (code = "AABBCCDD-11223344-55667788-99AABBCC") =>
    makeFormData({ mode: "recovery", token: code });

  const VENDOR_USER = {
    id: "vendor-user-1",
    role: "VENDOR" as const,
    companyId: "co-1",
    vendorId: "vendor-1",
    mfaEnabled: true,
    mfaSecret: "vendor-enc-secret",
    mfaRecoveryCodes: ["vh1", "vh2"],
  };

  beforeEach(() => {
    mockGetVendorMfaPendingClaims.mockResolvedValue(DEFAULT_VENDOR_PENDING_CLAIMS);
    mockUserFindUnique.mockResolvedValue(VENDOR_USER);
    mockVendorFindUnique.mockResolvedValue({ id: "vendor-1", codeExpiresAt: FUTURE });
    mockVendorUpdate.mockResolvedValue({});
  });

  it("returns RECOVERY_CODE_INVALID when bucket is rate-limited", async () => {
    mockIsRateLimited.mockReturnValue(true);
    const result = await verifyVendorMfaAndAuthenticate({ error: null }, makeRecoveryForm());
    expect(result).toEqual({ error: "RECOVERY_CODE_INVALID" });
  });

  it("registers failure and returns RECOVERY_CODE_INVALID for invalid code", async () => {
    mockVerifyAndConsumeRecoveryCode.mockResolvedValue(-1);
    const result = await verifyVendorMfaAndAuthenticate({ error: null }, makeRecoveryForm());
    expect(result).toEqual({ error: "RECOVERY_CODE_INVALID" });
    expect(mockRegisterFailure).toHaveBeenCalledWith(
      "rcv:vendor-user-1",
      expect.objectContaining({ maxFailures: 3, blockMs: 900_000 }),
    );
  });

  it("resets failures and redirects on successful recovery code consumption", async () => {
    mockVerifyAndConsumeRecoveryCode.mockResolvedValue(0);
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      verifyVendorMfaAndAuthenticate({ error: null }, makeRecoveryForm()),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT" });

    expect(mockResetFailures).toHaveBeenCalledWith("rcv:vendor-user-1");
    expect(mockClearVendorMfaPendingCookie).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// describe("verifyVendorMfaAndAuthenticate - redirect destination is never user-controlled")
// ---------------------------------------------------------------------------
describe("verifyVendorMfaAndAuthenticate - redirect destination", () => {
  const FUTURE = new Date(Date.now() + 1_000_000_000);
  const makeTotpForm = () => makeFormData({ mode: "totp", token: "123456" });

  it("redirect path is always /[locale]/external/assessment/[server-generated-token], never user-supplied", async () => {
    mockGetVendorMfaPendingClaims.mockResolvedValue(DEFAULT_VENDOR_PENDING_CLAIMS);
    mockUserFindUnique.mockResolvedValue({
      id: "vendor-user-1", role: "VENDOR", companyId: "co-1", vendorId: "vendor-1",
      mfaEnabled: true, mfaSecret: "enc", mfaRecoveryCodes: [],
    });
    mockVerifyTotpToken.mockReturnValue(true);
    mockVendorFindUnique.mockResolvedValue({ id: "vendor-1", codeExpiresAt: FUTURE });
    mockVendorUpdate.mockResolvedValue({});

    await expect(
      verifyVendorMfaAndAuthenticate({ error: null }, makeTotpForm()),
    ).rejects.toMatchObject({ message: "NEXT_REDIRECT" });

    const url: string = (mockRedirect.mock.calls[0] as [string])[0];
    // The destination always follows /locale/external/assessment/<token>
    expect(url).toMatch(/^\/en\/external\/assessment\/[a-f0-9]+$/);
  });
});
