import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockPrisma,
  mockEncrypt,
  mockPutLocalFile,
  mockRevalidatePath,
  mockRevalidateTag,
  mockLogAuditEvent,
  mockSanitizeHtml,
  mockCookies,
  mockHeaders,
} = vi.hoisted(() => ({
  mockPrisma: {
    vendor: { findFirst: vi.fn() },
    assessment: { findUnique: vi.fn() },
    assessmentAnswer: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    document: { create: vi.fn() },
  },
  mockEncrypt: vi.fn().mockImplementation((s: string) => `ENC:${s}`),
  mockPutLocalFile: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockLogAuditEvent: vi.fn(),
  mockSanitizeHtml: vi.fn((s: string) => s),
  mockCookies: vi.fn(),
  mockHeaders: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/crypto", () => ({ encrypt: mockEncrypt }));
vi.mock("@/lib/storage", () => ({ putLocalFile: mockPutLocalFile }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath, revalidateTag: mockRevalidateTag }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("sanitize-html", () => ({ default: mockSanitizeHtml }));
vi.mock("@/lib/queries/dashboard-risk-posture", () => ({ RISK_POSTURE_CACHE_TAG: "risk-posture" }));
vi.mock("next/headers", () => ({ cookies: mockCookies, headers: mockHeaders }));

import { updateExternalAnswer } from "@/app/actions/update-external-answer";

function makeFormData(overrides?: {
  status?: string;
  justificationText?: string;
  evidenceFile?: File;
}) {
  const fd = new FormData();
  fd.set("assessmentId", "a1");
  fd.set("questionId", "q1");
  fd.set("status", overrides?.status ?? "COMPLIANT");
  fd.set("justificationText", overrides?.justificationText ?? "vendor justification");
  if (overrides?.evidenceFile) {
    fd.set("evidenceFile", overrides.evidenceFile);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();

  mockEncrypt.mockImplementation((s: string) => `ENC:${s}`);
  mockSanitizeHtml.mockImplementation((s: string) => s);

  mockCookies.mockResolvedValue({
    get: vi.fn().mockImplementation((name: string) =>
      name === "venshield-vendor-token" ? { value: "tok" } : undefined,
    ),
  });

  mockHeaders.mockResolvedValue({
    get: vi.fn().mockImplementation((name: string) => {
      if (name === "origin") return "https://app.example.com";
      if (name === "host") return "app.example.com";
      return null;
    }),
  });

  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");

  mockPrisma.vendor.findFirst.mockResolvedValue({
    id: "v1",
    inviteToken: "tok",
    isCodeActive: true,
    inviteTokenExpires: new Date(Date.now() + 60_000),
    codeExpiresAt: null,
    assessment: { id: "a1" },
  });

  mockPrisma.assessment.findUnique.mockResolvedValue({
    id: "a1",
    companyId: "co1",
  });

  mockPrisma.document.create.mockResolvedValue({
    id: "doc1",
    filename: "proof.pdf",
    fileSize: 10,
    uploadedAt: new Date(),
    uploadedBy: "external-vendor",
  });

  mockPrisma.assessmentAnswer.findFirst.mockResolvedValue(null);
  mockPrisma.assessmentAnswer.create.mockResolvedValue({
    id: "ans1",
    status: "COMPLIANT",
    verified: true,
    justificationText: "ENC:vendor justification",
    evidenceFileName: null,
    evidenceFileUrl: null,
    document: null,
  });
  mockPrisma.assessmentAnswer.update.mockResolvedValue({
    id: "ans1",
    status: "COMPLIANT",
    verified: true,
    justificationText: "ENC:vendor justification",
    evidenceFileName: "proof.pdf",
    evidenceFileUrl: "key",
    document: { id: "doc1", filename: "proof.pdf", fileSize: 10, uploadedAt: new Date(), uploadedBy: "external-vendor" },
  });

  mockPutLocalFile.mockResolvedValue(undefined);
  mockLogAuditEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("updateExternalAnswer security/encryption behavior", () => {
  it("encrypts findings and justificationText using the sanitized input", async () => {
    mockSanitizeHtml.mockReturnValueOnce("sanitized justification");

    const result = await updateExternalAnswer(makeFormData({ justificationText: "<b>x</b>" }));

    expect(result.ok).toBe(true);
    expect(mockEncrypt).toHaveBeenCalledWith("sanitized justification");

    const data = mockPrisma.assessmentAnswer.create.mock.calls[0][0].data;
    expect(data.findings).toBe("ENC:sanitized justification");
    expect(data.justificationText).toBe("ENC:sanitized justification");
  });

  it("calls putLocalFile with correct path and buffer when evidence file provided", async () => {
    const bytes = Buffer.from("evidence-bytes", "utf8");
    const file = new File([bytes], "proof.pdf", { type: "application/pdf" });

    const result = await updateExternalAnswer(makeFormData({ evidenceFile: file }));

    expect(result.ok).toBe(true);
    expect(mockPutLocalFile).toHaveBeenCalledTimes(1);
    const [pathArg, bufferArg] = mockPutLocalFile.mock.calls[0];
    expect(String(pathArg)).toMatch(/^question-evidence\/[0-9a-f-]{36}\.pdf$/i);
    expect(Buffer.isBuffer(bufferArg)).toBe(true);
    expect((bufferArg as Buffer).equals(bytes)).toBe(true);
  });

  it("returns error when vendor token cookie is missing", async () => {
    mockCookies.mockResolvedValueOnce({ get: vi.fn().mockReturnValue(undefined) });

    const result = await updateExternalAnswer(makeFormData());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Session expired");
    }
  });

  it("rejects cross-origin request when origin mismatches", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    mockHeaders.mockResolvedValueOnce({
      get: vi.fn().mockImplementation((name: string) => {
        if (name === "origin") return "https://evil.example.com";
        if (name === "host") return "app.example.com";
        return null;
      }),
    });

    const result = await updateExternalAnswer(makeFormData());

    expect(result).toEqual({ ok: false, error: "Request rejected: cross-origin submission is not allowed." });
  });

  it("returns error when vendor session is expired", async () => {
    mockPrisma.vendor.findFirst.mockResolvedValueOnce({
      id: "v1",
      inviteToken: "tok",
      isCodeActive: true,
      inviteTokenExpires: new Date(Date.now() - 10 * 60 * 1000),
      codeExpiresAt: null,
      assessment: { id: "a1" },
    });

    const result = await updateExternalAnswer(makeFormData());

    expect(result).toEqual({ ok: false, error: "Portal session has expired." });
  });

  it("rejects unsupported evidence MIME type", async () => {
    const file = new File([Buffer.from("x")], "proof.bin", { type: "application/octet-stream" });

    const result = await updateExternalAnswer(makeFormData({ evidenceFile: file }));

    expect(result).toEqual({ ok: false, error: "Failed to save answer." });
  });

  it("rejects oversized evidence file (>10MB)", async () => {
    const large = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
    const file = new File([large], "big.pdf", { type: "application/pdf" });

    const result = await updateExternalAnswer(makeFormData({ evidenceFile: file }));

    expect(result).toEqual({ ok: false, error: "Failed to save answer." });
  });
});
