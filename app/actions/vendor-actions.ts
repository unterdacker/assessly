"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/queries/vendor-assessments";
import { calculateRiskLevel } from "@/lib/risk-level";
import crypto from "crypto";

const ANON_ACTOR = "anonymous:prototype";

export type CreateVendorResult =
  | { ok: true; token?: string }
  | { ok: false; error: string };

export type DeleteVendorResult =
  | { ok: true }
  | { ok: false; error: string };

export type DeleteVendorsResult =
  | { ok: true; deletedCount: number }
  | { ok: false; error: string };

/**
 * Creates a new vendor and their initial security assessment.
 * Generates a secure invite token for external third-party access.
 */
export async function createVendorAction(
  formData: FormData,
): Promise<CreateVendorResult> {
  const companyId = await getDefaultCompanyId();
  if (!companyId) {
    return {
      ok: false,
      error:
        "Database is empty. Run: npx prisma migrate dev && npx prisma db seed",
    };
  }

  const name = formData.get("name");
  const email = formData.get("email");
  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, error: "Organization name is required." };
  }
  if (typeof email !== "string" || !email.trim()) {
    return { ok: false, error: "Security contact email is required." };
  }

  /** No compliant answers yet — strict score is 0 and risk is HIGH. */
  const complianceScore = 0;
  const riskLevel = calculateRiskLevel(complianceScore);

  // Generate a secure token for the external portal
  const inviteToken = crypto.randomUUID().replace(/-/g, "");
  const inviteTokenExpires = new Date();
  inviteTokenExpires.setDate(inviteTokenExpires.getDate() + 14);

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Create the Vendor record
      const vendor = await (tx.vendor as any).create({
        data: {
          companyId,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          serviceType: "Pending classification",
          createdBy: ANON_ACTOR,
          inviteToken,
          inviteTokenExpires,
        },
      });

      // 2. Create the Assessment record
      await tx.assessment.create({
        data: {
          companyId,
          vendorId: vendor.id,
          status: "PENDING",
          riskLevel,
          complianceScore,
          lastAssessmentDate: null,
          createdBy: ANON_ACTOR,
        },
      });

      // 3. Create the Audit Log entry
      await tx.auditLog.create({
        data: {
          companyId,
          action: "vendor.created",
          entityType: "vendor",
          entityId: vendor.id,
          actorId: ANON_ACTOR,
          createdBy: ANON_ACTOR,
        },
      });
    });

    /** Simulation: Email Notification Service */
    console.log(`[SIMULATED EMAIL] Assessment Invitation for ${name}`);
    console.log(`[LINK] https://avra.app/external/assessment/${inviteToken}`);
    console.log(`[EXPIRY] ${inviteTokenExpires.toISOString()}`);
    
    revalidatePath("/dashboard");
    revalidatePath("/vendors");
    
    return { ok: true, token: inviteToken };
  } catch (err) {
    console.error("Vendor creation failed:", err);
    return { ok: false, error: "Could not save vendor. Try again." };
  }
}

export async function deleteVendorAction(vendorId: string): Promise<DeleteVendorResult> {
  if (!vendorId || !vendorId.trim()) {
    return { ok: false, error: "Invalid vendor identifier." };
  }

  const companyId = await getDefaultCompanyId();
  if (!companyId) {
    return {
      ok: false,
      error: "Database is empty. Run: npx prisma migrate dev && npx prisma db seed",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findFirst({
        where: { id: vendorId, companyId },
        select: { id: true, name: true },
      });

      if (!vendor) {
        throw new Error("Vendor not found.");
      }

      await tx.vendor.delete({ where: { id: vendor.id } });

      await tx.auditLog.create({
        data: {
          companyId,
          action: "vendor.deleted",
          entityType: "vendor",
          entityId: vendor.id,
          actorId: ANON_ACTOR,
          createdBy: ANON_ACTOR,
          metadata: { vendorName: vendor.name },
        },
      });
    });

    revalidatePath("/dashboard");
    revalidatePath("/vendors");

    return { ok: true };
  } catch (err) {
    console.error("Vendor deletion failed:", err);
    return { ok: false, error: "Could not delete vendor. Try again." };
  }
}

export async function deleteVendorsAction(vendorIds: string[]): Promise<DeleteVendorsResult> {
  const uniqueIds = [...new Set(vendorIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { ok: false, error: "No vendors selected for deletion." };
  }

  const companyId = await getDefaultCompanyId();
  if (!companyId) {
    return {
      ok: false,
      error: "Database is empty. Run: npx prisma migrate dev && npx prisma db seed",
    };
  }

  try {
    const deletedCount = await prisma.$transaction(async (tx) => {
      const vendors = await tx.vendor.findMany({
        where: { id: { in: uniqueIds }, companyId },
        select: { id: true, name: true },
      });

      if (vendors.length === 0) {
        throw new Error("Selected vendors not found.");
      }

      await tx.vendor.deleteMany({
        where: { id: { in: vendors.map((v) => v.id) }, companyId },
      });

      for (const vendor of vendors) {
        await tx.auditLog.create({
          data: {
            companyId,
            action: "vendor.deleted",
            entityType: "vendor",
            entityId: vendor.id,
            actorId: ANON_ACTOR,
            createdBy: ANON_ACTOR,
            metadata: { vendorName: vendor.name, bulk: true },
          },
        });
      }

      return vendors.length;
    });

    revalidatePath("/dashboard");
    revalidatePath("/vendors");

    return { ok: true, deletedCount };
  } catch (err) {
    console.error("Bulk vendor deletion failed:", err);
    return { ok: false, error: "Could not delete selected vendors. Try again." };
  }
}
