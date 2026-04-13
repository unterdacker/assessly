import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockFsReadFile,
  mockPrisma,
  mockEncrypt,
  mockDecrypt,
  mockRequireAuthSession,
  mockIsAccessControlError,
  mockRunNis2AnalysisWithTrace,
  mockExtractPdfText,
  mockSyncAssessmentComplianceToDatabase,
  mockCountStrictlyCompliantAnswers,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockFsReadFile: vi.fn(),
  mockPrisma: {
    assessment: { findFirst: vi.fn() },
    assessmentAnswer: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    question: { findMany: vi.fn() },
  },
  mockEncrypt: vi.fn().mockImplementation((s: string) => `ENC:${s}`),
  mockDecrypt: vi.fn().mockImplementation((s: string) => `DEC:${s}`),
  mockRequireAuthSession: vi.fn(),
  mockIsAccessControlError: vi.fn().mockReturnValue(false),
  mockRunNis2AnalysisWithTrace: vi.fn(),
  mockExtractPdfText: vi.fn(),
  mockSyncAssessmentComplianceToDatabase: vi.fn(),
  mockCountStrictlyCompliantAnswers: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("fs/promises", () => ({ default: { readFile: mockFsReadFile } }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/crypto", () => ({ encrypt: mockEncrypt, decrypt: mockDecrypt }));
vi.mock("@/lib/auth/server", () => ({
  requireAuthSession: mockRequireAuthSession,
  isAccessControlError: mockIsAccessControlError,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath, revalidateTag: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logErrorReport: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ runNis2AnalysisWithTrace: mockRunNis2AnalysisWithTrace }));
vi.mock("@/lib/pdf-utils", () => ({ extractPdfText: mockExtractPdfText }));
vi.mock("@/lib/assessment-compliance", () => ({
  syncAssessmentComplianceToDatabase: mockSyncAssessmentComplianceToDatabase,
  countStrictlyCompliantAnswers: mockCountStrictlyCompliantAnswers,
}));

import { reanalyzeStoredDocument } from "@/app/actions/reanalyze-document";

beforeEach(() => {
  vi.clearAllMocks();

  mockEncrypt.mockImplementation((s: string) => `ENC:${s}`);

  mockRequireAuthSession.mockResolvedValue({
    userId: "u1",
    companyId: "co1",
    role: "ADMIN",
    vendorId: null,
  });

  mockPrisma.assessment.findFirst.mockResolvedValue({
    id: "a1",
    vendorId: "v1",
    companyId: "co1",
    company: { aiDisabled: false },
    complianceScore: 20,
    riskLevel: "LOW",
    documentFilename: "stored.pdf",
  });

  mockFsReadFile.mockResolvedValue(Buffer.from("%PDF- x", "utf8"));
  mockPrisma.question.findMany.mockResolvedValue([
    { id: "q1", category: "Governance", text: "Question", guidance: null, sortOrder: 1 },
  ]);
  mockExtractPdfText.mockResolvedValue("Extracted text");

  mockRunNis2AnalysisWithTrace.mockResolvedValue({
    results: [
      {
        questionId: "q1",
        status: "compliant",
        reasoning: "AI reasoning",
        evidenceSnippet: "snippet",
      },
    ],
    trace: {
      promptSnapshot: "prompt",
      modelInfo: { model: "x" },
      rawAiOutput: "raw",
    },
  });

  mockPrisma.assessmentAnswer.findFirst.mockResolvedValue(null);
  mockPrisma.assessmentAnswer.create.mockResolvedValue({ id: "ans1" });
  mockPrisma.assessmentAnswer.update.mockResolvedValue({ id: "ans1" });
  mockPrisma.assessmentAnswer.findMany.mockResolvedValue([{ status: "COMPLIANT" }]);

  mockSyncAssessmentComplianceToDatabase.mockResolvedValue({ score: 80 });
  mockCountStrictlyCompliantAnswers.mockReturnValue(1);
});

describe("reanalyzeStoredDocument encryption behavior", () => {
  it("encrypts 5 AI fields before writing to DB (same schema as analyze-document)", async () => {
    const result = await reanalyzeStoredDocument("a1");

    expect(result.ok).toBe(true);
    const data = mockPrisma.assessmentAnswer.create.mock.calls[0][0].data;

    expect(mockEncrypt).toHaveBeenCalledWith("COMPLIANT");
    expect(mockEncrypt).toHaveBeenCalledWith("AI reasoning");
    expect(mockEncrypt).toHaveBeenCalledWith("snippet");

    expect(data.aiSuggestedStatus).toBe("ENC:COMPLIANT");
    expect(data.aiReasoning).toBe("ENC:AI reasoning");
    expect(data.justificationText).toBe("ENC:AI reasoning");
    expect(data.findings).toBe("ENC:AI reasoning");
    expect(data.evidenceSnippet).toBe("ENC:snippet");
  });

  it("returns error when documentFilename is null (no stored file)", async () => {
    mockPrisma.assessment.findFirst.mockResolvedValueOnce({
      id: "a1",
      vendorId: "v1",
      companyId: "co1",
      company: { aiDisabled: false },
      complianceScore: 20,
      riskLevel: "LOW",
      documentFilename: null,
    });

    const result = await reanalyzeStoredDocument("a1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("No stored document found");
    }
    expect(mockEncrypt).not.toHaveBeenCalled();
  });

  it("returns error when fs.readFile throws ENOENT (file missing from disk)", async () => {
    mockFsReadFile.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await reanalyzeStoredDocument("a1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Stored document file not found");
    }
  });

  it("returns {ok: false} for unauthorized session", async () => {
    mockRequireAuthSession.mockResolvedValueOnce(null);

    const result = await reanalyzeStoredDocument("a1");

    expect(result).toEqual({ ok: false, error: "Unauthorized." });
    expect(mockPrisma.assessmentAnswer.create).not.toHaveBeenCalled();
    expect(mockPrisma.assessmentAnswer.update).not.toHaveBeenCalled();
  });
});
