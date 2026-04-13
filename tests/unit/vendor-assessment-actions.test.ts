import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockEncrypt,
  mockDecrypt,
  mockRequireAdminUser,
  mockIsAccessControlError,
  mockCountVendorAssessmentQuestions,
  mockSyncAssessmentComplianceToDatabase,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockPrisma: {
    assessment: { findUnique: vi.fn() },
    assessmentAnswer: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
  mockEncrypt: vi.fn().mockImplementation((s: string) => `ENC:${s}`),
  mockDecrypt: vi.fn().mockImplementation((s: string) => `DEC:${s}`),
  mockRequireAdminUser: vi.fn(),
  mockIsAccessControlError: vi.fn().mockReturnValue(false),
  mockCountVendorAssessmentQuestions: vi.fn(),
  mockSyncAssessmentComplianceToDatabase: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/crypto", () => ({ encrypt: mockEncrypt, decrypt: mockDecrypt }));
vi.mock("@/lib/auth/server", () => ({
  requireAdminUser: mockRequireAdminUser,
  isAccessControlError: mockIsAccessControlError,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath, revalidateTag: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/assessment-compliance", () => ({
  syncAssessmentComplianceToDatabase: mockSyncAssessmentComplianceToDatabase,
}));
vi.mock("@/lib/queries/custom-questions", () => ({
  countVendorAssessmentQuestions: mockCountVendorAssessmentQuestions,
}));

import { saveAssessmentAnswer } from "@/app/actions/vendor-assessment-actions";

beforeEach(() => {
  vi.clearAllMocks();

  mockEncrypt.mockImplementation((s: string) => `ENC:${s}`);
  mockDecrypt.mockImplementation((s: string) => `DEC:${s}`);

  mockRequireAdminUser.mockResolvedValue({
    userId: "u1",
    companyId: "co1",
    role: "ADMIN",
  });

  mockPrisma.assessment.findUnique.mockResolvedValue({
    id: "a1",
    vendorId: "v1",
    companyId: "co1",
    complianceScore: 35,
    riskLevel: "LOW",
    vendor: { id: "v1" },
  });

  mockPrisma.assessmentAnswer.findFirst.mockResolvedValue(null);
  mockPrisma.assessmentAnswer.create.mockResolvedValue({ id: "ans1", findings: "ENC:finding text", evidenceSnippet: "ENC:snip" });
  mockPrisma.assessmentAnswer.update.mockResolvedValue({ id: "ans1", findings: "ENC:updated", evidenceSnippet: "ENC:snip" });
  mockPrisma.assessmentAnswer.findMany.mockResolvedValue([{ status: "COMPLIANT" }]);

  mockCountVendorAssessmentQuestions.mockResolvedValue(5);
  mockSyncAssessmentComplianceToDatabase.mockResolvedValue({ score: 70 });
});

describe("saveAssessmentAnswer encryption/decryption behavior", () => {
  it("encrypts findings and evidenceSnippet when creating a new answer", async () => {
    const result = await saveAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "COMPLIANT",
      findings: "finding text",
      evidenceSnippet: "snip",
    });

    expect(result.success).toBe(true);
    expect(mockEncrypt).toHaveBeenCalledWith("finding text");
    expect(mockEncrypt).toHaveBeenCalledWith("snip");

    const data = mockPrisma.assessmentAnswer.create.mock.calls[0][0].data;
    expect(data.findings).toBe("ENC:finding text");
    expect(data.evidenceSnippet).toBe("ENC:snip");
  });

  it("decrypts existing findings before concat on update (decrypt-before-concat)", async () => {
    mockPrisma.assessmentAnswer.findFirst.mockResolvedValueOnce({
      id: "ans1",
      status: "COMPLIANT",
      findings: "aabb1122:ccdd3344:eeff5566",
      evidenceSnippet: null,
    });
    mockDecrypt.mockReturnValueOnce("original AI reasoning");

    const result = await saveAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "NON_COMPLIANT",
      findings: "new findings",
      overrideReason: "manual correction",
    });

    expect(result.success).toBe(true);
    expect(mockDecrypt).toHaveBeenCalledWith("aabb1122:ccdd3344:eeff5566");

    const encryptedFindingArg = mockEncrypt.mock.calls.find((c) => String(c[0]).includes("manual correction"))?.[0];
    expect(String(encryptedFindingArg)).toContain("manual correction");
  });

  it("does not call decrypt when existing findings is null", async () => {
    mockPrisma.assessmentAnswer.findFirst.mockResolvedValueOnce({
      id: "ans1",
      status: "COMPLIANT",
      findings: null,
      evidenceSnippet: null,
    });

    await saveAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "NON_COMPLIANT",
      findings: "new findings",
      overrideReason: "reason",
    });

    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it("does not call decrypt for legacy plaintext findings (not in iv:tag:data format)", async () => {
    mockPrisma.assessmentAnswer.findFirst.mockResolvedValueOnce({
      id: "ans1",
      status: "COMPLIANT",
      findings: "plain old text",
      evidenceSnippet: null,
    });

    await saveAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "NON_COMPLIANT",
      findings: undefined,
      overrideReason: "manual reason",
    });

    expect(mockDecrypt).not.toHaveBeenCalled();
    const encryptedArg = mockEncrypt.mock.calls[0][0] as string;
    expect(encryptedArg).toContain("plain old text");
  });

  it("sets evidenceSnippet to null when not provided", async () => {
    await saveAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "COMPLIANT",
      findings: "finding text",
    });

    const data = mockPrisma.assessmentAnswer.create.mock.calls[0][0].data;
    expect(data.evidenceSnippet).toBeNull();
  });

  it("returns validation error when overrideReason is empty whitespace for existing answer", async () => {
    mockPrisma.assessmentAnswer.findFirst.mockResolvedValueOnce({
      id: "ans1",
      status: "COMPLIANT",
      findings: "aabb1122:ccdd3344:eeff5566",
      evidenceSnippet: null,
    });

    const result = await saveAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "NON_COMPLIANT",
      findings: "new",
      overrideReason: "   ",
    });

    expect(result).toEqual({ success: false, error: "A reason is required to change an existing answer." });
    expect(mockPrisma.assessmentAnswer.update).not.toHaveBeenCalled();
  });

  it("returns {success: false, error: 'Unauthorized.'} when auth throws access control error", async () => {
    const accessError = new Error("FORBIDDEN");
    mockRequireAdminUser.mockRejectedValueOnce(accessError);
    mockIsAccessControlError.mockReturnValueOnce(true);

    const result = await saveAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "COMPLIANT",
      findings: "finding text",
    });

    expect(result).toEqual({ success: false, error: "Unauthorized." });
  });
});
