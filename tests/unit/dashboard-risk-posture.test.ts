import { describe, expect, it } from "vitest";
import {
  DASHBOARD_CATEGORY_ORDER,
  isOpenGapStatus,
  normalizeDashboardCategory,
  scoreAnswerStatus,
} from "@/lib/dashboard-risk-posture";

describe("normalizeDashboardCategory", () => {
  it("maps all known aliases", () => {
    expect(normalizeDashboardCategory("governance & risk management")).toBe("governanceRisk");
    expect(normalizeDashboardCategory("access & identity")).toBe("accessIdentity");
    expect(normalizeDashboardCategory("data protection & privacy")).toBe("dataProtectionPrivacy");
    expect(normalizeDashboardCategory("cryptography & key management")).toBe("encryption");
    expect(normalizeDashboardCategory("operations & monitoring")).toBe("operationsMonitoring");
    expect(normalizeDashboardCategory("incident & business continuity")).toBe("incidentManagement");
    expect(normalizeDashboardCategory("supply chain & development")).toBe("supplyChainSecurity");
  });

  it("trims whitespace and is case-insensitive", () => {
    expect(normalizeDashboardCategory("  Governance & Risk Management  ")).toBe("governanceRisk");
  });

  it("falls back to governanceRisk for unknown categories", () => {
    expect(normalizeDashboardCategory("something else")).toBe("governanceRisk");
  });
});

describe("scoreAnswerStatus", () => {
  it("maps known statuses to score weights", () => {
    expect(scoreAnswerStatus("COMPLIANT")).toBe(100);
    expect(scoreAnswerStatus("PARTIALLY_COMPLIANT")).toBe(60);
    expect(scoreAnswerStatus("FLAGGED")).toBe(40);
    expect(scoreAnswerStatus("NON_COMPLIANT")).toBe(0);
    expect(scoreAnswerStatus("")).toBe(0);
  });
});

describe("isOpenGapStatus", () => {
  it("returns false only for COMPLIANT", () => {
    expect(isOpenGapStatus("COMPLIANT")).toBe(false);
    expect(isOpenGapStatus("NON_COMPLIANT")).toBe(true);
    expect(isOpenGapStatus("PENDING")).toBe(true);
    expect(isOpenGapStatus("PARTIALLY_COMPLIANT")).toBe(true);
  });
});

describe("DASHBOARD_CATEGORY_ORDER", () => {
  it("contains all seven dashboard category keys", () => {
    expect(DASHBOARD_CATEGORY_ORDER).toHaveLength(7);
    expect(DASHBOARD_CATEGORY_ORDER).toEqual(
      expect.arrayContaining([
        "governanceRisk",
        "accessIdentity",
        "dataProtectionPrivacy",
        "encryption",
        "operationsMonitoring",
        "incidentManagement",
        "supplyChainSecurity",
      ]),
    );
  });
});
