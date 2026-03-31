"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createSessionForUser,
  clearAuthSessionCookie,
  getLocalizedLandingPath,
  setAuthSessionCookie,
} from "@/lib/auth/server";
import { AUTH_SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/token";
import { canAccessPath } from "@/lib/auth/permissions";
import type { InternalSignInState } from "@/app/actions/internal-auth.types";

export async function authenticateInternalUser(
  _prevState: InternalSignInState,
  formData: FormData,
): Promise<InternalSignInState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const locale = String(formData.get("locale") || "de").trim() || "de";
  const nextPath = String(formData.get("next") || "").trim();

  if (!email || !password) {
    return { error: "REQUIRED" };
  }

  const user = await prisma.user.findFirst({
    where: {
      email,
      isActive: true,
      role: { in: ["ADMIN", "AUDITOR"] },
    },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      role: true,
      companyId: true,
      vendorId: true,
    },
  });

  if (!user?.passwordHash) {
    return { error: "INVALID_CREDENTIALS" };
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    return { error: "INVALID_CREDENTIALS" };
  }

  const { token, expiresAt } = await createSessionForUser({
    userId: user.id,
    role: user.role,
    companyId: user.companyId,
    vendorId: user.vendorId,
  });
  await setAuthSessionCookie(token, expiresAt);

  const safeNextPath = nextPath.startsWith("/") ? nextPath : "";
  const target = safeNextPath && canAccessPath(user.role, safeNextPath)
    ? safeNextPath
    : getLocalizedLandingPath(user.role, locale);

  redirect(target);
}

export async function signOutAction(formData: FormData): Promise<never> {
  const locale = String(formData.get("locale") || "en").trim() || "en";

  // Revoke the session server-side so re-use of the cookie is impossible
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value ?? null;
  if (token) {
    const tokenHash = await hashSessionToken(token);
    await prisma.authSession
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  await clearAuthSessionCookie();
  redirect(`/${locale}/auth/sign-in`);
}