-- CreateEnum
CREATE TYPE "CompanyPlan" AS ENUM ('FREE', 'PREMIUM');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "plan" "CompanyPlan" NOT NULL DEFAULT 'FREE';

-- Backfill: promote all companies with enabled SSO config to PREMIUM
UPDATE "Company"
SET plan = 'PREMIUM'
WHERE EXISTS (
  SELECT 1 FROM "OidcConfig"
  WHERE "OidcConfig"."companyId" = "Company".id
    AND "OidcConfig"."isEnabled" = true
);