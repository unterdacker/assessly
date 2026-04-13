import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExecReportCreate,
  mockExecReportUpdate,
  mockExecReportFindFirst,
  mockEncrypt,
  mockDecrypt,
} = vi.hoisted(() => ({
  mockExecReportCreate: vi.fn(),
  mockExecReportUpdate: vi.fn(),
  mockExecReportFindFirst: vi.fn(),
  mockEncrypt: vi.fn(),
  mockDecrypt: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    execReport: {
      create: mockExecReportCreate,
      update: mockExecReportUpdate,
      findFirst: mockExecReportFindFirst,
    },
  },
}));
vi.mock("@/lib/crypto", () => ({
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
}));

import {
  createExecReport,
  getExecReportForPdf,
  updateExecReport,
} from "@/lib/queries/reporting";

const CIPHER = "aabb1122:ccdd3344:eeff5566";

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    id: "report-1",
    companyId: "company-1",
    assessmentId: "assessment-1",
    status: "FINALIZED",
    executiveSummary: CIPHER,
    remediationRoadmap: CIPHER,
    aiDraftSummary: CIPHER,
    aiDraftRoadmap: CIPHER,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    assessment: {
      id: "assessment-1",
      vendor: { id: "vendor-1" },
      company: { id: "company-1" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEncrypt.mockImplementation((value: string) => `ENC:${value}`);
  mockDecrypt.mockImplementation((value: string) => `DEC:${value}`);
  mockExecReportCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "report-1",
    ...data,
  }));
  mockExecReportUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "report-1",
    ...data,
  }));
  mockExecReportFindFirst.mockResolvedValue(makeReport());
});

describe("createExecReport", () => {
  it("encrypts all four text fields before writing to DB", async () => {
    await createExecReport({
      companyId: "company-1",
      assessmentId: "assessment-1",
      status: "DRAFT",
      executiveSummary: "summary",
      remediationRoadmap: "roadmap",
      aiDraftSummary: "ai-summary",
      aiDraftRoadmap: "ai-roadmap",
    } as any);

    expect(mockEncrypt).toHaveBeenCalledTimes(4);
    expect(mockEncrypt).toHaveBeenNthCalledWith(1, "summary");
    expect(mockEncrypt).toHaveBeenNthCalledWith(2, "roadmap");
    expect(mockEncrypt).toHaveBeenNthCalledWith(3, "ai-summary");
    expect(mockEncrypt).toHaveBeenNthCalledWith(4, "ai-roadmap");

    expect(mockExecReportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executiveSummary: "ENC:summary",
          remediationRoadmap: "ENC:roadmap",
          aiDraftSummary: "ENC:ai-summary",
          aiDraftRoadmap: "ENC:ai-roadmap",
        }),
      }),
    );
  });

  it("passes null fields straight through without encrypting", async () => {
    await createExecReport({
      companyId: "company-1",
      assessmentId: "assessment-1",
      status: "DRAFT",
      executiveSummary: null,
      remediationRoadmap: null,
      aiDraftSummary: null,
      aiDraftRoadmap: null,
    } as any);

    expect(mockEncrypt).not.toHaveBeenCalled();
    expect(mockExecReportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executiveSummary: null,
          remediationRoadmap: null,
          aiDraftSummary: null,
          aiDraftRoadmap: null,
        }),
      }),
    );
  });

  it("passes undefined fields through without encrypting", async () => {
    await createExecReport({
      companyId: "company-1",
      assessmentId: "assessment-1",
      status: "DRAFT",
    } as any);

    expect(mockEncrypt).not.toHaveBeenCalled();

    const callData = mockExecReportCreate.mock.calls[0][0].data;
    expect(callData.executiveSummary).toBeUndefined();
    expect(callData.remediationRoadmap).toBeUndefined();
    expect(callData.aiDraftSummary).toBeUndefined();
    expect(callData.aiDraftRoadmap).toBeUndefined();
  });
});

