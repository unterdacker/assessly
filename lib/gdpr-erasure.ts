import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeEventHash, pseudonymizeUserId, scrubPiiFields } from "@/lib/audit-sanitize";

const ADVISORY_LOCK_NAMESPACE = 7769;

export type GdprErasureInput = {
  companyId: string;
  targetUserId: string;
  reason?: string;
};

export type GdprErasureResult = {
  companyId: string;
  targetUserId: string;
  pseudonym: string;
  redactedEntries: number;
  rehashedEntries: number;
};

export type GdprScrubResult = {
  companyId: string;
  targetUserId: string;
  redactedEntries: number;
  hashPreservedEntries: number;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toJsonInput(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}

/**
 * GDPR Art. 17 compliant redaction:
 * - Replaces direct user identifiers with deterministic pseudonyms
 * - Scrubs PII from payloads
 * - Recomputes previousLogHash/eventHash across the chain to preserve integrity
 */
export async function redactUserFromAuditLogs(
  input: GdprErasureInput,
): Promise<GdprErasureResult> {
  const pseudonym = pseudonymizeUserId(
    input.targetUserId,
    "export",
    process.env.AUDIT_ERASURE_KEY,
  );

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(CAST(${ADVISORY_LOCK_NAMESPACE} AS int4), hashtext(${input.companyId}))`;

    const logs = await tx.auditLog.findMany({
      where: { companyId: input.companyId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        companyId: true,
        userId: true,
        actorId: true,
        createdBy: true,
        action: true,
        entityType: true,
        entityId: true,
        timestamp: true,
        hitlVerifiedBy: true,
        previousValue: true,
        newValue: true,
        metadata: true,
      },
    });

    let previousLogHash: string | null = null;
    let redactedEntries = 0;

    for (const log of logs) {
      const isTargeted =
        log.userId === input.targetUserId ||
        log.actorId === input.targetUserId ||
        log.createdBy === input.targetUserId ||
        log.hitlVerifiedBy === input.targetUserId ||
        log.entityId === input.targetUserId;

      const nextUserId = log.userId === input.targetUserId ? pseudonym : log.userId;
      const nextActorId = log.actorId === input.targetUserId ? pseudonym : log.actorId;
      const nextCreatedBy = log.createdBy === input.targetUserId ? pseudonym : log.createdBy;
      const nextHitlVerifiedBy =
        log.hitlVerifiedBy === input.targetUserId ? pseudonym : log.hitlVerifiedBy;
      const nextEntityId = log.entityId === input.targetUserId ? `redacted:${pseudonym}` : log.entityId;

      const scrubbedPreviousValue =
        (scrubPiiFields(log.previousValue) as Prisma.InputJsonValue | null) ?? null;
      const scrubbedNewValue =
        (scrubPiiFields(log.newValue) as Prisma.InputJsonValue | null) ?? null;

      const metadataObj = asObject(scrubPiiFields(log.metadata));
      const nextMetadata: Record<string, unknown> = {
        ...(metadataObj ?? {}),
      };

      if (isTargeted) {
        redactedEntries += 1;
        nextMetadata.gdprRedaction = {
          article: "GDPR Art. 17",
          reason: input.reason ?? "Data redacted per GDPR Art. 17",
          target: pseudonym,
          redactedAt: new Date().toISOString(),
        };
      }

      const eventHash = computeEventHash({
        companyId: log.companyId,
        userId: nextUserId,
        action: log.action,
        entityType: log.entityType,
        entityId: nextEntityId,
        timestamp: log.timestamp.toISOString(),
        previousLogHash,
      });

      await tx.auditLog.update({
        where: { id: log.id },
        data: {
          userId: nextUserId,
          actorId: nextActorId,
          createdBy: nextCreatedBy,
          hitlVerifiedBy: nextHitlVerifiedBy,
          entityId: nextEntityId,
          previousValue: toJsonInput(scrubbedPreviousValue),
          newValue: toJsonInput(scrubbedNewValue),
          metadata: toJsonInput(nextMetadata),
          previousLogHash,
          eventHash,
        },
      });

      previousLogHash = eventHash;
    }

    return {
      companyId: input.companyId,
      targetUserId: input.targetUserId,
      pseudonym,
      redactedEntries,
      rehashedEntries: logs.length,
    };
  });
}

/**
 * GDPR Art. 17 scrub preserving forensic hash-chain immutability.
 *
 * This function deliberately does NOT modify canonical hash-bound fields
 * (`companyId`, `userId`, `action`, `entityType`, `entityId`, `timestamp`,
 * `previousLogHash`, `eventHash`).
 *
 * It redacts non-hash-bound payload fields with the marker
 * "[REDACTED_BY_REQUEST_ART17]" so chain integrity remains fully valid.
 */
export async function scrubUserLogs(input: GdprErasureInput): Promise<GdprScrubResult> {
  const REDACTION_MARKER = "[REDACTED_BY_REQUEST_ART17]";

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(CAST(${ADVISORY_LOCK_NAMESPACE} AS int4), hashtext(${input.companyId}))`;

    const logs = await tx.auditLog.findMany({
      where: {
        companyId: input.companyId,
        OR: [
          { userId: input.targetUserId },
          { actorId: input.targetUserId },
          { createdBy: input.targetUserId },
          { hitlVerifiedBy: input.targetUserId },
        ],
      },
      select: {
        id: true,
        actorId: true,
        createdBy: true,
        hitlVerifiedBy: true,
        previousValue: true,
        newValue: true,
        metadata: true,
        reason: true,
      },
    });

    for (const log of logs) {
      const metadataObj = asObject(scrubPiiFields(log.metadata));

      await tx.auditLog.update({
        where: { id: log.id },
        data: {
          actorId: log.actorId === input.targetUserId ? REDACTION_MARKER : log.actorId,
          createdBy: log.createdBy === input.targetUserId ? REDACTION_MARKER : log.createdBy,
          hitlVerifiedBy:
            log.hitlVerifiedBy === input.targetUserId
              ? REDACTION_MARKER
              : (log.hitlVerifiedBy ?? null),
          reason: log.reason ? REDACTION_MARKER : null,
          previousValue: toJsonInput(REDACTION_MARKER),
          newValue: toJsonInput(REDACTION_MARKER),
          metadata: toJsonInput({
            ...(metadataObj ?? {}),
            redactedPayload: REDACTION_MARKER,
            gdprScrub: {
              article: "GDPR Art. 17",
              marker: REDACTION_MARKER,
              reason: input.reason ?? "Data redacted by subject request",
              scrubbedAt: new Date().toISOString(),
            },
          }),
        },
      });
    }

    return {
      companyId: input.companyId,
      targetUserId: input.targetUserId,
      redactedEntries: logs.length,
      hashPreservedEntries: logs.length,
    };
  });
}
