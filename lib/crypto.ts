/**
 * Assessly Settings Encryption Utility
 *
 * AES-256-GCM helpers for encrypting sensitive configuration values
 * (SMTP passwords, API keys) before persisting them in the database.
 *
 * Key management:
 *   Set SETTINGS_ENCRYPTION_KEY to a 64-char hex string (32 bytes / 256 bits).
 *   Generate one with:
 *     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Ciphertext format: `<iv_hex>:<tag_hex>:<ciphertext_hex>`
 */

import "server-only";

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm" as const;

function getEncryptionKey(): Buffer {
  const key = process.env.SETTINGS_ENCRYPTION_KEY;

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SETTINGS_ENCRYPTION_KEY env variable is required in production. " +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    // Dev-only deterministic fallback — NEVER use in production.
    return crypto
      .createHash("sha256")
      .update("dev-only-assessly-settings-key-not-for-production")
      .digest();
  }

  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes / 256 bits).",
    );
  }
  return buf;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a single string in the format `<iv_hex>:<tag_hex>:<ciphertext_hex>`.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV — NIST recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a ciphertext string previously produced by `encrypt()`.
 * Throws if the ciphertext is malformed or the authentication tag is invalid.
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid ciphertext format. Expected `<iv_hex>:<tag_hex>:<data_hex>`.",
    );
  }
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
