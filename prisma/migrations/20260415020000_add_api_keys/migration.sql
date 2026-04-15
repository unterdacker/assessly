-- ApiKey: stores hashed API keys. Plaintext is NEVER persisted after creation.
CREATE TABLE "ApiKey" (
    "id"              TEXT NOT NULL,
    "companyId"       TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "keyHash"         TEXT NOT NULL,
    "keyPrefix"       TEXT NOT NULL,
    "scopes"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "usageCount"      INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt"      TIMESTAMP(3),
    "expiresAt"       TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiKeyUsageLog" (
    "id"             TEXT NOT NULL,
    "apiKeyId"       TEXT NOT NULL,
    "endpoint"       TEXT NOT NULL,
    "method"         TEXT NOT NULL,
    "statusCode"     INTEGER NOT NULL,
    "requestedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApiKeyUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_companyId_idx" ON "ApiKey"("companyId");
CREATE INDEX "ApiKey_companyId_isActive_idx" ON "ApiKey"("companyId", "isActive");
CREATE INDEX "ApiKeyUsageLog_apiKeyId_idx" ON "ApiKeyUsageLog"("apiKeyId");
CREATE INDEX "ApiKeyUsageLog_requestedAt_idx" ON "ApiKeyUsageLog"("requestedAt");
CREATE INDEX "ApiKeyUsageLog_retentionUntil_idx" ON "ApiKeyUsageLog"("retentionUntil");

ALTER TABLE "ApiKey"
    ADD CONSTRAINT "ApiKey_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiKey"
    ADD CONSTRAINT "ApiKey_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiKeyUsageLog"
    ADD CONSTRAINT "ApiKeyUsageLog_apiKeyId_fkey"
    FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
