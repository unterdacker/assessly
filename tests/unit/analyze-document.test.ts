import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockEncrypt,
  mockDecrypt,
  mockRequireAuthSession,
  mockIsAccessControlError,
  mockRunNis2AnalysisWithTrace,
  mockExtractPdfText,
  mockPersistEvidencePdf,
  mockSyncAssessmentComplianceToDatabase,
  mockCountStrictlyCompliantAnswers,
  mockRevalidatePath,
  mockLogAuditEvent,
  mockLogErrorReport,
  mockFireWebhookEvent,
} = vi.hoisted(() => ({
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
  mockPersistEvidencePdf: vi.fn(),
  mockSyncAssessmentComplianceToDatabase: vi.fn(),
  mockCountStrictlyCompliantAnswers: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockLogAuditEvent: vi.fn(),
  mockLogErrorReport: vi.fn(),
  mockFireWebhookEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/crypto", () => ({ encrypt: mockEncrypt, decrypt: mockDecrypt }));
vi.mock("@/lib/auth/server", () => ({
  requireAuthSession: mockRequireAuthSession,
  isAccessControlError: mockIsAccessControlError,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/logger", () => ({ logErrorReport: mockLogErrorReport }));
vi.mock("@/lib/ai/provider", () => ({ runNis2AnalysisWithTrace: mockRunNis2AnalysisWithTrace }));
vi.mock("@/lib/pdf-utils", () => ({
  extractPdfText: mockExtractPdfText,
  persistEvidencePdf: mockPersistEvidencePdf,
}));
vi.mock("@/lib/assessment-compliance", () => ({
  syncAssessmentComplianceToDatabase: mockSyncAssessmentComplianceToDatabase,
  countStrictlyCompliantAnswers: mockCountStrictlyCompliantAnswers,
}));
vi.mock("@/modules/webhooks/lib/fire-webhook-event", () => ({
  fireWebhookEvent: mockFireWebhookEvent,
}));

import { analyzeDocument } from "@/app/actions/analyze-document";

function makePdfFile(name = "evidence.pdf", text = "%PDF- sample") {
  return new File([Buffer.from(text, "utf8")], name, { type: "application/pdf" });
}

function makeFormData() {
  const fd = new FormData();
  fd.set("vendorId", "v1");
  fd.set("file", makePdfFile());
  return fd;
}

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
  });

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

  mockSyncAssessmentComplianceToDatabase.mockResolvedValue({ score: 80, riskLevel: "LOW" });
  mockCountStrictlyCompliantAnswers.mockReturnValue(1);
  mockLogAuditEvent.mockResolvedValue(undefined);
  mockPersistEvidencePdf.mockResolvedValue(undefined);
  mockFireWebhookEvent.mockResolvedValue(undefined);
});

describe("analyzeDocument encryption behavior", () => {
  it("encrypts aiSuggestedStatus, aiReasoning, justificationText, findings, evidenceSnippet on CREATE", async () => {
    const result = await analyzeDocument(makeFormData());

    expect(result.ok).toBe(true);
    expect(mockPrisma.assessmentAnswer.create).toHaveBeenCalledTimes(1);

    expect(mockEncrypt).toHaveBeenCalledWith("COMPLIANT");
    expect(mockEncrypt).toHaveBeenCalledWith("AI reasoning");
    expect(mockEncrypt).toHaveBeenCalledWith("snippet");

    const data = mockPrisma.assessmentAnswer.create.mock.calls[0][0].data;
    expect(data.aiSuggestedStatus).toBe("ENC:COMPLIANT");
    expect(data.aiReasoning).toBe("ENC:AI reasoning");
    expect(data.justificationText).toBe("ENC:AI reasoning");
    expect(data.findings).toBe("ENC:AI reasoning");
    expect(data.evidenceSnippet).toBe("ENC:snippet");
  });

  it("encrypts the same 5 fields on UPDATE for an existing answer", async () => {
    mockPrisma.assessmentAnswer.findFirst.mockResolvedValue({ id: "existing1" });

    const result = await analyzeDocument(makeFormData());

    expect(result.ok).toBe(true);
    expect(mockPrisma.assessmentAnswer.update).toHaveBeenCalledTimes(1);

    const updateData = mockPrisma.assessmentAnswer.update.mock.calls[0][0].data;
    expect(updateData.aiSuggestedStatus).toBe("ENC:COMPLIANT");
    expect(updateData.aiReasoning).toBe("ENC:AI reasoning");
    expect(updateData.justificationText).toBe("ENC:AI reasoning");
    expect(updateData.findings).toBe("ENC:AI reasoning");
    expect(updateData.evidenceSnippet).toBe("ENC:snippet");
  });

  it("sets evidenceSnippet to null when AI result has no evidenceSnippet", async () => {
    mockRunNis2AnalysisWithTrace.mockResolvedValueOnce({
      results: [
        {
          questionId: "q1",
          status: "non_compliant",
          reasoning: "No snippet reasoning",
          evidenceSnippet: null,
        },
      ],
      trace: { promptSnapshot: "p", modelInfo: {}, rawAiOutput: "r" },
    });

    await analyzeDocument(makeFormData());

    const data = mockPrisma.assessmentAnswer.create.mock.calls[0][0].data;
    expect(data.evidenceSnippet).toBeNull();
    expect(mockEncrypt).not.toHaveBeenCalledWith(null as unknown as string);
  });

  it("returns {ok: false} when session is unauthorized", async () => {
    mockRequireAuthSession.mockResolvedValueOnce(null);

    const result = await analyzeDocument(makeFormData());

    expect(result).toEqual({ ok: false, error: "Unauthorized." });
    expect(mockPrisma.assessmentAnswer.create).not.toHaveBeenCalled();
    expect(mockPrisma.assessmentAnswer.update).not.toHaveBeenCalled();
  });

  it("returns {ok: true, aiSkipped: true} when company has aiDisabled flag", async () => {
    mockPrisma.assessment.findFirst.mockResolvedValueOnce({
      id: "a1",
      vendorId: "v1",
      companyId: "co1",
      company: { aiDisabled: true },
      complianceScore: 20,
      riskLevel: "LOW",
    });

    const result = await analyzeDocument(makeFormData());

    expect(result).toEqual({
      ok: true,
      results: [],
      aiSkipped: true,
      message: "Document uploaded. AI analysis is disabled.",
    });
    expect(mockRunNis2AnalysisWithTrace).not.toHaveBeenCalled();
    expect(mockPrisma.assessmentAnswer.create).not.toHaveBeenCalled();
    expect(mockPrisma.assessmentAnswer.update).not.toHaveBeenCalled();
  });
});

describe("analyzeDocument webhook behavior", () => {
  it("fires vendor.risk_changed when riskLevel changes after sync", async () => {
    mockSyncAssessmentComplianceToDatabase.mockResolvedValueOnce({
      score: 95,
      riskLevel: "HIGH",
    });

    const result = await analyzeDocument(makeFormData());

    expect(result.ok).toBe(true);
    expect(mockFireWebhookEvent).toHaveBeenCalledOnce();
    expect(mockFireWebhookEvent).toHaveBeenCalledWith("co1", {
      event: "vendor.risk_changed",
      assessmentId: "a1",
      vendorId: "v1",
      companyId: "co1",
      previousRiskLevel: "LOW",
      newRiskLevel: "HIGH",
      changedAt: expect.any(String),
    });
  });

  it("does not fire vendor.risk_changed when riskLevel is unchanged", async () => {
    await analyzeDocument(makeFormData());

    expect(mockFireWebhookEvent).not.toHaveBeenCalled();
  });

  it("does not fire when aiDisabled is true", async () => {
    mockPrisma.assessment.findFirst.mockResolvedValueOnce({
      id: "a1",
      vendorId: "v1",
      companyId: "co1",
      company: { aiDisabled: true },
      complianceScore: 20,
      riskLevel: "LOW",
    });

    await analyzeDocument(makeFormData());

    expect(mockFireWebhookEvent).not.toHaveBeenCalled();
  });
});
