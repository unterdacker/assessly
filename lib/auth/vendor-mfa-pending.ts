import "server-only";

import { cookies } from "next/headers";
import { shouldSecureCookie } from "@/lib/auth/token";

export const VENDOR_MFA_PENDING_COOKIE = "venshield-vendor-mfa-pending";
const VENDOR_MFA_PENDING_TTL_SECONDS = 5 * 60; // 5 minutes

export type VendorMfaPendingClaims = {
  type: "venshield-vendor-mfa-pending";
  uid: string;
  vid: string;
  cid: string;
  locale: string;
  exp: number;
};

const encoder = new TextEncoder();

function getSigningSecret(): string {
  return (
    process.env.AUTH_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dev-only-venshield-session-secret-change-me"
  );
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

async function signClaims(claims: VendorMfaPendingClaims): Promise<string> {
  const payload = encodeBase64Url(encoder.encode(JSON.stringify(claims)));
  const key = await importSigningKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function verifyClaims(token: string): Promise<VendorMfaPendingClaims | null> {
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
    ) as VendorMfaPendingClaims;
    if (claims.type !== "venshield-vendor-mfa-pending") return null;
    if (claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function setVendorMfaPendingCookie(
  uid: string,
  vid: string,
  cid: string,
  locale: string,
): Promise<void> {
  const claims: VendorMfaPendingClaims = {
    type: "venshield-vendor-mfa-pending",
    uid,
    vid,
    cid,
    locale,
    exp: Date.now() + VENDOR_MFA_PENDING_TTL_SECONDS * 1000,
  };
  const token = await signClaims(claims);
  const cookieStore = await cookies();
  cookieStore.set(VENDOR_MFA_PENDING_COOKIE, token, {
    httpOnly: true,
    secure: shouldSecureCookie(),
    sameSite: "strict",
    path: "/",
    maxAge: VENDOR_MFA_PENDING_TTL_SECONDS,
  });
}

export async function getVendorMfaPendingClaims(): Promise<VendorMfaPendingClaims | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(VENDOR_MFA_PENDING_COOKIE)?.value;
  if (!token) return null;
  return verifyClaims(token);
}

export async function clearVendorMfaPendingCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(VENDOR_MFA_PENDING_COOKIE);
}
