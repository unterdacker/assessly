"use server";

import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

/**
 * Generates a secure, 32-character hex token for a vendor's external assessment.
 * Sets an expiration date (default: 14 days) and stores it in the database.
 */
export async function generateInviteToken(vendorId: string) {
  if (!vendorId) throw new Error("Vendor ID is required to generate an invite.");

  const token = crypto.randomBytes(16).toString("hex");
    
  // Link valid for 14 days
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  try {
    await (prisma.vendor as any).update({
      where: { id: vendorId },
      data: {
        inviteToken: token,
        inviteTokenExpires: expiresAt,
      },
    });

    revalidatePath(`/vendors/${vendorId}/assessment`);
    
    // In a real app, this would trigger an email. For this prototype, we return the token.
    return { ok: true, token };
  } catch (err) {
    console.error("Token generation error:", err);
    return { ok: false, error: "Failed to generate invite token." };
  }
}
