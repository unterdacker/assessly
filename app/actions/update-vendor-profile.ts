"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logErrorReport } from "@/lib/logger";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";
import { logAuditEvent } from "@/lib/audit-log";
import { AuditLogger } from "@/lib/structured-logger";

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
    const session = await requireAdminUser();
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    if (!vendor || vendor.companyId !== session.companyId) {
      return { success: false, error: "Vendor not found." };
    }

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

    // Audit log — hash-chained via centralized logAuditEvent
    await logAuditEvent(
      {
        companyId: vendor.companyId,
        userId: session.userId,
        action: "VENDOR_CREATED", // vendor profile update (closest available action)
        entityType: "Vendor",
        entityId: vendorId,
        previousValue: { name: vendor.name },
        newValue: { name: officialName?.trim() || vendor.name, updatedFields: Object.keys(input).filter(k => k !== 'vendorId') },
      },
      { captureHeaders: true },
    );

    AuditLogger.dataOp("vendor.profile_updated", "success", {
      userId: session.userId,
      entityType: "Vendor",
      entityId: vendorId,
      message: `Vendor profile updated for ${officialName?.trim() || vendor.name}`,
      details: { updatedFields: Object.keys(input).filter(k => k !== 'vendorId') },
    });

    revalidatePath("/vendors");
    revalidatePath(`/vendors/${vendorId}/assessment`);
    revalidatePath(`/vendors/${vendorId}/assessment`, "page");

    return { success: true };
  } catch (err) {
    if (isAccessControlError(err)) {
      return { success: false, error: "Unauthorized." };
    }
    logErrorReport("updateVendorProfile", err);
    return { success: false, error: "Failed to update vendor profile. Please try again." };
  }
}