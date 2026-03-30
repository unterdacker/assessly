"use server";

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";

const MAX_EVIDENCE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const EVIDENCE_STORAGE_DIR = path.join(process.cwd(), ".avra-storage", "question-evidence");

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

async function persistEvidenceDocument(
  assessmentId: string,
  file: File,
  uploadedBy: string,
) {
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

  const doc = await (prisma as any).document.create({
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
      storagePath: true,
    },
  });

  return { storageKey, displayName, doc };
}

export async function uploadInternalAnswerEvidence(formData: FormData) {
  const assessmentId = String(formData.get("assessmentId") || "").trim();
  const questionId = String(formData.get("questionId") || "").trim();
  const file = formData.get("evidenceFile");

  if (!assessmentId || !questionId) {
    return { ok: false, error: "Missing assessment or question identifier." };
  }

  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, error: "Please select an evidence file first." };
  }

  try {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, companyId: true, vendorId: true },
    });

    if (!assessment) {
      return { ok: false, error: "Assessment not found." };
    }

    let answer = await prisma.assessmentAnswer.findFirst({
      where: { assessmentId, questionId },
      select: {
        id: true,
        status: true,
        evidenceFileName: true,
        evidenceFileUrl: true,
        documentId: true,
      },
    });

    if (!answer) {
      answer = await prisma.assessmentAnswer.create({
        data: {
          assessmentId,
          questionId,
          status: "PENDING",
          verified: false,
          createdBy: "isb-user",
        },
        select: {
          id: true,
          status: true,
          evidenceFileName: true,
          evidenceFileUrl: true,
          documentId: true,
        },
      });
    }

    const persisted = await persistEvidenceDocument(assessmentId, file, "internal-auditor");

    const updated = await prisma.assessmentAnswer.update({
      where: { id: answer.id },
      data: {
        evidenceFileName: persisted.displayName,
        evidenceFileUrl: persisted.storageKey,
        documentId: persisted.doc.id,
      },
      select: {
        id: true,
        questionId: true,
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
      await logAuditEvent(
        {
          companyId: assessment.companyId,
          userId: "isb-user",
          action: "ASSESSMENT_EVIDENCE_UPLOADED",
          entityType: "assessment_answer",
          entityId: updated.id,
          previousValue: {
            evidenceFileName: answer.evidenceFileName || null,
            evidenceFileUrl: answer.evidenceFileUrl || null,
            documentId: answer.documentId || null,
          },
          newValue: {
            evidenceFileName: updated.evidenceFileName || null,
            evidenceFileUrl: updated.evidenceFileUrl || null,
            documentId: updated.document?.id || null,
            uploadedBy: updated.document?.uploadedBy || null,
          },
        },
        { captureHeaders: false },
      );
    } catch (auditErr) {
      console.error("[uploadInternalAnswerEvidence] Audit log failed:", auditErr);
    }

    revalidatePath("/vendors");
    revalidatePath(`/vendors/${assessment.vendorId}/assessment`);

    return { ok: true, answer: updated };
  } catch (err) {
    console.error("Internal answer evidence upload failed:", err);
    return { ok: false, error: "Failed to upload evidence." };
  }
}
