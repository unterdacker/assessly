/*
  Warnings:

  - You are about to drop the column `serviceCategory` on the `Vendor` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "officialName" TEXT,
    "registrationId" TEXT,
    "vendorServiceType" TEXT,
    "vendorServiceTypeCustom" TEXT,
    "securityOfficerName" TEXT,
    "securityOfficerEmail" TEXT,
    "dpoName" TEXT,
    "dpoEmail" TEXT,
    "headquartersLocation" TEXT,
    "sizeClassification" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "Vendor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Vendor" ("companyId", "createdAt", "createdBy", "dpoEmail", "dpoName", "email", "headquartersLocation", "id", "name", "officialName", "registrationId", "securityOfficerEmail", "securityOfficerName", "serviceType", "sizeClassification", "updatedAt") SELECT "companyId", "createdAt", "createdBy", "dpoEmail", "dpoName", "email", "headquartersLocation", "id", "name", "officialName", "registrationId", "securityOfficerEmail", "securityOfficerName", "serviceType", "sizeClassification", "updatedAt" FROM "Vendor";
DROP TABLE "Vendor";
ALTER TABLE "new_Vendor" RENAME TO "Vendor";
CREATE INDEX "Vendor_companyId_idx" ON "Vendor"("companyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
