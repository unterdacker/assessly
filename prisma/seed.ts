import bcrypt from "bcryptjs";
import { Prisma, PrismaClient, AssessmentStatus, RiskLevel, UserRole, CompanyPlan, ExecReportStatus } from "@prisma/client";
import { nis2Questions } from "../lib/nis2-questions";
import crypto from "crypto";

const prisma = new PrismaClient();

async function tryDeleteMany(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") return;
    throw e;
  }
}

const SEED_ACTOR = "system-seed";
const COMPANY_SLUG = "default";
const DEFAULT_ADMIN_EMAIL = process.env.VENSHIELD_ADMIN_EMAIL || "admin@venshield.local";
const DEFAULT_ADMIN_PASSWORD = process.env.VENSHIELD_ADMIN_PASSWORD || "admin123";
const DEFAULT_AUDITOR_EMAIL = process.env.VENSHIELD_AUDITOR_EMAIL || "auditor@venshield.local";
const DEFAULT_AUDITOR_PASSWORD = process.env.VENSHIELD_AUDITOR_PASSWORD || "auditor123";
const E2E_MFA_USER_EMAIL = process.env.E2E_MFA_USER_EMAIL ?? "mfa-user@venshield.local";
const E2E_MFA_USER_PASSWORD = process.env.E2E_MFA_USER_PASSWORD ?? "MfaUser1234!";
const E2E_MFA_ENFORCED_EMAIL = process.env.E2E_MFA_ENFORCED_EMAIL ?? "mfa-enforced@venshield.local";
const E2E_MFA_ENFORCED_PASSWORD = process.env.E2E_MFA_ENFORCED_PASSWORD ?? "Enforced1234!";
// Test-fixture TOTP secret - publicly known otplib example value, NEVER use in production.
const E2E_MFA_TOTP_SECRET = process.env.E2E_MFA_TOTP_SECRET ?? "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
// First recovery code - known plaintext used by E2E scenarios 2+3.
const E2E_MFA_RECOVERY_CODE_1 = process.env.E2E_MFA_RECOVERY_CODE ?? "AABBCCDD-11223344-55667788-99AABBCC";

/**
 * AES-256-GCM encryption for MFA secrets in seed data.
 * Mirrors lib/mfa.ts encryptMfaSecret without the server-only import.
 * Format: <iv_hex>:<tag_hex>:<ciphertext_hex>
 * Requires MFA_ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 */
function encryptMfaSecretForSeed(plaintext: string): string {
  const keyHex = process.env.MFA_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      "MFA_ENCRYPTION_KEY must be set when seeding MFA-enabled users. " +
        "Set it to the same value used by the application server.",
    );
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("MFA_ENCRYPTION_KEY must be a 64-char hex string (32 bytes).");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

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
    status: AssessmentStatus.UNDER_REVIEW,
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
  await tryDeleteMany(() => prisma.execReport.deleteMany());
  await tryDeleteMany(() => prisma.authSession.deleteMany());
  await tryDeleteMany(() => prisma.user.deleteMany());
  await tryDeleteMany(() => prisma.auditLog.deleteMany());
  await tryDeleteMany(() => prisma.assessment.deleteMany());
  await tryDeleteMany(() => prisma.vendor.deleteMany());
  await tryDeleteMany(() => prisma.question.deleteMany());
  await tryDeleteMany(() => prisma.company.deleteMany());

  const company = await prisma.company.create({
    data: {
      name: "Demo Enterprise (EU)",
      slug: COMPANY_SLUG,
      plan: CompanyPlan.PREMIUM,
      aiDisabled: true,
      createdBy: SEED_ACTOR,
    },
  });

  const [adminPasswordHash, auditorPasswordHash] = await Promise.all([
    bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12),
    bcrypt.hash(DEFAULT_AUDITOR_PASSWORD, 12),
  ]);

  const [mfaUserPasswordHash, enforcedUserPasswordHash] = await Promise.all([
    bcrypt.hash(E2E_MFA_USER_PASSWORD, 12),
    bcrypt.hash(E2E_MFA_ENFORCED_PASSWORD, 12),
  ]);

  // Hash 10 recovery codes: first is the known E2E test code, remaining 9 are random.
  // Cost 10 matches the production RECOVERY_CODE_HASH_COST used in lib/mfa.ts.
  const recoveryCodePlaintexts = [
    E2E_MFA_RECOVERY_CODE_1,
    ...Array.from({ length: 9 }, () => {
      const hex = crypto.randomBytes(16).toString("hex").toUpperCase();
      return `${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24, 32)}`;
    }),
  ];
  const mfaRecoveryCodes = await Promise.all(
    recoveryCodePlaintexts.map((c) => bcrypt.hash(c, 10)),
  );

  const encryptedMfaSecret = encryptMfaSecretForSeed(E2E_MFA_TOTP_SECRET);

  await prisma.user.createMany({
    data: [
      {
        companyId: company.id,
        email: DEFAULT_ADMIN_EMAIL,
        displayName: "Venshield Admin",
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        createdBy: SEED_ACTOR,
      },
      {
        companyId: company.id,
        email: DEFAULT_AUDITOR_EMAIL,
        displayName: "Venshield Auditor",
        passwordHash: auditorPasswordHash,
        role: UserRole.AUDITOR,
        createdBy: SEED_ACTOR,
      },
      {
        companyId: company.id,
        email: E2E_MFA_USER_EMAIL,
        displayName: "MFA Test User (Admin)",
        passwordHash: mfaUserPasswordHash,
        role: UserRole.ADMIN,
        mfaEnabled: true,
        mfaSecret: encryptedMfaSecret,
        mfaRecoveryCodes: mfaRecoveryCodes,
        createdBy: SEED_ACTOR,
      },
      {
        companyId: company.id,
        email: E2E_MFA_ENFORCED_EMAIL,
        displayName: "MFA Enforced User (Auditor)",
        passwordHash: enforcedUserPasswordHash,
        role: UserRole.AUDITOR,
        mfaEnabled: false,
        mfaEnforced: true,
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

  // Seed a genesis ExecReport for the advanced-reporting E2E tests.
  // Links to the first COMPLETED assessment (Northwind Analytics, score 82%).
  const completedAssessment = await prisma.assessment.findFirstOrThrow({
    // Find Northwind Analytics' assessment by vendor name — stable across future demoVendors additions.
    where: {
      companyId: company.id,
      status: AssessmentStatus.COMPLETED,
      vendor: { name: "Northwind Analytics" },
    },
    select: { id: true },
  });

  await prisma.execReport.create({
    data: {
      companyId: company.id,
      assessmentId: completedAssessment.id,
      createdBy: SEED_ACTOR,
      status: ExecReportStatus.FINALIZED,
      executiveSummary:
        "Northwind Analytics demonstrates strong NIS2 compliance posture with an 82% score. " +
        "No critical gaps identified. Minor findings in incident management documentation.",
      remediationRoadmap:
        "1. Update incident response runbooks (Q3). " +
        "2. Schedule next assessment in 6 months.",
      // chain genesis — hash computed on first update
      eventHash: null,
      previousReportHash: null,
    },
  });
}

main()
  .then(() => {
    console.info(`Seeded company "${COMPANY_SLUG}", ${nis2Questions.length} questions, ${demoVendors.length} vendors, 1 exec report.`);
    console.info(`Admin login: ${DEFAULT_ADMIN_EMAIL} / [redacted]`);
    console.info(`Auditor login: ${DEFAULT_AUDITOR_EMAIL} / [redacted]`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
