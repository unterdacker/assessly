import "server-only";

import { encrypt, decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// ExecReport field encryption helpers
//
// These fields contain AI-generated and human-authored report content that
// may include vendor-sensitive compliance findings.  They are encrypted at
// rest using AES-256-GCM (SETTINGS_ENCRYPTION_KEY via lib/crypto.ts).
// ---------------------------------------------------------------------------

const CIPHER_FORMAT_RE = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i;

function safeDecrypt(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  // Legacy plaintext row: not in iv:tag:ciphertext format — return as-is
  if (!CIPHER_FORMAT_RE.test(value)) return value;
  // Encrypted row: let GCM auth-tag failure propagate (signals tampering/corruption)
  return decrypt(value);
}

function encryptIfPresent(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  return encrypt(value);
}

/**
 * Narrowed input type for updateExecReport that prevents Prisma's
 * StringFieldUpdateOperationsInput ({ set: "..." }) from bypassing encryption.
 * TypeScript enforces that callers pass plain string values, not Prisma operation objects.
 */
type ExecReportUpdateFields = {
  executiveSummary?: string | null;
  remediationRoadmap?: string | null;
  aiDraftSummary?: string | null;
  aiDraftRoadmap?: string | null;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Fetches a FINALIZED ExecReport by ID and company, decrypting sensitive text
 * fields before returning.  Used by the PDF generation route.
 */
export async function getExecReportForPdf(reportId: string, companyId: string) {
  const report = await prisma.execReport.findFirst({
    where: {
      id: reportId,
      companyId,
      status: "FINALIZED",
    },
    include: {
      assessment: {
        include: {
          vendor: true,
          company: true,
        },
      },
    },
  });

  if (!report) return null;

  return {
    ...report,
    executiveSummary:   safeDecrypt(report.executiveSummary),
    remediationRoadmap: safeDecrypt(report.remediationRoadmap),
    aiDraftSummary:     safeDecrypt(report.aiDraftSummary),
    aiDraftRoadmap:     safeDecrypt(report.aiDraftRoadmap),
  };
}

// ---------------------------------------------------------------------------
// Write helpers (encrypt on write — use these instead of direct prisma calls
// when creating or updating ExecReport records with sensitive fields)
// ---------------------------------------------------------------------------

/**
 * Creates an ExecReport, encrypting the four sensitive text fields before
 * writing to the database.
 */
export async function createExecReport(data: Prisma.ExecReportUncheckedCreateInput) {
  return prisma.execReport.create({
    data: {
      ...data,
      executiveSummary:   encryptIfPresent(data.executiveSummary as string | null | undefined),
      remediationRoadmap: encryptIfPresent(data.remediationRoadmap as string | null | undefined),
      aiDraftSummary:     encryptIfPresent(data.aiDraftSummary as string | null | undefined),
      aiDraftRoadmap:     encryptIfPresent(data.aiDraftRoadmap as string | null | undefined),
    },
  });
}

/**
 * Updates an ExecReport, encrypting any sensitive text fields that are being
 * updated.  Fields not present in `data` are left unchanged.
 */
export async function updateExecReport(id: string, data: ExecReportUpdateFields) {
  return prisma.execReport.update({
    where: { id },
    data: {
      ...data,
      executiveSummary:
        typeof data.executiveSummary === "string"
          ? encrypt(data.executiveSummary)
          : data.executiveSummary,
      remediationRoadmap:
        typeof data.remediationRoadmap === "string"
          ? encrypt(data.remediationRoadmap)
          : data.remediationRoadmap,
      aiDraftSummary:
        typeof data.aiDraftSummary === "string"
          ? encrypt(data.aiDraftSummary)
          : data.aiDraftSummary,
      aiDraftRoadmap:
        typeof data.aiDraftRoadmap === "string"
          ? encrypt(data.aiDraftRoadmap)
          : data.aiDraftRoadmap,
    },
  });
}
