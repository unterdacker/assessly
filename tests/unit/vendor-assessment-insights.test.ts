import { describe, expect, it } from "vitest";
import { buildVendorAssessmentInsightLines } from "@/lib/vendor-assessment-insights";

function makeFixture(name: string, complianceScore: number) {
  return {
    id: "vendor-001",
    name,
    accessCode: null,
    codeExpiresAt: null,
    isCodeActive: false,
    inviteSentAt: null,
    inviteTokenExpires: null,
    isFirstLogin: false,
    email: "v@example.com",
    serviceType: "SaaS",
    lastAssessmentDate: null,
    riskLevel: "not_calculated" as const,
    status: "pending" as const,
    complianceScore,
    documentUrl: null,
    documentFilename: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    dueDate: null,
    createdBy: "system",
    dossierCompletion: 0,
    questionnaireProgress: 0,
    questionsFilled: 0,
  };
}

describe("buildVendorAssessmentInsightLines", () => {
  it("returns high-concern lines for score < 40", () => {
    const lines = buildVendorAssessmentInsightLines(makeFixture("Vendor A", 39));

    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("Automated scan");
    expect(lines[1]).toContain("AI summary");
    expect(lines[2]).toContain("Elevated concern");
    expect(lines[3]).toContain("Recommendation");
  });

  it("returns moderate-gap line at score 40", () => {
    const lines = buildVendorAssessmentInsightLines(makeFixture("Vendor B", 40));

    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("Moderate gap");
  });

  it("returns moderate-gap line at score 70", () => {
    const lines = buildVendorAssessmentInsightLines(makeFixture("Vendor C", 70));

    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("Moderate gap");
  });

  it("returns healthy posture line at score 71", () => {
    const lines = buildVendorAssessmentInsightLines(makeFixture("Vendor D", 71));

    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("Posture appears consistent");
  });

  it("returns healthy posture line at score 100", () => {
    const lines = buildVendorAssessmentInsightLines(makeFixture("Vendor E", 100));

    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("Posture appears consistent");
  });

  it("uses high-concern path for score 0", () => {
    const lines = buildVendorAssessmentInsightLines(makeFixture("Vendor F", 0));

    expect(lines).toHaveLength(4);
  });
});
