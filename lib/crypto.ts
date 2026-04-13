/**
 * Venshield Settings Encryption Utility
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
      .update("dev-only-venshield-settings-key-not-for-production")
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

// ---------------------------------------------------------------------------
// Binary file encryption  (AES-256-GCM — uses STORAGE_ENCRYPTION_KEY)
// Used by lib/storage.ts local filesystem helpers.
// ---------------------------------------------------------------------------

function getStorageEncryptionKey(): Buffer {
  const key = process.env.STORAGE_ENCRYPTION_KEY;

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "STORAGE_ENCRYPTION_KEY env variable is required in production. " +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    // Dev-only deterministic fallback — NEVER use in production.
    return crypto
      .createHash("sha256")
      .update("dev-only-venshield-storage-key-not-for-production")
      .digest();
  }

  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error(
      "STORAGE_ENCRYPTION_KEY must be a 64-character hex string (32 bytes / 256 bits).",
    );
  }
  return buf;
}

/**
 * Encrypts a binary buffer using AES-256-GCM with STORAGE_ENCRYPTION_KEY.
 * Returns a Buffer in the format: [12B IV][16B auth tag][ciphertext bytes].
 */
export function encryptFile(plaintext: Buffer): Buffer {
  const key = getStorageEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV — NIST recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

/**
 * Decrypts a binary buffer previously produced by `encryptFile()`.
 * Expects the format: [12B IV][16B auth tag][ciphertext bytes].
 * Throws if the buffer is too short or the GCM auth tag is invalid.
 */
export function decryptFile(ciphertext: Buffer): Buffer {
  if (ciphertext.length < 28) {
    throw new Error("Buffer too short to be an encrypted file (minimum 28 bytes: 12B IV + 16B tag).");
  }
  const key = getStorageEncryptionKey();
  const iv = ciphertext.subarray(0, 12);
  const tag = ciphertext.subarray(12, 28);
  const data = ciphertext.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
