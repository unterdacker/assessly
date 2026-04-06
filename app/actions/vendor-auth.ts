"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { prisma } from "@/lib/prisma";
import type { PortalActionState } from "@/lib/types/vendor-auth";
import { createSessionForUser, setAuthSessionCookie } from "@/lib/auth/server";
import { shouldSecureCookie } from "@/lib/auth/token";
import { routing } from "@/i18n/routing";
import { withLocalePath } from "@/lib/auth/permissions";
import { isRateLimited, registerFailure, resetFailures, readClientIp } from "@/lib/rate-limit";
import { AuditLogger } from "@/lib/structured-logger";
import { truncateIp } from "@/lib/audit-sanitize";

const FAIL_DELAY_MS = 3_000;

function sanitizeAccessCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toUpperCase().trim().replace(/\s+/g, "").replace(/-/g, "");
}

function formatAccessCode(code8: string): string {
  if (code8.length !== 8) return "";
  return `${code8.slice(0, 4)}-${code8.slice(4)}`;
}

async function failWithDelay(): Promise<PortalActionState> {
  await new Promise((resolve) => setTimeout(resolve, FAIL_DELAY_MS));
  return { error: "Invalid credentials." };
}

function resolveActionLocale(raw: FormDataEntryValue | null): string {
  const locale = typeof raw === "string" ? raw : "";
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

export async function authenticateVendorAccessCode(
  _prevState: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = resolveActionLocale(formData.get("locale"));
  const rawIp = readClientIp(headerStore);
  const ipKey = `vpi:${rawIp}`;

  let clientId = cookieStore.get("avra-portal-client")?.value;
  if (!clientId) {
    clientId = crypto.randomUUID();
    cookieStore.set("avra-portal-client", clientId, {
      httpOnly: true,
      sameSite: "strict",
      secure: shouldSecureCookie(),
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }

  if (isRateLimited(ipKey)) {
    AuditLogger.auth("rate_limit.exceeded", "failure", {
      sourceIp: truncateIp(rawIp),
      message: "Vendor portal login: per-IP rate limit exceeded",
      details: { key: ipKey },
    });
    return failWithDelay();
  }

  const normalized = sanitizeAccessCode(formData.get("accessCode"));
  const formatted = formatAccessCode(normalized);
  const codeKey = `vpc:${normalized || "EMPTY"}`;

  if (isRateLimited(codeKey)) {
    AuditLogger.auth("rate_limit.exceeded", "failure", {
      sourceIp: truncateIp(rawIp),
      message: "Vendor portal login: per-code rate limit exceeded",
      details: { key: codeKey },
    });
    return failWithDelay();
  }

  const rawPassword = formData.get("password");
  const password = typeof rawPassword === "string" ? rawPassword : "";

  if (!formatted || !password) {
    registerFailure(ipKey);
    registerFailure(codeKey, { maxFailures: 5, blockMs: 10 * 60 * 1000 });
    return failWithDelay();
  }

  const vendor = await prisma.vendor.findFirst({
    where: {
      accessCode: formatted,
      isCodeActive: true,
    },
    select: {
      id: true,
      companyId: true,
      inviteToken: true,
      inviteTokenExpires: true,
      codeExpiresAt: true,
      passwordHash: true,
      isFirstLogin: true,
    },
  });

  if (!vendor) {
    registerFailure(ipKey);
    registerFailure(codeKey, { maxFailures: 5, blockMs: 10 * 60 * 1000 });
    return failWithDelay();
  }

  const codeExpiresAt = vendor.codeExpiresAt;
  if (!codeExpiresAt || codeExpiresAt <= new Date()) {
    const resetPendingInviteState = Boolean(vendor.isFirstLogin);

    await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        accessCode: null,
        codeExpiresAt: null,
        isCodeActive: false,
        ...(resetPendingInviteState
          ? {
              inviteSentAt: null,
              passwordHash: null,
            }
          : {}),
      },
    });

    registerFailure(ipKey);
    registerFailure(codeKey, { maxFailures: 5, blockMs: 10 * 60 * 1000 });
    return failWithDelay();
  }

  // Verify password — must have a hash (requires code regeneration after MFA upgrade)
  const passwordHash = vendor.passwordHash;
  if (!passwordHash) {
    registerFailure(ipKey);
    registerFailure(codeKey, { maxFailures: 5, blockMs: 10 * 60 * 1000 });
    return failWithDelay();
  }

  const passwordOk = await bcrypt.compare(password, passwordHash);
  if (!passwordOk) {
    registerFailure(ipKey);
    registerFailure(codeKey, { maxFailures: 5, blockMs: 10 * 60 * 1000 });
    return failWithDelay();
  }

  resetFailures(ipKey);
  resetFailures(codeKey);

  // If this is the vendor's first login, redirect to force-change-password flow
  const isFirstLogin = vendor.isFirstLogin;
  if (isFirstLogin) {
    cookieStore.set("avra-vendor-setup", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "strict",
      secure: shouldSecureCookie(),
      path: "/",
      maxAge: 60 * 30, // 30 minutes
    });
    cookieStore.set("avra-vendor-id", vendor.id, {
      httpOnly: true,
      sameSite: "strict",
      secure: shouldSecureCookie(),
      path: "/",
      maxAge: 60 * 30,
    });
    redirect(withLocalePath("/external/force-password-change", locale));
  }

  const now = new Date();
  let inviteToken = vendor.inviteToken;
  let expires = vendor.inviteTokenExpires;

  if (!inviteToken || !expires || expires <= now) {
    inviteToken = crypto.randomUUID().replace(/-/g, "");
    expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14);

    await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        inviteToken,
        inviteTokenExpires: expires,
      },
    });
  }

  // Derive cookie lifetimes from the actual server-side expiry timestamps so the
  // browser discards them at the same moment the server considers them invalid.
  const tokenMaxAgeSeconds = Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000));
  const codeMaxAgeSeconds  = Math.max(0, Math.floor((codeExpiresAt.getTime() - Date.now()) / 1000));
  const isSecure = shouldSecureCookie();

  // avra-vendor-id — identifies which vendor record backs this session.
  cookieStore.set("avra-vendor-id", vendor.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: tokenMaxAgeSeconds,
  });

  // avra-vendor-token — the opaque invite token used to authenticate portal actions.
  // SameSite=Lax: sent on top-level navigations (click a link) but NOT on
  // cross-site sub-resource requests or cross-site POST, preventing CSRF.
  cookieStore.set("avra-vendor-token", inviteToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: tokenMaxAgeSeconds,
  });

  // avra-vendor-code-exp — expiry timestamp surfaced to the UI countdown clock.
  cookieStore.set("avra-vendor-code-exp", codeExpiresAt.toISOString(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: codeMaxAgeSeconds,
  });

  const user = await prisma.user.upsert({
    where: { vendorId: vendor.id },
    update: {
      role: "VENDOR",
      companyId: vendor.companyId,
      isActive: true,
    },
    create: {
      vendorId: vendor.id,
      companyId: vendor.companyId,
      role: "VENDOR",
      createdBy: "external-vendor",
    },
    select: {
      id: true,
      role: true,
      companyId: true,
      vendorId: true,
    },
  });

  const { token, expiresAt } = await createSessionForUser({
    userId: user.id,
    role: user.role,
    companyId: user.companyId,
    vendorId: user.vendorId,
  });
  await setAuthSessionCookie(token, expiresAt);

  redirect(withLocalePath(`/external/assessment/${inviteToken}`, locale));
}
