import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssessmentFindFirst,
  mockVendorUpdateMany,
  mockPrismaTransaction,
  mockDecrypt,
  mockRequireInternalReadUser,
  mockCountVendorAssessmentQuestions,
  mockSyncAssessmentComplianceToDatabase,
  mockToVendorAssessment,
} = vi.hoisted(() => ({
  mockAssessmentFindFirst: vi.fn(),
  mockVendorUpdateMany: vi.fn(),
  mockPrismaTransaction: vi.fn(),
  mockDecrypt: vi.fn(),
  mockRequireInternalReadUser: vi.fn(),
  mockCountVendorAssessmentQuestions: vi.fn(),
  mockSyncAssessmentComplianceToDatabase: vi.fn(),
  mockToVendorAssessment: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockPrismaTransaction,
    vendor: {
      updateMany: mockVendorUpdateMany,
    },
    assessment: {
      findFirst: mockAssessmentFindFirst,
    },
  },
}));
vi.mock("@/lib/crypto", () => ({ decrypt: mockDecrypt }));
vi.mock("@/lib/auth/server", () => ({
  requireInternalReadUser: mockRequireInternalReadUser,
}));
vi.mock("@/lib/queries/custom-questions", () => ({
  countVendorAssessmentQuestions: mockCountVendorAssessmentQuestions,
}));
vi.mock("@/lib/assessment-compliance", () => ({
  syncAssessmentComplianceToDatabase: mockSyncAssessmentComplianceToDatabase,
}));
vi.mock("@/lib/ensure-demo-data", () => ({ ensureDemoData: vi.fn() }));
vi.mock("@/lib/prisma-mappers", () => ({
  toVendorAssessment: mockToVendorAssessment,
}));

import { getVendorAssessmentDetail } from "@/lib/queries/vendor-assessments";

const CIPHER = "aabb1122:ccdd3344:eeff5566";

function makeAnswer(overrides: Record<string, unknown> = {}) {
  return {
    id: "ans-1",
    assessmentId: "assessment-1",
    questionId: "q-1",
    status: "COMPLIANT",
    answerText: "Yes",
    aiReasoning: CIPHER,
    findings: CIPHER,
    evidenceSnippet: CIPHER,
    justificationText: CIPHER,
    manualNotes: CIPHER,
    aiSuggestedStatus: CIPHER,
    documentId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    document: null,
    ...overrides,
  };
}

