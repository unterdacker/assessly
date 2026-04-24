-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN "templateId" TEXT;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QuestionnaireTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Assessment_templateId_idx" ON "Assessment"("templateId");
