import type { RiskLevel } from "@prisma/client";

/**
 * Central risk-level calculator — single source of truth for all server actions.
 * Maps a 0-100 compliance score to a Prisma RiskLevel enum value:
 *   0–39  → HIGH
 *   40–69 → MEDIUM
 *   70–100 → LOW
 */
export function calculateRiskLevel(score: number): RiskLevel {
  if (score < 40) return "HIGH";
  if (score < 70) return "MEDIUM";
  return "LOW";
}
