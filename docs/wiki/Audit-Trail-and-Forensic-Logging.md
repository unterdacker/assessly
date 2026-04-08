# Audit Trail & Forensic Logging

## Overview

Assessly implements a **tamper-evident, cryptographically chained audit trail** that satisfies requirements from multiple compliance frameworks simultaneously:

| Framework | Requirement |
|-----------|-------------|
| NIS2 Art. 21 | Supply chain event traceability |
| DORA Art. 9 | ICT incident logging and resilience evidence |
| ISO 27001 A.12 | Operational logs and monitoring |
| SOC 2 CC7 | System monitoring |
| BSI Grundschutz OPS.1.1.5 | Centralized log management |
| GDPR Art. 5(1)(b) | Purpose limitation — documented intent |
| GDPR Art. 6 | Legal basis accountability |
| EU AI Act Art. 12/14 | AI traceability |

---

## Hash Chain Mechanism

Every `AuditLog` row is part of a per-company hash chain:

```
Entry N-1                    Entry N
┌─────────────────┐         ┌────────────────────────────────┐
│ eventHash       │──SHA256─▶│ previousLogHash                │
│ (SHA-256 of     │         │ eventHash = SHA-256(            │
│  canonical      │         │   action + entityType +         │
│  fields)        │         │   entityId + timestamp +        │
└─────────────────┘         │   previousLogHash)              │
                            └────────────────────────────────┘
```

- `previousLogHash`: SHA-256 of the previous entry's `eventHash` in the same company's chain
- `eventHash`: SHA-256 of this entry's canonical fields (action, entityType, entityId, timestamp, previousLogHash)

This makes it **detectable if any entry is deleted, reordered, or modified** after the fact — a fundamental requirement of DORA Art. 9 and BSI Grundschutz.

### Verifying the chain

```bash
npm run audit:verify-chain
```

The `scripts/verify-audit-chain.ts` script walks the entire audit log for all companies and verifies that each `previousLogHash` matches the previous entry's `eventHash`. Any break in the chain is reported.

### Tamper testing

```bash
npm run audit:tamper-test
```

The forensic tamper test (`scripts/forensic-tamper-test.ts`) deliberately corrupts a test entry and confirms the chain verification detects it.

---

## Audit Log Entry Structure

Every entry includes the **5-Ws**:

| Field | W | Description |
|-------|---|-------------|
| `userId` | Who | Opaque actor ID — never an email or name |
| `timestamp` | When | ISO 8601, UTC |
| `action` | What | Action type from the catalogue |
| `entityType` + `entityId` | What | Target entity |
| `companyId` | Where | Tenant scope |
| `requestId` | Where | Correlates with server/CDN access logs |
| Outcome | Outcome | Inferred from `newValue`/`previousValue` |

---

## Action Catalogue

| Action | Category | Trigger |
|--------|----------|---------|
| `VENDOR_CREATED` | NIS2_DORA | New vendor added |
| `VENDOR_DELETED` | NIS2_DORA | Vendor removed |
| `ASSESSMENT_OVERRIDE` | NIS2_DORA | Auditor overrides an answer |
| `ASSESSMENT_UPDATED` | NIS2_DORA | Assessment data changed |
| `EXTERNAL_ASSESSMENT_UPDATED` | NIS2_DORA | Vendor updates their own questionnaire |
| `DOCUMENT_ANALYZED` | AI_ACT | AI document analysis run |
| `AI_GENERATION` | AI_ACT | AI summary generated |
| `AI_REMEDIATION_SENT` | AI_ACT | AI-assisted remediation email sent |
| `INVITE_SENT` | NIS2_DORA | Vendor invitation email dispatched |
| `VENDOR_INVITE_REFRESHED` | NIS2_DORA | Invite token regenerated |
| `ACCESS_CODE_GENERATED` | NIS2_DORA | Access code created |
| `ACCESS_CODE_VOIDED` | NIS2_DORA | Access code revoked |
| `LOGIN_SUCCESS` | AUTH | Successful authentication |
| `LOGIN_FAILED` | AUTH | Failed authentication attempt |
| `RATE_LIMIT_EXCEEDED` | AUTH | Login rate limit triggered |
| `USER_LOGOUT` | AUTH | Explicit logout |
| `MFA_ENABLED` | AUTH | TOTP MFA activated |
| `MFA_DISABLED` | AUTH | TOTP MFA deactivated |
| `MFA_FAILED_ATTEMPT` | AUTH | Incorrect TOTP code |
| `SETTINGS_UPDATED` | CONFIG | System settings changed |
| `MAIL_DELIVERY_FAILED` | CONFIG | Email send failure |
| `USER_CREATED` | ISO27001_SOC2 | Internal user added |
| `USER_DELETED` | ISO27001_SOC2 | Internal user removed |
| `USER_ROLE_CHANGED` | ISO27001_SOC2 | Role assignment changed |
| `OTHER` | OTHER | System fallback for unrecognised action strings. **Must not be used for intentional events.** |

