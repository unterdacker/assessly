#!/usr/bin/env tsx
/**
 * scripts/simulate-traceability-chain.ts
 *
 * Emits three correlated audit events with one shared requestId/traceId:
 * LOGIN_SUCCESS -> SETTINGS_UPDATED -> AI_GENERATION
 *
 * Usage:
 *   npx tsx scripts/simulate-traceability-chain.ts --company <companyId> --user <userId>
 */

import { randomUUID } from "crypto";
import { logAuditEvent } from "../lib/audit-log";

const argv = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const companyId = getArg("--company");
  const userId = getArg("--user");

  if (!companyId || !userId) {
    console.error("Usage: npx tsx scripts/simulate-traceability-chain.ts --company <companyId> --user <userId>");
    process.exit(2);
  }

  const traceId = randomUUID();
  const aiEntityId = `ai-report-${Date.now()}`;

  const login = await logAuditEvent({
    companyId,
    userId,
    action: "LOGIN_SUCCESS",
    entityType: "auth_session",
    entityId: userId,
    requestId: traceId,
    reason: "Traceability stress-test: login event",
  });

  const config = await logAuditEvent({
    companyId,
    userId,
    action: "SETTINGS_UPDATED",
    entityType: "company_settings",
    entityId: companyId,
    requestId: traceId,
    reason: "Traceability stress-test: sensitive setting update",
  });

  const ai = await logAuditEvent({
    companyId,
    userId,
    action: "AI_GENERATION",
    entityType: "ai_report",
    entityId: aiEntityId,
    requestId: traceId,
    aiModelId: "stress-test-model",
    aiProviderName: "stress-test-provider",
    inputContextHash: randomUUID().replace(/-/g, ""),
    reason: "Traceability stress-test: AI generation",
  });

  console.log("Traceability chain generated successfully.");
  console.log(`trace_id/requestId: ${traceId}`);
  console.log(`LOGIN_SUCCESS id: ${login.id}`);
  console.log(`SETTINGS_UPDATED id: ${config.id}`);
  console.log(`AI_GENERATION id: ${ai.id}`);
  console.log("\nManual UI verification:");
  console.log(`1. Open /en/admin/audit-logs and open details for event ${ai.id}.`);
  console.log("2. Confirm Trace ID / Correlation matches the trace above.");
  console.log("3. Confirm Related Events contains LOGIN_SUCCESS and SETTINGS_UPDATED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
