import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  mockRevalidatePath,
  mockUserFindUniqueOrThrow,
  mockUserUpdate,
  mockUserFindUnique,
  mockUserCreate,
  mockUserUpdateInTx,
  mockAuthSessionUpdateMany,
  mockPrismaTransaction,
  mockRequireAdminUser,
  mockLogAuditEvent,
  mockSendMail,
  mockBuildUserInviteEmail,
} = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockUserFindUniqueOrThrow: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdateInTx: vi.fn(),
  mockAuthSessionUpdateMany: vi.fn(),
  mockPrismaTransaction: vi.fn(),
  mockRequireAdminUser: vi.fn(),
  mockLogAuditEvent: vi.fn(),
  mockSendMail: vi.fn(),
  mockBuildUserInviteEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: mockUserFindUniqueOrThrow,
      update: mockUserUpdate,
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
    },
    authSession: { updateMany: mockAuthSessionUpdateMany },
    $transaction: mockPrismaTransaction,
  },
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/auth/server", () => ({ requireAdminUser: mockRequireAdminUser }));
vi.mock("@/lib/structured-logger", () => ({ AuditLogger: { accessControl: vi.fn() } }));
vi.mock("@/lib/auth/constants", () => ({ INVITE_TOKEN_EXPIRES_MS: 48 * 60 * 60 * 1000 }));
// Mock dynamic imports used inside createInternalUser
vi.mock("@/components/emails/user-invite", () => ({ buildUserInviteEmail: mockBuildUserInviteEmail }));
vi.mock("@/lib/mail", () => ({ sendMail: mockSendMail }));

import { updateUserRole, createInternalUser, deleteUser } from "@/app/actions/iam";

const ADMIN_SESSION = { userId: "admin1", companyId: "co1", role: "ADMIN" as const, email: "admin@example.com" };