---

## Compliance Categories

The `complianceCategory` field enables filtering the audit log by framework:

| Category | Frameworks |
|----------|-----------|
| `AI_ACT` | EU AI Act Art. 12 / 14 |
| `AUTH` | ISO 27001 A.9 / SOC 2 CC6 |
| `CONFIG` | ISO 27001 A.12 / SOC 2 CC7 |
| `NIS2_DORA` | NIS2 Art. 21 / DORA Art. 9 |
| `ISO27001_SOC2` | ISO 27001 A.9 / SOC 2 CC6 (user lifecycle) |
| `BSI_TISAX` | BSI Grundschutz / TISAX |
| `OTHER` | Uncategorised events |

---

## Privacy-First Logging

### PII Protection

The `lib/audit-sanitize.ts` module enforces these rules at write time:

- **IP truncation**: IPv4 addresses are truncated to `/24` prefix (e.g. `192.168.1.0/24`), IPv6 to `/48` (GDPR Recital 30)
- **PII field scrubbing**: Known PII fields (`email`, `password`, `token`, `secret`, `apiKey`, etc.) are replaced with `"[REDACTED]"` in `previousValue`/`newValue` JSON
- **No raw text**: Answer text, email content, and vendor responses are never stored — only entity IDs

### GDPR Retention Tiers

| Tier | `retentionPriority` | Typical use |
|------|---------------------|-------------|
| HIGH | Security events | AUTH, NIS2_DORA events |
| LOW | Operational telemetry | CONFIG read events |

A cron job can enforce retention by deleting entries where `retentionUntil < now()`.

### Legal Basis Tagging

Every entry is tagged with a GDPR Art. 6 legal basis:

| `legalBasis` | When used |
|--------------|-----------|
| `LEGAL_OBLIGATION` | NIS2 / DORA regulatory obligations |
| `LEGITIMATE_INTEREST` | Operational security monitoring |

---

## GDPR Right to Erasure (Art. 17)

The `lib/gdpr-erasure.ts` module implements compliant user data erasure from audit logs:

1. Acquires a PostgreSQL advisory lock to prevent concurrent erasure of the same company
2. Replaces the user's direct identifiers (`userId`, `actorId`, `createdBy`) with a **deterministic pseudonym** derived from `AUDIT_PSEUDONYMIZATION_KEY`
3. Scrubs PII from `previousValue` and `newValue` JSON payloads
4. **Recomputes the entire hash chain** to maintain cryptographic integrity after redaction
5. Returns a `GdprErasureResult` with counts of redacted and rehashed entries

This approach satisfies both Art. 17 (erasure) and DORA Art. 9 (audit integrity) simultaneously.

---

## Structured Logger

The `AuditLogger` class in `lib/structured-logger.ts` provides typed log emit methods:

```typescript
AuditLogger.auth(action, status, options)       // AUTH category
AuditLogger.dataOperation(action, status, options) // DATA_OPERATIONS
AuditLogger.aiEvent(action, status, options)    // AI_ACT
AuditLogger.configuration(action, status, options) // CONFIGURATION
AuditLogger.systemHealth(action, status, options)  // SYSTEM_HEALTH
```

All output is JSON to `stdout`/`stderr`, compatible with container log aggregation platforms (ELK, Loki, CloudWatch, etc.).

---

## Audit Log UI

The audit log is accessible at **Admin → Audit Logs**. The UI supports:

- Filtering by compliance category
- Filtering by date range
- Full-text search on action type and entity ID
- Export (CSV) for regulator submission

Access: ADMIN and AUDITOR roles.
