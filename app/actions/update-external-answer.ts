"use server";

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import sanitizeHtml from "sanitize-html";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logAuditEvent } from "@/lib/audit-log";

const MAX_EVIDENCE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const EVIDENCE_STORAGE_DIR = path.join(process.cwd(), ".avra-storage", "question-evidence");

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
  const storagePath = path.join(EVIDENCE_STORAGE_DIR, storageKey);
  const resolvedStorageDir = path.resolve(EVIDENCE_STORAGE_DIR);
  const resolvedStoragePath = path.resolve(storagePath);

  if (!resolvedStoragePath.startsWith(resolvedStorageDir)) {
    throw new Error("Invalid storage path.");
  }

  await fs.mkdir(EVIDENCE_STORAGE_DIR, { recursive: true });
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(storagePath, buffer, { flag: "wx" });

  return { storageKey, displayName };
}

/**
 * Explicit save endpoint for one external vendor answer.
 * Enforces server-side sanitization and secure evidence upload controls.
 */
export async function updateExternalAnswer(formData: FormData) {
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

    if (maybeFile instanceof File && maybeFile.size > 0) {
      const persisted = await persistEvidenceFile(maybeFile);
      evidenceFileUrl = persisted.storageKey;
      evidenceFileName = persisted.displayName;
    }

    const existing = await prisma.assessmentAnswer.findFirst({
      where: { assessmentId, questionId }
    });

    if (existing) {
      const updated = await prisma.assessmentAnswer.update({
        where: { id: existing.id },
        data: { 
          status, 
          findings: justificationText,
          justificationText,
          ...(evidenceFileUrl
            ? {
                evidenceFileUrl,
                evidenceFileName,
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
        },
      });

      try {
        const previousValuePayload = {
          status: existing.status || null,
          justificationText: existing.justificationText || null,
          evidenceFileName: existing.evidenceFileName || null,
          evidenceFileUrl: existing.evidenceFileUrl || null,
          verified: existing.verified ?? false,
        };

        const newValuePayload = {
          status: updated.status || null,
          justificationText: updated.justificationText || null,
          evidenceFileName: updated.evidenceFileName || null,
          evidenceFileUrl: updated.evidenceFileUrl || null,
          verified: updated.verified ?? false,
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
      return { ok: true, answer: updated };
    } else {
      const created = await prisma.assessmentAnswer.create({
        data: {
          assessmentId,
          questionId,
          status,
          findings: justificationText,
          justificationText,
          evidenceFileUrl,
          evidenceFileName,
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
        },
      });

      try {
        const newValuePayload = {
          status: created.status || null,
          justificationText: created.justificationText || null,
          evidenceFileName: created.evidenceFileName || null,
          evidenceFileUrl: created.evidenceFileUrl || null,
          verified: created.verified ?? false,
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
      return { ok: true, answer: created };
    }
  } catch (err) {
    console.error("Answer update error:", err);
    return { ok: false, error: "Failed to save answer." };
  }
}
