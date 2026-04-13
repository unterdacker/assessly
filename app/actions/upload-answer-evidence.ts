"use server";

import path from "path";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";
import { putLocalFile } from "@/lib/storage";

const MAX_EVIDENCE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

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
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await putLocalFile(`question-evidence/${storageKey}`, buffer);

  const doc = await prisma.document.create({
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
  const session = await requireAdminUser().catch((error) => {
    if (isAccessControlError(error)) {
      return null;
    }
    throw error;
  });
  if (!session) {
    return { ok: false, error: "Unauthorized." };
  }

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

    if (!assessment || assessment.companyId !== session.companyId) {
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
          createdBy: session.userId,
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

    const persisted = await persistEvidenceDocument(assessmentId, file, session.userId);

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
          userId: session.userId,
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
    if (isAccessControlError(err)) {
      return { ok: false, error: "Unauthorized." };
    }
    console.error("Internal answer evidence upload failed:", err);
    return { ok: false, error: "Failed to upload evidence." };
  }
}
