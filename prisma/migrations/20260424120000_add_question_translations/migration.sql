-- Add translation fields to Question (custom questions)
ALTER TABLE "Question" ADD COLUMN "textDe" TEXT;
ALTER TABLE "Question" ADD COLUMN "guidanceDe" TEXT;
ALTER TABLE "Question" ADD COLUMN "textEn" TEXT;
ALTER TABLE "Question" ADD COLUMN "guidanceEn" TEXT;

-- Add translation fields to TemplateQuestion
ALTER TABLE "TemplateQuestion" ADD COLUMN "textDe" TEXT;
ALTER TABLE "TemplateQuestion" ADD COLUMN "helpTextDe" TEXT;
ALTER TABLE "TemplateQuestion" ADD COLUMN "textEn" TEXT;
ALTER TABLE "TemplateQuestion" ADD COLUMN "helpTextEn" TEXT;
