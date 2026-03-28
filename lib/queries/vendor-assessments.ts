import { prisma } from "@/lib/prisma";
import { toVendorAssessment } from "@/lib/prisma-mappers";
import type { VendorAssessment } from "@/lib/vendor-assessment";

export const DEFAULT_COMPANY_SLUG = "default";

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

  const totalQuestions = await prisma.question.count();

  const rows = await prisma.assessment.findMany({
    where: { companyId },
    include: { vendor: true, _count: { select: { answers: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((r) => toVendorAssessment(r.vendor, r, r._count?.answers || 0, totalQuestions));
}

export async function getVendorAssessmentByVendorId(
  vendorId: string,
): Promise<VendorAssessment | null> {
  const totalQuestions = await prisma.question.count();
  const row = await prisma.assessment.findFirst({
    where: { vendorId },
    include: { vendor: true, _count: { select: { answers: true } } },
  });
  if (!row) return null;
  return toVendorAssessment(row.vendor, row, row._count?.answers || 0, totalQuestions);
}
