import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockTx } = vi.hoisted(() => {
  const mockTx = {
    question: {
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  const mockPrisma = {
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: typeof mockTx) => unknown)(mockTx);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg as Promise<unknown>[]);
      }
      return arg;
    }),
    question: {
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };

  return { mockPrisma, mockTx };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/server", () => ({
  requireAdminUser: vi.fn(),
  isAccessControlError: vi.fn(
    (err: unknown) =>
      err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN"),
  ),
}));
vi.mock("@/lib/structured-logger", () => ({
  AuditLogger: { configuration: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({ logErrorReport: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createCustomQuestion,
  updateCustomQuestion,
  deleteCustomQuestion,
  reorderCustomQuestions,
} from "@/app/actions/custom-questions";
import {
  getCustomQuestions,
  getVendorAssessmentQuestions,
  countVendorAssessmentQuestions,
} from "@/lib/queries/custom-questions";
import { requireAdminUser } from "@/lib/auth/server";
import { AuditLogger } from "@/lib/structured-logger";
import { logErrorReport } from "@/lib/logger";
import { revalidatePath } from "next/cache";

const MOCK_SESSION = {
  sessionId: "sess-1",
  userId: "user-abc",
  role: "ADMIN" as const,
  companyId: "company-xyz",
  vendorId: null,
  email: "admin@test.example",
  displayName: "Test Admin",
  expiresAt: new Date(Date.now() + 3_600_000),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockPrisma.$transaction).mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: typeof mockTx) => unknown)(mockTx);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg as Promise<unknown>[]);
    }
    return arg;
  });
  vi.mocked(requireAdminUser).mockResolvedValue(MOCK_SESSION as any);
});

describe("Zod validation - CreateSchema", () => {
  it("rejects empty text", async () => {
    const result = await createCustomQuestion({ text: "" });

    expect(result.success).toBe(false);
    expect(result.success ? null : result.error).toBe("Invalid input.");
    expect(mockTx.question.count).not.toHaveBeenCalled();
    expect(mockTx.question.create).not.toHaveBeenCalled();
  });

  it("rejects text over 1000 chars", async () => {
    const result = await createCustomQuestion({ text: "x".repeat(1001) });

    expect(result.success).toBe(false);
    expect(result.success ? null : result.error).toBe("Invalid input.");
    expect(mockTx.question.count).not.toHaveBeenCalled();
  });

  it("rejects guidance over 2000 chars", async () => {
    const result = await createCustomQuestion({ text: "valid", guidance: "x".repeat(2001) });

    expect(result.success).toBe(false);
    expect(result.success ? null : result.error).toBe("Invalid input.");
    expect(mockTx.question.count).not.toHaveBeenCalled();
  });

  it("accepts valid minimal input", async () => {
    mockTx.question.count.mockResolvedValue(0);
    mockTx.question.create.mockResolvedValue({ id: "q1", text: "valid" });

    const result = await createCustomQuestion({ text: "valid" });

    expect(result.success).toBe(true);
    expect(mockTx.question.count).toHaveBeenCalledTimes(1);
    expect(mockTx.question.create).toHaveBeenCalledTimes(1);
  });

  it("accepts text at max length", async () => {
    const text = "x".repeat(1000);
    mockTx.question.count.mockResolvedValue(0);
    mockTx.question.create.mockResolvedValue({ id: "q2", text });

    const result = await createCustomQuestion({ text });

    expect(result.success).toBe(true);
    expect(mockTx.question.create).toHaveBeenCalledTimes(1);
  });
});

