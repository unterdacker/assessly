-- CreateEnum
CREATE TYPE "ExecReportStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateTable
CREATE TABLE "ExecReport" (
    "id"                 TEXT NOT NULL,
    "companyId"          TEXT NOT NULL,
    "assessmentId"       TEXT NOT NULL,
    "creatorUserId"      TEXT,
    "createdBy"          TEXT NOT NULL,
    "status"             "ExecReportStatus" NOT NULL DEFAULT 'DRAFT',
    "executiveSummary"   TEXT,
    "remediationRoadmap" TEXT,
    "aiDraftSummary"     TEXT,
    "aiDraftRoadmap"     TEXT,
    "eventHash"          TEXT,
    "previousReportHash" TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExecReport_companyId_idx" ON "ExecReport"("companyId");
CREATE INDEX "ExecReport_assessmentId_idx" ON "ExecReport"("assessmentId");
CREATE INDEX "ExecReport_creatorUserId_idx" ON "ExecReport"("creatorUserId");
CREATE INDEX "ExecReport_status_idx" ON "ExecReport"("status");
CREATE INDEX "ExecReport_companyId_status_idx" ON "ExecReport"("companyId", "status");

-- AddForeignKey
ALTER TABLE "ExecReport"
    ADD CONSTRAINT "ExecReport_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExecReport"
    ADD CONSTRAINT "ExecReport_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExecReport"
    ADD CONSTRAINT "ExecReport_creatorUserId_fkey"
    FOREIGN KEY ("creatorUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
