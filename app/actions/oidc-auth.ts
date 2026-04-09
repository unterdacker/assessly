"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { logAuditEvent } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { getOidcConfigForEmail } from "@/lib/oidc/config";
import { OidcError, buildOidcAuthorizationUrl, discoverOidcClient } from "@/lib/oidc/client";
import { setOidcStateCookie, validateNextParam } from "@/lib/oidc/state-cookie";
import {
  isRateLimited,
  readClientIp,
  registerFailure,
  resetFailures,
} from "@/lib/rate-limit";

export type OidcInitiateState = { error: string | null; redirectTo?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function initiateOidcLogin(
  _prevState: OidcInitiateState,
  formData: FormData,
): Promise<OidcInitiateState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const locale = String(formData.get("locale") || "en").trim() || "en";
  const next = String(formData.get("next") || "").trim();

  if (!EMAIL_RE.test(email)) {
    return { error: "INVALID_EMAIL" };
  }

  const headerStore = await headers();
  const ip = readClientIp(headerStore);
  const rateLimitKey = `oidc-init:${ip}`;

  if (isRateLimited(rateLimitKey)) {
    return { error: "RATE_LIMITED" };
  }

  const validatedNext = validateNextParam(next, env.APP_URL);
  const config = await getOidcConfigForEmail(email);
  if (!config) {
    registerFailure(rateLimitKey, { maxFailures: 8, blockMs: 10 * 60 * 1000 });
    return { error: "SSO_NOT_CONFIGURED" };
  }

  let oidcClientConfig: unknown;
  try {
    oidcClientConfig = await discoverOidcClient(config);
  } catch (error) {
    registerFailure(rateLimitKey, { maxFailures: 8, blockMs: 10 * 60 * 1000 });

    const timestamp = new Date().toISOString();
    await logAuditEvent({
      companyId: config.companyId,
      userId: "system",
      action: "SSO_LOGIN_FAILED",
      entityType: "Auth",
      entityId: "oidc-initiate",
      newValue: {
        companyId: config.companyId,
        ipAddress: ip,
        errorCode: error instanceof OidcError ? error.code : "IDP_UNAVAILABLE",
        timestamp,
      },
    }).catch(() => undefined);

    return { error: "IDP_UNAVAILABLE" };
  }

  const pkceVerifier = crypto.randomBytes(64).toString("base64url");
  const state = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(32).toString("base64url");

  await setOidcStateCookie({
    state,
    nonce,
    pkceVerifier,
    locale,
    next: validatedNext,
    companyId: config.companyId,
  });

  const authorizationUrl = buildOidcAuthorizationUrl(
    oidcClientConfig,
    state,
    nonce,
    pkceVerifier,
  );

  resetFailures(rateLimitKey);
  return { error: null, redirectTo: authorizationUrl.toString() };
}
