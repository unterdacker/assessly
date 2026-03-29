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
