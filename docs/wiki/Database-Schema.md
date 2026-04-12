# Database Schema

Venshield uses **PostgreSQL 16** via **Prisma ORM**. The schema file is at `prisma/schema.prisma`.

---

## Entity Relationship Overview

```
Company
  ├── User (1:N)          — internal users (SUPER_ADMIN / ADMIN / RISK_REVIEWER / AUDITOR)
  ├── OidcConfig (1:1)    — optional OIDC/SSO provider configuration
  ├── Vendor (1:N)        — third-party suppliers under review
  │     └── Assessment (1:1)
  │           ├── AssessmentAnswer (1:N)   — one row per NIS2 question
  │           └── Document (1:N)           — uploaded PDF evidence
  ├── AuditLog (1:N)      — tamper-evident event stream
  └── CustomVendorServiceType (1:N)

User
  └── AuthSession (1:N)   — active/revoked sessions

SystemSettings           — singleton row: mail, encryption config
```

---

## Enumerations

### `UserRole`
| Value | Description |
|-------|-------------|
| `SUPER_ADMIN` | Platform-level administrator; same path access as ADMIN; intended for cross-company administration |
| `ADMIN` | Full access: vendor management, settings, user management, audit logs |
| `RISK_REVIEWER` | Internal read + write (vendor/assessment management, audit logs); cannot manage users or settings. Not shown in the user creation form |
| `AUDITOR` | Internal read-only access (dashboard, vendors, audit logs); cannot perform write operations |
| `VENDOR` | External portal only; scoped to their own assessment |

### `AssessmentStatus`
| Value | Description |
|-------|-------------|
| `PENDING` | Questionnaire not yet started by vendor |
| `IN_REVIEW` | ISB/Auditor is reviewing submitted answers |
| `COMPLETED` | Assessment closed and risk level finalised |

### `RiskLevel`
| Value | Score range | Meaning |
|-------|-------------|---------|
| `LOW` | 70–100 | Vendor meets most NIS2 controls |
| `MEDIUM` | 40–69 | Partial compliance; remediation recommended |
| `HIGH` | 0–39 | Significant compliance gaps; immediate action required |

### `MailStrategy`
| Value | Behaviour |
|-------|-----------|
| `SMTP` | Send via configured SMTP relay |
| `RESEND` | Send via Resend API |
| `LOG` | Print email content to stdout (development default) |

---

## Models

### `Company`

The root multi-tenant entity. Every user, vendor, and audit log belongs to exactly one Company.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | Primary key |
| `name` | `String` | Display name |
| `slug` | `String` (unique) | URL-safe identifier |
| `aiProvider` | `String` | `"local"` or `"mistral"` |
| `aiDisabled` | `Boolean` | When `true`, AI features are disabled for this company |
| `mistralApiKey` | `String?` | AES-256-GCM encrypted |
| `localAiEndpoint` | `String?` | Ollama base URL |
| `localAiModel` | `String?` | Default: `"ministral-3:8b"` |
| `lastAiSummary` | `String?` | Cached executive summary text |
| `aiSummaryUpdatedAt` | `DateTime?` | Cache timestamp |

---

### `OidcConfig`

Optional per-company OpenID Connect / SSO configuration. When enabled, users matching the allowed email domains are provisioned automatically (JIT provisioning).

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | |
| `companyId` | `String` (unique) | FK → Company (cascade delete) |
| `issuerUrl` | `String` | OIDC issuer discovery URL |
| `clientId` | `String` | OAuth2 client ID |
| `clientSecretEncrypted` | `String` | AES-256-GCM encrypted client secret |
| `isEnabled` | `Boolean` | Whether SSO login is active |
| `jitProvisioning` | `Boolean` | Auto-create users on first SSO login |
| `jitAllowedEmailDomains` | `String[]` | Domains eligible for JIT user creation |

---

### `User`

Internal platform users (SUPER_ADMIN / ADMIN / RISK_REVIEWER / AUDITOR) and linked vendor contacts.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | |
| `companyId` | `String?` | `SetNull` on company delete |
| `vendorId` | `String?` (unique) | Links to `Vendor` for role=VENDOR |
| `email` | `String?` (unique) | Login identifier |
| `displayName` | `String?` | |
| `passwordHash` | `String?` | bcrypt, cost factor 12 |
| `ssoProviderId` | `String?` | SSO provider subject identifier (unique per company+provider) |
| `role` | `UserRole` | |
| `isActive` | `Boolean` | Soft disable without deletion |
| `mfaEnabled` | `Boolean` | |
| `mfaSecret` | `String?` | AES-256-GCM encrypted TOTP seed |

Indexes: `companyId`, `role`

---

### `AuthSession`

Stateful session store. Upon login a session row is created; logout sets `revokedAt`. Expired or revoked sessions are rejected by middleware.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | Random session ID |
| `userId` | `String` | FK → User (cascade delete) |
| `tokenHash` | `String` (unique) | HMAC-SHA256 of the session cookie value |
| `expiresAt` | `DateTime` | Absolute expiry |
| `lastSeenAt` | `DateTime?` | Rolling activity tracking |
| `revokedAt` | `DateTime?` | Set on explicit logout |
| `role` | `UserRole` | Snapshot at session creation |

