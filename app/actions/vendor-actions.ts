"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/queries/vendor-assessments";
import { calculateRiskLevel } from "@/lib/risk-level";

const ANON_ACTOR = "anonymous:prototype";

export type CreateVendorResult =
  | { ok: true }
  | { ok: false; error: string };

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

  try {
    await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.create({
        data: {
          companyId,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          serviceType: "Pending classification",
          createdBy: ANON_ACTOR,
        },
      });

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
  } catch {
    return { ok: false, error: "Could not save vendor. Try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/vendors");
  return { ok: true };
}
