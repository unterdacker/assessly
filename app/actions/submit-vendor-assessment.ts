"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Marks an external vendor assessment as completed.
 * Automatically clears the invite token and updates the internal assessment status.
 */
export async function submitExternalAssessment(vendorId: string, assessmentId: string) {
  if (!vendorId || !assessmentId) {
    throw new Error("Missing identification for assessment submission.");
  }

  try {
    // 1. Update the Assessment status to COMPLETED
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: "COMPLETED" }
    });

    // 2. Clear the token to prevent further external edits
    await (prisma.vendor as any).update({
      where: { id: vendorId },
      data: { inviteToken: null, inviteTokenExpires: null } as any
    });

    // Revalidate affected routes
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${vendorId}/assessment`);
    revalidatePath("/");

    return { ok: true };
  } catch (err) {
    console.error("Submission error:", err);
    return { ok: false, error: "Submission failed." };
  }
}
