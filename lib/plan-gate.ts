import "server-only";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { checkLicense } from "@/lib/license/gate";

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
  if (process.env.NODE_ENV === "development") return true;
  if (env.LICENSE_PUBLIC_KEY) {
    const licenseCheck = await checkLicense();
    if (licenseCheck.allowed) return true;
  }

  return (await getCompanyPlan(companyId)) === "PREMIUM";
}
