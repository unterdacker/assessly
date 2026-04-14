"use server";

import path from "path";
import { createHash, randomUUID } from "crypto";
import sanitizeHtml from "sanitize-html";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { RISK_POSTURE_CACHE_TAG } from "@/lib/queries/dashboard-risk-posture";
import { logAuditEvent } from "@/lib/audit-log";
import { encrypt } from "@/lib/crypto";
import { putLocalFile } from "@/lib/storage";

const MAX_EVIDENCE_SIZE_BYTES = 10 * 1024 * 1024;
/** Grace period keeps sessions alive through brief clock skew at the boundary. */
const EXPIRY_GRACE_PERIOD_MS = 2 * 60 * 1000;
const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

function sanitizeJustificationText(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  }).trim();
}

function safeDisplayFilename(rawName: string): string {
  const basename = path.basename(rawName || "evidence");
  const cleaned = basename
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
  return cleaned || "evidence";
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    default:
      return "bin";
  }
}

async function persistEvidenceFile(file: File): Promise<{ storageKey: string; displayName: string }> {
  if (!ALLOWED_EVIDENCE_MIME_TYPES.has(file.type)) {
    throw new Error("Unsupported evidence file type. Allowed types: PDF, JPG, PNG.");
  }
  if (file.size <= 0) {
    throw new Error("Evidence file is empty.");
  }
  if (file.size > MAX_EVIDENCE_SIZE_BYTES) {
    throw new Error("Evidence file exceeds 10MB size limit.");
  }

  const displayName = safeDisplayFilename(file.name);
  const extension = extensionForMimeType(file.type);
  const storageKey = `${randomUUID()}.${extension}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await putLocalFile(`question-evidence/${storageKey}`, buffer);

  return { storageKey, displayName };
}

async function createEvidenceDocument(
  assessmentId: string,
  file: File,
  storageKey: string,
  displayName: string,
  uploadedBy: string,
) {
  return prisma.document.create({
    data: {
      assessmentId,
      filename: displayName,
      storagePath: path.join("question-evidence", storageKey).replace(/\\/g, "/"),
      mimeType: file.type,
      fileSize: file.size,
      uploadedBy,
    },
    select: {
      id: true,
      filename: true,
      fileSize: true,
      uploadedAt: true,
      uploadedBy: true,
    },
  });
}

/**
 * Explicit save endpoint for one external vendor answer.
 * Enforces server-side token authentication, sanitization, and secure evidence upload controls.
 */
export async function updateExternalAnswer(formData: FormData) {
  // ── CSRF: verify Origin header ────────────────────────────────────────────
  // Defense-in-depth on top of SameSite=Lax. If the browser sends an Origin
  // header (all modern browsers do on cross-origin POST/form submissions) it
  // must match the application's own origin.  A mismatch means the request
  // originated from a foreign site and is rejected immediately, before any
  // cookie reading or database access.
  const headerStore = await headers();
  const requestOrigin = headerStore.get("origin");
  if (requestOrigin) {
    // Build the canonical expected origin from NEXT_PUBLIC_APP_URL, falling
    // back to constructing it from the Host header.
    const rawAppUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
    let expectedOrigin: string | undefined;
    try {
      if (rawAppUrl) expectedOrigin = new URL(rawAppUrl).origin;
    } catch { /* ignore misconfigured URL — fall through to Host */ }
    if (!expectedOrigin) {
      const host = headerStore.get("host");
      const proto = process.env.NODE_ENV === "production" ? "https" : "http";
      if (host) expectedOrigin = `${proto}://${host}`;
    }
    if (expectedOrigin && requestOrigin !== expectedOrigin) {
      return { ok: false, error: "Request rejected: cross-origin submission is not allowed." };
    }
  }

  // ── Authentication: validate vendor portal token ──────────────────────────
  const cookieStore = await cookies();
  const vendorToken = cookieStore.get("venshield-vendor-token")?.value;
  if (!vendorToken) {
    return { ok: false, error: "Session expired. Please reload the portal." };
  }
  const vendorTokenHash = createHash("sha256").update(vendorToken).digest("hex");

  const tokenVendor = await prisma.vendor.findFirst({
    where: { inviteToken: vendorTokenHash, isCodeActive: true },
    select: {
      id: true,
      inviteTokenExpires: true,
      codeExpiresAt: true,
      assessment: { select: { id: true } },
    },
  });

  if (!tokenVendor || !tokenVendor.assessment) {
    return { ok: false, error: "Invalid or expired portal session." };
  }

  const sessionDeadline: Date | null =
    tokenVendor.inviteTokenExpires ?? tokenVendor.codeExpiresAt ?? null;
  if (sessionDeadline && Date.now() > sessionDeadline.getTime() + EXPIRY_GRACE_PERIOD_MS) {
    return { ok: false, error: "Portal session has expired." };
  }

  // ── Input parsing ─────────────────────────────────────────────────────────
  const assessmentId = String(formData.get("assessmentId") || "").trim();
  const questionId = String(formData.get("questionId") || "").trim();
  const status = String(formData.get("status") || "").trim() as
    | "COMPLIANT"
    | "NON_COMPLIANT"
    | "NOT_APPLICABLE";
  const justificationRaw = String(formData.get("justificationText") || "");
  const justificationText = sanitizeJustificationText(justificationRaw);
  const maybeFile = formData.get("evidenceFile");

  if (!assessmentId || !questionId) {
    throw new Error("Missing identification for answer update.");
  }

  // Cross-check: the submitted assessmentId must belong to the authenticated vendor
  if (tokenVendor.assessment.id !== assessmentId) {
    return { ok: false, error: "Unauthorized." };
  }

  if (!["COMPLIANT", "NON_COMPLIANT", "NOT_APPLICABLE"].includes(status)) {
    return { ok: false, error: "Invalid answer status." };
  }

  if (!justificationText) {
    return { ok: false, error: "Justification is required before Save & Confirm." };
  }

  try {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, companyId: true },
    });

    if (!assessment) {
      return { ok: false, error: "Assessment not found." };
    }

    let evidenceFileUrl: string | undefined;
    let evidenceFileName: string | undefined;
    let evidenceDocumentId: string | undefined;

    if (maybeFile instanceof File && maybeFile.size > 0) {
      const persisted = await persistEvidenceFile(maybeFile);
      evidenceFileUrl = persisted.storageKey;
      evidenceFileName = persisted.displayName;
      const evidenceDocument = await createEvidenceDocument(
        assessment.id,
        maybeFile,
        persisted.storageKey,
        persisted.displayName,
        "external-vendor",
      );
      evidenceDocumentId = evidenceDocument.id;
    }

    const existing = await prisma.assessmentAnswer.findFirst({
      where: { assessmentId, questionId }
    });

    if (existing) {
      const updated = await prisma.assessmentAnswer.update({
        where: { id: existing.id },
        data: { 
          status, 
          findings: encrypt(justificationText),
          justificationText: encrypt(justificationText),
          ...(evidenceFileUrl
            ? {
                evidenceFileUrl,
                evidenceFileName,
                documentId: evidenceDocumentId,
              }
            : {}),
          verified: true,
          isAiSuggested: existing.isAiSuggested,
          updatedAt: new Date(),
          createdBy: "external-vendor" 
        },
        select: {
          id: true,
          status: true,
          verified: true,
          justificationText: true,
          evidenceFileName: true,
          evidenceFileUrl: true,
          document: {
            select: {
              id: true,
              filename: true,
              fileSize: true,
              uploadedAt: true,
              uploadedBy: true,
            },
          },
        },
      });

      try {
        const previousValuePayload = {
          status: existing.status || null,
          justificationText: existing.justificationText || null,
          evidenceFileName: existing.evidenceFileName || null,
          evidenceFileUrl: existing.evidenceFileUrl || null,
          documentId: existing.documentId || null,
          verified: existing.verified ?? false,
        };

        const newValuePayload = {
          status: updated.status || null,
          justificationText: updated.justificationText || null,
          evidenceFileName: updated.evidenceFileName || null,
          evidenceFileUrl: updated.evidenceFileUrl || null,
          documentId: updated.document?.id || null,
          verified: updated.verified ?? false,
          aiSuggestionUsed: existing.isAiSuggested ?? false,
          aiSuggestedStatus: existing.aiSuggestedStatus || null,
          aiReasoningSnapshot: existing.aiReasoning || null,
        };

        await logAuditEvent(
          {
            companyId: assessment.companyId,
            userId: "external-vendor",
            action: "EXTERNAL_ASSESSMENT_UPDATED",
            entityType: "assessment_answer",
            entityId: updated.id,
            previousValue: previousValuePayload,
            newValue: newValuePayload,
          },
          { captureHeaders: false }, // Disable header capture to avoid async context issues
        );
      } catch (auditErr) {
        console.error("[updateExternalAnswer] Audit log failed:", auditErr);
        // Non-fatal: continue even if audit logging fails
      }

      revalidatePath("/vendors");
      revalidateTag(RISK_POSTURE_CACHE_TAG);
      return { ok: true, answer: updated };
    } else {
      const created = await prisma.assessmentAnswer.create({
        data: {
          assessmentId,
          questionId,
          status,
          findings: encrypt(justificationText),
          justificationText: encrypt(justificationText),
          evidenceFileUrl,
          evidenceFileName,
          documentId: evidenceDocumentId,
          verified: true,
          createdBy: "external-vendor"
        },
        select: {
          id: true,
          status: true,
          verified: true,
          justificationText: true,
          evidenceFileName: true,
          evidenceFileUrl: true,
          document: {
            select: {
              id: true,
              filename: true,
              fileSize: true,
              uploadedAt: true,
              uploadedBy: true,
            },
          },
        },
      });

      try {
        const newValuePayload = {
          status: created.status || null,
          justificationText: created.justificationText || null,
          evidenceFileName: created.evidenceFileName || null,
          evidenceFileUrl: created.evidenceFileUrl || null,
          documentId: created.document?.id || null,
          verified: created.verified ?? false,
          aiSuggestionUsed: false,
        };

        await logAuditEvent(
          {
            companyId: assessment.companyId,
            userId: "external-vendor",
            action: "EXTERNAL_ASSESSMENT_UPDATED",
            entityType: "assessment_answer",
            entityId: created.id,
            previousValue: null,
            newValue: newValuePayload,
          },
          { captureHeaders: false }, // Disable header capture to avoid async context issues
        );
      } catch (auditErr) {
        console.error("[updateExternalAnswer] Audit log failed:", auditErr);
        // Non-fatal: continue even if audit logging fails
      }

      revalidatePath("/vendors");
      revalidateTag(RISK_POSTURE_CACHE_TAG);
      return { ok: true, answer: created };
    }
  } catch (err) {
    console.error("Answer update error:", err);
    return { ok: false, error: "Failed to save answer." };
  }
}