function makeAssessmentRow(answerOverrides: Record<string, unknown> = {}) {
  return {
    id: "assessment-1",
    companyId: "company-1",
    vendorId: "vendor-1",
    status: "PENDING",
    riskLevel: "MEDIUM",
    complianceScore: 42,
    lastAssessmentDate: null,
    documentUrl: "https://example.test/doc.pdf",
    documentFilename: "doc.pdf",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: "user-1",
    vendor: {
      id: "vendor-1",
      companyId: "company-1",
      name: "Vendor One",
      email: "vendor@example.test",
      serviceType: "SaaS",
      officialName: null,
      registrationId: null,
      vendorServiceType: null,
      securityOfficerName: null,
      securityOfficerEmail: null,
      dpoName: null,
      dpoEmail: null,
      headquartersLocation: null,
      sizeClassification: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: "user-1",
      accessCode: null,
      codeExpiresAt: null,
      isCodeActive: false,
      isFirstLogin: false,
      inviteSentAt: null,
      inviteTokenExpires: null,
    },
    answers: [makeAnswer(answerOverrides)],
    documents: [
      {
        fileSize: 1024,
        uploadedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockPrismaTransaction.mockImplementation(async (arg: unknown) => {
    if (Array.isArray(arg)) {
      return Promise.all(arg as Promise<unknown>[]);
    }
    if (typeof arg === "function") {
      return (arg as (...args: unknown[]) => unknown)({});
    }
    return arg;
  });

  mockVendorUpdateMany.mockResolvedValue({ count: 0 });
  mockRequireInternalReadUser.mockResolvedValue({ companyId: "company-1" });
  mockCountVendorAssessmentQuestions.mockResolvedValue(12);
  mockSyncAssessmentComplianceToDatabase.mockResolvedValue({
    score: 76,
    riskLevel: "MEDIUM",
  });
  mockToVendorAssessment.mockReturnValue({ id: "vendor-assessment-1" });
  mockAssessmentFindFirst.mockResolvedValue(makeAssessmentRow());
  mockDecrypt.mockImplementation((value: string) => `decrypted:${value}`);
});

describe("getVendorAssessmentDetail encryption handling", () => {
  it("calls decrypt for each of the 6 encrypted answer fields when they match cipher format", async () => {
    mockDecrypt.mockReturnValue("decrypted-value");

    const result = await getVendorAssessmentDetail("vendor-1");

    expect(result).not.toBeNull();
    expect(mockDecrypt).toHaveBeenCalledTimes(6);
    for (const [cipher] of mockDecrypt.mock.calls) {
      expect(cipher).toBe(CIPHER);
    }

    const answer = result!.answers[0];
    expect(answer.aiReasoning).toBe("decrypted-value");
    expect(answer.findings).toBe("decrypted-value");
    expect(answer.evidenceSnippet).toBe("decrypted-value");
    expect(answer.justificationText).toBe("decrypted-value");
    expect(answer.manualNotes).toBe("decrypted-value");
    expect(answer.aiSuggestedStatus).toBe("decrypted-value");
  });

  it("passes through legacy plaintext values (not in iv:tag:data format)", async () => {
    const plain = "legacy plain text";
    mockAssessmentFindFirst.mockResolvedValue(
      makeAssessmentRow({
        aiReasoning: plain,
        findings: plain,
        evidenceSnippet: plain,
        justificationText: plain,
        manualNotes: plain,
        aiSuggestedStatus: plain,
      }),
    );

    const result = await getVendorAssessmentDetail("vendor-1");

    expect(result).not.toBeNull();
    expect(mockDecrypt).not.toHaveBeenCalled();
    const answer = result!.answers[0];
    expect(answer.aiReasoning).toBe(plain);
    expect(answer.findings).toBe(plain);
    expect(answer.evidenceSnippet).toBe(plain);
    expect(answer.justificationText).toBe(plain);
    expect(answer.manualNotes).toBe(plain);
    expect(answer.aiSuggestedStatus).toBe(plain);
  });

  it("passes through null fields without calling decrypt", async () => {
    mockAssessmentFindFirst.mockResolvedValue(
      makeAssessmentRow({
        aiReasoning: null,
        findings: null,
        evidenceSnippet: null,
        justificationText: null,
        manualNotes: null,
        aiSuggestedStatus: null,
      }),
    );

    const result = await getVendorAssessmentDetail("vendor-1");

    expect(result).not.toBeNull();
    expect(mockDecrypt).not.toHaveBeenCalled();
    const answer = result!.answers[0];
    expect(answer.aiReasoning).toBeNull();
    expect(answer.findings).toBeNull();
    expect(answer.evidenceSnippet).toBeNull();
    expect(answer.justificationText).toBeNull();
    expect(answer.manualNotes).toBeNull();
    expect(answer.aiSuggestedStatus).toBeNull();
  });

  it("propagates GCM auth-tag errors without catch-swallowing", async () => {
    mockDecrypt.mockImplementation(() => {
      throw new Error("Unsupported state or unable to authenticate data");
    });

    await expect(getVendorAssessmentDetail("vendor-1")).rejects.toThrow(
      "Unsupported state or unable to authenticate data",
    );
  });

  it("returns null when the assessment row is not found", async () => {
    mockAssessmentFindFirst.mockResolvedValue(null);

    const result = await getVendorAssessmentDetail("vendor-1");

    expect(result).toBeNull();
  });

  it("returns null when session has no companyId", async () => {
    mockRequireInternalReadUser.mockResolvedValue({ companyId: null });

    const result = await getVendorAssessmentDetail("vendor-1");

    expect(result).toBeNull();
    expect(mockAssessmentFindFirst).not.toHaveBeenCalled();
  });
});
