-- AlterTable
ALTER TABLE "QuestionnaireTemplate" ADD COLUMN     "systemTemplateKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireTemplate_companyId_systemTemplateKey_key" ON "QuestionnaireTemplate"("companyId", "systemTemplateKey");
