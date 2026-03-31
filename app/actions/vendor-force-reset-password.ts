"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { PortalActionState } from "@/lib/types/vendor-auth";
import { AUTH_SESSION_COOKIE_NAME } from "@/lib/auth/token";

export async function forceResetVendorPasswordAction(
  _prevState: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const cookieStore = await cookies();

  const setupToken = cookieStore.get("avra-vendor-setup")?.value;
  if (!setupToken) {
    return { error: "Session expired. Please log in again." };
  }

  const vendorId = cookieStore.get("avra-vendor-id")?.value;
  if (!vendorId) {
    return { error: "Session expired. Please log in again." };
  }

  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof newPassword !== "string" || newPassword.length < 12) {
    return { error: "Password must be at least 12 characters." };
  }

  if (typeof confirmPassword !== "string" || newPassword !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  // Reject passwords that are trivially weak (fewer than 4 unique chars)
  if (new Set(newPassword).size < 4) {
    return { error: "Password is too simple. Use a mix of different characters." };
  }

  try {
    const vendor = await (prisma.vendor as any).findFirst({
      where: { id: vendorId, isCodeActive: true },
      select: { id: true },
    });

    if (!vendor) {
      return { error: "Invalid session. Please log in again." };
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await (prisma.vendor as any).update({
      where: { id: vendor.id },
      data: {
        passwordHash,
        isFirstLogin: false,
      },
    });

    // Clear setup and session cookies — vendor must do a full re-login
    cookieStore.delete("avra-vendor-setup");
    cookieStore.delete("avra-vendor-id");
    cookieStore.delete("avra-vendor-token");
    cookieStore.delete("avra-vendor-code-exp");
    cookieStore.delete(AUTH_SESSION_COOKIE_NAME);
  } catch (err) {
    console.error("Force password reset failed:", err);
    return { error: "Could not update password. Please try again." };
  }

  redirect("/external/portal");
}
