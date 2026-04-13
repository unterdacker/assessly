import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockEncrypt,
  mockDecrypt,
  mockRequireAdminUser,
  mockIsAccessControlError,
  mockSyncAssessmentComplianceToDatabase,
  mockRevalidatePath,
  mockRevalidateTag,
  mockPutLocalFile,
  mockLogErrorReport,
} = vi.hoisted(() => ({
  mockPrisma: {
    assessment: { findUnique: vi.fn() },
    assessmentAnswer: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    question: { count: vi.fn() },
  },
  mockEncrypt: vi.fn().mockImplementation((s: string) => `ENC:${s}`),
  mockDecrypt: vi.fn().mockImplementation((s: string) => `DEC:${s}`),
  mockRequireAdminUser: vi.fn(),
  mockIsAccessControlError: vi.fn().mockReturnValue(false),
  mockSyncAssessmentComplianceToDatabase: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockPutLocalFile: vi.fn(),
  mockLogErrorReport: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/crypto", () => ({ encrypt: mockEncrypt, decrypt: mockDecrypt }));
vi.mock("@/lib/auth/server", () => ({
  requireAdminUser: mockRequireAdminUser,
  isAccessControlError: mockIsAccessControlError,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath, revalidateTag: mockRevalidateTag }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logErrorReport: mockLogErrorReport }));
vi.mock("@/lib/storage", () => ({ putLocalFile: mockPutLocalFile }));
vi.mock("@/lib/assessment-compliance", () => ({
  syncAssessmentComplianceToDatabase: mockSyncAssessmentComplianceToDatabase,
}));
vi.mock("@/lib/queries/dashboard-risk-posture", () => ({ RISK_POSTURE_CACHE_TAG: "risk-posture" }));

import { overrideAssessmentAnswer } from "@/app/actions/update-answer-override";

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
    complianceScore: 40,
    riskLevel: "LOW",
    vendor: { id: "v1" },
  });

  mockPrisma.assessmentAnswer.findFirst.mockResolvedValue(null);
  mockPrisma.assessmentAnswer.create.mockResolvedValue({ id: "ans1" });
  mockPrisma.assessmentAnswer.update.mockResolvedValue({ id: "ans1" });
  mockPrisma.assessmentAnswer.findMany.mockResolvedValue([{ status: "COMPLIANT" }]);
  mockPrisma.question.count.mockResolvedValue(5);

  mockSyncAssessmentComplianceToDatabase.mockResolvedValue({ score: 88 });
  mockPutLocalFile.mockResolvedValue(undefined);
});

