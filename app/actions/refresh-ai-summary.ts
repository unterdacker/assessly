"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { requireUserRole } from "@/lib/auth/server";
import { getDashboardRiskPostureOverview } from "@/lib/queries/dashboard-risk-posture";

export async function refreshAiSummary(): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireUserRole(["ADMIN", "AUDITOR"]);
    const locale = (await getLocale()) as "en" | "de";
    await getDashboardRiskPostureOverview(locale, /* bypassCache */ true);
    revalidatePath("/dashboard");
    revalidatePath("/[locale]/dashboard", "page");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[refreshAiSummary]", message);
    return { ok: false, error: message };
  }
}
