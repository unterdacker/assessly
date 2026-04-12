-- CreateEnum
CREATE TYPE "RemediationTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX');

-- CreateTable
CREATE TABLE "RemediationTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "RemediationTaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "assigneeUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "RemediationTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RemediationTask_companyId_idx" ON "RemediationTask"("companyId");

-- CreateIndex
CREATE INDEX "RemediationTask_assessmentId_idx" ON "RemediationTask"("assessmentId");

-- CreateIndex
CREATE INDEX "RemediationTask_assigneeUserId_idx" ON "RemediationTask"("assigneeUserId");

-- CreateIndex
CREATE INDEX "RemediationTask_companyId_status_idx" ON "RemediationTask"("companyId", "status");

-- AddForeignKey
ALTER TABLE "RemediationTask" ADD CONSTRAINT "RemediationTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemediationTask" ADD CONSTRAINT "RemediationTask_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemediationTask" ADD CONSTRAINT "RemediationTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
