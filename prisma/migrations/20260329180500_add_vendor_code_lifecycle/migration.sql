-- Add access-code lifecycle control fields
ALTER TABLE "Vendor" ADD COLUMN "codeExpiresAt" DATETIME;
ALTER TABLE "Vendor" ADD COLUMN "isCodeActive" BOOLEAN NOT NULL DEFAULT false;
