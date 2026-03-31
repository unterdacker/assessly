import { prisma } from "@/lib/prisma";
import { toVendorAssessment } from "@/lib/prisma-mappers";
import type { VendorAssessment } from "@/lib/vendor-assessment";
import type { AssessmentAnswer } from "@prisma/client";
import { syncAssessmentComplianceToDatabase } from "@/lib/assessment-compliance";
import { DEFAULT_COMPANY_SLUG, ensureDemoData } from "@/lib/ensure-demo-data";
import { requireInternalReadUser } from "@/lib/auth/server";

async function cleanupExpiredVendorCodes(where?: { companyId?: string; vendorId?: string }) {
  const now = new Date();

  await prisma.$transaction([
    (prisma.vendor as any).updateMany({
      where: {
        isCodeActive: true,
        codeExpiresAt: { lt: now },
        isFirstLogin: true,
        ...(where?.companyId ? { companyId: where.companyId } : {}),
        ...(where?.vendorId ? { id: where.vendorId } : {}),
      },
      data: {
        accessCode: null,
        codeExpiresAt: null,
        isCodeActive: false,
        inviteSentAt: null,
        passwordHash: null,
      },
    }),
    (prisma.vendor as any).updateMany({
      where: {
        isCodeActive: true,
        codeExpiresAt: { lt: now },
        isFirstLogin: false,
        ...(where?.companyId ? { companyId: where.companyId } : {}),
        ...(where?.vendorId ? { id: where.vendorId } : {}),
      },
      data: {
        accessCode: null,
        codeExpiresAt: null,
        isCodeActive: false,
      },
    }),
    (prisma.vendor as any).updateMany({
      where: {
        isCodeActive: false,
        isFirstLogin: true,
        inviteSentAt: { not: null },
        ...(where?.companyId ? { companyId: where.companyId } : {}),
        ...(where?.vendorId ? { id: where.vendorId } : {}),
      },
      data: {
        inviteSentAt: null,
        passwordHash: null,
      },
    }),
  ]);
}

export async function getDefaultCompanyId(): Promise<string | null> {
  return ensureDemoData();
}

export async function listVendorAssessments(): Promise<VendorAssessment[]> {
  const session = await requireInternalReadUser();
  const companyId = session.companyId;
  if (!companyId) return [];

  await cleanupExpiredVendorCodes({ companyId });

  const totalQuestions = await prisma.question.count();

  const rows = await prisma.assessment.findMany({
    where: { companyId },
    include: {
      vendor: true,
      answers: { select: { status: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return Promise.all(
    rows.map(async (r) => {
      const { score, riskLevel } = await syncAssessmentComplianceToDatabase(
        r.id,
        r.answers,
        totalQuestions,
        r.complianceScore,
        r.riskLevel,
        r.createdBy,
      );
      const filledCount = r.answers.filter(
        (a) => a.status === "COMPLIANT" || a.status === "NON_COMPLIANT"
      ).length;

      const { vendor, answers, ...assessmentFields } = r;
      return toVendorAssessment(
        vendor,
        { ...assessmentFields, complianceScore: score, riskLevel },
        filledCount,
        totalQuestions,
      );
    }),
  );
}

export type VendorAssessmentDetail = {
  vendorAssessment: VendorAssessment;
  assessmentId: string;
  companyId: string;
  answers: AssessmentAnswer[];
  documentUrl: string | null;
  documentFilename: string | null;
  documentFileSize: number | null;
  lastAuditedAt: string | null;
};

/** Loads vendor assessment, reconciles strict score/risk to DB, returns full detail for workspace. */
export async function getVendorAssessmentDetail(
  vendorId: string,
): Promise<VendorAssessmentDetail | null> {
  const session = await requireInternalReadUser();
  if (!session.companyId) {
    return null;
  }

  await cleanupExpiredVendorCodes({ vendorId });

  const totalQuestions = await prisma.question.count();

  const row = await prisma.assessment.findFirst({
    where: { vendorId, companyId: session.companyId },
    include: {
      vendor: true,
      answers: {
        include: {
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
      },
      documents: {
        select: { fileSize: true, uploadedAt: true },
        orderBy: { uploadedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!row) return null;

  const { score, riskLevel } = await syncAssessmentComplianceToDatabase(
    row.id,
    row.answers,
    totalQuestions,
    row.complianceScore,
    row.riskLevel,
    row.createdBy,
  );

  const { vendor, answers, documents, ...assessmentFields } = row;
  const latestDocument = documents[0] ?? null;

  const filledCount = answers.filter(
    (a: any) => a.status === "COMPLIANT" || a.status === "NON_COMPLIANT"
  ).length;

  const vendorAssessment = toVendorAssessment(
    vendor,
    { ...assessmentFields, complianceScore: score, riskLevel },
    filledCount,
    totalQuestions,
  );

  return {
    vendorAssessment,
    assessmentId: row.id,
    companyId: row.companyId,
    answers,
    documentUrl: row.documentUrl ?? null,
    documentFilename: row.documentFilename ?? null,
    documentFileSize: latestDocument?.fileSize ?? null,
    lastAuditedAt: row.updatedAt.toISOString(),
  };
}

export async function getVendorAssessmentByVendorId(
  vendorId: string,
): Promise<VendorAssessment | null> {
  const detail = await getVendorAssessmentDetail(vendorId);
  return detail?.vendorAssessment ?? null;
}
