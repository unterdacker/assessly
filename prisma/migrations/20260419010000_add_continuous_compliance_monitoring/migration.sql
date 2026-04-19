-- CreateEnum
CREATE TYPE "RecurrenceInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');

-- CreateTable
CREATE TABLE "RecurrenceSchedule" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT,
    "interval" "RecurrenceInterval" NOT NULL,
    "lastAssessmentId" TEXT,
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoSend" BOOLEAN NOT NULL DEFAULT false,
    "regressionThreshold" INTEGER NOT NULL DEFAULT 10,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurrenceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "overallScore" DECIMAL(5,2) NOT NULL,
    "categoryScores" JSONB NOT NULL,
    "frameworkKey" TEXT,
    "vendorCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurrenceSchedule_companyId_idx" ON "RecurrenceSchedule"("companyId");
CREATE INDEX "RecurrenceSchedule_nextDueAt_idx" ON "RecurrenceSchedule"("nextDueAt");
CREATE INDEX "RecurrenceSchedule_companyId_isActive_idx" ON "RecurrenceSchedule"("companyId", "isActive");
CREATE UNIQUE INDEX "RecurrenceSchedule_vendorId_companyId_key" ON "RecurrenceSchedule"("vendorId", "companyId");
CREATE INDEX "ComplianceSnapshot_companyId_snapshotDate_idx" ON "ComplianceSnapshot"("companyId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "RecurrenceSchedule" ADD CONSTRAINT "RecurrenceSchedule_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurrenceSchedule" ADD CONSTRAINT "RecurrenceSchedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurrenceSchedule" ADD CONSTRAINT "RecurrenceSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QuestionnaireTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurrenceSchedule" ADD CONSTRAINT "RecurrenceSchedule_lastAssessmentId_fkey" FOREIGN KEY ("lastAssessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurrenceSchedule" ADD CONSTRAINT "RecurrenceSchedule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComplianceSnapshot" ADD CONSTRAINT "ComplianceSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
