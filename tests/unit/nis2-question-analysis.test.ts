import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AnalyzeDocumentResponseSchema,
  Nis2AnalysisParseError,
  Nis2QuestionAnalysisSchema,
  parseNis2AnalysisResults,
} from "@/lib/nis2-question-analysis";

describe("Nis2QuestionAnalysisSchema", () => {
  it("accepts a valid analysis item", () => {
    const parsed = Nis2QuestionAnalysisSchema.safeParse({
      questionId: "q1",
      status: "compliant",
      reasoning: "ok",
      evidenceSnippet: "",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects unknown status values", () => {
    const parsed = Nis2QuestionAnalysisSchema.safeParse({
      questionId: "q1",
      status: "unknown",
      reasoning: "ok",
      evidenceSnippet: "",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects too-long reasoning", () => {
    const parsed = Nis2QuestionAnalysisSchema.safeParse({
      questionId: "q1",
      status: "compliant",
      reasoning: "x".repeat(10_001),
      evidenceSnippet: "",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects too-long evidence snippets", () => {
    const parsed = Nis2QuestionAnalysisSchema.safeParse({
      questionId: "q1",
      status: "compliant",
      reasoning: "ok",
      evidenceSnippet: "x".repeat(5_001),
    });

    expect(parsed.success).toBe(false);
  });
});

describe("AnalyzeDocumentResponseSchema", () => {
  it("accepts ok:true with results", () => {
    expect(AnalyzeDocumentResponseSchema.safeParse({ ok: true, results: [] }).success).toBe(true);
  });

  it("accepts ok:false with error", () => {
    expect(AnalyzeDocumentResponseSchema.safeParse({ ok: false, error: "boom" }).success).toBe(true);
  });

  it("rejects ok:true without results", () => {
    expect(AnalyzeDocumentResponseSchema.safeParse({ ok: true }).success).toBe(false);
  });
});

describe("Nis2AnalysisParseError", () => {
  it("captures issue count and paths from Zod errors", () => {
    const invalid = Nis2QuestionAnalysisSchema.safeParse({});
    expect(invalid.success).toBe(false);

    const error = new Nis2AnalysisParseError((invalid as { error: z.ZodError }).error);

    expect(error.zodIssueCount).toBeGreaterThan(0);
    expect(Array.isArray(error.zodPaths)).toBe(true);
  });
});

describe("parseNis2AnalysisResults", () => {
  const validItem = {
    questionId: "q1",
    status: "compliant",
    reasoning: "ok",
    evidenceSnippet: "snippet",
  } as const;

  it("parses a valid bare array", () => {
    expect(parseNis2AnalysisResults([validItem])).toEqual([validItem]);
  });

  it("parses a valid wrapped results payload", () => {
    expect(parseNis2AnalysisResults({ results: [validItem] })).toEqual([validItem]);
  });

  it("throws Nis2AnalysisParseError for invalid top-level shape", () => {
    expect(() => parseNis2AnalysisResults({ nope: true })).toThrow(Nis2AnalysisParseError);
  });

  it("throws Nis2AnalysisParseError when one array item is invalid", () => {
    expect(() =>
      parseNis2AnalysisResults([
        validItem,
        { ...validItem, status: "invalid" },
      ]),
    ).toThrow(Nis2AnalysisParseError);
  });
});
