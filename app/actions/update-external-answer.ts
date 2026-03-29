"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Handles real-time saving of an individual assessment answer from the external vendor interface.
 * Updates the database and triggers internal revalidation for auditors to monitor progress.
 */
export async function updateExternalAnswer(
  assessmentId: string,
  questionId: string,
  status: "COMPLIANT" | "NON_COMPLIANT" | "NOT_APPLICABLE",
  findings?: string,
  verified: boolean = true
) {
  if (!assessmentId || !questionId) {
    throw new Error("Missing identification for answer update.");
  }

  try {
    const existing = await prisma.assessmentAnswer.findFirst({
      where: { assessmentId, questionId }
    });

    if (existing) {
      await prisma.assessmentAnswer.update({
        where: { id: existing.id },
        data: { 
          status, 
          findings, 
          verified,
          updatedAt: new Date(),
          createdBy: "external-vendor" 
        }
      });
    } else {
      await prisma.assessmentAnswer.create({
        data: {
          assessmentId,
          questionId,
          status,
          findings,
          verified,
          createdBy: "external-vendor"
        }
      });
    }

    // Trigger revalidation for the vendor list and audit views
    revalidatePath("/vendors");
    return { ok: true };
  } catch (err) {
    console.error("Answer update error:", err);
    return { ok: false, error: "Failed to save answer." };
  }
}
