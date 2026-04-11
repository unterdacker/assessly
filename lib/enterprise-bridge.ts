import "server-only";

import { isPremiumPlan } from "@/lib/plan-gate";

export class PremiumGateError extends Error {
  readonly companyId: string;

  constructor(companyId: string) {
    super(`Premium plan required for companyId=${companyId}`);
    this.name = "PremiumGateError";
    this.companyId = companyId;
  }
}

/**
 * Throws PremiumGateError if the company is not on a PREMIUM plan.
 * Call at the top of every premium Server Action before any data access.
 */
export async function requirePremiumPlan(
  companyId: string | null | undefined,
): Promise<void> {
  const premium = await isPremiumPlan(companyId);
  if (!premium) {
    throw new PremiumGateError(companyId ?? "unknown");
  }
}

/**
 * Returns true if the company has the premium feature enabled.
 * Does NOT throw - use requirePremiumPlan() in mutations.
 * Use this in UI components to conditionally render upgrade prompts.
 */
export async function isPremiumFeatureEnabled(
  companyId: string | null | undefined,
): Promise<boolean> {
  return isPremiumPlan(companyId);
}
