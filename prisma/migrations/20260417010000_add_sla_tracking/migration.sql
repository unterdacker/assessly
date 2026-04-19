-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('PRE_DUE', 'OVERDUE', 'ESCALATION', 'MANUAL');

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN "dueDate" TIMESTAMP(3),
ADD COLUMN "slaPolicyId" TEXT,
ADD COLUMN "slaBreached" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "responseDays" INTEGER NOT NULL,
    "reminderIntervals" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "escalationDays" INTEGER NOT NULL DEFAULT 0,
    "escalationRecipientUserId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentReminder" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "type" "ReminderType" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlaPolicy_companyId_name_key" ON "SlaPolicy"("companyId", "name");

-- CreateIndex
CREATE INDEX "SlaPolicy_companyId_idx" ON "SlaPolicy"("companyId");

-- CreateIndex
CREATE INDEX "SlaPolicy_escalationRecipientUserId_idx" ON "SlaPolicy"("escalationRecipientUserId");

-- CreateIndex
CREATE INDEX "AssessmentReminder_assessmentId_idx" ON "AssessmentReminder"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentReminder_sentAt_scheduledAt_idx" ON "AssessmentReminder"("sentAt", "scheduledAt");

-- CreateIndex
CREATE INDEX "Assessment_slaPolicyId_idx" ON "Assessment"("slaPolicyId");

-- CreateIndex
CREATE INDEX "Assessment_dueDate_idx" ON "Assessment"("dueDate");

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_escalationRecipientUserId_fkey" FOREIGN KEY ("escalationRecipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentReminder" ADD CONSTRAINT "AssessmentReminder_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
