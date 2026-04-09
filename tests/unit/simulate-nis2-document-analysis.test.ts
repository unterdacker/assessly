import { describe, expect, it } from "vitest";
import { simulateNis2DocumentAnalysis } from "@/lib/simulate-nis2-document-analysis";
import { nis2Questions } from "@/lib/nis2-questions";

describe("simulateNis2DocumentAnalysis", () => {
  it("returns one result per NIS2 question by default", () => {
    const result = simulateNis2DocumentAnalysis();

    expect(result).toHaveLength(nis2Questions.length);
  });

  it("returns expected item shape", () => {
    const result = simulateNis2DocumentAnalysis();

    for (const item of result) {
      expect(typeof item.questionId).toBe("string");
      expect(typeof item.reasoning).toBe("string");
      expect(typeof item.evidenceSnippet).toBe("string");
      expect(["compliant", "non-compliant"]).toContain(item.status);
    }
  });

  it("returns non-compliant for all questions on empty input", () => {
    const result = simulateNis2DocumentAnalysis("");

    expect(result).toHaveLength(nis2Questions.length);
    expect(result.every((item) => item.status === "non-compliant")).toBe(true);
  });

  it("marks matching controls compliant for rich keyword input", () => {
    const result = simulateNis2DocumentAnalysis(
      "information security policy approved tls aes-256 penetration",
    );

    const byId = new Map(result.map((item) => [item.questionId, item.status]));

    expect(byId.get("q1")).toBe("compliant");
    expect(byId.get("q9")).toBe("compliant");
    expect(byId.get("q20")).toBe("compliant");
  });

  it("matches keywords case-insensitively", () => {
    const result = simulateNis2DocumentAnalysis(
      "INFORMATION SECURITY POLICY APPROVED TLS AES-256 PENETRATION",
    );

    const byId = new Map(result.map((item) => [item.questionId, item.status]));

    expect(byId.get("q1")).toBe("compliant");
    expect(byId.get("q9")).toBe("compliant");
    expect(byId.get("q20")).toBe("compliant");
  });
});
