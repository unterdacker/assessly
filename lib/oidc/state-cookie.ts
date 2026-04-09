import "server-only";

import { cookies } from "next/headers";
import { env } from "@/lib/env";

const OIDC_STATE_COOKIE = "assessly-oidc-state";
const OIDC_STATE_TTL_MS = 600_000;
const OIDC_STATE_TTL_SECONDS = 600;

type OidcStateClaims = {
  type: "assessly-oidc-state";
  state: string;
  nonce: string;
  pkceVerifier: string;
  locale: string;
  next: string;
  companyId: string;
  exp: number;
};

const encoder = new TextEncoder();

function getSigningSecret(): string {
  return env.OIDC_STATE_SECRET;
}

function encodeBase64Url(input: Uint8Array): string {
  const binary = Array.from(input, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(input: string): Uint8Array<ArrayBuffer> {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0
      ? ""
      : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  return new Uint8Array(Array.from(binary, (char) => char.charCodeAt(0)));
}

async function importSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSigningSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signClaims(claims: OidcStateClaims): Promise<string> {
  const payload = encodeBase64Url(encoder.encode(JSON.stringify(claims)));
  const key = await importSigningKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function verifyClaims(token: string): Promise<OidcStateClaims | null> {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  try {
    const key = await importSigningKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signature),
      encoder.encode(payload),
    );
    if (!valid) return null;

    const claims = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payload)),
    ) as OidcStateClaims;
    if (claims.type !== "assessly-oidc-state") return null;
    if (claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function validateNextParam(next: string | undefined, appUrl: string): string {
  if (!next) return "";
  if (next.startsWith("//")) return "";
  if (!next.startsWith("/")) return "";

  try {
    const resolved = new URL(next, appUrl);
    const appOrigin = new URL(appUrl).origin;
    if (resolved.origin !== appOrigin) return "";
    return next;
  } catch {
    return "";
  }
}

export async function setOidcStateCookie(
  claims: Omit<OidcStateClaims, "type" | "exp">,
): Promise<void> {
  const fullClaims: OidcStateClaims = {
    type: "assessly-oidc-state",
    state: claims.state,
    nonce: claims.nonce,
    pkceVerifier: claims.pkceVerifier,
    locale: claims.locale,
    next: claims.next,
    companyId: claims.companyId,
    exp: Date.now() + OIDC_STATE_TTL_MS,
  };
  const token = await signClaims(fullClaims);
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
  const token = cookieStore.get(OIDC_STATE_COOKIE)?.value;
  if (!token) return null;
  return verifyClaims(token);
}

export async function clearOidcStateCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(OIDC_STATE_COOKIE);
}

export type { OidcStateClaims };
