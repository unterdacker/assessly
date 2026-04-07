import type { UserRole } from "@prisma/client";

export const AUTH_SESSION_COOKIE_NAME = "assessly-session";

export type SessionClaims = {
  type: "assessly-session";
  sid: string;
  uid: string;
  role: UserRole;
  cid: string | null;
  vid: string | null;
  exp: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SESSION_SECRET env variable is required in production.");
    }
    return "dev-only-assessly-session-secret-change-me";
  }
  if (secret.length < 32) {
    throw new Error(
      "AUTH_SESSION_SECRET must be at least 32 characters (256 bits) long.",
    );
  }
  return secret;
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
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  return new Uint8Array(Array.from(binary, (char) => char.charCodeAt(0)));
}

async function importSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSessionClaims(claims: SessionClaims): Promise<string> {
  const payload = encodeBase64Url(encoder.encode(JSON.stringify(claims)));
  const key = await importSigningKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | null | undefined): Promise<SessionClaims | null> {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  try {
    const key = await importSigningKey();
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signature),
      encoder.encode(payload),
    );

    if (!isValid) return null;

    const claims = JSON.parse(decoder.decode(decodeBase64Url(payload))) as SessionClaims;
    if (claims.type !== "assessly-session" || claims.exp <= Date.now()) return null;

    return claims;
  } catch {
    return null;
  }
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return encodeBase64Url(new Uint8Array(digest));
}

/**
 * Returns true when cookies should carry the `Secure` attribute.
 *
 * The flag is tied to the actual transport protocol rather than NODE_ENV
 * because Next.js standalone always runs with NODE_ENV=production — even
 * inside a local Docker container served over plain HTTP.
 *
 * We use the runtime env var ALLOW_INSECURE_LOCALHOST (not a NEXT_PUBLIC_
 * var, so it is NOT inlined at build time and reflects the real runtime
 * environment).  docker-compose.yml sets it to "true" for local Docker;
 * real deployments omit it or set it to "false".
 */
export function shouldSecureCookie(): boolean {
  if (process.env.ALLOW_INSECURE_LOCALHOST === "true") return false;
  return process.env.NODE_ENV === "production";
}