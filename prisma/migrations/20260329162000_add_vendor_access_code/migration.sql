-- Add vendor access code for external portal login
ALTER TABLE "Vendor" ADD COLUMN "accessCode" TEXT;

-- Unique code per vendor; nullable for transition/backfill safety
CREATE UNIQUE INDEX "Vendor_accessCode_key" ON "Vendor"("accessCode");
