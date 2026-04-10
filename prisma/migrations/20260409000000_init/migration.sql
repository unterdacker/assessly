-- Initial schema migration (pre-CompanyPlan).
-- This migration intentionally excludes:
-- 1) enum "CompanyPlan"
-- 2) column "Company"."plan"

CREATE TYPE "AssessmentStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'COMPLETED');
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'RISK_REVIEWER', 'AUDITOR', 'VENDOR');
CREATE TYPE "MailStrategy" AS ENUM ('SMTP', 'RESEND', 'LOG');

CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "aiProvider" TEXT NOT NULL DEFAULT 'local',
  "aiDisabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "mistralApiKey" TEXT,
  "localAiEndpoint" TEXT DEFAULT 'http://localhost:11434',
  "localAiModel" TEXT DEFAULT 'ministral-3:8b',
  "lastAiSummary" TEXT,
  "aiSummaryUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Question" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "guidance" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemSettings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "mailStrategy" "MailStrategy" NOT NULL DEFAULT 'LOG',
  "mailFrom" TEXT,
  "mailFromName" TEXT,
  "smtpHost" TEXT,
  "smtpPort" INTEGER DEFAULT 587,
  "smtpUser" TEXT,
  "smtpPassword" TEXT,
  "resendApiKey" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT,
  CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vendor" (
  "id" TEXT NOT NULL,
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "accessCode" TEXT,
  "codeExpiresAt" TIMESTAMP(3),
  "isCodeActive" BOOLEAN NOT NULL DEFAULT FALSE,
  "passwordHash" TEXT,
  "isFirstLogin" BOOLEAN NOT NULL DEFAULT TRUE,
  "inviteSentAt" TIMESTAMP(3),
  "inviteToken" TEXT,
  "inviteTokenExpires" TIMESTAMP(3),
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Vendor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "vendorId" TEXT,
  "email" TEXT,
  "displayName" TEXT,
  "passwordHash" TEXT,
  "ssoProviderId" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'VENDOR',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "mfaEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "mfaSecret" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "User_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT,
  "vendorId" TEXT,
  "role" "UserRole" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Assessment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "status" "AssessmentStatus" NOT NULL DEFAULT 'PENDING',
  "riskLevel" "RiskLevel" NOT NULL,
  "complianceScore" INTEGER NOT NULL,
  "lastAssessmentDate" TIMESTAMP(3),
  "documentFilename" TEXT,
  "documentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Assessment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Assessment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Document" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  "fileSize" INTEGER NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedBy" TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Document_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AssessmentAnswer" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "findings" TEXT,
  "justificationText" TEXT,
  "evidenceSnippet" TEXT,
  "evidenceFileUrl" TEXT,
  "evidenceFileName" TEXT,
  "isAiSuggested" BOOLEAN NOT NULL DEFAULT FALSE,
  "verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "documentId" TEXT,
  "aiSuggestedStatus" TEXT,
  "aiConfidence" DOUBLE PRECISION,
  "aiReasoning" TEXT,
  "manualNotes" TEXT,
  "evidenceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentAnswer_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssessmentAnswer_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL DEFAULT 'system',
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "previousValue" JSONB,
  "newValue" JSONB,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "complianceCategory" TEXT,
  "reason" TEXT,
  "retentionPriority" TEXT,
  "retentionUntil" TIMESTAMP(3),
  "legalBasis" TEXT,
  "requestId" TEXT,
  "previousLogHash" TEXT,
  "eventHash" TEXT,
  "aiModelId" TEXT,
  "aiProviderName" TEXT,
  "inputContextHash" TEXT,
  "hitlVerifiedBy" TEXT,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CustomVendorServiceType" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "CustomVendorServiceType_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomVendorServiceType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OidcConfig" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "issuerUrl" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientSecretEncrypted" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "jitProvisioning" BOOLEAN NOT NULL DEFAULT FALSE,
  "jitAllowedEmailDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OidcConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OidcConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

CREATE UNIQUE INDEX "OidcConfig_companyId_key" ON "OidcConfig"("companyId");
CREATE INDEX "OidcConfig_companyId_idx" ON "OidcConfig"("companyId");

CREATE UNIQUE INDEX "User_vendorId_key" ON "User"("vendorId");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_companyId_idx" ON "User"("companyId");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE UNIQUE INDEX "User_companyId_ssoProviderId_key" ON "User"("companyId", "ssoProviderId");

CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_companyId_idx" ON "AuthSession"("companyId");
CREATE INDEX "AuthSession_vendorId_idx" ON "AuthSession"("vendorId");
CREATE INDEX "AuthSession_role_idx" ON "AuthSession"("role");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

CREATE UNIQUE INDEX "Vendor_accessCode_key" ON "Vendor"("accessCode");
CREATE UNIQUE INDEX "Vendor_inviteToken_key" ON "Vendor"("inviteToken");
CREATE INDEX "Vendor_companyId_idx" ON "Vendor"("companyId");

CREATE UNIQUE INDEX "Assessment_vendorId_key" ON "Assessment"("vendorId");
CREATE INDEX "Assessment_companyId_idx" ON "Assessment"("companyId");
CREATE INDEX "Assessment_vendorId_idx" ON "Assessment"("vendorId");

CREATE INDEX "Question_category_idx" ON "Question"("category");

CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX "AuditLog_complianceCategory_idx" ON "AuditLog"("complianceCategory");
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");
CREATE INDEX "AuditLog_retentionUntil_idx" ON "AuditLog"("retentionUntil");

CREATE INDEX "AssessmentAnswer_assessmentId_questionId_idx" ON "AssessmentAnswer"("assessmentId", "questionId");

CREATE UNIQUE INDEX "CustomVendorServiceType_companyId_name_key" ON "CustomVendorServiceType"("companyId", "name");
CREATE INDEX "CustomVendorServiceType_companyId_idx" ON "CustomVendorServiceType"("companyId");

CREATE INDEX "Document_assessmentId_idx" ON "Document"("assessmentId");