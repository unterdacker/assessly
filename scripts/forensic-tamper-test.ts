#!/usr/bin/env tsx
/**
 * scripts/forensic-tamper-test.ts
 *
 * Simulates direct database tampering (bypassing app writes) on one audit row.
 *
 * Usage:
 *   npx tsx scripts/forensic-tamper-test.ts --company <companyId>
 *   npx tsx scripts/forensic-tamper-test.ts --company <companyId> --row <auditLogId>
 */

import { PrismaClient } from "@prisma/client";
import { computeEventHash } from "../lib/audit-sanitize";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const companyId = getArg("--company");
  const rowId = getArg("--row");

  if (!companyId) {
    console.error("Usage: npx tsx scripts/forensic-tamper-test.ts --company <companyId> [--row <auditLogId>]");
    process.exit(2);
  }

  const row = rowId
    ? await prisma.auditLog.findFirst({
        where: { id: rowId, companyId },
        select: {
          id: true,
          companyId: true,
          userId: true,
          action: true,
          entityType: true,
          entityId: true,
          timestamp: true,
          previousLogHash: true,
          eventHash: true,
        },
      })
    : await prisma.auditLog.findFirst({
        where: { companyId, eventHash: { not: null } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          companyId: true,
          userId: true,
          action: true,
          entityType: true,
          entityId: true,
          timestamp: true,
          previousLogHash: true,
          eventHash: true,
        },
      });

  if (!row) {
    console.error("No hash-chained row found for the provided company.");
    process.exit(1);
  }

  const expectedBefore = computeEventHash({
    companyId: row.companyId,
    userId: row.userId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    timestamp: row.timestamp.toISOString(),
    previousLogHash: row.previousLogHash,
  });

  console.log("Target row:", row.id);
  console.log("Original action:", row.action);
  console.log("Hash valid before tamper:", row.eventHash === expectedBefore);

  const tamperedAction = `${row.action}_TAMPERED`;

  // Direct SQL update simulates bypassing application-layer hash-chain logic.
  await prisma.$executeRaw`
    UPDATE "AuditLog"
    SET "action" = ${tamperedAction}
    WHERE "id" = ${row.id}
  `;

  const tampered = await prisma.auditLog.findUnique({
    where: { id: row.id },
    select: {
      id: true,
      companyId: true,
      userId: true,
      action: true,
      entityType: true,
      entityId: true,
      timestamp: true,
      previousLogHash: true,
      eventHash: true,
    },
  });

  if (!tampered) {
    console.error("Tampered row could not be reloaded.");
    process.exit(1);
  }

  const expectedAfter = computeEventHash({
    companyId: tampered.companyId,
    userId: tampered.userId,
    action: tampered.action,
    entityType: tampered.entityType,
    entityId: tampered.entityId,
    timestamp: tampered.timestamp.toISOString(),
    previousLogHash: tampered.previousLogHash,
  });

  console.log("Tampered action:", tampered.action);
  console.log("Stored eventHash:", tampered.eventHash);
  console.log("Expected hash after tamper:", expectedAfter);
  console.log("Hash mismatch detected:", tampered.eventHash !== expectedAfter);

  console.log("\nManual UI verification:");
  console.log(`1. Open /en/admin/audit-logs and the row ${tampered.id}.`);
  console.log('2. Click "Verify Integrity" in the Hash-Chain section.');
  console.log('3. Expected: status INVALID.');
  console.log('4. Try "Download Forensic Bundle". Expected: export blocked due to chain mismatch.');
  console.log("\nRestore command:");
  console.log(`UPDATE \"AuditLog\" SET \"action\"='${row.action.replace(/'/g, "''")}' WHERE \"id\"='${row.id}';`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
