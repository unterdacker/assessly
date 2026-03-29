"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logErrorReport } from "@/lib/logger";

export type UpdateVendorProfileInput = {
  vendorId: string;
  officialName?: string;
  registrationId?: string;
  vendorServiceType?: string;
  securityOfficerName?: string;
  securityOfficerEmail?: string;
  dpoName?: string;
  dpoEmail?: string;
  headquartersLocation?: string;
};

export type UpdateVendorProfileResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Server action to update vendor profile metadata.
 */
export async function updateVendorProfile(
  input: UpdateVendorProfileInput,
): Promise<UpdateVendorProfileResult> {
  const {
    vendorId,
    officialName,
    registrationId,
    vendorServiceType,
    securityOfficerName,
    securityOfficerEmail,
    dpoName,
    dpoEmail,
    headquartersLocation,
  } = input;

  // Basic validation
  if (securityOfficerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(securityOfficerEmail)) {
    return { success: false, error: "Invalid Security Officer email format." };
  }
  if (dpoEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dpoEmail)) {
    return { success: false, error: "Invalid DPO email format." };
  }

  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    if (!vendor) return { success: false, error: "Vendor not found." };

    // Update both the display name (name) and officialName to ensure global sync
    await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        name: officialName?.trim() || vendor.name,
        officialName: officialName || null,
        registrationId: registrationId || null,
        vendorServiceType: vendorServiceType || null,
        securityOfficerName: securityOfficerName || null,
        securityOfficerEmail: securityOfficerEmail || null,
        dpoName: dpoName || null,
        dpoEmail: dpoEmail || null,
        headquartersLocation: headquartersLocation || null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        companyId: vendor.companyId,
        action: `Updated vendor profile for ${officialName?.trim() || vendor.name}`,
        entityType: "vendor",
        entityId: vendorId,
        actorId: "user",
        createdBy: "user",
        metadata: { updatedFields: Object.keys(input).filter(k => k !== 'vendorId') },
      },
    });

    revalidatePath("/vendors");
    revalidatePath(`/vendors/${vendorId}/assessment`);
    revalidatePath(`/vendors/${vendorId}/assessment`, "page");

    return { success: true };
  } catch (err) {
    logErrorReport("updateVendorProfile", err);
    return { success: false, error: "Failed to update vendor profile. Please try again." };
  }
}