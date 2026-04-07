"use server";

import path from "path";
import fs from "fs/promises";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/queries/vendor-assessments";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";
import { logAuditEvent } from "@/lib/audit-log";
import { AuditLogger } from "@/lib/structured-logger";

const ROOT_STORAGE_DIR = path.join(process.cwd(), ".assessly-storage");

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

    // Write audit log entry — hash-chained via centralized logAuditEvent
    await logAuditEvent(
      {
        companyId,
        userId: session.userId,
        action: "DOCUMENT_ANALYZED", // closest available action for document operations
        entityType: "Assessment",
        entityId: assessment.id,
        previousValue: {
          documentFilename: assessment.documentFilename,
          documentUrl: assessment.documentUrl,
        },
        newValue: { documentFilename: null, documentUrl: null },
      },
      { captureHeaders: true },
    );

    AuditLogger.dataOp("assessment.document_removed", "success", {
      userId: session.userId,
      entityType: "Assessment",
      entityId: assessment.id,
      message: "Assessment document removed",
    });

    revalidatePath("/vendors");
    revalidatePath(`/[locale]/vendors/${assessment.vendorId}`, "page");

    return { ok: true };
  } catch (err) {
    AuditLogger.dataOp("assessment.document_removed", "failure", {
      userId: session.userId,
      entityType: "Assessment",
      entityId: assessmentId,
      error: err instanceof Error ? err : new Error(String(err)),
      message: "Failed to remove assessment document",
    });
    return { ok: false, error: "Failed to remove document." };
  }
}
