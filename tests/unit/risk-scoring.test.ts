/**
 * Unit tests — Risk Scoring Engine
 *
 * Covers:
 *   - calculateRiskLevel: boundary values, exact thresholds, all three bands
 *   - riskLevelFromScore (vendor-assessment): maps score → "low"|"medium"|"high"
 *   - countStrictlyCompliantAnswers: only "COMPLIANT" status counts
 *   - computeComplianceScorePercent: rounding, zero-division guard
 *   - strictComplianceFromAnswers: integrated pipeline with riskLevel output
 *   - supplyChainRiskScore: empty list, single vendor, averaged rounding
 *   - countByStatus: correct filtering per status
 *   - calculateDossierCompletion: field counting, empty/partial/full
 */

import { describe, it, expect } from "vitest";
import { calculateRiskLevel } from "@/lib/risk-level";
import {
  countStrictlyCompliantAnswers,
  computeComplianceScorePercent,
  strictComplianceFromAnswers,
} from "@/lib/assessment-compliance";
import {
  riskLevelFromScore,
  supplyChainRiskScore,
  countByStatus,
  calculateDossierCompletion,
  type VendorAssessment,
} from "@/lib/vendor-assessment";

// ---------------------------------------------------------------------------
// calculateRiskLevel (lib/risk-level.ts)
// ---------------------------------------------------------------------------

describe("calculateRiskLevel", () => {
  it("returns HIGH for scores 0–39", () => {
    expect(calculateRiskLevel(0)).toBe("HIGH");
    expect(calculateRiskLevel(1)).toBe("HIGH");
    expect(calculateRiskLevel(39)).toBe("HIGH");
  });

  it("returns MEDIUM for scores 40–69", () => {
    expect(calculateRiskLevel(40)).toBe("MEDIUM");
    expect(calculateRiskLevel(55)).toBe("MEDIUM");
    expect(calculateRiskLevel(69)).toBe("MEDIUM");
  });

  it("returns LOW for scores 70–100", () => {
    expect(calculateRiskLevel(70)).toBe("LOW");
    expect(calculateRiskLevel(85)).toBe("LOW");
    expect(calculateRiskLevel(100)).toBe("LOW");
  });

  it("treats boundary 40 as MEDIUM (not HIGH)", () => {
    expect(calculateRiskLevel(40)).toBe("MEDIUM");
  });

  it("treats boundary 70 as LOW (not MEDIUM)", () => {
    expect(calculateRiskLevel(70)).toBe("LOW");
  });
});

// ---------------------------------------------------------------------------
// riskLevelFromScore (lib/vendor-assessment.ts — UI types, lowercase values)
// ---------------------------------------------------------------------------

