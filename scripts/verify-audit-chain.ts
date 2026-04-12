#!/usr/bin/env tsx
/**
 * scripts/verify-audit-chain.ts
 *
 * ════════════════════════════════════════════════════════════════════════════
 * Venshield Forensic Audit Log — Hash-Chain Verifier
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE
 *   Stand-alone integrity checker for the NIS2/DORA tamper-evidence hash-chain
 *   stored in the AuditLog table.  Designed for M&A technical due-diligence
 *   teams and external auditors who need to prove that no audit rows have been
 *   deleted, inserted out-of-order, or modified after the fact.
 *
 * USAGE
 *   npx tsx scripts/verify-audit-chain.ts --company <companyId>
 *   npx tsx scripts/verify-audit-chain.ts --company <companyId> --verbose
 *   npx tsx scripts/verify-audit-chain.ts --company <companyId> --out report.txt
 *
 * OPTIONS
 *   --company <id>   (required) CUID/UUID of the company to audit.
 *   --verbose        Print every row's detail, including MATCH rows.
 *                    Without this flag only anomalies are printed in full.
 *   --out <file>     Write the report to a file in addition to stdout.
 *
 * EXIT CODES
 *   0  Chain verified intact (or no hash-chain rows found)
 *   1  Chain broken (at least one integrity violation found)
 *   2  Usage / connection error
 *
 * ── How the Hash-Chain Works ─────────────────────────────────────────────────
 *
 * Each AuditLog row stores two SHA-256 fields:
 *
 *   previousLogHash  The eventHash of the immediately preceding row in this
 *                    company's chain.  NULL for the first row (GENESIS).
 *
 *   eventHash        SHA-256 of the canonical string:
 *                      companyId|userId|action|entityType|entityId|timestamp|previousLogHash
 *                    where the last field is the literal "GENESIS" when null.
 *
 * This script re-derives `eventHash` from the seven stored fields and compares
 * it against the stored value.  It also confirms that each row's
 * `previousLogHash` matches the `eventHash` of the preceding row.
 *
 * A mismatch in either check proves:
 *   • Self-hash mismatch   → the row's own fields were modified after insert.
 *   • Link mismatch        → a row was deleted or inserted between two rows.
 *   • Both mismatch        → wholesale replacement of a row.
 *
 * ── Pre-chain / Legacy Rows ──────────────────────────────────────────────────
 *
 * Rows written before hash-chain support was introduced have eventHash = NULL.
 * These rows cannot be cryptographically verified and are reported separately.
 * The chain analysis begins at the first row that carries a non-null eventHash.
 *
 * ── Framework References ─────────────────────────────────────────────────────
 *   NIS2 Art. 21 § 2(b)    — Incident detection & logging
 *   DORA Art. 9 § 2         — ICT-related incident management
 *   BSI Grundschutz OPS.1.1.5 — Logging & audit trail
 *   ISO/IEC 27001:2022 A.8.15 — Logging
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return argv.includes(flag);
}

const companyId = getArg("--company");
const verbose = hasFlag("--verbose");
const outFile = getArg("--out");

if (!companyId) {
  console.error(
    "Error: --company <companyId> is required.\n" +
      "Usage: npx tsx scripts/verify-audit-chain.ts --company <companyId> [--verbose] [--out report.txt]",
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Hash-chain re-implementation (mirrors computeEventHash in audit-sanitize.ts)
// ---------------------------------------------------------------------------

/**
 * Separator used in the canonical event string.  Must stay in sync with
 * CANONICAL_SEPARATOR in lib/audit-sanitize.ts.
 */
const CANONICAL_SEPARATOR = "|";

/**
 * Re-derives the eventHash for a row from its seven canonical fields.
 *
 * This is an intentional local copy of the algorithm — the script must remain
 * standalone and must not depend on Next.js module resolution or any server
 * runtime.  The algorithm is identical to `computeEventHash` in
 * lib/audit-sanitize.ts and is specified by the Venshield Audit Log Specification
 * (see file header).
 *
 * If a field value contains the separator character the function returns a
 * special sentinel instead of throwing, so the verifier can report the
 * anomaly rather than crashing.
 */
