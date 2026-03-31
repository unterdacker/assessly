"use server";

import path from "path";
import fs from "fs/promises";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/queries/vendor-assessments";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";

const ROOT_STORAGE_DIR = path.join(process.cwd(), ".avra-storage");

export async function removeAssessmentDocument(assessmentId: string) {
  const session = await requireAdminUser().catch((error) => {
    if (isAccessControlError(error)) {
      return null;
    }
    throw error;
  });
  if (!session) {
    return { ok: false, error: "Unauthorized." };
  }

  const companyId = session.companyId ?? (await getDefaultCompanyId());
  if (!companyId) {
    return { ok: false, error: "Company context not found." };
  }

  // Load assessment, verifying it belongs to this company
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, vendor: { companyId } },
    select: {
      id: true,
      documentFilename: true,
      documentUrl: true,
      vendorId: true,
    },
  });

  if (!assessment) {
    return { ok: false, error: "Assessment not found." };
  }

  try {
    // Delete the file from disk using the same naming convention as the upload action
    if (assessment.documentFilename) {
      const safeName = assessment.documentFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storedName = `${assessment.id}__${safeName}`;
      const filePath = path.join(ROOT_STORAGE_DIR, storedName);
      const resolved = path.resolve(filePath);
      if (resolved.startsWith(path.resolve(ROOT_STORAGE_DIR))) {
        await fs.unlink(resolved).catch(() => undefined);
      }
    }

    // Clear document fields on the assessment record
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        documentFilename: null,
        documentUrl: null,
      },
    });

    // Write audit log entry
    await prisma.auditLog.create({
      data: {
        companyId,
        action: "DOCUMENT_REMOVED",
        entityType: "assessment",
        entityId: assessment.id,
        actorId: session.userId,
        createdBy: session.userId,
        newValue: { documentFilename: null, documentUrl: null },
        previousValue: {
          documentFilename: assessment.documentFilename,
          documentUrl: assessment.documentUrl,
        },
      },
    });

    revalidatePath("/vendors");
    revalidatePath(`/[locale]/vendors/${assessment.vendorId}`, "page");

    return { ok: true };
  } catch (err) {
    console.error("removeAssessmentDocument failed:", err);
    return { ok: false, error: "Failed to remove document." };
  }
}
