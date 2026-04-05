"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import { AuditLogger } from "@/lib/structured-logger";

const ROOT_STORAGE_DIR = path.join(process.cwd(), ".avra-storage");
const QUESTION_EVIDENCE_DIR = path.join(ROOT_STORAGE_DIR, "question-evidence");
const EXPIRY_GRACE_PERIOD_MS = 2 * 60 * 1000;

function resolveDeadline(vendor: {
  inviteTokenExpires?: Date | null;
  codeExpiresAt?: Date | null;
}): Date | null {
  const candidates = [vendor.inviteTokenExpires, vendor.codeExpiresAt]
    .filter((value): value is Date => Boolean(value))
    .map((value) => value.getTime());
  if (!candidates.length) return null;
  return new Date(Math.min(...candidates));
}

function isExpiredUtcWithGrace(deadline: Date): boolean {
  return Date.now() > deadline.getTime() + EXPIRY_GRACE_PERIOD_MS;
}

function normalizeOptional(value?: string | null): string | null {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

async function getExternalVendorByToken(token: string) {
  if (!token || !token.trim()) return null;

  const vendor = await prisma.vendor.findFirst({
    where: {
      inviteToken: token,
      isCodeActive: true,
    },
    include: {
      assessment: true,
    },
  });

  if (!vendor) return null;
  const deadline = resolveDeadline(vendor);
  if (!deadline) return null;
  if (isExpiredUtcWithGrace(deadline)) return null;
  return vendor;
}

export async function updateExternalVendorProfileByToken(input: {
  token: string;
  officialName?: string;
  registrationId?: string;
  vendorServiceType?: string;
  headquartersLocation?: string;
  securityOfficerName?: string;
  securityOfficerEmail?: string;
  dpoName?: string;
  dpoEmail?: string;
}) {
  const vendor = await getExternalVendorByToken(input.token);
  if (!vendor) {
    return { ok: false, error: "Invalid or expired assessment link." };
  }

  try {
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        officialName: normalizeOptional(input.officialName),
        registrationId: normalizeOptional(input.registrationId),
        vendorServiceType: normalizeOptional(input.vendorServiceType),
        headquartersLocation: normalizeOptional(input.headquartersLocation),
        securityOfficerName: normalizeOptional(input.securityOfficerName),
        securityOfficerEmail: normalizeOptional(input.securityOfficerEmail),
        dpoName: normalizeOptional(input.dpoName),
        dpoEmail: normalizeOptional(input.dpoEmail),
      },
    });

    await logAuditEvent({
      companyId: vendor.companyId,
      userId: "external-vendor",
      action: "EXTERNAL_ASSESSMENT_UPDATED",
      entityType: "Vendor",
      entityId: vendor.id,
      newValue: { context: "profile_update" },
    });

    AuditLogger.dataOp("external.vendor_profile.updated", "success", {
      entityType: "Vendor",
      entityId: vendor.id,
      message: "External vendor profile updated",
    });

    revalidatePath(`/external/assessment/${input.token}`);
    revalidatePath("/vendors");

    return { ok: true };
  } catch (err) {
    AuditLogger.dataOp("external.vendor_profile.updated", "failure", {
      entityType: "Vendor",
      entityId: vendor.id,
      error: err instanceof Error ? err : new Error(String(err)),
      message: "External profile update failed",
    });
    return { ok: false, error: "Failed to update profile." };
  }
}

export async function deleteExternalAssessmentDocument(token: string) {
  const vendor = await getExternalVendorByToken(token);
  if (!vendor || !vendor.assessment) {
    return { ok: false, error: "Invalid or expired assessment link." };
  }

  const assessment = vendor.assessment;

  try {
    if (assessment.documentFilename) {
      const safeName = assessment.documentFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storedName = `${assessment.id}__${safeName}`;
      const filePath = path.join(ROOT_STORAGE_DIR, storedName);
      const resolved = path.resolve(filePath);
      if (resolved.startsWith(path.resolve(ROOT_STORAGE_DIR))) {
        await fs.unlink(resolved).catch(() => undefined);
      }
    }

    await prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        documentFilename: null,
        documentUrl: null,
      },
    });

    await logAuditEvent({
      companyId: vendor.companyId,
      userId: "external-vendor",
      action: "EXTERNAL_ASSESSMENT_UPDATED",
      entityType: "Assessment",
      entityId: assessment.id,
      newValue: { context: "document_deleted" },
    });

    AuditLogger.dataOp("external.assessment_document.deleted", "success", {
      entityType: "Assessment",
      entityId: assessment.id,
      message: "External assessment document deleted",
    });

    revalidatePath(`/external/assessment/${token}`);
    revalidatePath("/vendors");

    return { ok: true };
  } catch (err) {
    AuditLogger.dataOp("external.assessment_document.deleted", "failure", {
      entityType: "Assessment",
      error: err instanceof Error ? err : new Error(String(err)),
      message: "External document delete failed",
    });
    return { ok: false, error: "Failed to delete evidence document." };
  }
}

export async function deleteExternalAnswerEvidence(input: { token: string; answerId: string }) {
  const vendor = await getExternalVendorByToken(input.token);
  if (!vendor || !vendor.assessment) {
    return { ok: false, error: "Invalid or expired assessment link." };
  }

  try {
    const answer = await prisma.assessmentAnswer.findFirst({
      where: {
        id: input.answerId,
        assessmentId: vendor.assessment.id,
      },
      select: {
        id: true,
        evidenceFileUrl: true,
        documentId: true,
        document: {
          select: {
            id: true,
            storagePath: true,
          },
        },
      },
    });

    if (!answer) {
      return { ok: false, error: "Evidence entry not found." };
    }

    if (answer.evidenceFileUrl) {
      const filePath = path.join(QUESTION_EVIDENCE_DIR, answer.evidenceFileUrl);
      const resolved = path.resolve(filePath);
      if (resolved.startsWith(path.resolve(QUESTION_EVIDENCE_DIR))) {
        await fs.unlink(resolved).catch(() => undefined);
      }
    }

    if (answer.document?.storagePath) {
      const filePath = path.join(ROOT_STORAGE_DIR, answer.document.storagePath);
      const resolved = path.resolve(filePath);
      if (resolved.startsWith(path.resolve(ROOT_STORAGE_DIR))) {
        await fs.unlink(resolved).catch(() => undefined);
      }
    }

    const updated = await prisma.assessmentAnswer.update({
      where: { id: answer.id },
      data: {
        evidenceFileUrl: null,
        evidenceFileName: null,
        documentId: null,
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

    if (answer.documentId) {
      await prisma.document.delete({ where: { id: answer.documentId } }).catch(() => undefined);
    }

    await logAuditEvent({
      companyId: vendor.companyId,
      userId: "external-vendor",
      action: "EXTERNAL_ASSESSMENT_UPDATED",
      entityType: "AssessmentAnswer",
      entityId: answer.id,
      newValue: { context: "evidence_deleted" },
    });

    AuditLogger.dataOp("external.answer_evidence.deleted", "success", {
      entityType: "AssessmentAnswer",
      entityId: answer.id,
      message: "External answer evidence deleted",
    });

    revalidatePath(`/external/assessment/${input.token}`);
    revalidatePath("/vendors");

    return { ok: true, answer: updated };
  } catch (err) {
    AuditLogger.dataOp("external.answer_evidence.deleted", "failure", {
      entityType: "AssessmentAnswer",
      error: err instanceof Error ? err : new Error(String(err)),
      message: "External answer evidence delete failed",
    });
    return { ok: false, error: "Failed to delete answer evidence." };
  }
}
