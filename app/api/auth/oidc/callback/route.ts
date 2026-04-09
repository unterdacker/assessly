import crypto from "node:crypto";
import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createSessionForUser, setAuthSessionCookie } from "@/lib/auth/server";
import { INTERNAL_READ_ROLES, getRoleLandingPath } from "@/lib/auth/permissions";
import { getOidcConfig } from "@/lib/oidc/config";
import { discoverOidcClient, exchangeOidcCode } from "@/lib/oidc/client";
import {
  clearOidcStateCookie,
  getOidcStateClaims,
} from "@/lib/oidc/state-cookie";
import { setMfaPendingCookie } from "@/lib/auth/mfa-pending";
import { logAuditEvent } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type CallbackUser = {
  id: string;
  companyId: string | null;
  vendorId: string | null;
  role: UserRole;
  mfaEnabled: boolean;
};

function redirectWithError(locale: string | undefined, code: string): NextResponse {
  const safeLocale = locale || "en";
  return NextResponse.redirect(
    new URL(`/${safeLocale}/auth/sign-in?error=${code}`, env.APP_URL),
  );
}

function getIpAddress(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
}

async function logSsoFailure(input: {
  companyId: string;
  ipAddress: string;
  errorCode: string;
}): Promise<void> {
  const payload = {
    companyId: input.companyId,
    ipAddress: input.ipAddress,
    errorCode: input.errorCode,
    timestamp: new Date().toISOString(),
  };

  await logAuditEvent({
    companyId: input.companyId,
    userId: "system",
    action: "SSO_LOGIN_FAILED",
    entityType: "Auth",
    entityId: "oidc-callback",
    newValue: payload,
  }).catch(() => undefined);
}

function normalizeDomain(email: string): string {
  const parts = email.toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : "";
}