describe("Zod validation - UpdateSchema", () => {
  it("rejects empty text", async () => {
    const result = await updateCustomQuestion("q1", { text: "" });

    expect(result.success).toBe(false);
    expect(result.success ? null : result.error).toBe("Invalid input.");
    expect(mockPrisma.question.updateMany).not.toHaveBeenCalled();
  });

  it("rejects text over 1000", async () => {
    const result = await updateCustomQuestion("q1", { text: "x".repeat(1001) });

    expect(result.success).toBe(false);
    expect(result.success ? null : result.error).toBe("Invalid input.");
    expect(mockPrisma.question.updateMany).not.toHaveBeenCalled();
  });

  it("accepts guidance null", async () => {
    mockPrisma.question.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.question.findFirst.mockResolvedValue({ id: "q1", guidance: null });

    const result = await updateCustomQuestion("q1", { guidance: null });

    expect(result.success).toBe(true);
    expect(mockPrisma.question.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.question.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ guidance: null }),
      }),
    );
  });

  it("rejects guidance over 2000", async () => {
    const result = await updateCustomQuestion("q1", { guidance: "x".repeat(2001) });

    expect(result.success).toBe(false);
    expect(result.success ? null : result.error).toBe("Invalid input.");
    expect(mockPrisma.question.updateMany).not.toHaveBeenCalled();
  });

  it("accepts valid update", async () => {
    mockPrisma.question.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.question.findFirst.mockResolvedValue({ id: "q1", text: "updated" });

    const result = await updateCustomQuestion("q1", { text: "updated" });

    expect(result.success).toBe(true);
    expect(mockPrisma.question.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("createCustomQuestion", () => {
  it("returns unauthorized when requireAdminUser throws access control error", async () => {
    vi.mocked(requireAdminUser).mockRejectedValueOnce(new Error("UNAUTHENTICATED"));

    const result = await createCustomQuestion({ text: "Hello" });

    expect(result).toEqual({ success: false, error: "Unauthorized." });
    expect(mockTx.question.count).not.toHaveBeenCalled();
  });

  it("returns cap-exceeded error when count >= 50", async () => {
    mockTx.question.count.mockResolvedValue(50);

    const result = await createCustomQuestion({ text: "Hello" });

    expect(result.success).toBe(false);
    expect(result.success ? null : result.error).toContain("Maximum of 50");
    expect(mockTx.question.create).not.toHaveBeenCalled();
  });

  it("creates question when under cap and returns id + question", async () => {
    mockTx.question.count.mockResolvedValue(3);
    mockTx.question.create.mockResolvedValue({
      id: "q-new",
      companyId: "company-xyz",
      text: "How?",
      guidance: null,
      category: "Custom",
      isCustom: true,
      createdBy: "user-abc",
      sortOrder: 3,
    });

    const result = await createCustomQuestion({ text: "How?" });

    expect(result.success).toBe(true);
    expect(result.success && result.data.id).toBe("q-new");
    expect(result.success && result.data.question.id).toBe("q-new");
    expect(AuditLogger.configuration).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("sets sortOrder equal to count value", async () => {
    let capturedData: Record<string, unknown> | undefined;
    mockTx.question.count.mockResolvedValue(5);
    mockTx.question.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return { id: "q-sort", ...data };
    });

    await createCustomQuestion({ text: "test" });

    expect(capturedData?.sortOrder).toBe(5);
  });

  it("logs and returns generic error on unexpected create failure", async () => {
    mockTx.question.count.mockRejectedValue(new Error("db down"));

    const result = await createCustomQuestion({ text: "test" });

    expect(result).toEqual({ success: false, error: "An unexpected error occurred." });
    expect(logErrorReport).toHaveBeenCalledWith("createCustomQuestion", expect.any(Error));
  });
});

describe("updateCustomQuestion", () => {
  it("returns success false with UNAUTHENTICATED when auth fails", async () => {
    vi.mocked(requireAdminUser).mockRejectedValueOnce(new Error("UNAUTHENTICATED"));

    const result = await updateCustomQuestion("q1", { text: "new" });

    expect(result).toEqual({ success: false, error: "Unauthorized." });
  });

  it("returns success false when question not found (updateMany count=0)", async () => {
    mockPrisma.question.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateCustomQuestion("q1", { text: "new" });

    expect(result).toEqual({ success: false, error: "Question not found." });
  });

  it("updates question when found (count=1) and returns updated question", async () => {
    mockPrisma.question.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.question.findFirst.mockResolvedValue({ id: "q1", text: "new" });

    const result = await updateCustomQuestion("q1", { text: "new" });

    expect(result.success).toBe(true);
    expect(result.success && result.data.id).toBe("q1");
    expect(result.success && result.data.question).toEqual({ id: "q1", text: "new" });
  });

  it("clears guidance when null is passed", async () => {
    mockPrisma.question.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.question.findFirst.mockResolvedValue({ id: "q1", guidance: null });

    await updateCustomQuestion("q1", { guidance: null });

    expect(mockPrisma.question.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { guidance: null },
      }),
    );
  });

  it("calls AuditLogger.configuration and revalidatePath on success", async () => {
    mockPrisma.question.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.question.findFirst.mockResolvedValue({ id: "q1", text: "ok" });

    await updateCustomQuestion("q1", { text: "ok" });

    expect(AuditLogger.configuration).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("logs and returns generic error on unexpected update failure", async () => {
    mockPrisma.question.updateMany.mockRejectedValue(new Error("db failure"));

    const result = await updateCustomQuestion("q1", { text: "new" });

    expect(result.success).toBe(false);
    expect(result.success ? null : result.error).toContain("An unexpected error occurred");
    expect(logErrorReport).toHaveBeenCalledTimes(1);
  });
});

describe("deleteCustomQuestion", () => {
  it("returns success false when FORBIDDEN", async () => {
    vi.mocked(requireAdminUser).mockRejectedValueOnce(new Error("FORBIDDEN"));

    const result = await deleteCustomQuestion("q1");

    expect(result).toEqual({ success: false, error: "Unauthorized." });
  });

  it("returns success false with not found when deleteMany count=0", async () => {
    mockPrisma.question.deleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteCustomQuestion("q1");

    expect(result).toEqual({ success: false, error: "Question not found." });
  });

  it("returns success true when deleteMany count=1", async () => {
    mockPrisma.question.deleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteCustomQuestion("q1");

    expect(result).toEqual({ success: true });
  });

  it("calls AuditLogger.configuration and revalidatePath on success", async () => {
    mockPrisma.question.deleteMany.mockResolvedValue({ count: 1 });

    await deleteCustomQuestion("q1");

    expect(AuditLogger.configuration).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });
});

describe("reorderCustomQuestions", () => {
  it("returns error immediately when ids array length > 50", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`);

    const result = await reorderCustomQuestions(ids);

    expect(result).toEqual({ success: false, error: "Invalid request." });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.question.updateMany).not.toHaveBeenCalled();
  });

  it("returns success when all updates succeed", async () => {
    mockPrisma.question.updateMany.mockResolvedValue({ count: 1 });

    const result = await reorderCustomQuestions(["id1", "id2", "id3"]);

    expect(result).toEqual({ success: true });
    expect(mockPrisma.question.updateMany).toHaveBeenCalledTimes(3);
    expect(mockPrisma.question.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: "id1" }),
        data: { sortOrder: 0 },
      }),
    );
    expect(mockPrisma.question.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: "id2" }),
        data: { sortOrder: 1 },
      }),
    );
    expect(mockPrisma.question.updateMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({ id: "id3" }),
        data: { sortOrder: 2 },
      }),
    );
  });

  it("calls AuditLogger.configuration on success", async () => {
    mockPrisma.question.updateMany.mockResolvedValue({ count: 1 });

    await reorderCustomQuestions(["id1"]);

    expect(AuditLogger.configuration).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("returns error when transaction rejects", async () => {
    mockPrisma.question.updateMany.mockResolvedValue({ count: 1 });
    vi.mocked(mockPrisma.$transaction).mockRejectedValueOnce(new Error("tx failed"));

    const result = await reorderCustomQuestions(["id1", "id2"]);

    expect(result).toEqual({ success: false, error: "An unexpected error occurred." });
    expect(logErrorReport).toHaveBeenCalledWith("reorderCustomQuestions", expect.any(Error));
  });
});

describe("getCustomQuestions", () => {
  it("calls findMany with companyId and isCustom=true filter", async () => {
    mockPrisma.question.findMany.mockResolvedValue([]);

    await getCustomQuestions("company-xyz");

    expect(mockPrisma.question.findMany).toHaveBeenCalledWith({
      where: { companyId: "company-xyz", isCustom: true },
      orderBy: { sortOrder: "asc" },
    });
  });
});

describe("countVendorAssessmentQuestions", () => {
  it("calls count with OR filter for global and company questions", async () => {
    mockPrisma.question.count.mockResolvedValue(23);

    const result = await countVendorAssessmentQuestions("company-xyz");

    expect(result).toBe(23);
    expect(mockPrisma.question.count).toHaveBeenCalledWith({
      where: {
        OR: [{ companyId: null }, { companyId: "company-xyz" }],
      },
    });
  });
});

describe("getVendorAssessmentQuestions", () => {
  it("calls findMany with OR filter and returns NIS2 first then custom", async () => {
    const rows = [{ id: "n1", isCustom: false }, { id: "c1", isCustom: true }];
    mockPrisma.question.findMany.mockResolvedValue(rows);

    const result = await getVendorAssessmentQuestions("company-xyz");

    expect(result).toEqual(rows);
    expect(mockPrisma.question.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ companyId: null }, { companyId: "company-xyz" }],
      },
      orderBy: [{ isCustom: "asc" }, { sortOrder: "asc" }],
    });
  });
});
