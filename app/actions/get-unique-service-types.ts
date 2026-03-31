"use server";

import { prisma } from "@/lib/prisma";
import { logErrorReport } from "@/lib/logger";
import { requireAdminUser } from "@/lib/auth/server";

/**
 * Returns every distinct `vendorServiceType` string that has been saved
 * across all vendors in the given company.
 *
 * This is the backbone of the "learn-as-you-go" service-type system:
 * no hardcoded list, no separate lookup table — the Vendor table
 * itself is the canonical source of truth.
 */
export async function getUniqueServiceTypes(
  companyId: string,
): Promise<string[]> {
  try {
    const session = await requireAdminUser();
    if (!session.companyId || session.companyId !== companyId) {
      return [];
    }
    const rows = await prisma.vendor.findMany({
      where: {
        companyId,
        vendorServiceType: { not: null },
      },
      distinct: ["vendorServiceType"],
      select: { vendorServiceType: true },
      orderBy: { vendorServiceType: "asc" },
    });

    return rows
      .map((r) => r.vendorServiceType)
      .filter((v): v is string => Boolean(v) && v !== "Other (Custom)");
  } catch (err) {
    logErrorReport("getUniqueServiceTypes", err);
    return [];
  }
}
