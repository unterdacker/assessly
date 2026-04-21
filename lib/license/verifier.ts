import "server-only";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import type { SignedLicense } from "./types";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export function verifyLicenseSignatureSync(
  encoded: string,
  publicKeyHex: string
): SignedLicense | null {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    const signed: SignedLicense = JSON.parse(json);
    const message = Buffer.from(JSON.stringify(signed.payload));
    const signature = Buffer.from(signed.signature, "hex");
    const publicKey = Buffer.from(publicKeyHex, "hex");
    const valid = ed.verify(signature, message, publicKey);
    if (!valid) return null;
    return signed;
  } catch {
    return null;
  }
}

export function isLicenseExpired(expiresAt: number | null): boolean {
  if (expiresAt === null) return false;
  return Date.now() / 1000 > expiresAt;
}