async function resolveOrProvisionUser(input: {
  companyId: string;
  subject: string;
  email: string;
  name?: string;
  jitProvisioning: boolean;
  jitAllowedEmailDomains: string[];
  ipAddress: string;
  locale: string;
}): Promise<{ user: CallbackUser | null; errorCode?: string }> {
  let user = await prisma.user.findFirst({
    where: {
      companyId: input.companyId,
      ssoProviderId: input.subject,
      role: { in: INTERNAL_READ_ROLES },
      isActive: true,
    },
    select: {
      id: true,
      companyId: true,
      vendorId: true,
      role: true,
      mfaEnabled: true,
    },
  });

  if (!user) {
    const existingByEmail = await prisma.user.findFirst({
      where: {
        companyId: input.companyId,
        email: input.email,
        role: { in: INTERNAL_READ_ROLES },
        isActive: true,
      },
      select: {
        id: true,
        companyId: true,
        vendorId: true,
        role: true,
        mfaEnabled: true,
        ssoProviderId: true,
      },
    });

    if (existingByEmail) {
      if (existingByEmail.ssoProviderId && existingByEmail.ssoProviderId !== input.subject) {
        return { user: null, errorCode: "SSO_SUBJECT_MISMATCH" };
      }

      if (!existingByEmail.ssoProviderId) {
        await prisma.user.update({
          where: { id: existingByEmail.id },
          data: { ssoProviderId: input.subject },
        });
      }

      user = {
        id: existingByEmail.id,
        companyId: existingByEmail.companyId,
        vendorId: existingByEmail.vendorId,
        role: existingByEmail.role,
        mfaEnabled: existingByEmail.mfaEnabled,
      };
    }
  }

  if (user) {
    return { user };
  }

  if (!input.jitProvisioning) {
    await logSsoFailure({
      companyId: input.companyId,
      ipAddress: input.ipAddress,
      errorCode: "ACCOUNT_NOT_LINKED",
    });
    return { user: null, errorCode: "SSO_ACCOUNT_NOT_LINKED" };
  }

  const allowedDomains = input.jitAllowedEmailDomains
    .map((domain) => domain.toLowerCase().trim())
    .filter(Boolean);

  if (allowedDomains.length > 0) {
    const domain = normalizeDomain(input.email);
    if (!allowedDomains.includes(domain)) {
      await logSsoFailure({
        companyId: input.companyId,
        ipAddress: input.ipAddress,
        errorCode: "JIT_DOMAIN_REJECTED",
      });
      return { user: null, errorCode: "SSO_ACCOUNT_NOT_LINKED" };
    }
  }

  const created = await prisma.user.create({
    data: {
      companyId: input.companyId,
      email: input.email,
      displayName: input.name,
      ssoProviderId: input.subject,
      role: "AUDITOR",
      isActive: true,
      passwordHash: `sso:${crypto.randomBytes(64).toString("hex")}`,
      createdBy: "system",
    },
    select: {
      id: true,
      companyId: true,
      vendorId: true,
      role: true,
      mfaEnabled: true,
    },
  });

  await logAuditEvent({
    companyId: input.companyId,
    userId: "system",
    action: "SSO_USER_PROVISIONED",
    entityType: "User",
    entityId: created.id,
    newValue: {
      companyId: input.companyId,
      ipAddress: input.ipAddress,
      errorCode: "NONE",
      timestamp: new Date().toISOString(),
    },
  }).catch(() => undefined);

  return { user: created };
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const queryState = request.nextUrl.searchParams.get("state");

  if (!code || !queryState) {
    return redirectWithError("en", "SSO_INVALID_CALLBACK");
  }

  const stateClaims = await getOidcStateClaims();
  if (!stateClaims) {
    return redirectWithError("en", "SSO_STATE_EXPIRED");
  }

  const ipAddress = getIpAddress(request);

  if (queryState !== stateClaims.state) {
    await logSsoFailure({
      companyId: stateClaims.companyId,
      ipAddress,
      errorCode: "CSRF_MISMATCH",
    });
    await clearOidcStateCookie();
    return redirectWithError(stateClaims.locale, "SSO_CSRF_MISMATCH");
  }

  await clearOidcStateCookie();

  const config = await getOidcConfig(stateClaims.companyId);
  if (!config) {
    return redirectWithError(stateClaims.locale, "SSO_NOT_CONFIGURED");
  }

  let oidcClientConfig: unknown;
  try {
    oidcClientConfig = await discoverOidcClient(config);
  } catch {
    await logSsoFailure({
      companyId: stateClaims.companyId,
      ipAddress,
      errorCode: "IDP_UNAVAILABLE",
    });
    return redirectWithError(stateClaims.locale, "SSO_IDP_UNAVAILABLE");
  }

  let tokenClaims;
  try {
    tokenClaims = await exchangeOidcCode(
      oidcClientConfig,
      code,
      stateClaims.pkceVerifier,
      stateClaims.nonce,
      stateClaims.state,
    );
  } catch {
    await logSsoFailure({
      companyId: stateClaims.companyId,
      ipAddress,
      errorCode: "TOKEN_EXCHANGE_FAILED",
    });
    return redirectWithError(stateClaims.locale, "SSO_TOKEN_FAILED");
  }

  if (tokenClaims.email_verified !== true) {
    await logSsoFailure({
      companyId: stateClaims.companyId,
      ipAddress,
      errorCode: "EMAIL_NOT_VERIFIED",
    });
    return redirectWithError(stateClaims.locale, "SSO_ACCOUNT_NOT_LINKED");
  }

  let resolved;
  try {
    resolved = await resolveOrProvisionUser({
      companyId: stateClaims.companyId,
      subject: tokenClaims.sub,
      email: tokenClaims.email,
      name: tokenClaims.name,
      jitProvisioning: config.jitProvisioning,
      jitAllowedEmailDomains: config.jitAllowedEmailDomains,
      ipAddress,
      locale: stateClaims.locale,
    });
  } catch {
    await logSsoFailure({
      companyId: stateClaims.companyId,
      ipAddress,
      errorCode: "INTERNAL_ERROR",
    });
    return redirectWithError(stateClaims.locale, "SSO_INTERNAL_ERROR");
  }

  if (!resolved.user) {
    if (resolved.errorCode === "SSO_SUBJECT_MISMATCH") {
      await logSsoFailure({
        companyId: stateClaims.companyId,
        ipAddress,
        errorCode: "SUBJECT_MISMATCH",
      });
      return redirectWithError(stateClaims.locale, "SSO_FORBIDDEN");
    }

    return redirectWithError(stateClaims.locale, resolved.errorCode ?? "SSO_ACCOUNT_NOT_LINKED");
  }

  const user = resolved.user;

  if (user.companyId !== stateClaims.companyId) {
    await logSsoFailure({
      companyId: stateClaims.companyId,
      ipAddress,
      errorCode: "TENANT_MISMATCH",
    });
    return redirectWithError(stateClaims.locale, "SSO_FORBIDDEN");
  }

  if (user.mfaEnabled) {
    await setMfaPendingCookie(user.id, stateClaims.locale, stateClaims.next);
    return NextResponse.redirect(
      new URL(`/${stateClaims.locale}/auth/mfa-verify`, env.APP_URL),
    );
  }

  const { token, expiresAt } = await createSessionForUser({
    userId: user.id,
    role: user.role,
    companyId: user.companyId,
    vendorId: user.vendorId,
  });
  await setAuthSessionCookie(token, expiresAt);

  await logAuditEvent({
    companyId: user.companyId,
    userId: user.id,
    action: "SSO_LOGIN_SUCCESS",
    entityType: "Auth",
    entityId: user.id,
    newValue: {
      companyId: user.companyId,
      ipAddress,
      errorCode: "NONE",
      timestamp: new Date().toISOString(),
    },
  }).catch(() => undefined);

  const destination = stateClaims.next || `/${stateClaims.locale}${getRoleLandingPath(user.role)}`;
  return NextResponse.redirect(new URL(destination, env.APP_URL));
}
