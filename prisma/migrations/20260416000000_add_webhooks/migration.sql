-- CreateTable
CREATE TABLE "Webhook" (
    "id"              TEXT NOT NULL,
    "companyId"       TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "url"             TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "events"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isEnabled"       BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Webhook_companyId_idx" ON "Webhook"("companyId");

-- CreateIndex
CREATE INDEX "Webhook_companyId_isEnabled_idx" ON "Webhook"("companyId", "isEnabled");

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
