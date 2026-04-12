-- AlterTable: add companyId and isCustom to Question
ALTER TABLE "Question"
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "isCustom"  BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Question_companyId_idx" ON "Question"("companyId");

-- AddForeignKey
ALTER TABLE "Question"
  ADD CONSTRAINT "Question_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
