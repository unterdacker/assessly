import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { logErrorReport } from "@/lib/logger";

const OIDC_STATE_COOKIE = "assessly-oidc-state";
const OIDC_STATE_TTL_MS = 600_000;
const OIDC_STATE_TTL_SECONDS = 600;

export interface OidcStateClaims {
  type: "assessly-oidc-state";
  state: string;
  nonce: string;
  pkceVerifier: string;
  locale: string;
  next: string;
  companyId: string;
  exp: number;
}

interface SetOidcStateCookieParams {
  state: string;
  nonce: string;
  pkceVerifier: string;
  locale: string;
  next: string;
  companyId: string;
}

function encodeBase64Url(input: Uint8Array): string {
  const binary = Array.from(input, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(input: string): Uint8Array<ArrayBuffer> {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  // Use new Uint8Array(Array.from(...)) - Uint8Array is a valid BufferSource for
  // crypto.subtle.verify. Do NOT use .buffer (returns ArrayBuffer which fails
  // type checks in some runtimes).
  return new Uint8Array(Array.from(binary, (c) => c.charCodeAt(0)));
}

async function importHmacKey(usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.OIDC_STATE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

async function signToken(payloadB64: string): Promise<string> {
  const key = await importHmacKey(["sign"]);
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64),
  );
  return `${payloadB64}.${encodeBase64Url(new Uint8Array(signatureBuffer))}`;
}

async function verifyClaims(token: string): Promise<OidcStateClaims | null> {
  try {
    const lastDot = token.lastIndexOf(".");
    if (lastDot === -1) return null;

    const payloadB64 = token.slice(0, lastDot);
    const signatureB64 = token.slice(lastDot + 1);

    const key = await importHmacKey(["verify"]);
    const signatureBytes = decodeBase64Url(signatureB64);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(payloadB64),
    );
    if (!valid) return null;

    const payloadBytes = decodeBase64Url(payloadB64);
    const payloadJson = new TextDecoder().decode(payloadBytes);
    const claims = JSON.parse(payloadJson) as OidcStateClaims;

    if (claims.exp < Date.now()) return null;
    if (claims.type !== "assessly-oidc-state") return null;

    return claims;
  } catch (e) {
    // Only truly unexpected errors (crypto misconfiguration, etc.) reach here.
    // Normal rejections (tampered MAC, expired token) return null before this.
    logErrorReport("oidc/state-cookie: verifyClaims unexpected error", e);
    return null;
  }
}

export function validateNextParam(
  next: string | undefined,
  appUrl: string,
): string {
  if (!next || next === "") return "";

  let appOrigin: string;
  try {
    appOrigin = new URL(appUrl).origin;
  } catch {
    return "";
  }

  if (!next.startsWith("/") || next.startsWith("//")) return "";

  try {
    const resolved = new URL(next, appUrl);
    if (resolved.origin !== appOrigin) return "";
  } catch {
    return "";
  }

  return next;
}

export async function setOidcStateCookie(params: SetOidcStateCookieParams): Promise<void> {
  const claims: OidcStateClaims = {
    type: "assessly-oidc-state",
    ...params,
    exp: Date.now() + OIDC_STATE_TTL_MS,
  };

  const payloadB64 = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(claims)),
  );
  const token = await signToken(payloadB64);

  const cookieStore = await cookies();
  cookieStore.set(OIDC_STATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_STATE_TTL_SECONDS,
  });
}

export async function getOidcStateClaims(): Promise<OidcStateClaims | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(OIDC_STATE_COOKIE);
  if (!cookie?.value) return null;
  return verifyClaims(cookie.value);
}

export async function clearOidcStateCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(OIDC_STATE_COOKIE);
}
