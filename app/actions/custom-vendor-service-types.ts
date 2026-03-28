"use server";

import { prisma } from "@/lib/prisma";
import { logErrorReport } from "@/lib/logger";

/**
 * Fetch custom vendor service types for a company.
 */
export async function getCustomVendorServiceTypes(
  companyId: string,
): Promise<string[]> {
  try {
    const customTypes = await prisma.customVendorServiceType.findMany({
      where: { companyId },
      select: { name: true },
      orderBy: { createdAt: "asc" },
    });
    return customTypes.map((t) => t.name);
  } catch (err) {
    logErrorReport("getCustomVendorServiceTypes", err);
    return [];
  }
}

export type SaveCustomVendorServiceTypeInput = {
  companyId: string;
  name: string;
};

export type SaveCustomVendorServiceTypeResult =
  | { success: true; created: boolean }
  | { success: false; error: string };

/**
 * Save a custom vendor service type for a company.
 * Returns `created: true` if this is a new type, `false` if it already existed.
 */
export async function saveCustomVendorServiceType(
  input: SaveCustomVendorServiceTypeInput,
): Promise<SaveCustomVendorServiceTypeResult> {
  const { companyId, name } = input;

  if (!name.trim()) {
    return { success: false, error: "Service type name cannot be empty." };
  }

  try {
    const existing = await prisma.customVendorServiceType.findUnique({
      where: { companyId_name: { companyId, name: name.trim() } },
    });

    if (existing) {
      return { success: true, created: false };
    }

    await prisma.customVendorServiceType.create({
      data: {
        companyId,
        name: name.trim(),
        createdBy: "user",
      },
    });

    return { success: true, created: true };
  } catch (err) {
    logErrorReport("saveCustomVendorServiceType", err);
    return { success: false, error: "Failed to save custom service type." };
  }
}