describe("iam actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminUser.mockResolvedValue(ADMIN_SESSION);
    mockPrismaTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          user: { update: mockUserUpdateInTx, findUniqueOrThrow: mockUserFindUniqueOrThrow },
          authSession: { updateMany: mockAuthSessionUpdateMany },
        }),
    );
    mockLogAuditEvent.mockResolvedValue(undefined);
    mockSendMail.mockResolvedValue({ ok: true });
    mockBuildUserInviteEmail.mockReturnValue({ subject: "Invite", html: "<html />" });
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  describe("updateUserRole", () => {
    it("throws SELF_ROLE_CHANGE_FORBIDDEN when targeting own userId", async () => {
      await expect(updateUserRole("admin1", "AUDITOR")).rejects.toThrow("SELF_ROLE_CHANGE_FORBIDDEN");
    });

    it("throws MISSING_COMPANY_CONTEXT when session has no companyId", async () => {
      mockRequireAdminUser.mockResolvedValue({ ...ADMIN_SESSION, companyId: null });
      await expect(updateUserRole("u2", "AUDITOR")).rejects.toThrow("MISSING_COMPANY_CONTEXT");
    });

    it("updates role and calls logAuditEvent", async () => {
      mockUserFindUniqueOrThrow.mockResolvedValue({ id: "u2", role: "AUDITOR" });
      mockUserUpdate.mockResolvedValue({});
      const result = await updateUserRole("u2", "RISK_REVIEWER");
      expect(result).toEqual({ success: true });
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "u2" }, data: { role: "RISK_REVIEWER" } }),
      );
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "USER_ROLE_CHANGED", companyId: "co1" }),
        expect.anything(),
      );
    });

    it("calls revalidatePath('/dashboard/users') on success", async () => {
      mockUserFindUniqueOrThrow.mockResolvedValue({ id: "u2", role: "AUDITOR" });
      mockUserUpdate.mockResolvedValue({});
      await updateUserRole("u2", "RISK_REVIEWER");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/users");
    });

    it("propagates error when requireAdminUser rejects", async () => {
      mockRequireAdminUser.mockRejectedValue(new Error("Unauthorized"));
      await expect(updateUserRole("u2", "AUDITOR")).rejects.toThrow("Unauthorized");
    });
  });

  describe("createInternalUser", () => {
    it("throws MISSING_COMPANY_CONTEXT when admin session has no companyId", async () => {
      mockRequireAdminUser.mockResolvedValue({ ...ADMIN_SESSION, companyId: null });
      await expect(createInternalUser("new@example.com", "AUDITOR")).rejects.toThrow("MISSING_COMPANY_CONTEXT");
    });

    it("throws EMAIL_ALREADY_EXISTS when user has passwordHash (active user)", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "u1", passwordHash: "$2b$12$hash", inviteToken: null });
      await expect(createInternalUser("existing@example.com", "AUDITOR")).rejects.toThrow("EMAIL_ALREADY_EXISTS");
    });

    it("creates new user with hashed invite token (not plaintext)", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({ id: "u2" });
      await createInternalUser("new@example.com", "AUDITOR");
      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "new@example.com",
            // inviteToken is a SHA-256 hash (64 hex chars)
            inviteToken: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
      );
    });

    it("regenerates invite for existing unactivated user (no passwordHash)", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "u1", passwordHash: null, inviteToken: "old-hash" });
      mockUserUpdate.mockResolvedValue({ id: "u1" });
      await createInternalUser("pending@example.com", "AUDITOR");
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u1" },
          data: expect.objectContaining({ inviteToken: expect.stringMatching(/^[a-f0-9]{64}$/) }),
        }),
      );
      expect(mockUserCreate).not.toHaveBeenCalled();
    });

    it("calls sendMail with invite URL containing token param", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({ id: "u2" });
      await createInternalUser("new@example.com", "AUDITOR");
      expect(mockBuildUserInviteEmail).toHaveBeenCalledWith(
        expect.objectContaining({ inviteUrl: expect.stringContaining("token=") }),
      );
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "new@example.com" }),
      );
    });

    it("throws MAIL_DELIVERY_FAILED when sendMail returns ok: false", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({ id: "u2" });
      mockSendMail.mockResolvedValue({ ok: false, error: "SMTP error" });
      await expect(createInternalUser("new@example.com", "AUDITOR")).rejects.toThrow("MAIL_DELIVERY_FAILED");
    });

    it("normalizes email to lowercase", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({ id: "u2" });
      await createInternalUser("NEW@EXAMPLE.COM", "AUDITOR");
      expect(mockUserFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: "new@example.com" } }),
      );
    });
  });

  describe("deleteUser", () => {
    it("throws SELF_DELETE_FORBIDDEN when targeting own userId", async () => {
      await expect(deleteUser("admin1")).rejects.toThrow("SELF_DELETE_FORBIDDEN");
    });

    it("throws MISSING_COMPANY_CONTEXT when admin session has no companyId", async () => {
      mockRequireAdminUser.mockResolvedValue({ ...ADMIN_SESSION, companyId: null });
      await expect(deleteUser("u2")).rejects.toThrow("MISSING_COMPANY_CONTEXT");
    });

    it("anonymizes email and deactivates user, revokes sessions", async () => {
      mockUserFindUniqueOrThrow.mockResolvedValue({ id: "u2", email: "user2@example.com", role: "AUDITOR", isActive: true });
      mockUserUpdateInTx.mockResolvedValue({});
      mockAuthSessionUpdateMany.mockResolvedValue({ count: 1 });

      const result = await deleteUser("u2");

      expect(result).toEqual({ success: true });
      expect(mockUserUpdateInTx).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u2" },
          data: expect.objectContaining({
            isActive: false,
            email: expect.stringMatching(/^revoked-/),
            passwordHash: null,
          }),
        }),
      );
      expect(mockAuthSessionUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "u2", revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it("calls logAuditEvent with USER_DELETED action", async () => {
      mockUserFindUniqueOrThrow.mockResolvedValue({ id: "u2", email: "user2@example.com", role: "AUDITOR", isActive: true });
      mockUserUpdateInTx.mockResolvedValue({});
      mockAuthSessionUpdateMany.mockResolvedValue({ count: 0 });
      await deleteUser("u2");
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "USER_DELETED", companyId: "co1" }),
        expect.anything(),
      );
    });
  });
});
