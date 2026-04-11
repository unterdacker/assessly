"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit-log";
import { requireSuperAdminUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { isRateLimited, registerFailure, resetFailures } from "@/lib/rate-limit";
import { AuditLogger } from "@/lib/structured-logger";

const CUID_COMPANY_ID_PATTERN = /^c[0-9a-z]{24}$/;

type CompanyPlan = "FREE" | "PREMIUM";

export async function updateCompanyPlan(
  companyId: string,
  plan: CompanyPlan,
  reason: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let session;
  try {
    session = await requireSuperAdminUser();
  } catch {
    return { success: false, error: "Unauthorized." };
  }

  if (!CUID_COMPANY_ID_PATTERN.test(companyId)) {
    return { success: false, error: "Invalid company." };
  }

  if (plan !== "FREE" && plan !== "PREMIUM") {
    return { success: false, error: "Invalid plan." };
  }

  const trimmedReason = reason.trim().slice(0, 500);
  if (!trimmedReason) {
    return { success: false, error: "Reason is required." };
  }

  const rateLimitKey = `plan-change:${session.userId}`;
  if (isRateLimited(rateLimitKey)) {
    return { success: false, error: "RATE_LIMITED" };
  }

  try {
    const transactionResult = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { id: true, name: true, plan: true },
      });

      if (company.plan === plan) {
        return null;
      }

      await tx.company.update({
        where: { id: companyId },
        data: { plan },
      });

      return {
        companyName: company.name,
        previousPlan: company.plan,
      };
    });

    if (transactionResult !== null) {
      await logAuditEvent(
        {
          companyId,
          userId: session.userId,
          action: "COMPANY_PLAN_UPDATED",
          entityType: "Company",
          entityId: companyId,
          previousValue: { plan: transactionResult.previousPlan },
          newValue: { plan },
          reason: trimmedReason,
        },
        { captureHeaders: true },
      );

      AuditLogger.configuration("company.plan_updated", "success", {
        userId: session.userId,
        entityType: "Company",
        entityId: companyId,
        message: `Company ${transactionResult.companyName} plan changed from ${transactionResult.previousPlan} to ${plan}`,
        details: {
          previousPlan: transactionResult.previousPlan,
          newPlan: plan,
        },
      });
    }

    resetFailures(rateLimitKey);
    revalidatePath("/admin/companies");
    return { success: true };
  } catch (error) {
    registerFailure(rateLimitKey);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { success: false, error: "Company not found." };
    }

    return { success: false, error: "Failed to update company plan." };
  }
}