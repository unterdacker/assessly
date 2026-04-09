import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assessment: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/ensure-demo-data", () => ({
  DEMO_DATA_ACTOR: "demo-seed",
}));

import {
  computeComplianceScorePercent,
  countStrictlyCompliantAnswers,
  strictComplianceFromAnswers,
  syncAssessmentComplianceToDatabase,
} from "@/lib/assessment-compliance";
import { prisma } from "@/lib/prisma";

describe("countStrictlyCompliantAnswers", () => {
  it("counts only COMPLIANT answers", () => {
    expect(countStrictlyCompliantAnswers([])).toBe(0);
    expect(
      countStrictlyCompliantAnswers([
        { status: "COMPLIANT" },
        { status: "NON_COMPLIANT" },
        { status: "COMPLIANT" },
      ]),
    ).toBe(2);
    expect(countStrictlyCompliantAnswers([{ status: "NON_COMPLIANT" }])).toBe(0);
    expect(
      countStrictlyCompliantAnswers([
        { status: "COMPLIANT" },
        { status: "PARTIALLY_COMPLIANT" },
      ]),
    ).toBe(1);
  });
});

describe("computeComplianceScorePercent", () => {
  it("computes and rounds percentages", () => {
    expect(computeComplianceScorePercent(10, 20)).toBe(50);
    expect(computeComplianceScorePercent(0, 20)).toBe(0);
    expect(computeComplianceScorePercent(20, 20)).toBe(100);
    expect(computeComplianceScorePercent(1, 3)).toBe(33);
  });

  it("returns zero when totalQuestions is zero", () => {
    expect(computeComplianceScorePercent(10, 0)).toBe(0);
  });
});

describe("strictComplianceFromAnswers", () => {
  it("returns compliant count, score and risk level", () => {
    const answers = [
      ...Array.from({ length: 15 }, () => ({ status: "COMPLIANT" })),
      ...Array.from({ length: 5 }, () => ({ status: "NON_COMPLIANT" })),
    ];

    const result = strictComplianceFromAnswers(answers, 20);

    expect(result.compliantCount).toBe(15);
    expect(result.score).toBe(75);
    expect(result.riskLevel).toBe("LOW");
  });
});

describe("syncAssessmentComplianceToDatabase", () => {
  beforeEach(() => {
    vi.mocked(prisma.assessment.update).mockClear();
  });

  it("returns stored values for demo actor with empty answers", async () => {
    const result = await syncAssessmentComplianceToDatabase(
      "assessment-1",
      [],
      20,
      80,
      "LOW",
      "demo-seed",
    );

    expect(result).toEqual({ score: 80, riskLevel: "LOW" });
    expect(vi.mocked(prisma.assessment.update)).toHaveBeenCalledTimes(0);
  });

  it("skips update when computed values match stored values", async () => {
    const result = await syncAssessmentComplianceToDatabase(
      "assessment-2",
      [{ status: "COMPLIANT" }, { status: "NON_COMPLIANT" }],
      2,
      50,
      "MEDIUM",
      "someone",
    );

    expect(result).toEqual({ score: 50, riskLevel: "MEDIUM" });
    expect(vi.mocked(prisma.assessment.update)).toHaveBeenCalledTimes(0);
  });

  it("updates database when score diverges", async () => {
    const result = await syncAssessmentComplianceToDatabase(
      "assessment-3",
      [{ status: "COMPLIANT" }, { status: "COMPLIANT" }],
      2,
      50,
      "MEDIUM",
      "someone",
    );

    expect(result).toEqual({ score: 100, riskLevel: "LOW" });
    expect(vi.mocked(prisma.assessment.update)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.assessment.update)).toHaveBeenCalledWith({
      where: { id: "assessment-3" },
      data: { complianceScore: 100, riskLevel: "LOW" },
    });
  });

  it("updates when storedScore is undefined", async () => {
    await syncAssessmentComplianceToDatabase(
      "assessment-4",
      [{ status: "NON_COMPLIANT" }],
      1,
      undefined,
      "HIGH",
      "someone",
    );

    expect(vi.mocked(prisma.assessment.update)).toHaveBeenCalledTimes(1);
  });

  it("updates when no stored values are provided", async () => {
    await syncAssessmentComplianceToDatabase(
      "assessment-5",
      [{ status: "NON_COMPLIANT" }],
      1,
    );

    expect(vi.mocked(prisma.assessment.update)).toHaveBeenCalledTimes(1);
  });
});
