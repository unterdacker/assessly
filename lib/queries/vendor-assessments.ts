import { prisma } from "@/lib/prisma";
import { toVendorAssessment } from "@/lib/prisma-mappers";
import type { VendorAssessment } from "@/lib/vendor-assessment";
import type { AssessmentAnswer } from "@prisma/client";
import { syncAssessmentComplianceToDatabase } from "@/lib/assessment-compliance";

export const DEFAULT_COMPANY_SLUG = "default";

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
  const row = await prisma.company.findUnique({
    where: { slug: DEFAULT_COMPANY_SLUG },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function listVendorAssessments(): Promise<VendorAssessment[]> {
  const companyId = await getDefaultCompanyId();
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
};

/** Loads vendor assessment, reconciles strict score/risk to DB, returns full detail for workspace. */
export async function getVendorAssessmentDetail(
  vendorId: string,
): Promise<VendorAssessmentDetail | null> {
  await cleanupExpiredVendorCodes({ vendorId });

  const totalQuestions = await prisma.question.count();

  const row = await prisma.assessment.findFirst({
    where: { vendorId },
    include: { vendor: true, answers: true },
  });

  if (!row) return null;

  const { score, riskLevel } = await syncAssessmentComplianceToDatabase(
    row.id,
    row.answers,
    totalQuestions,
    row.complianceScore,
    row.riskLevel,
  );

  const { vendor, answers, ...assessmentFields } = row;

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
  };
}

export async function getVendorAssessmentByVendorId(
  vendorId: string,
): Promise<VendorAssessment | null> {
  const detail = await getVendorAssessmentDetail(vendorId);
  return detail?.vendorAssessment ?? null;
}
