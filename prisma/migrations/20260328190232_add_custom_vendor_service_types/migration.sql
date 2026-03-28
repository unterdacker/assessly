-- CreateTable
CREATE TABLE "CustomVendorServiceType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "CustomVendorServiceType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CustomVendorServiceType_companyId_idx" ON "CustomVendorServiceType"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomVendorServiceType_companyId_name_key" ON "CustomVendorServiceType"("companyId", "name");
