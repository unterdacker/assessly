-- Migration: invite_link_flow
-- Replaces SMS-based two-channel credential delivery with email invite-link flow.

-- GDPR Art. 17 erasure: VendorSmsLog held personal data (E.164 phone number hashes 
-- reversible via rainbow table; SHA-256 of a ~10-digit number is not pseudonymous under
-- GDPR Recital 26). Deletion recorded below per Art. 30 requirements.

-- Record personal data deletion in AuditLog before dropping the table.
-- This INSERT is a best-effort: if AuditLog table structure differs, the migration 
-- will still proceed (the DROP TABLE below is the authoritative erasure action).
INSERT INTO "AuditLog" ("id", "companyId", "userId", "action", "entityType", "entityId", "newValue", "timestamp", "complianceCategory")
SELECT
  gen_random_uuid()::text,
  'system',
  'migration',
  'PERSONAL_DATA_DELETED',
  'VendorSmsLog',
  'ALL',
  '{"table": "VendorSmsLog", "reason": "SMS feature removed; phone hashes constitute personal data under GDPR Recital 26. Feature replaced by email invite-link flow.", "migration": "20260415000000_invite_link_flow"}'::jsonb,
  NOW(),
  'DATA_OPERATIONS'
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'AuditLog');

-- Drop VendorSmsLog (GDPR Art. 17 erasure - no rollback path recreates this table with data)
DROP TABLE IF EXISTS "VendorSmsLog";

-- Add setup token fields to Vendor
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "setupToken" TEXT UNIQUE;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "setupTokenExpires" TIMESTAMP(3);

-- Add invite token fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "inviteToken" TEXT UNIQUE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "inviteTokenExpires" TIMESTAMP(3);