Indexes: `userId`, `companyId`, `vendorId`, `expiresAt`, `(userId, expiresAt)`

---

### `Vendor`

A third-party supplier tracked by an organisation. Vendors receive an email invitation and complete the NIS2 questionnaire via the external portal.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | |
| `companyId` | `String` | FK → Company |
| `name` | `String` | |
| `email` | `String` | Primary security contact |
| `serviceType` | `String` | Legacy; migrated to vendorServiceType |
| `officialName` | `String?` | Legal registered name |
| `registrationId` | `String?` | Company registration number |
| `securityOfficerName/Email` | `String?` | NIS2 Art. 20 contact |
| `dpoName/Email` | `String?` | GDPR DPO contact |
| `headquartersLocation` | `String?` | For jurisdictional risk |
| `sizeClassification` | `String?` | SME / large enterprise |
| `accessCode` | `String?` (unique) | OTP-style portal access credential |
| `codeExpiresAt` | `DateTime?` | |
| `inviteToken` | `String?` (unique) | One-time email invitation token |
| `isFirstLogin` | `Boolean` | Forces password change on first access |

---

### `Assessment`

One current assessment record per vendor. Contains the overall scores and links to answers and documents.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | |
| `vendorId` | `String` (unique) | One assessment per vendor |
| `status` | `AssessmentStatus` | |
| `riskLevel` | `RiskLevel` | Derived from `complianceScore` |
| `complianceScore` | `Int` | 0–100 |
| `documentFilename` | `String?` | Legacy single-document field |
| `documentUrl` | `String?` | Legacy single-document field |

---

### `AssessmentAnswer`

One row per NIS2 question per assessment. Tracks manual auditor input, AI suggestions, and human verification.

| Field | Type | Notes |
|-------|------|-------|
| `questionId` | `String` | References `nis2Questions` catalogue |
| `status` | `String` | `"COMPLIANT"` \| `"NON_COMPLIANT"` \| `"PARTIAL"` \| `"NA"` |
| `findings` | `String?` | Auditor notes |
| `justificationText` | `String?` | Vendor or AI narrative |
| `evidenceSnippet` | `String?` | PDF text extract |
| `evidenceFileUrl` | `String?` | Per-question uploaded file path |
| `isAiSuggested` | `Boolean` | AI auto-populated this answer |
| `verified` | `Boolean` | Human auditor confirmed AI suggestion |
| `aiSuggestedStatus` | `String?` | AI's compliance verdict |
| `aiConfidence` | `Float?` | 0.0–1.0 confidence score |
| `aiReasoning` | `String?` | AI's evidence trace (for audit) |
| `manualNotes` | `String?` | ISB override justification |

---

### `Document`

Append-only PDF evidence record. Documents are never deleted; the audit-grade file is retained for NIS2 Article 21 traceability.

| Field | Type | Notes |
|-------|------|-------|
| `assessmentId` | `String` | FK → Assessment |
| `filename` | `String` | Original upload name (sanitised) |
| `storagePath` | `String` | Path relative to `.venshield-storage/` |
| `mimeType` | `String` | Default `application/pdf` |
| `fileSize` | `Int` | Bytes |
| `uploadedBy` | `String` | User ID at upload time |

---

### `AuditLog`

Tamper-evident event stream. Every state-changing action in the platform writes a row here. See [Audit Trail & Forensic Logging](Audit-Trail-and-Forensic-Logging) for the full specification.

Key forensic fields:

| Field | Description |
|-------|-------------|
| `previousLogHash` | SHA-256 of the previous entry's `eventHash` (hash chain) |
| `eventHash` | SHA-256 of this entry's canonical fields |
| `complianceCategory` | `AI_ACT \| AUTH \| CONFIG \| NIS2_DORA \| ISO27001_SOC2 \| BSI_TISAX \| OTHER` |
| `legalBasis` | GDPR Art. 6 basis: `LEGAL_OBLIGATION \| LEGITIMATE_INTEREST` |
| `retentionPriority` | `HIGH` (security events) or `LOW` (operational telemetry) |
| `aiModelId` | EU AI Act Art. 14: LLM model identifier |
| `hitlVerifiedBy` | EU AI Act Art. 14: ID of human who approved AI output |
| `inputContextHash` | SHA-256 of AI prompt/document (no PII stored) |

---

### `SystemSettings`

Singleton row (`id = "singleton"`). Stores mail transport configuration with encrypted credential fields.

| Field | Notes |
|-------|-------|
| `mailStrategy` | `MailStrategy` enum |
| `smtpPassword` | AES-256-GCM encrypted via `lib/crypto.ts` |
| `resendApiKey` | AES-256-GCM encrypted via `lib/crypto.ts` |

---

### `Question`

Global NIS2 question catalogue. Seeded at startup; version controlled via `NIS2_QUESTIONNAIRE_VERSION = "2026.1"`. See [NIS2 Compliance Module](NIS2-Compliance-Module) for details.

---

### `CustomVendorServiceType`

Per-company extensions to the built-in vendor service type list. Unique per `(companyId, name)`.