function recomputeEventHash(row: {
  companyId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  /** ISO-8601 timestamp string. */
  timestamp: string;
  previousLogHash: string | null;
}): { hash: string; error?: string } {
  const fields = [
    row.companyId,
    row.userId,
    row.action,
    row.entityType,
    row.entityId,
    row.timestamp,
    row.previousLogHash ?? "GENESIS",
  ];

  // Guard: a field containing the separator would silently produce an
  // ambiguous canonical string — report it as a chain anomaly.
  for (const f of fields) {
    if (f.includes(CANONICAL_SEPARATOR)) {
      return {
        hash: "",
        error: `Field value contains the canonical separator '${CANONICAL_SEPARATOR}': "${f}"`,
      };
    }
  }

  const canonical = fields.join(CANONICAL_SEPARATOR);
  const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
  return { hash };
}

// ---------------------------------------------------------------------------
// Report output helpers
// ---------------------------------------------------------------------------

const DIVIDER = "═".repeat(72);
const lines: string[] = [];

function emit(line: string): void {
  lines.push(line);
  console.log(line);
}

// ---------------------------------------------------------------------------
// Main verification logic
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // ── Fetch rows ─────────────────────────────────────────────────────────────
  //
  // ORDER: We order by `createdAt ASC` (server-inserted clock) as the primary
  // key, then by `id ASC` as a tiebreaker for rows with the same millisecond.
  // This must match the order observed by logAuditEvent when it calls
  // findFirst({ orderBy: { createdAt: "desc" } }).
  const rows = await prisma.auditLog.findMany({
    where: { companyId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      companyId: true,
      userId: true,
      action: true,
      entityType: true,
      entityId: true,
      timestamp: true,    // business timestamp (used in canonical hash)
      createdAt: true,    // server insert clock (used for ordering only)
      previousLogHash: true,
      eventHash: true,
    },
  });

  const runAt = new Date().toISOString();

  emit(DIVIDER);
  emit("  Venshield Forensic Audit Log — Hash-Chain Verification Report");
  emit(`  Company ID    : ${companyId}`);
  emit(`  Total rows    : ${rows.length}`);
  emit(`  Report run at : ${runAt}`);
  emit(`  Verbose       : ${verbose}`);
  emit(DIVIDER);
  emit("");

  if (rows.length === 0) {
    emit("  No AuditLog entries found for this company.");
    emit("");
    emit(DIVIDER);
    emit("  Chain Integrity: NO DATA");
    emit(DIVIDER);
    return;
  }

  // ── Classification pass ────────────────────────────────────────────────────
  //
  // Rows are split into two groups:
  //   • Pre-chain: eventHash is null — written before hash-chain support;
  //     they cannot be cryptographically verified.
  //   • Chain rows: eventHash is non-null — subject to full verification.

  let preChainCount = 0;
  let verifiedCount = 0;
  let brokenCount = 0;

  // Tracks the expected previousLogHash for the *next* chain row.
  // null  →  the next row with eventHash should be a GENESIS row.
  // string→  the next row must carry this exact previousLogHash value.
  let expectedPreviousHash: string | null = null;

  // Whether we have already entered a chain segment (seen a row with eventHash).
  let chainStarted = false;

  // Index (1-based) and ID of the first broken row, for the summary line.
  let firstBreakIndex: number | null = null;
  let firstBreakId: string | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    // ── Pre-chain row ───────────────────────────────────────────────────────
    if (row.eventHash === null) {
      preChainCount++;
      if (verbose) {
        emit(
          `[${String(rowNum).padStart(4)}] ID: ${row.id}  createdAt: ${row.createdAt.toISOString()}`,
        );
        emit(`       Action : ${row.action} | Entity: ${row.entityType} / ${row.entityId}`);
        emit(`       ⊘  PRE-CHAIN — no eventHash (written before hash-chain support)`);
        emit("");
      }
      // Pre-chain rows do not advance the chain pointer.
      continue;
    }

    // ── Chain row ───────────────────────────────────────────────────────────
    const timestampIso = row.timestamp.toISOString();
    const recomputed = recomputeEventHash({
      companyId: row.companyId,
      userId: row.userId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      timestamp: timestampIso,
      previousLogHash: row.previousLogHash,
    });

    // Determine link validity
    let linkOk: boolean;
    let linkNote: string;

    if (!chainStarted) {
      // First chain row: must have previousLogHash = null (GENESIS).
      linkOk = row.previousLogHash === null;
      linkNote = linkOk
        ? "null (GENESIS — valid chain start)                       ✓"
        : `ERROR — expected null (GENESIS) but got: ${row.previousLogHash}  ✗`;
      chainStarted = true;
    } else {
      // Subsequent chain row: previousLogHash must equal the previous eventHash.
      linkOk = row.previousLogHash === expectedPreviousHash;
      linkNote = linkOk
        ? `${row.previousLogHash}  ✓`
        : `MISMATCH — stored:    ${row.previousLogHash ?? "null"}\n` +
          `                             expected: ${expectedPreviousHash ?? "null"}  ✗`;
    }

    // Determine self-hash validity
    let selfOk: boolean;
    let selfNote: string;

    if (recomputed.error) {
      selfOk = false;
      selfNote = `ERROR — ${recomputed.error}  ✗`;
    } else {
      selfOk = recomputed.hash === row.eventHash;
      selfNote = selfOk
        ? `${row.eventHash}  ✓`
        : `MISMATCH — stored:    ${row.eventHash}\n` +
          `                             computed: ${recomputed.hash}  ✗`;
    }

    const rowOk = linkOk && selfOk;

    if (rowOk) {
      verifiedCount++;
    } else {
      brokenCount++;
      if (firstBreakIndex === null) {
        firstBreakIndex = rowNum;
        firstBreakId = row.id;
      }
    }

    // Print row detail:
    //   always when verbose=true or when there is a problem.
    if (verbose || !rowOk) {
      emit(
        `[${String(rowNum).padStart(4)}] ID: ${row.id}  createdAt: ${row.createdAt.toISOString()}`,
      );
      emit(`       Action          : ${row.action}`);
      emit(`       Entity          : ${row.entityType} / ${row.entityId}`);
      emit(`       Timestamp (hash): ${timestampIso}`);
      emit(`       previousLogHash : ${linkNote}`);
      emit(`       eventHash       : ${selfNote}`);
      emit("");
    } else {
      // Compact single-line output for verified rows when not in verbose mode.
      emit(
        `[${String(rowNum).padStart(4)}] ${row.id}  ${row.action.padEnd(30)} ✓`,
      );
    }

    // Advance the chain pointer for the next row.
    expectedPreviousHash = row.eventHash;
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  emit("");
  emit(DIVIDER);
  emit("  SUMMARY");
  emit(DIVIDER);
  emit(`  Total rows examined : ${rows.length}`);
  emit(`  Pre-chain rows      : ${preChainCount}  (eventHash = null; not verifiable)`);
  emit(`  Chain rows verified : ${verifiedCount}`);
  emit(`  Chain rows broken   : ${brokenCount}`);
  emit("");

  if (brokenCount === 0) {
    emit("  Chain Integrity: VERIFIED");
    if (preChainCount > 0) {
      emit(
        `  Note: ${preChainCount} pre-chain row(s) could not be cryptographically verified.`,
      );
      emit(
        "  These rows were written before hash-chain support was introduced and",
      );
      emit(
        "  should be corroborated against server-side application logs.",
      );
    }
  } else {
    emit(
      `  Chain Integrity: BROKEN at Log ID ${firstBreakId} (row ${firstBreakIndex})`,
    );
    emit("");
    emit("  INTERPRETATION");
    emit("  ─────────────────────────────────────────────────────────────────");
    emit("  A broken chain means one or more of the following occurred:");
    emit("    (a) A row was DELETED between two existing rows.");
    emit("    (b) A row was INSERTED into the chain after the fact.");
    emit("    (c) A row's immutable fields (action, entityId, timestamp, etc.)");
    emit("        were MODIFIED after the original insert.");
    emit(
      "    (d) The previousLogHash or eventHash column was directly edited in the DB.",
    );
    emit("");
    emit("  Recommended next steps for the audit team:");
    emit("    1. Cross-reference the broken row's `requestId` with CDN/API logs.");
    emit("    2. Check PostgreSQL WAL / pg_audit log for UPDATE/DELETE on AuditLog.");
    emit("    3. Compare against the last off-site backup exported before the gap.");
  }

  emit(DIVIDER);

  // ── Write to file if requested ────────────────────────────────────────────
  if (outFile) {
    const outPath = path.resolve(outFile);
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
    console.log(`\nReport written to: ${outPath}`);
  }

  // Exit with code 1 if chain is broken so CI pipelines can detect failures.
  if (brokenCount > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
