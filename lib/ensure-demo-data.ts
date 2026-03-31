import { AssessmentStatus, RiskLevel, type Prisma } from "@prisma/client";
import { nis2Questions } from "@/lib/nis2-questions";
import { prisma } from "@/lib/prisma";

export const DEFAULT_COMPANY_SLUG = "default";
export const DEMO_DATA_ACTOR = "system-demo";

const DEMO_DATA_LOCK_KEY = 417652001;
const DEMO_COMPANY_NAME = "Demo Enterprise (EU)";

type DemoVendor = {
  name: string;
  email: string;
  serviceType: string;
  status: AssessmentStatus;
  riskLevel: RiskLevel;
  complianceScore: number;
  lastAssessmentDate: Date | null;
  vendorCreatedAt: Date;
  assessmentUpdatedAt: Date;
};

const demoVendors: DemoVendor[] = [
  {
    name: "Northwind Analytics",
    email: "security@northwind.example",
    serviceType: "SaaS / Data Analytics",
    status: AssessmentStatus.COMPLETED,
    riskLevel: RiskLevel.LOW,
    complianceScore: 82,
    lastAssessmentDate: new Date("2026-01-14T12:00:00.000Z"),
    vendorCreatedAt: new Date("2025-04-10T08:00:00.000Z"),
    assessmentUpdatedAt: new Date("2026-01-14T12:00:00.000Z"),
  },
  {
    name: "Contoso Cloud IAM",
    email: "trust@contoso.example",
    serviceType: "Identity & Access",
    status: AssessmentStatus.IN_REVIEW,
    riskLevel: RiskLevel.MEDIUM,
    complianceScore: 58,
    lastAssessmentDate: new Date("2026-02-02T12:00:00.000Z"),
    vendorCreatedAt: new Date("2025-05-01T08:00:00.000Z"),
    assessmentUpdatedAt: new Date("2026-02-02T12:00:00.000Z"),
  },
  {
    name: "Fabrikam Payments",
    email: "pci@fabrikam.example",
    serviceType: "Payment Processing",
    status: AssessmentStatus.PENDING,
    riskLevel: RiskLevel.HIGH,
    complianceScore: 34,
    lastAssessmentDate: null,
    vendorCreatedAt: new Date("2025-11-20T09:00:00.000Z"),
    assessmentUpdatedAt: new Date("2025-11-20T09:00:00.000Z"),
  },
];

async function ensureQuestionCatalogue(tx: Prisma.TransactionClient) {
  for (const [index, question] of nis2Questions.entries()) {
    await tx.question.upsert({
      where: { id: question.id },
      update: {
        category: question.category,
        text: question.text,
        guidance: question.guidance ?? null,
        sortOrder: index,
        createdBy: DEMO_DATA_ACTOR,
      },
      create: {
        id: question.id,
        category: question.category,
        text: question.text,
        guidance: question.guidance ?? null,
        sortOrder: index,
        createdBy: DEMO_DATA_ACTOR,
      },
    });
  }
}

export async function ensureDemoData(): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DEMO_DATA_LOCK_KEY})`;

    const company = await tx.company.upsert({
      where: { slug: DEFAULT_COMPANY_SLUG },
      update: {},
      create: {
        name: DEMO_COMPANY_NAME,
        slug: DEFAULT_COMPANY_SLUG,
        createdBy: DEMO_DATA_ACTOR,
      },
      select: { id: true },
    });

    await ensureQuestionCatalogue(tx);

    const vendorCount = await tx.vendor.count();
    if (vendorCount > 0) {
      return company.id;
    }

    for (const demoVendor of demoVendors) {
      const vendor = await tx.vendor.create({
        data: {
          companyId: company.id,
          name: demoVendor.name,
          email: demoVendor.email,
          serviceType: demoVendor.serviceType,
          createdBy: DEMO_DATA_ACTOR,
          createdAt: demoVendor.vendorCreatedAt,
          updatedAt: demoVendor.assessmentUpdatedAt,
        },
        select: { id: true },
      });

      await tx.assessment.create({
        data: {
          companyId: company.id,
          vendorId: vendor.id,
          status: demoVendor.status,
          riskLevel: demoVendor.riskLevel,
          complianceScore: demoVendor.complianceScore,
          lastAssessmentDate: demoVendor.lastAssessmentDate,
          createdBy: DEMO_DATA_ACTOR,
          createdAt: demoVendor.vendorCreatedAt,
          updatedAt: demoVendor.assessmentUpdatedAt,
        },
      });
    }

    return company.id;
  });
}