import { prisma } from "@/lib/prisma";
import { toVendorAssessment, VendorDomainMapper } from "@/lib/prisma-mappers";
import type { VendorAssessment } from "@/lib/vendor-assessment";
import type { AssessmentAnswer } from "@prisma/client";
import { syncAssessmentComplianceToDatabase } from "@/lib/assessment-compliance";
import { ensureDemoData } from "@/lib/ensure-demo-data";
import { requireInternalReadUser } from "@/lib/auth/server";
import { countVendorAssessmentQuestions } from "@/lib/queries/custom-questions";

/**
 * Explicit vendor column selection — omits sensitive fields that must never
 * leave the database in a list or detail context:
 *   - passwordHash  : bcrypt digest  — login-flow only
 *   - inviteToken   : single-use URL token  — secret value
 *   - vendorServiceTypeCustom : internal classification scratch-pad, not displayed
 * Note: inviteTokenExpires (the expiry date, not the token) is intentionally
 * included so the UI can show the "Resend Invite" affordance.
 */
const VENDOR_SELECT = {
  id: true,
  companyId: true,
  name: true,
  email: true,
  serviceType: true,
  officialName: true,
  registrationId: true,
  vendorServiceType: true,
  securityOfficerName: true,
  securityOfficerEmail: true,
  dpoName: true,
  dpoEmail: true,
  headquartersLocation: true,
  sizeClassification: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  accessCode: true,
  codeExpiresAt: true,
  isCodeActive: true,
  isFirstLogin: true,
  inviteSentAt: true,
  inviteTokenExpires: true,
} as const;

async function cleanupExpiredVendorCodes(where?: { companyId?: string; vendorId?: string }) {
  const now = new Date();

  await prisma.$transaction([
    prisma.vendor.updateMany({
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
    prisma.vendor.updateMany({
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
    prisma.vendor.updateMany({
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

  const totalQuestions = await countVendorAssessmentQuestions(companyId);

  const rows = await prisma.assessment.findMany({
    where: { companyId },
    select: {
      id: true,
      companyId: true,
      vendorId: true,
      status: true,
      riskLevel: true,
      complianceScore: true,
      lastAssessmentDate: true,
      documentFilename: true,
      documentUrl: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      vendor: { select: VENDOR_SELECT },
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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { vendor, answers: _answers, ...assessmentFields } = r;
      return toVendorAssessment(
        vendor as unknown as VendorDomainMapper,
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

  const totalQuestions = await countVendorAssessmentQuestions(session.companyId ?? "");

  const row = await prisma.assessment.findFirst({
    where: { vendorId, companyId: session.companyId },
    include: {
      vendor: { select: VENDOR_SELECT },
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
    (a: { status: string }) => a.status === "COMPLIANT" || a.status === "NON_COMPLIANT"
  ).length;

  const vendorAssessment = toVendorAssessment(
    vendor as unknown as VendorDomainMapper,
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

export const VENDORS_PAGE_SIZE = 25;

export type PaginatedVendorAssessments = {
  items: VendorAssessment[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * Paginated variant of listVendorAssessments for the Vendors table view.
 * Uses take/skip to prevent loading thousands of rows at once.
 */
export async function listVendorAssessmentsPaginated(
  page = 1,
  pageSize = VENDORS_PAGE_SIZE,
): Promise<PaginatedVendorAssessments> {
  const session = await requireInternalReadUser();
  const companyId = session.companyId;
  if (!companyId) {
    return { items: [], total: 0, page, pageSize, pageCount: 0 };
  }

  await cleanupExpiredVendorCodes({ companyId });

  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * pageSize;

  const [totalQuestions, total, rows] = await Promise.all([
    countVendorAssessmentQuestions(companyId),
    prisma.assessment.count({ where: { companyId } }),
    prisma.assessment.findMany({
      where: { companyId },
      select: {
        id: true,
        companyId: true,
        vendorId: true,
        status: true,
        riskLevel: true,
        complianceScore: true,
        lastAssessmentDate: true,
        documentFilename: true,
        documentUrl: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
        vendor: { select: VENDOR_SELECT },
        answers: { select: { status: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: pageSize,
      skip,
    }),
  ]);

  const items = await Promise.all(
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
        (a) => a.status === "COMPLIANT" || a.status === "NON_COMPLIANT",
      ).length;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { vendor, answers: _answers, ...assessmentFields } = r;
      return toVendorAssessment(
        vendor as unknown as VendorDomainMapper,
        { ...assessmentFields, complianceScore: score, riskLevel },
        filledCount,
        totalQuestions,
      );
    }),
  );

  return {
    items,
    total,
    page: safePage,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}
