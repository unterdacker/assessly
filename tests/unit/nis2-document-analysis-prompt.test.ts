import { describe, expect, it } from "vitest";
import {
  SIMULATED_VENDOR_DOCUMENT_SNIPPET,
  buildNis2DocumentAnalysisSystemPrompt,
  buildNis2DocumentAnalysisUserPayload,
} from "@/lib/nis2-document-analysis-prompt";
import type { Nis2Question } from "@/lib/nis2-questions";

describe("SIMULATED_VENDOR_DOCUMENT_SNIPPET", () => {
  it("is a non-empty string", () => {
    expect(typeof SIMULATED_VENDOR_DOCUMENT_SNIPPET).toBe("string");
    expect(SIMULATED_VENDOR_DOCUMENT_SNIPPET.length).toBeGreaterThan(0);
  });

  it("contains key security policy markers", () => {
    expect(SIMULATED_VENDOR_DOCUMENT_SNIPPET).toContain("Information Security Policy");
    expect(SIMULATED_VENDOR_DOCUMENT_SNIPPET).toContain("CISO");
    expect(SIMULATED_VENDOR_DOCUMENT_SNIPPET).toContain("AES-256");
  });
});

describe("buildNis2DocumentAnalysisSystemPrompt", () => {
  it("returns a non-empty string containing NIS2 and JSON", () => {
    const prompt = buildNis2DocumentAnalysisSystemPrompt();

    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("NIS2");
    expect(prompt).toContain("JSON");
  });

  it("does not include markdown triple-backtick fences", () => {
    const prompt = buildNis2DocumentAnalysisSystemPrompt();

    expect(prompt).not.toContain("```");
  });
});

describe("buildNis2DocumentAnalysisUserPayload", () => {
  it("includes required section delimiters and document excerpt", () => {
    const questions: Nis2Question[] = [
      {
        id: "q-1",
        category: "Governance",
        text: "Question text",
      },
    ];
    const excerpt = "Vendor policy excerpt";

    const payload = buildNis2DocumentAnalysisUserPayload({
      questions,
      documentExcerpt: excerpt,
    });

    expect(payload).toContain("=== VENDOR DOCUMENT ===");
    expect(payload).toContain("=== END DOCUMENT ===");
    expect(payload).toContain("=== COMPLIANCE QUESTIONS ===");
    expect(payload).toContain("=== END QUESTIONS ===");
    expect(payload).toContain(excerpt);
  });

  it("contains question ids in output JSON", () => {
    const questions: Nis2Question[] = [
      { id: "q-alpha", category: "Cat", text: "A" },
      { id: "q-beta", category: "Cat", text: "B" },
    ];

    const payload = buildNis2DocumentAnalysisUserPayload({
      questions,
      documentExcerpt: "doc",
    });

    expect(payload).toContain('"id": "q-alpha"');
    expect(payload).toContain('"id": "q-beta"');
  });

  it("omits guidance key when guidance is undefined", () => {
    const questions: Nis2Question[] = [
      {
        id: "q-no-guidance",
        category: "Category",
        text: "Question without guidance",
      },
    ];

    const payload = buildNis2DocumentAnalysisUserPayload({
      questions,
      documentExcerpt: "doc",
    });

    expect(payload).not.toContain('"guidance"');
  });

  it("includes guidance when provided", () => {
    const questions: Nis2Question[] = [
      {
        id: "q-guidance",
        category: "Category",
        text: "Question with guidance",
        guidance: "Use policy evidence",
      },
    ];

    const payload = buildNis2DocumentAnalysisUserPayload({
      questions,
      documentExcerpt: "doc",
    });

    expect(payload).toContain('"guidance": "Use policy evidence"');
  });
});
