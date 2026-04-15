"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { parseRfc4180 } from "@/lib/csv-parse";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { isRateLimited, registerFailure, resetFailures } from "@/lib/rate-limit";
import { calculateRiskLevel } from "@/lib/risk-level";
import { RISK_POSTURE_CACHE_TAG } from "@/lib/queries/dashboard-risk-posture";
import { AuditLogger } from "@/lib/structured-logger";
import { fireWebhookEvent } from "@/modules/webhooks/lib/fire-webhook-event";

export type ImportRowStatus = "created" | "skipped" | "failed";

export type ImportRowResult = {
  row: number;
  status: ImportRowStatus;
  reason?: string;
};

export type ImportVendorsCsvResult =
  | { ok: true; created: number; skipped: number; failed: number; rows: ImportRowResult[] }
  | { ok: false; error: string };

const ImportInputSchema = z.object({
  csvContent: z.string().min(1).max(2_000_000),
});

const CsvRowSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  serviceType: z.string().min(1).max(255),
  officialName: z.string().max(255).optional(),
  contactEmail: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().email().max(255).optional(),
  ),
  headquartersLocation: z.string().max(255).optional(),
});

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string };
  return maybe.code === "P2002";
}

function isAccessCodeSchemaMismatch(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes("Unknown argument `accessCode`") ||
    message.includes("Unknown argument `codeExpiresAt`") ||
    message.includes("Unknown argument `isCodeActive`") ||
    (message.includes("column") && message.includes("accessCode"))
  );
}

