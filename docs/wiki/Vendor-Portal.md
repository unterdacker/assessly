# Vendor Portal

## Overview

The vendor portal is a separate, isolated section of the application accessible only to users with the `VENDOR` role. It allows vendors to:

- Complete the 20-question NIS2 security questionnaire
- Upload supporting evidence (security policy PDF, etc.)
- View their assessment status

Vendors cannot access any part of the internal application (dashboard, other vendor data, audit logs, settings).

---

## Access Flow

### Invite-Token Flow (Primary)

```
Admin → Send Invite
    └── Server generates inviteToken (random, hashed in DB)
    └── Email sent to vendor: /en/external/force-password-change?token=<token>

Vendor → clicks link
    └── /en/external/force-password-change
    └── Validates token (checks hash, checks expiry)
    └── Vendor sets new password
    └── isFirstLogin cleared
    └── Vendor redirected to /en/external/portal
```

### Portal Login

URL: `/en/external/portal` (or `/de/external/portal`)

1. Vendor enters their email and password
2. `POST /api/auth/sign-in` with vendor credentials
3. A `VENDOR`-role `AuthSession` is created
4. Vendor is redirected to `/en/external/assessment`

---

## Portal Routes

| Route | Description |
|-------|-------------|
| `/[locale]/external/portal` | Login page |
| `/[locale]/external/force-password-change` | First-login password setup |
| `/[locale]/external/assessment` | Questionnaire workspace |
| `/[locale]/external/exit` | Logout / session end |

---

## Questionnaire Workspace

The vendor-facing questionnaire (`ExternalAssessmentWorkspace` component) presents the 20 NIS2 questions grouped by category. For each question, the vendor can:

- Select a status (`COMPLIANT`, `NON_COMPLIANT`, `PARTIAL`, `NA`)
- Write a free-text justification
- Upload a per-question evidence file

Progress is saved automatically as the vendor fills in each answer. The questionnaire can be completed across multiple sessions.

---

## Answer Submission

The `update-external-answer.ts` server action handles vendor answer submissions:

1. Validates session (VENDOR role, correct vendor)
2. Validates inputs with Zod
3. Upserts `AssessmentAnswer` row
4. Recalculates `complianceScore` and `riskLevel` on the `Assessment`
5. Writes `EXTERNAL_ASSESSMENT_UPDATED` audit event

---

## Evidence Upload

Vendors can upload one PDF evidence file per question via the `upload-answer-evidence.ts` action:

1. File type validated (PDF only)
2. File size validated (max configurable)
3. Stored in `.venshield-storage/` with a sanitised filename
4. `Document` record created (append-only)
5. `AssessmentAnswer.evidenceFileUrl` updated to point to the document

---

## Session Isolation

Vendor sessions are strictly isolated:

- `AuthSession.vendorId` is set at login time
- All server actions verify that `session.vendorId === vendor.id`
- A vendor cannot access another vendor's assessment even if they guess the URL
- The middleware blocks all `VENDOR` role access to `/dashboard`, `/vendors`, `/admin`, `/settings`

---

## Exit Portal

`/api/exit-portal` terminates a vendor session:

1. Reads the session cookie
2. Sets `revokedAt` on the `AuthSession` row
3. Clears the cookie
4. Returns a redirect to the portal login page

This is separate from the internal logout endpoint to ensure vendor sessions cannot accidentally access the internal sign-in page.

---

## Vendor Profile Editing

Through the internal application (not the vendor portal), auditors can edit vendor master-data profiles via the `EditVendorProfileModal` component. This includes all NIS2-relevant fields (security officer, DPO, headquarters, etc.).

Vendors themselves do not edit their own profile — they only complete the questionnaire.
