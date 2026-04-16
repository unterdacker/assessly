-- Migration: Add Assessment Approval Workflow
-- Expands AssessmentStatus enum and adds AssessmentApprovalStep table.
-- Existing IN_REVIEW data is migrated to UNDER_REVIEW.

-- Step 1: Rename old enum
ALTER TYPE "AssessmentStatus" RENAME TO "AssessmentStatus_old";

-- Step 2: Create new enum with full lifecycle
CREATE TYPE "AssessmentStatus" AS ENUM (
  'PENDING',
  'UNDER_REVIEW',
  'SUBMITTED',
  'REVIEWER_APPROVED',
  'SIGN_OFF',
  'COMPLETED',
  'REJECTED',
  'ARCHIVED'
);

-- Step 3: Migrate Assessment.status column
ALTER TABLE "Assessment" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Assessment"
  ALTER COLUMN "status" TYPE "AssessmentStatus"
  USING (
    CASE "status"::text
      WHEN 'PENDING'    THEN 'PENDING'
      WHEN 'IN_REVIEW'  THEN 'UNDER_REVIEW'
      WHEN 'COMPLETED'  THEN 'COMPLETED'
      ELSE 'PENDING'
    END
  )::"AssessmentStatus";

ALTER TABLE "Assessment" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"AssessmentStatus";

-- Step 4: Drop old enum
DROP TYPE "AssessmentStatus_old";

-- Step 5: Add reviewerUserId to Assessment
ALTER TABLE "Assessment" ADD COLUMN "reviewerUserId" TEXT;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_reviewerUserId_fkey"
  FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Assessment_reviewerUserId_idx" ON "Assessment"("reviewerUserId");

-- Step 6: Create AssessmentApprovalStep table
CREATE TABLE "AssessmentApprovalStep" (
  "id"           TEXT        NOT NULL,
  "assessmentId" TEXT        NOT NULL,
  "fromStatus"   "AssessmentStatus" NOT NULL,
  "toStatus"     "AssessmentStatus" NOT NULL,
  "actorUserId"  TEXT,
  "comment"      TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssessmentApprovalStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssessmentApprovalStep_assessmentId_idx" ON "AssessmentApprovalStep"("assessmentId");

ALTER TABLE "AssessmentApprovalStep"
  ADD CONSTRAINT "AssessmentApprovalStep_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssessmentApprovalStep"
  ADD CONSTRAINT "AssessmentApprovalStep_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AssessmentApprovalStep_actorUserId_idx" ON "AssessmentApprovalStep"("actorUserId");
