import "server-only";

import { createHash } from "node:crypto";
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  customFetch,
  discovery,
  type CustomFetch,
  type Configuration,
} from "openid-client";
import { env } from "@/lib/env";
import {
  assertSafeHostname,
  createSsrfSafeFetch,
  OidcSsrfBlockedError,
} from "./ssrf-guard";
import type { DecryptedOidcConfig } from "./config";

type OidcErrorCode =
  | "IDP_UNREACHABLE"
  | "TOKEN_EXCHANGE_FAILED"
  | "INVALID_ID_TOKEN"
  | "SSRF_BLOCKED"
  | "DISCOVERY_FAILED";

export class OidcError extends Error {
  constructor(
    readonly code: OidcErrorCode,
    readonly issuer: string,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OidcError";
  }
}

type OidcTokenClaims = {
  sub: string;
  email: string;
  email_verified: boolean | undefined;
  name?: string;
};

function asConfiguration(clientConfig: unknown): Configuration {
  return clientConfig as Configuration;
}

function isLikelyNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const msg = error.message.toLowerCase();
  return (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("timeout") ||
    msg.includes("unreachable")
  );
}

function getIssuerFromConfig(clientConfig: Configuration): string {
  return clientConfig.serverMetadata().issuer ?? "unknown";
}

function toPkceCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function toCustomFetch(fetchFn: ReturnType<typeof createSsrfSafeFetch>): CustomFetch {
  return fetchFn as unknown as CustomFetch;
}

export async function discoverOidcClient(
  config: DecryptedOidcConfig,
): Promise<Configuration> {
  let issuerUrl: URL;
  try {
    issuerUrl = new URL(config.issuerUrl);
  } catch (cause) {
    throw new OidcError(
      "DISCOVERY_FAILED",
      config.issuerUrl,
      "OIDC issuer URL is invalid",
      cause,
    );
  }

  try {
    await assertSafeHostname(issuerUrl.hostname, config.issuerUrl);
  } catch (cause) {
    if (cause instanceof OidcSsrfBlockedError) {
      throw new OidcError(
        "SSRF_BLOCKED",
        config.issuerUrl,
        "OIDC issuer host blocked by SSRF guard",
        cause,
      );
    }
    throw cause;
  }

  const ssrfSafeFetch = toCustomFetch(createSsrfSafeFetch(config.issuerUrl));

  try {
    return await discovery(
      issuerUrl,
      config.clientId,
      config.clientSecret,
      undefined,
      { [customFetch]: ssrfSafeFetch },
    );
  } catch (cause) {
    if (cause instanceof OidcSsrfBlockedError) {
      throw new OidcError(
        "SSRF_BLOCKED",
        config.issuerUrl,
        "OIDC issuer blocked during discovery",
        cause,
      );
    }

    const code: OidcErrorCode = isLikelyNetworkError(cause)
      ? "IDP_UNREACHABLE"
      : "DISCOVERY_FAILED";

    throw new OidcError(
      code,
      config.issuerUrl,
      "OIDC discovery failed",
      cause,
    );
  }
}

export function buildOidcAuthorizationUrl(
  clientConfig: unknown,
  state: string,
  nonce: string,
  pkceVerifier: string,
): URL {
  const config = asConfiguration(clientConfig);
  const codeChallenge = toPkceCodeChallenge(pkceVerifier);

  return buildAuthorizationUrl(config, {
    redirect_uri: `${env.APP_URL}/api/auth/oidc/callback`,
    response_type: "code",
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
}

export async function exchangeOidcCode(
  clientConfig: unknown,
  code: string,
  pkceVerifier: string,
  nonce: string,
  state: string,
): Promise<OidcTokenClaims> {
  const config = asConfiguration(clientConfig);
  const issuer = getIssuerFromConfig(config);

  try {
    config[customFetch] = toCustomFetch(createSsrfSafeFetch(issuer));

    const callbackUrl = new URL(`${env.APP_URL}/api/auth/oidc/callback`);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", state);

    const tokenResponse = await authorizationCodeGrant(
      config,
      callbackUrl,
      {
        pkceCodeVerifier: pkceVerifier,
        expectedNonce: nonce,
        expectedState: state,
      },
    );

    const claims = tokenResponse.claims();
    if (!claims) {
      throw new OidcError(
        "INVALID_ID_TOKEN",
        issuer,
        "OIDC token response did not include ID token claims",
      );
    }

    if (typeof claims.sub !== "string" || typeof claims.email !== "string") {
      throw new OidcError(
        "INVALID_ID_TOKEN",
        issuer,
        "OIDC ID token claims are missing required subject or email",
      );
    }

    return {
      sub: claims.sub,
      email: claims.email,
      email_verified:
        typeof claims.email_verified === "boolean"
          ? claims.email_verified
          : undefined,
      name: typeof claims.name === "string" ? claims.name : undefined,
    };
  } catch (cause) {
    if (cause instanceof OidcError) {
      throw cause;
    }

    if (cause instanceof OidcSsrfBlockedError) {
      throw new OidcError(
        "SSRF_BLOCKED",
        issuer,
        "OIDC token exchange blocked by SSRF guard",
        cause,
      );
    }

    throw new OidcError(
      "TOKEN_EXCHANGE_FAILED",
      issuer,
      "OIDC authorization code exchange failed",
      cause,
    );
  }
}

export type { OidcErrorCode, OidcTokenClaims };
