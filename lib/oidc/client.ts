import "server-only";
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  customFetch,
  discovery,
  type Configuration,
  type CustomFetch,
} from "openid-client";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { OidcSsrfBlockedError, assertSafeHostname, createSsrfSafeFetch } from "./ssrf-guard";
import type { DecryptedOidcConfig } from "./config";

export type OidcErrorCode =
  | "DISCOVERY_FAILED"
  | "IDP_UNREACHABLE"
  | "TOKEN_EXCHANGE_FAILED"
  | "INVALID_ID_TOKEN"
  | "SSRF_BLOCKED";

export class OidcError extends Error {
  override readonly name = "OidcError";

  constructor(
    readonly code: OidcErrorCode,
    readonly issuer: string,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message, { cause });
  }
}

export interface OidcTokenClaims {
  sub: string;
  email: string;
  email_verified: boolean | undefined;
  name: string | undefined;
}

function isLikelyNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("fetch") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("unreachable")
  );
}

function toPkceCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function discoverOidcClient(config: DecryptedOidcConfig): Promise<Configuration> {
  let issuerUrl: URL;
  try {
    issuerUrl = new URL(config.issuerUrl);
  } catch (cause) {
    throw new OidcError("DISCOVERY_FAILED", config.issuerUrl, `Invalid issuer URL: ${config.issuerUrl}`, cause);
  }

  try {
    await assertSafeHostname(issuerUrl.hostname, config.issuerUrl);
  } catch (e) {
    if (e instanceof OidcSsrfBlockedError) {
      throw new OidcError("SSRF_BLOCKED", config.issuerUrl, e.message, e);
    }
    throw e;
  }

  const ssrfSafeFetch = createSsrfSafeFetch(config.issuerUrl) as unknown as CustomFetch;

  try {
    return await discovery(issuerUrl, config.clientId, config.clientSecret, undefined, {
      [customFetch]: ssrfSafeFetch,
    });
  } catch (e) {
    if (e instanceof OidcSsrfBlockedError) {
      throw new OidcError("SSRF_BLOCKED", config.issuerUrl, e.message, e);
    }
    if (isLikelyNetworkError(e)) {
      throw new OidcError(
        "IDP_UNREACHABLE",
        config.issuerUrl,
        `IdP unreachable: ${config.issuerUrl}`,
        e,
      );
    }
    throw new OidcError(
      "DISCOVERY_FAILED",
      config.issuerUrl,
      `Discovery failed for ${config.issuerUrl}`,
      e,
    );
  }
}

export function buildOidcAuthorizationUrl(
  /**
   * @param clientConfig - Typed as `unknown` to satisfy tests that pass a partial mock.
   * The internal cast to Configuration is intentional; callers from production code
   * always pass a result from discoverOidcClient() which returns Configuration.
   */
  clientConfig: unknown,
  state: string,
  nonce: string,
  pkceVerifier: string,
): URL {
  const codeChallenge = toPkceCodeChallenge(pkceVerifier);
  return buildAuthorizationUrl(clientConfig as Configuration, {
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
  /**
   * @param clientConfig - Typed as `unknown` to satisfy tests that pass a partial mock.
   * The internal cast to Configuration is intentional; callers from production code
   * always pass a result from discoverOidcClient() which returns Configuration.
   */
  clientConfig: unknown,
  code: string,
  pkceVerifier: string,
  nonce: string,
  state: string,
): Promise<OidcTokenClaims> {
  const config = clientConfig as Configuration;
  const issuer = config.serverMetadata().issuer as string;

  // Attach SSRF-safe fetch for the token exchange request.
  config[customFetch] = createSsrfSafeFetch(issuer) as unknown as CustomFetch;

  const callbackUrl = new URL(`${env.APP_URL}/api/auth/oidc/callback`);
  callbackUrl.searchParams.set("code", code);
  callbackUrl.searchParams.set("state", state);

  let tokenResponse: Awaited<ReturnType<typeof authorizationCodeGrant>>;
  try {
    tokenResponse = await authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: pkceVerifier,
      expectedNonce: nonce,
      expectedState: state,
    });
  } catch (e) {
    if (e instanceof OidcError) throw e;
    if (e instanceof OidcSsrfBlockedError) {
      throw new OidcError("SSRF_BLOCKED", issuer, e.message, e);
    }
    throw new OidcError("TOKEN_EXCHANGE_FAILED", issuer, `Token exchange failed for ${issuer}`, e);
  }

  const claims = tokenResponse.claims();
  if (!claims) {
    throw new OidcError("INVALID_ID_TOKEN", issuer, "ID token claims are missing");
  }
  if (typeof claims.sub !== "string" || typeof claims.email !== "string") {
    throw new OidcError("INVALID_ID_TOKEN", issuer, "Required ID token claims (sub, email) are missing");
  }

  return {
    sub: claims.sub,
    email: claims.email,
    email_verified: claims.email_verified as boolean | undefined,
    name: claims.name as string | undefined,
  };
}