describe("overrideAssessmentAnswer encryption/decryption behavior", () => {
  it("encrypts findings and manualNotes when creating a new answer override", async () => {
    const result = await overrideAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "COMPLIANT",
      manualNotes: "audit justification",
    });

    expect(result.success).toBe(true);
    expect(mockEncrypt).toHaveBeenCalledWith("audit justification");

    const findingsEncryptArg = mockEncrypt.mock.calls.find((c) => String(c[0]).includes("[ISB Override"))?.[0];
    expect(findingsEncryptArg).toBeDefined();

    const data = mockPrisma.assessmentAnswer.create.mock.calls[0][0].data;
    expect(data.findings).toContain("ENC:");
    expect(data.manualNotes).toBe("ENC:audit justification");
  });

  it("decrypts existing findings before building audit trail on update", async () => {
    mockPrisma.assessmentAnswer.findFirst.mockResolvedValueOnce({
      id: "ans1",
      status: "COMPLIANT",
      findings: "aabb1122:ccdd3344:eeff5566",
      manualNotes: null,
      evidenceUrl: null,
    });
    mockDecrypt.mockReturnValueOnce("previous AI finding");

    const result = await overrideAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "NON_COMPLIANT",
      manualNotes: "updated by auditor",
    });

    expect(result.success).toBe(true);
    expect(mockDecrypt).toHaveBeenCalledWith("aabb1122:ccdd3344:eeff5566");

    const findingsEncryptArg = mockEncrypt.mock.calls.find((c) => String(c[0]).includes("previous AI finding"))?.[0];
    expect(String(findingsEncryptArg)).toContain("previous AI finding");
  });

  it("does not call decrypt when existing findings is null", async () => {
    mockPrisma.assessmentAnswer.findFirst.mockResolvedValueOnce({
      id: "ans1",
      status: "COMPLIANT",
      findings: null,
      manualNotes: null,
      evidenceUrl: null,
    });

    await overrideAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "NON_COMPLIANT",
      manualNotes: "note",
    });

    expect(mockDecrypt).not.toHaveBeenCalled();
    const findingsEncryptArg = mockEncrypt.mock.calls.find((c) => String(c[0]).includes("[ISB Override"))?.[0] as string;
    expect(findingsEncryptArg).not.toContain("Previous AI reasoning");
  });

  it("does not call decrypt for legacy plaintext findings (regex guard)", async () => {
    mockPrisma.assessmentAnswer.findFirst.mockResolvedValueOnce({
      id: "ans1",
      status: "COMPLIANT",
      findings: "legacy finding text",
      manualNotes: null,
      evidenceUrl: null,
    });

    await overrideAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "NON_COMPLIANT",
      manualNotes: "note",
    });

    expect(mockDecrypt).not.toHaveBeenCalled();
    const findingsEncryptArg = mockEncrypt.mock.calls.find((c) => String(c[0]).includes("legacy finding text"))?.[0];
    expect(String(findingsEncryptArg)).toContain("legacy finding text");
  });

  it("calls putLocalFile with base64-decoded buffer when evidencePdfBase64 is provided", async () => {
    const pdfBuffer = Buffer.from("%PDF- evidence", "utf8");
    const b64 = pdfBuffer.toString("base64");

    await overrideAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "COMPLIANT",
      manualNotes: "note",
      evidencePdfBase64: b64,
      evidencePdfFilename: "supplement.pdf",
    });

    expect(mockPutLocalFile).toHaveBeenCalledTimes(1);
    const [storagePath, savedBuffer] = mockPutLocalFile.mock.calls[0];
    expect(String(storagePath)).toContain("answer__ans1__supplement.pdf");
    expect(Buffer.isBuffer(savedBuffer)).toBe(true);
    expect((savedBuffer as Buffer).equals(pdfBuffer)).toBe(true);
  });

  it("is non-fatal when putLocalFile throws — logs error and returns success", async () => {
    mockPutLocalFile.mockRejectedValueOnce(new Error("disk full"));

    const result = await overrideAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "COMPLIANT",
      manualNotes: "note",
      evidencePdfBase64: Buffer.from("%PDF-").toString("base64"),
      evidencePdfFilename: "x.pdf",
    });

    expect(result.success).toBe(true);
    expect(mockLogErrorReport).toHaveBeenCalled();
  });

  it("returns validation error when manualNotes is whitespace-only", async () => {
    const result = await overrideAssessmentAnswer({
      assessmentId: "a1",
      questionId: "q1",
      status: "COMPLIANT",
      manualNotes: "   ",
    });

    expect(result).toEqual({ success: false, error: "Justification is required to override an answer." });
    expect(mockPrisma.assessmentAnswer.create).not.toHaveBeenCalled();
    expect(mockPrisma.assessmentAnswer.update).not.toHaveBeenCalled();
    expect(mockEncrypt).not.toHaveBeenCalled();
  });

  it("returns {success: false} when assessment is not found", async () => {
    mockPrisma.assessment.findUnique.mockResolvedValueOnce(null);

    const result = await overrideAssessmentAnswer({
      assessmentId: "missing",
      questionId: "q1",
      status: "COMPLIANT",
      manualNotes: "reason",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Assessment not found");
    }
  });
});
