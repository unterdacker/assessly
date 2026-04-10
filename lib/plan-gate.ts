import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Returns the Company's current plan, or "FREE" if the company is not found.
 * Safe to call with null/undefined companyId — returns "FREE" in that case.
 */
export async function getCompanyPlan(
  companyId: string | null | undefined,
): Promise<"FREE" | "PREMIUM"> {
  if (!companyId) return "FREE";

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { plan: true },
  });

  return company?.plan ?? "FREE";
}

/**
 * Returns true if the company is on the PREMIUM plan.
 * Safe to call with null/undefined companyId — returns false in that case.
 */
export async function isPremiumPlan(
  companyId: string | null | undefined,
): Promise<boolean> {
  return (await getCompanyPlan(companyId)) === "PREMIUM";
}
