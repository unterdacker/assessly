export type DashboardCategoryKey =
  | "governanceRisk"
  | "accessIdentity"
  | "dataProtectionPrivacy"
  | "encryption"
  | "operationsMonitoring"
  | "incidentManagement"
  | "supplyChainSecurity";

export type DashboardRiskLevelKey = "low" | "medium" | "high";

export const DASHBOARD_CATEGORY_ORDER: DashboardCategoryKey[] = [
  "governanceRisk",
  "accessIdentity",
  "dataProtectionPrivacy",
  "encryption",
  "operationsMonitoring",
  "incidentManagement",
  "supplyChainSecurity",
];

const CATEGORY_ALIASES: Record<string, DashboardCategoryKey> = {
  "governance & risk management": "governanceRisk",
  "access & identity": "accessIdentity",
  "data protection & privacy": "dataProtectionPrivacy",
  "cryptography & key management": "encryption",
  "operations & monitoring": "operationsMonitoring",
  "incident & business continuity": "incidentManagement",
  "supply chain & development": "supplyChainSecurity",
};

export function normalizeDashboardCategory(category: string): DashboardCategoryKey {
  const normalized = category.trim().toLowerCase();
  return CATEGORY_ALIASES[normalized] ?? "governanceRisk";
}

export function scoreAnswerStatus(status: string): number {
  const normalized = status.trim().toUpperCase();

  if (normalized === "COMPLIANT") {
    return 100;
  }

  if (normalized === "PARTIALLY_COMPLIANT") {
    return 60;
  }

  if (normalized === "FLAGGED") {
    return 40;
  }

  return 0;
}

export function isOpenGapStatus(status: string): boolean {
  return status.trim().toUpperCase() !== "COMPLIANT";
}
