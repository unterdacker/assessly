-- Safety guard: fail fast if any SUPER_ADMIN rows exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE role = 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Cannot remove SUPER_ADMIN: rows still exist in User table. Run: UPDATE "User" SET role = ''ADMIN'' WHERE role = ''SUPER_ADMIN'' first.';
  END IF;
  IF EXISTS (SELECT 1 FROM "AuthSession" WHERE role = 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Cannot remove SUPER_ADMIN: rows still exist in AuthSession table. Run: UPDATE "AuthSession" SET role = ''ADMIN'' WHERE role = ''SUPER_ADMIN'' first.';
  END IF;
END;
$$;

-- Create replacement enum without SUPER_ADMIN
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'RISK_REVIEWER', 'AUDITOR', 'VENDOR');

-- Migrate columns
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING ("role"::text::"UserRole_new");

ALTER TABLE "AuthSession"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING ("role"::text::"UserRole_new");

-- Swap type names
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
