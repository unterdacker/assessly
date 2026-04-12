# NIS2 Compliance Module

## Overview

Venshield is designed around **NIS2 Directive (Directive (EU) 2022/2555) Article 21** supply chain security obligations. The platform provides a structured framework for organisations to assess the cybersecurity posture of their third-party vendors.

---

## Questionnaire Catalogue

### Version

The active questionnaire catalogue is versioned as **`2026.1`** (`lib/nis2-questions.ts`).

### 20 NIS2-Aligned Questions

The catalogue contains 20 questions across 7 compliance categories:

| Category | Questions | IDs |
|----------|-----------|-----|
| Governance & Risk Management | 3 | q1, q2, q3 |
| Access & Identity | 3 | q4, q5, q6 |
| Data Protection & Privacy | 3 | q7, q8, q9 |
| Cryptography & Key Management | 2 | q10, q11 |
| Operations & Monitoring | 3 | q12, q13, q14 |
| Incident & Business Continuity | 3 | q15, q16, q17 |
| Supply Chain & Development | 3 | q18, q19, q20 |

### Example Questions

| ID | Category | Question |
|----|----------|---------|
| q1 | Governance | Does the vendor maintain a documented information security policy approved by management? |
| q4 | Access | Is multi-factor authentication enforced for all administrative and remote access? |
| q10 | Cryptography & Key Management | Are cryptographic keys generated, stored, and rotated according to a defined process? |
| q15 | Incident & Business Continuity | Does the vendor maintain an incident response plan with customer notification clauses? |
| q18 | Supply Chain & Development | Is secure SDLC practiced (threat modeling, code review, dependency scanning)? |

Each question optionally carries `guidance` text visible to the vendor during completion.

---

## Scoring Model

### Compliance Score (0–100)

The compliance score is calculated from the number of `COMPLIANT` answers divided by the total answered questions.

```
complianceScore = (COMPLIANT answers / total questions) × 100
```

The score is rounded to the nearest integer and stored in `Assessment.complianceScore`.

### Risk Level Mapping (`lib/risk-level.ts`)

| Score range | Risk Level |
|-------------|-----------|
| 70–100 | `LOW` |
| 40–69 | `MEDIUM` |
| 0–39 | `HIGH` |

This mapping is the single source of truth across server actions and is enforced by the `calculateRiskLevel()` function.

---

## Answer Status Values

| Status | Meaning |
|--------|---------|
| `COMPLIANT` | Control is fully in place |
| `NON_COMPLIANT` | Control is absent or inadequate |
| `PARTIAL` | Control exists but is incomplete |
| `NA` | Not applicable to this vendor |

---

## Assessment Workflow

```
1. Vendor onboarded (Admin creates Vendor record)
         │
2. Invite sent via email (inviteToken issued)
         │
3. Vendor sets password, logs into portal
         │
4. Vendor completes questionnaire (one answer per question)
         │
5. Vendor optionally uploads a security policy PDF
         │
6. AI analyzes uploaded document → auto-populates suggested answers
         │
7. ISB / Auditor reviews answers in the Assessment Workspace
         │
8. Auditor confirms or overrides AI suggestions (HITL verification)
         │
9. Compliance score + risk level calculated
         │
10. Assessment status set to COMPLETED
         │
11. Remediation emails generated for NON_COMPLIANT findings (optional)
```

---

## Dossier Completion

In addition to the questionnaire progress, each vendor has a **dossier completion** percentage that reflects how much of the NIS2-required vendor master data has been filled in:

Fields tracked for dossier completeness:
- `officialName`
- `registrationId`
- `vendorServiceType`
- `securityOfficerName` + `securityOfficerEmail`
- `dpoName` + `dpoEmail`
- `headquartersLocation`
- `sizeClassification`

The dossier completion score (0–100) is shown in the vendor card and used as a secondary risk signal.

---

## Category Compliance Radar Chart

The dashboard includes a radar chart (`CategoryComplianceRadarChart`) that visualises compliance scores across the 7 NIS2 categories, providing an at-a-glance view of where the supply chain has the most exposure.

---

## Questionnaire Progress Tracking

| Metric | Description |
|--------|-------------|
| `questionnaireProgress` | 0–100: percentage of questions answered |
| `questionsFilled` | Absolute count of answered questions (0–20) |

Progress is visible in the vendor list table and the vendor details card.

---

## NIS2-Relevant Vendor Metadata

The `Vendor` model stores the following NIS2-specific fields to support Article 21 supply chain documentation obligations:

| Field | NIS2 relevance |
|-------|----------------|
| `securityOfficerName/Email` | Article 20 accountability contact |
| `dpoName/Email` | GDPR Art. 37 DPO contact |
| `headquartersLocation` | Jurisdictional risk assessment |
| `sizeClassification` | NIS2 proportionality assessment (SME vs large) |
| `registrationId` | Legal entity verification |

---

## Remediation Workflow

When a vendor has `NON_COMPLIANT` answers, an auditor can trigger remediation notifications:

1. Navigate to the vendor's Assessment Workspace
2. Click **Send Remediation Notice**
3. The system generates a structured email listing the non-compliant controls with remediation guidance
4. A `AI_REMEDIATION_SENT` event is written to the audit log

Remediation emails use the configured mail transport (SMTP / Resend / LOG). See [Mail System](Mail-System).
