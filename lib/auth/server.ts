import "server-only";

import crypto from "crypto";
import type { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import {
  AUTH_SESSION_COOKIE_NAME,
  hashSessionToken,
  shouldSecureCookie,
  signSessionClaims,
  verifySessionToken,
} from "@/lib/auth/token";
import { getRoleLandingPath, withLocalePath } from "@/lib/auth/permissions";

const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AuthSession = {
  sessionId: string;
  userId: string;
  role: UserRole;
  companyId: string | null;
  vendorId: string | null;
  email: string | null;
  displayName: string | null;
  expiresAt: Date;
};

type PersistedSession = {
  id: string;
  userId: string;
  role: UserRole;
  companyId: string | null;
  vendorId: string | null;
  expiresAt: Date;
  user: {
    id: string;
    role: UserRole;
    email: string | null;
    displayName: string | null;
    isActive: boolean;
    companyId: string | null;
    vendorId: string | null;
  };
};

function toAuthSession(session: PersistedSession): AuthSession {
  return {
    sessionId: session.id,
    userId: session.userId,
    role: session.user.role,
    companyId: session.user.companyId,
    vendorId: session.user.vendorId,
    email: session.user.email,
    displayName: session.user.displayName,
    expiresAt: session.expiresAt,
  };
}

async function getPersistedSessionByToken(token: string | null | undefined): Promise<PersistedSession | null> {
  const claims = await verifySessionToken(token);
  if (!claims || !token) {
    return null;
  }

  const tokenHash = await hashSessionToken(token);
  const session = await withDbRetry(() =>
    prisma.authSession.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        role: true,
        companyId: true,
        vendorId: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            role: true,
            email: true,
            displayName: true,
            isActive: true,
            companyId: true,
            vendorId: true,
          },
        },
      },
    }),
  );

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  if (!session.user.isActive) {
    return null;
  }

  if (
    session.id !== claims.sid ||
    session.userId !== claims.uid ||
    session.user.role !== claims.role ||
    session.user.companyId !== claims.cid ||
    session.user.vendorId !== claims.vid
  ) {
    return null;
  }

  void prisma.authSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  }).catch(() => undefined);

  return session;
}

export async function getOptionalAuthSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value || null;
  const session = await getPersistedSessionByToken(token);
  return session ? toAuthSession(session) : null;
}

export async function getAuthSessionFromRequest(request: NextRequest): Promise<AuthSession | null> {
  const token = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value || null;
  const session = await getPersistedSessionByToken(token);
  return session ? toAuthSession(session) : null;
}

export async function requireAuthSession(): Promise<AuthSession> {
  const session = await getOptionalAuthSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  return session;
}

export async function requireUserRole(allowedRoles: UserRole[]): Promise<AuthSession> {
  const session = await requireAuthSession();
  if (!allowedRoles.includes(session.role)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

export async function requireAdminUser(): Promise<AuthSession> {
  return requireUserRole(["ADMIN"]);
}

export async function requireInternalReadUser(): Promise<AuthSession> {
  return requireUserRole(["ADMIN", "AUDITOR"]);
}

export function isAccessControlError(error: unknown): boolean {
  return error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "FORBIDDEN");
}

export async function requirePageRole(allowedRoles: UserRole[], locale: string): Promise<AuthSession> {
  const session = await getOptionalAuthSession();
  if (!session) {
    redirect(withLocalePath("/auth/sign-in", locale));
  }

  if (!allowedRoles.includes(session.role)) {
    if (session.role === "VENDOR") {
      redirect(withLocalePath("/external/portal", locale));
    }
    redirect(withLocalePath("/unauthorized", locale));
  }

  return session;
}

export async function createSessionForUser(input: {
  userId: string;
  role: UserRole;
  companyId: string | null;
  vendorId: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const token = await signSessionClaims({
    type: "assessly-session",
    sid: sessionId,
    uid: input.userId,
    role: input.role,
    cid: input.companyId,
    vid: input.vendorId,
    exp: expiresAt.getTime(),
  });
  const tokenHash = await hashSessionToken(token);

  await prisma.authSession.create({
    data: {
      id: sessionId,
      userId: input.userId,
      role: input.role,
      companyId: input.companyId,
      vendorId: input.vendorId,
      tokenHash,
      expiresAt,
      lastSeenAt: new Date(),
      createdBy: input.userId,
    },
  });

  return { token, expiresAt };
}

export async function setAuthSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldSecureCookie(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearAuthSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_SESSION_COOKIE_NAME);
}

export function getLocalizedLandingPath(role: UserRole, locale: string): string {
  return withLocalePath(getRoleLandingPath(role), locale);
}