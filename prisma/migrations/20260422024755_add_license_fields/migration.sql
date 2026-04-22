-- DropForeignKey
ALTER TABLE "AssessmentAnswer" DROP CONSTRAINT "AssessmentAnswer_documentId_fkey";

-- DropIndex
DROP INDEX "Assessment_reviewerUserId_idx";

-- AlterTable
ALTER TABLE "ApiKey" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "QuestionnaireTemplate" ADD COLUMN     "frameworkCategory" TEXT;

-- CreateTable
CREATE TABLE "LicenseCache" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "instanceUuid" TEXT NOT NULL,
    "encodedLicense" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "cachedStatus" TEXT,
    "cachedMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseCache_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
