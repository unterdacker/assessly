/**
 * OidcConfig clientSecretEncrypted Re-encryption Script
 *
 * Usage:
 *   OLD_SETTINGS_ENCRYPTION_KEY=<old_64_hex> \
 *   SETTINGS_ENCRYPTION_KEY=<new_64_hex> \
 *   npx ts-node --project tsconfig.json scripts/reencrypt-oidc-secrets.ts
 *
 * WARNING: Run inside a maintenance window. Back up the DB first.
 * This script reads all OidcConfig rows, decrypts with the OLD key,
 * re-encrypts with the NEW key. Exits non-zero if any row fails.
 */
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm" as const;

function getKey(envVar: string): Buffer {
  const val = process.env[envVar];
  if (!val) throw new Error(`${envVar} is required`);
  const buf = Buffer.from(val, "hex");
  if (buf.length !== 32) {
    throw new Error(`${envVar} must be exactly 64 hex chars (32 bytes)`);
  }
  return buf;
}

// Matches lib/crypto.ts format exactly: <iv_hex>:<tag_hex>:<ciphertext_hex>
function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

// Matches lib/crypto.ts format exactly: <iv_hex>:<tag_hex>:<ciphertext_hex>
function decrypt(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format. Expected <iv_hex>:<tag_hex>:<data_hex>.");
  }

  const [ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  return decipher.update(Buffer.from(dataHex, "hex")).toString("utf8") + decipher.final("utf8");
}

async function main(): Promise<void> {
  const oldKey = getKey("OLD_SETTINGS_ENCRYPTION_KEY");
  const newKey = getKey("SETTINGS_ENCRYPTION_KEY");
  const prisma = new PrismaClient();

  try {
    const rows = await prisma.oidcConfig.findMany({
      select: { id: true, clientSecretEncrypted: true },
    });

    const beforeCount = rows.length;
    console.log(`Re-encrypting ${beforeCount} OidcConfig row(s)...`);

    let success = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const plaintext = decrypt(row.clientSecretEncrypted, oldKey);
        const reencrypted = encrypt(plaintext, newKey);
        await prisma.oidcConfig.update({
          where: { id: row.id },
          data: { clientSecretEncrypted: reencrypted },
        });
        success++;
      } catch (err) {
        console.error(`FAILED to re-encrypt row ${row.id}:`, err);
        failed++;
      }
    }

    const afterCount = await prisma.oidcConfig.count();
    if (afterCount !== beforeCount) {
      console.error(`FATAL: Row count mismatch. Before: ${beforeCount}, After: ${afterCount}`);
      process.exit(1);
    }

    console.log(`Done. Success: ${success}, Failed: ${failed}`);
    if (failed > 0) {
      console.error("FATAL: Some rows failed. Do NOT deploy new key until all rows succeed.");
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
