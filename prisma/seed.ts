import bcrypt from "bcryptjs";
import { PrismaClient, AssessmentStatus, RiskLevel, UserRole } from "@prisma/client";
import { nis2Questions } from "../lib/nis2-questions";

const prisma = new PrismaClient();

const SEED_ACTOR = "system-seed";
const COMPANY_SLUG = "default";
const DEFAULT_ADMIN_EMAIL = process.env.AVRA_ADMIN_EMAIL || "admin@avra.local";
const DEFAULT_ADMIN_PASSWORD = process.env.AVRA_ADMIN_PASSWORD || "admin123";
const DEFAULT_AUDITOR_EMAIL = process.env.AVRA_AUDITOR_EMAIL || "auditor@avra.local";
const DEFAULT_AUDITOR_PASSWORD = process.env.AVRA_AUDITOR_PASSWORD || "auditor123";

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
    // LOW risk — completed assessment, high compliance score
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
    // MEDIUM risk — assessment in review, partial compliance
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
    // HIGH risk — assessment pending, low compliance score, no last assessment date
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

async function main() {
  await prisma.authSession.deleteMany();
  await prisma.user.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.question.deleteMany();
  await prisma.company.deleteMany();

  const company = await prisma.company.create({
    data: {
      name: "Demo Enterprise (EU)",
      slug: COMPANY_SLUG,
      createdBy: SEED_ACTOR,
    },
  });

  const [adminPasswordHash, auditorPasswordHash] = await Promise.all([
    bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12),
    bcrypt.hash(DEFAULT_AUDITOR_PASSWORD, 12),
  ]);

  await prisma.user.createMany({
    data: [
      {
        companyId: company.id,
        email: DEFAULT_ADMIN_EMAIL,
        displayName: "AVRA Admin",
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        createdBy: SEED_ACTOR,
      },
      {
        companyId: company.id,
        email: DEFAULT_AUDITOR_EMAIL,
        displayName: "AVRA Auditor",
        passwordHash: auditorPasswordHash,
        role: UserRole.AUDITOR,
        createdBy: SEED_ACTOR,
      },
    ],
  });

  for (let i = 0; i < nis2Questions.length; i++) {
    const q = nis2Questions[i];
    await prisma.question.upsert({
      where: { id: q.id },
      update: {
        category: q.category,
        text: q.text,
        guidance: q.guidance ?? null,
        sortOrder: i,
        createdBy: SEED_ACTOR,
      },
      create: {
        id: q.id,
        category: q.category,
        text: q.text,
        guidance: q.guidance ?? null,
        sortOrder: i,
        createdBy: SEED_ACTOR,
      },
    });
  }

  for (const d of demoVendors) {
    const vendor = await prisma.vendor.create({
      data: {
        companyId: company.id,
        name: d.name,
        email: d.email,
        serviceType: d.serviceType,
        createdBy: SEED_ACTOR,
        createdAt: d.vendorCreatedAt,
        updatedAt: d.assessmentUpdatedAt,
      },
    });

    await prisma.assessment.create({
      data: {
        companyId: company.id,
        vendorId: vendor.id,
        status: d.status,
        riskLevel: d.riskLevel,
        complianceScore: d.complianceScore,
        lastAssessmentDate: d.lastAssessmentDate,
        createdBy: SEED_ACTOR,
        createdAt: d.vendorCreatedAt,
        updatedAt: d.assessmentUpdatedAt,
      },
    });
  }
}

main()
  .then(() => {
    console.info(`Seeded company "${COMPANY_SLUG}", ${nis2Questions.length} questions, ${demoVendors.length} vendors.`);
    console.info(`Admin login: ${DEFAULT_ADMIN_EMAIL} / ${DEFAULT_ADMIN_PASSWORD}`);
    console.info(`Auditor login: ${DEFAULT_AUDITOR_EMAIL} / ${DEFAULT_AUDITOR_PASSWORD}`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
