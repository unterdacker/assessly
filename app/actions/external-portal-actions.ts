"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

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

  return (prisma.vendor as any).findFirst({
    where: {
      inviteToken: token,
      isCodeActive: true,
    },
    include: {
      assessment: true,
    },
  }).then((vendor: any) => {
    if (!vendor) return null;
    const deadline = resolveDeadline(vendor);
    if (!deadline) return null;
    if (isExpiredUtcWithGrace(deadline)) return null;
    return vendor;
  });
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

    await prisma.auditLog.create({
      data: {
        companyId: vendor.companyId,
        action: "external.vendor_profile.updated",
        entityType: "vendor",
        entityId: vendor.id,
        actorId: "external-vendor",
        createdBy: "external-vendor",
      },
    });

    revalidatePath(`/external/assessment/${input.token}`);
    revalidatePath("/vendors");

    return { ok: true };
  } catch (err) {
    console.error("External profile update failed:", err);
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

    await prisma.auditLog.create({
      data: {
        companyId: vendor.companyId,
        action: "external.assessment_document.deleted",
        entityType: "vendor_assessment",
        entityId: assessment.id,
        actorId: "external-vendor",
        createdBy: "external-vendor",
      },
    });

    revalidatePath(`/external/assessment/${token}`);
    revalidatePath("/vendors");

    return { ok: true };
  } catch (err) {
    console.error("External document delete failed:", err);
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
      await (prisma as any).document.delete({ where: { id: answer.documentId } }).catch(() => undefined);
    }

    await prisma.auditLog.create({
      data: {
        companyId: vendor.companyId,
        action: "external.answer_evidence.deleted",
        entityType: "assessment_answer",
        entityId: answer.id,
        actorId: "external-vendor",
        createdBy: "external-vendor",
      },
    });

    revalidatePath(`/external/assessment/${input.token}`);
    revalidatePath("/vendors");

    return { ok: true, answer: updated };
  } catch (err) {
    console.error("External answer evidence delete failed:", err);
    return { ok: false, error: "Failed to delete answer evidence." };
  }
}
