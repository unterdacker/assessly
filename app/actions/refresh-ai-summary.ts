"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { requireUserRole } from "@/lib/auth/server";
import { getDashboardRiskPostureOverview } from "@/lib/queries/dashboard-risk-posture";
import { prisma } from "@/lib/prisma";

export async function refreshAiSummary(): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireUserRole(["ADMIN", "AUDITOR"]);
    const companyId = session.companyId;
    const companySettings = companyId
      ? await prisma.company.findUnique({
          where: { id: companyId },
          select: { aiDisabled: true },
        })
      : null;
    if (companySettings?.aiDisabled) {
      return { ok: false, error: "AI features are currently disabled." };
    }
    const locale = (await getLocale()) as "en" | "de";
    await getDashboardRiskPostureOverview(locale, /* bypassCache */ true);
    revalidatePath("/dashboard");
    revalidatePath("/[locale]/dashboard", "page");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[refreshAiSummary]", message);
    return { ok: false, error: "Failed to refresh AI summary. Please try again." };
  }
}
