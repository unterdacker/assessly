"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { PortalActionState } from "@/lib/types/vendor-auth";

const MAX_CONSECUTIVE_FAILURES = 3;
const BLOCK_MS = 15 * 60 * 1000;
const FAIL_DELAY_MS = 3_000;

type RateLimitState = {
  consecutiveFailures: number;
  blockedUntil: number;
};

const rateLimitStore: Map<string, RateLimitState> = (globalThis as any).__avraPortalRateLimit || new Map();
(globalThis as any).__avraPortalRateLimit = rateLimitStore;

function sanitizeAccessCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toUpperCase().trim().replace(/\s+/g, "").replace(/-/g, "");
}

function formatAccessCode(code8: string): string {
  if (code8.length !== 8) return "";
  return `${code8.slice(0, 4)}-${code8.slice(4)}`;
}

function readClientIp(headerValue: string | null): string {
  if (!headerValue) return "unknown";
  return headerValue.split(",")[0]?.trim() || "unknown";
}

function takeRateLimitKey(ip: string): string {
  return `ip:${ip}`;
}

function getRateLimitState(key: string): RateLimitState {
  return rateLimitStore.get(key) || { consecutiveFailures: 0, blockedUntil: 0 };
}

function isBlocked(state: RateLimitState): boolean {
  return state.blockedUntil > Date.now();
}

function registerFailure(key: string): void {
  const state = getRateLimitState(key);
  const nextFailures = state.consecutiveFailures + 1;
  const blockedUntil = nextFailures >= MAX_CONSECUTIVE_FAILURES ? Date.now() + BLOCK_MS : state.blockedUntil;
  rateLimitStore.set(key, {
    consecutiveFailures: nextFailures,
    blockedUntil,
  });
}

function resetFailures(key: string): void {
  rateLimitStore.set(key, { consecutiveFailures: 0, blockedUntil: 0 });
}

async function failWithDelay(): Promise<PortalActionState> {
  await new Promise((resolve) => setTimeout(resolve, FAIL_DELAY_MS));
  return { error: "Invalid credentials." };
}

export async function authenticateVendorAccessCode(
  _prevState: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const cookieStore = await cookies();
  const headerStore = await headers();

  let clientId = cookieStore.get("avra-portal-client")?.value;
  if (!clientId) {
    clientId = crypto.randomUUID();
    cookieStore.set("avra-portal-client", clientId, {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }

  const ip = readClientIp(headerStore.get("x-forwarded-for"));
  const key = takeRateLimitKey(ip);
  const state = getRateLimitState(key);

  if (isBlocked(state)) {
    return failWithDelay();
  }

  const normalized = sanitizeAccessCode(formData.get("accessCode"));
  const formatted = formatAccessCode(normalized);

  const rawPassword = formData.get("password");
  const password = typeof rawPassword === "string" ? rawPassword : "";

  if (!formatted || !password) {
    registerFailure(key);
    return failWithDelay();
  }

  const vendor = await (prisma.vendor as any).findFirst({
    where: {
      accessCode: formatted,
      isCodeActive: true,
    },
    select: {
      id: true,
      inviteToken: true,
      inviteTokenExpires: true,
      codeExpiresAt: true,
      passwordHash: true,
      isFirstLogin: true,
    },
  });

  if (!vendor) {
    registerFailure(key);
    return failWithDelay();
  }

  const codeExpiresAt = vendor.codeExpiresAt ? new Date(vendor.codeExpiresAt as Date) : null;
  if (!codeExpiresAt || codeExpiresAt <= new Date()) {
    await (prisma.vendor as any).update({
      where: { id: vendor.id },
      data: {
        accessCode: null,
        codeExpiresAt: null,
        isCodeActive: false,
        passwordHash: null,
        isFirstLogin: true,
      },
    });

    registerFailure(key);
    return failWithDelay();
  }

  // Verify password — must have a hash (requires code regeneration after MFA upgrade)
  const passwordHash = vendor.passwordHash as string | null;
  if (!passwordHash) {
    registerFailure(key);
    return failWithDelay();
  }

  const passwordOk = await bcrypt.compare(password, passwordHash);
  if (!passwordOk) {
    registerFailure(key);
    return failWithDelay();
  }

  resetFailures(key);

  // If this is the vendor's first login, redirect to force-change-password flow
  const isFirstLogin = vendor.isFirstLogin as boolean;
  if (isFirstLogin) {
    cookieStore.set("avra-vendor-setup", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 60 * 30, // 30 minutes
    });
    cookieStore.set("avra-vendor-id", vendor.id, {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 60 * 30,
    });
    redirect("/external/force-password-change");
  }

  const now = new Date();
  let inviteToken = vendor.inviteToken as string | null;
  let expires = vendor.inviteTokenExpires as Date | null;

  if (!inviteToken || !expires || expires <= now) {
    inviteToken = crypto.randomUUID().replace(/-/g, "");
    expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14);

    await (prisma.vendor as any).update({
      where: { id: vendor.id },
      data: {
        inviteToken,
        inviteTokenExpires: expires,
      },
    });
  }

  cookieStore.set("avra-vendor-id", vendor.id, {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  cookieStore.set("avra-vendor-token", inviteToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  cookieStore.set("avra-vendor-code-exp", codeExpiresAt.toISOString(), {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  redirect(`/external/assessment/${inviteToken}`);
}