describe("updateExecReport", () => {
  it("encrypts string fields on update", async () => {
    await updateExecReport("report-1", {
      executiveSummary: "new summary",
      aiDraftRoadmap: "new roadmap",
    });

    expect(mockEncrypt).toHaveBeenCalledTimes(2);
    expect(mockEncrypt).toHaveBeenNthCalledWith(1, "new summary");
    expect(mockEncrypt).toHaveBeenNthCalledWith(2, "new roadmap");
    expect(mockExecReportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-1" },
        data: expect.objectContaining({
          executiveSummary: "ENC:new summary",
          aiDraftRoadmap: "ENC:new roadmap",
        }),
      }),
    );
  });

  it("passes through undefined fields without encrypting", async () => {
    await updateExecReport("report-1", {
      aiDraftSummary: "only one field",
    });

    expect(mockEncrypt).toHaveBeenCalledTimes(1);
    expect(mockEncrypt).toHaveBeenCalledWith("only one field");

    const callData = mockExecReportUpdate.mock.calls[0][0].data;
    expect(callData.executiveSummary).toBeUndefined();
    expect(callData.remediationRoadmap).toBeUndefined();
    expect(callData.aiDraftSummary).toBe("ENC:only one field");
    expect(callData.aiDraftRoadmap).toBeUndefined();
  });

  it("passes through null values without calling encrypt", async () => {
    await updateExecReport("report-1", {
      executiveSummary: null,
    });

    expect(mockEncrypt).not.toHaveBeenCalled();
    expect(mockExecReportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-1" },
        data: expect.objectContaining({ executiveSummary: null }),
      }),
    );
  });
});

describe("getExecReportForPdf", () => {
  it("decrypts the four text fields on read", async () => {
    const result = await getExecReportForPdf("report-1", "company-1");

    expect(result).not.toBeNull();
    expect(mockDecrypt).toHaveBeenCalledTimes(4);
    expect(mockDecrypt).toHaveBeenNthCalledWith(1, CIPHER);
    expect(mockDecrypt).toHaveBeenNthCalledWith(2, CIPHER);
    expect(mockDecrypt).toHaveBeenNthCalledWith(3, CIPHER);
    expect(mockDecrypt).toHaveBeenNthCalledWith(4, CIPHER);
    expect(result!.executiveSummary).toBe(`DEC:${CIPHER}`);
    expect(result!.remediationRoadmap).toBe(`DEC:${CIPHER}`);
    expect(result!.aiDraftSummary).toBe(`DEC:${CIPHER}`);
    expect(result!.aiDraftRoadmap).toBe(`DEC:${CIPHER}`);
  });

  it("passes through legacy plaintext values (no cipher format)", async () => {
    mockExecReportFindFirst.mockResolvedValue(
      makeReport({
        executiveSummary: "plain summary",
        remediationRoadmap: "plain roadmap",
        aiDraftSummary: "plain ai summary",
        aiDraftRoadmap: "plain ai roadmap",
      }),
    );

    const result = await getExecReportForPdf("report-1", "company-1");

    expect(result).not.toBeNull();
    expect(mockDecrypt).not.toHaveBeenCalled();
    expect(result!.executiveSummary).toBe("plain summary");
    expect(result!.remediationRoadmap).toBe("plain roadmap");
    expect(result!.aiDraftSummary).toBe("plain ai summary");
    expect(result!.aiDraftRoadmap).toBe("plain ai roadmap");
  });

  it("passes through null values", async () => {
    mockExecReportFindFirst.mockResolvedValue(
      makeReport({
        executiveSummary: null,
        remediationRoadmap: null,
        aiDraftSummary: null,
        aiDraftRoadmap: null,
      }),
    );

    const result = await getExecReportForPdf("report-1", "company-1");

    expect(result).not.toBeNull();
    expect(mockDecrypt).not.toHaveBeenCalled();
    expect(result!.executiveSummary).toBeNull();
    expect(result!.remediationRoadmap).toBeNull();
    expect(result!.aiDraftSummary).toBeNull();
    expect(result!.aiDraftRoadmap).toBeNull();
  });

  it("returns null when report not found", async () => {
    mockExecReportFindFirst.mockResolvedValue(null);

    const result = await getExecReportForPdf("report-1", "company-1");

    expect(result).toBeNull();
  });

  it("propagates GCM auth-tag errors without swallowing", async () => {
    mockDecrypt.mockImplementation(() => {
      throw new Error("Unsupported state or unable to authenticate data");
    });

    await expect(getExecReportForPdf("report-1", "company-1")).rejects.toThrow(
      "Unsupported state or unable to authenticate data",
    );
  });
});
