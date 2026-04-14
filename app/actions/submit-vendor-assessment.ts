"use server";

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

const EXPIRY_GRACE_PERIOD_MS = 2 * 60 * 1000;

function resolveDeadline(vendor: {
  inviteTokenExpires?: Date | null;
  codeExpiresAt?: Date | null;
}): Date | null {
  const candidates = [vendor.inviteTokenExpires, vendor.codeExpiresAt]
    .filter((value): value is Date => Boolean(value))
    .map((value) => value.getTime());

  if (candidates.length === 0) {
    return null;
  }

  return new Date(Math.min(...candidates));
}

function isExpiredUtcWithGrace(deadline: Date): boolean {
  return Date.now() > deadline.getTime() + EXPIRY_GRACE_PERIOD_MS;
}

/**
 * Marks an external vendor assessment as completed.
 * Automatically clears the invite token and updates the internal assessment status.
 */
export async function submitExternalAssessment(input: {
  vendorId: string;
  assessmentId: string;
  token: string;
}) {
  const vendorId = input.vendorId?.trim();
  const assessmentId = input.assessmentId?.trim();
  const token = input.token?.trim();
  const tokenHash = token ? createHash("sha256").update(token).digest("hex") : "";

  if (!vendorId || !assessmentId || !token) {
    throw new Error("Missing identification for assessment submission.");
  }

  try {
    const vendor = await prisma.vendor.findFirst({
      where: {
        id: vendorId,
        inviteToken: tokenHash,
        isCodeActive: true,
      },
      include: {
        assessment: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!vendor || !vendor.assessment || vendor.assessment.id !== assessmentId) {
      return { ok: false, error: "Invalid link." };
    }

    const deadline = resolveDeadline(vendor);
    if (!deadline) {
      return { ok: false, error: "Invalid link." };
    }

    if (isExpiredUtcWithGrace(deadline)) {
      return {
        ok: false,
        code: "DEADLINE_PASSED",
        error: "Deadline passed.",
        expiresAt: deadline.toISOString(),
      };
    }

    // 1. Update the Assessment status to COMPLETED
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: "COMPLETED" }
    });

    // Revalidate affected routes
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${vendorId}/assessment`);
    revalidatePath("/");

    return { ok: true, expiresAt: deadline.toISOString() };
  } catch (err) {
    console.error("Submission error:", err);
    return { ok: false, error: "Submission failed." };
  }
}