describe("riskLevelFromScore", () => {
  it("returns 'high' below 40", () => {
    expect(riskLevelFromScore(0)).toBe("high");
    expect(riskLevelFromScore(39)).toBe("high");
  });

  it("returns 'medium' for 40–70", () => {
    expect(riskLevelFromScore(40)).toBe("medium");
    expect(riskLevelFromScore(70)).toBe("medium");
  });

  it("returns 'low' above 70", () => {
    expect(riskLevelFromScore(71)).toBe("low");
    expect(riskLevelFromScore(100)).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// countStrictlyCompliantAnswers
// ---------------------------------------------------------------------------

describe("countStrictlyCompliantAnswers", () => {
  it("counts only answers with status exactly 'COMPLIANT'", () => {
    const answers = [
      { status: "COMPLIANT" },
      { status: "NON_COMPLIANT" },
      { status: "PENDING" },
      { status: "COMPLIANT" },
      { status: "" },
    ];
    expect(countStrictlyCompliantAnswers(answers)).toBe(2);
  });

  it("returns 0 when all answers are non-compliant", () => {
    expect(
      countStrictlyCompliantAnswers([{ status: "NON_COMPLIANT" }, { status: "PENDING" }]),
    ).toBe(0);
  });

  it("returns the full count when all answers are COMPLIANT", () => {
    const all = Array.from({ length: 20 }, () => ({ status: "COMPLIANT" }));
    expect(countStrictlyCompliantAnswers(all)).toBe(20);
  });

  it("returns 0 for an empty array", () => {
    expect(countStrictlyCompliantAnswers([])).toBe(0);
  });

  it("is case-sensitive — 'compliant' does not count", () => {
    expect(countStrictlyCompliantAnswers([{ status: "compliant" }])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeComplianceScorePercent
// ---------------------------------------------------------------------------

describe("computeComplianceScorePercent", () => {
  it("calculates percentage and rounds to nearest integer", () => {
    // 10/20 = 50%
    expect(computeComplianceScorePercent(10, 20)).toBe(50);
    // 1/3 ≈ 33.33 → 33
    expect(computeComplianceScorePercent(1, 3)).toBe(33);
    // 2/3 ≈ 66.67 → 67
    expect(computeComplianceScorePercent(2, 3)).toBe(67);
  });

  it("returns 0 when totalQuestions is 0 (prevents division by zero)", () => {
    expect(computeComplianceScorePercent(0, 0)).toBe(0);
    expect(computeComplianceScorePercent(5, 0)).toBe(0);
  });

  it("returns 100 when all questions are compliant", () => {
    expect(computeComplianceScorePercent(20, 20)).toBe(100);
  });

  it("returns 0 when compliant count is 0", () => {
    expect(computeComplianceScorePercent(0, 20)).toBe(0);
  });

  it("returns negative totalQuestions as 0", () => {
    // totalQuestions <= 0 guard
    expect(computeComplianceScorePercent(5, -1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// strictComplianceFromAnswers — integrated pipeline
// ---------------------------------------------------------------------------

describe("strictComplianceFromAnswers", () => {
  it("returns correct compliantCount, score, and riskLevel for a HIGH risk scenario", () => {
    const answers = Array.from({ length: 20 }, (_, i) => ({
      status: i < 5 ? "COMPLIANT" : "NON_COMPLIANT",
    }));
    const result = strictComplianceFromAnswers(answers, 20);
    expect(result.compliantCount).toBe(5);
    expect(result.score).toBe(25);
    expect(result.riskLevel).toBe("HIGH");
  });

  it("returns MEDIUM for a 50% compliant score", () => {
    const answers = Array.from({ length: 20 }, (_, i) => ({
      status: i < 10 ? "COMPLIANT" : "NON_COMPLIANT",
    }));
    const result = strictComplianceFromAnswers(answers, 20);
    expect(result.score).toBe(50);
    expect(result.riskLevel).toBe("MEDIUM");
  });

  it("returns LOW for full compliance", () => {
    const answers = Array.from({ length: 20 }, () => ({ status: "COMPLIANT" }));
    const result = strictComplianceFromAnswers(answers, 20);
    expect(result.score).toBe(100);
    expect(result.riskLevel).toBe("LOW");
  });

  it("returns score 0 and HIGH when answers list is empty", () => {
    const result = strictComplianceFromAnswers([], 20);
    expect(result.compliantCount).toBe(0);
    expect(result.score).toBe(0);
    expect(result.riskLevel).toBe("HIGH");
  });

  it("boundary: 14/20 → score 70 → LOW", () => {
    const answers = Array.from({ length: 20 }, (_, i) => ({
      status: i < 14 ? "COMPLIANT" : "NON_COMPLIANT",
    }));
    const result = strictComplianceFromAnswers(answers, 20);
    expect(result.score).toBe(70);
    expect(result.riskLevel).toBe("LOW");
  });

  it("boundary: 13/20 → score 65 → MEDIUM", () => {
    const answers = Array.from({ length: 20 }, (_, i) => ({
      status: i < 13 ? "COMPLIANT" : "NON_COMPLIANT",
    }));
    const result = strictComplianceFromAnswers(answers, 20);
    expect(result.score).toBe(65);
    expect(result.riskLevel).toBe("MEDIUM");
  });
});

// ---------------------------------------------------------------------------
// supplyChainRiskScore
// ---------------------------------------------------------------------------

describe("supplyChainRiskScore", () => {
  const makeVendor = (score: number): VendorAssessment =>
    ({
      id: `v-${score}`,
      name: "Vendor",
      accessCode: null,
      codeExpiresAt: null,
      isCodeActive: false,
      inviteSentAt: null,
      isFirstLogin: false,
      email: "v@example.com",
      serviceType: "IT",
      lastAssessmentDate: null,
      riskLevel: riskLevelFromScore(score),
      status: "completed",
      complianceScore: score,
      documentUrl: null,
      documentFilename: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdBy: "system",
      dossierCompletion: 0,
      questionnaireProgress: 0,
      questionsFilled: 0,
    }) as VendorAssessment;

  it("returns 100 for an empty portfolio (no risk)", () => {
    expect(supplyChainRiskScore([])).toBe(100);
  });

  it("returns the score directly for a single vendor", () => {
    expect(supplyChainRiskScore([makeVendor(60)])).toBe(60);
  });

  it("averages scores across multiple vendors", () => {
    expect(supplyChainRiskScore([makeVendor(40), makeVendor(80)])).toBe(60);
  });

  it("rounds the average to the nearest integer", () => {
    // (50 + 51) / 2 = 50.5 → 51 (Math.round)
    expect(supplyChainRiskScore([makeVendor(50), makeVendor(51)])).toBe(51);
  });
});

// ---------------------------------------------------------------------------
// countByStatus
// ---------------------------------------------------------------------------

describe("countByStatus", () => {
  const vendors = [
    { status: "completed" },
    { status: "pending" },
    { status: "pending" },
    { status: "incomplete" },
  ] as Pick<VendorAssessment, "status">[] as VendorAssessment[];

  it("counts completed vendors", () => {
    expect(countByStatus(vendors, "completed")).toBe(1);
  });

  it("counts pending vendors", () => {
    expect(countByStatus(vendors, "pending")).toBe(2);
  });

  it("counts incomplete vendors", () => {
    expect(countByStatus(vendors, "incomplete")).toBe(1);
  });

  it("returns 0 for a status not present", () => {
    expect(countByStatus([], "completed")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateDossierCompletion
// ---------------------------------------------------------------------------

describe("calculateDossierCompletion", () => {
  it("returns 0 when vendor is undefined", () => {
    expect(calculateDossierCompletion(undefined)).toBe(0);
  });

  it("returns 0 when all six fields are absent", () => {
    expect(calculateDossierCompletion({})).toBe(0);
  });

  it("returns 100 when all six fields are present", () => {
    expect(
      calculateDossierCompletion({
        registrationId: "REG-123",
        headquartersLocation: "Berlin, DE",
        securityOfficerName: "Alice",
        securityOfficerEmail: "alice@example.com",
        dpoName: "Bob",
        dpoEmail: "bob@example.com",
      }),
    ).toBe(100);
  });

  it("returns 50 when three of six fields are filled", () => {
    expect(
      calculateDossierCompletion({
        registrationId: "REG-123",
        headquartersLocation: "Paris, FR",
        securityOfficerName: "Carol",
      }),
    ).toBe(50);
  });

  it("treats null and empty string as missing fields", () => {
    expect(
      calculateDossierCompletion({
        registrationId: null,
        headquartersLocation: "",
        securityOfficerName: "Dave",
      }),
    ).toBe(17); // 1/6 ≈ 16.7 → 17
  });
});