export async function importVendorsCsvAction(
  input: { csvContent: string },
): Promise<ImportVendorsCsvResult> {
  let session: Awaited<ReturnType<typeof requireAdminUser>>;
  try {
    session = await requireAdminUser();
  } catch (error) {
    if (isAccessControlError(error)) {
      return { ok: false, error: "unauthorized" };
    }
    return { ok: false, error: "unauthorized" };
  }

  const companyId = session.companyId;
  if (!companyId) {
    return { ok: false, error: "unauthorized" };
  }

  const rlKey = `vendor-csv-import:${session.userId}`;
  if (isRateLimited(rlKey)) {
    return { ok: false, error: "rateLimited" };
  }
  registerFailure(rlKey, { maxFailures: 3, blockMs: 5 * 60 * 1000 });

  const parsedInput = ImportInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: "invalidInput" };
  }

  let rows: string[][];
  try {
    const stripped = parsedInput.data.csvContent.replace(/^\uFEFF/, "");
    rows = parseRfc4180(stripped);
  } catch (error) {
    console.error("[importVendorsCsvAction] parse failure", error);
    return { ok: false, error: "parseError" };
  }

  if (rows.length === 0) {
    return { ok: false, error: "invalidHeaders" };
  }

  const header = rows[0] ?? [];
  const colIndex = new Map<string, number>();
  for (let i = 0; i < header.length; i += 1) {
    const normalized = normalizeHeader(header[i] ?? "");
    if (!colIndex.has(normalized)) {
      colIndex.set(normalized, i);
    }
  }

  const requiredHeaders = ["name", "email", "servicetype"];
  for (const key of requiredHeaders) {
    if (!colIndex.has(key)) {
      return { ok: false, error: "invalidHeaders" };
    }
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return { ok: false, error: "noDataRows" };
  }
  if (dataRows.length > 200) {
    return { ok: false, error: "tooManyRows" };
  }

  const existing = await prisma.vendor.findMany({
    where: { companyId },
    select: { email: true },
  });
  const existingEmails = new Set(existing.map((v) => v.email.toLowerCase()));

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const results: ImportRowResult[] = [];
  const seenInBatch = new Set<string>();
  const WEBHOOK_DELIVERY_BUDGET = 50;
  let webhookDeliveriesQueued = 0;

  for (let index = 0; index < dataRows.length; index += 1) {
    const csvRow = dataRows[index] ?? [];
    const rowNumber = index + 1;

    const rawName = csvRow[colIndex.get("name") ?? -1] ?? "";
    const rawEmail = csvRow[colIndex.get("email") ?? -1] ?? "";
    const rawServiceType = csvRow[colIndex.get("servicetype") ?? -1] ?? "";
    const rawOfficialName = csvRow[colIndex.get("officialname") ?? -1] ?? "";
    const rawContactEmail = csvRow[colIndex.get("contactemail") ?? -1] ?? "";
    const rawHeadquartersLocation = csvRow[colIndex.get("headquarterslocation") ?? -1] ?? "";

    const candidate = {
      name: rawName.trim(),
      email: rawEmail.trim(),
      serviceType: rawServiceType.trim(),
      officialName: rawOfficialName.trim() || undefined,
      contactEmail: rawContactEmail.trim(),
      headquartersLocation: rawHeadquartersLocation.trim() || undefined,
    };

    const parsedRow = CsvRowSchema.safeParse(candidate);
    if (!parsedRow.success) {
      failed += 1;
      results.push({ row: rowNumber, status: "failed", reason: "invalidRow" });
      continue;
    }

    const email = parsedRow.data.email.trim().toLowerCase();
    if (existingEmails.has(email) || seenInBatch.has(email)) {
      skipped += 1;
      results.push({ row: rowNumber, status: "skipped", reason: "duplicateEmail" });
      continue;
    }
    seenInBatch.add(email);

    const complianceScore = 0;
    const riskLevel = calculateRiskLevel(complianceScore);

    try {
      let csvRowVendorSnapshot: { id: string; serviceType: string; createdAt: Date } | null = null;
      // Intentionally one transaction per row. A single 200-row transaction
      // would hold DB locks for too long and risk a full rollback for an unrelated row failure.
      await prisma.$transaction(async (tx) => {
        let vendor:
          | Awaited<ReturnType<typeof tx.vendor.create>>
          | null = null;

        try {
          vendor = await tx.vendor.create({
            data: {
              companyId,
              name: parsedRow.data.name,
              email,
              serviceType: parsedRow.data.serviceType,
              officialName: parsedRow.data.officialName ?? null,
              registrationId: null,
              vendorServiceType: null,
              vendorServiceTypeCustom: null,
              securityOfficerName: null,
              securityOfficerEmail: parsedRow.data.contactEmail ?? null,
              dpoName: null,
              dpoEmail: null,
              headquartersLocation: parsedRow.data.headquartersLocation ?? null,
              sizeClassification: null,
              createdBy: session.userId,
              accessCode: null,
              codeExpiresAt: null,
              isCodeActive: false,
              passwordHash: null,
              isFirstLogin: true,
              inviteSentAt: null,
              inviteToken: null,
              inviteTokenExpires: null,
            },
          });
        } catch (error) {
          if (!isAccessCodeSchemaMismatch(error)) {
            throw error;
          }
          vendor = await tx.vendor.create({
            data: {
              companyId,
              name: parsedRow.data.name,
              email,
              serviceType: parsedRow.data.serviceType,
              officialName: parsedRow.data.officialName ?? null,
              registrationId: null,
              vendorServiceType: null,
              vendorServiceTypeCustom: null,
              securityOfficerName: null,
              securityOfficerEmail: parsedRow.data.contactEmail ?? null,
              dpoName: null,
              dpoEmail: null,
              headquartersLocation: parsedRow.data.headquartersLocation ?? null,
              sizeClassification: null,
              createdBy: session.userId,
              passwordHash: null,
              isFirstLogin: true,
              inviteSentAt: null,
              inviteToken: null,
              inviteTokenExpires: null,
            },
          });
        }

        csvRowVendorSnapshot = {
          id: vendor.id,
          serviceType: vendor.serviceType,
          createdAt: vendor.createdAt,
        };

        await tx.assessment.create({
          data: {
            companyId,
            vendorId: vendor.id,
            status: "PENDING",
            riskLevel,
            complianceScore,
            lastAssessmentDate: null,
            documentFilename: null,
            documentUrl: null,
            createdBy: session.userId,
          },
        });
      });

      created += 1;
      existingEmails.add(email);
      results.push({ row: rowNumber, status: "created" });
      const rowSnapshot: { id: string; serviceType: string; createdAt: Date } | null = csvRowVendorSnapshot;
      if (rowSnapshot && webhookDeliveriesQueued < WEBHOOK_DELIVERY_BUDGET) {
        webhookDeliveriesQueued++;
        void fireWebhookEvent(companyId, {
          event: "vendor.created" as const,
          vendorId: rowSnapshot.id,
          companyId,
          serviceType: rowSnapshot.serviceType,
          createdAt: rowSnapshot.createdAt.toISOString(),
        });
      }
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        skipped += 1;
        results.push({ row: rowNumber, status: "skipped", reason: "duplicateEmail" });
        continue;
      }
      console.error("[importVendorsCsvAction] row transaction failed", error);
      failed += 1;
      results.push({ row: rowNumber, status: "failed", reason: "dbError" });
    }
  }

  AuditLogger.dataOp("vendor.bulk_import", "success", {
    userId: session.userId,
    message: `Bulk CSV import: ${created} created, ${skipped} skipped, ${failed} failed`,
  });

  revalidatePath("/vendors");
  revalidatePath("/dashboard");
  revalidateTag(RISK_POSTURE_CACHE_TAG);
  resetFailures(rlKey);

  return {
    ok: true,
    created,
    skipped,
    failed,
    rows: results,
  };
}
