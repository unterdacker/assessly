import "server-only";

import crypto from "crypto";
import { generateSecret as totpGenerateSecret, generateURI, verifySync } from "otplib";

// Use 96-bit IV (12 bytes) which is the NIST-recommended size for AES-GCM.
const ALGORITHM = "aes-256-gcm" as const;

/**
 * Returns a 32-byte AES-256 key for encrypting MFA secrets at rest.
 *
 * In production, set MFA_ENCRYPTION_KEY to a 64-char hex string.
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
function getMfaEncryptionKey(): Buffer {
  const key = process.env.MFA_ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "MFA_ENCRYPTION_KEY env variable is required in production. " +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    // Dev-only deterministic fallback — never use in production.
    return crypto
      .createHash("sha256")
      .update("dev-only-assessly-mfa-key-not-for-production")
      .digest();
  }

  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error(
      "MFA_ENCRYPTION_KEY must be a 64-char hex string (32 bytes / 256 bits).",
    );
  }
  return buf;
}

/**
 * Encrypts a TOTP secret with AES-256-GCM so it can be safely stored in the DB.
 * Output format: `<iv_hex>:<tag_hex>:<ciphertext_hex>`
 */
export function encryptMfaSecret(plaintext: string): string {
  const key = getMfaEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a TOTP secret previously encrypted with encryptMfaSecret.
 */
export function decryptMfaSecret(ciphertext: string): string {
  const key = getMfaEncryptionKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid MFA secret ciphertext format.");
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return (
    decipher.update(Buffer.from(dataHex, "hex")).toString("utf8") +
    decipher.final("utf8")
  );
}

/** Generates a new TOTP base32 secret. */
export function generateTotpSecret(): string {
  return totpGenerateSecret();
}

/** Builds the otpauth:// URI used to populate authenticator apps. */
export function generateTotpUri(email: string, secret: string): string {
  return generateURI({ issuer: "Assessly", label: email, secret });
}

/**
 * Verifies a 6-digit TOTP code against an encrypted secret.
 * Returns false for any error (wrong code, decryption failure, etc.).
 */
export function verifyTotpToken(token: string, encryptedSecret: string): boolean {
  try {
    const secret = decryptMfaSecret(encryptedSecret);
    return verifySync({ token, secret }).valid;
  } catch {
    return false;
  }
}
