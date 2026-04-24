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
| `/[locale]/external/mfa-verify` | MFA verification step during vendor login (TOTP code or recovery code) |
| `/[locale]/external/assessment` | Questionnaire workspace |
| `/[locale]/external/settings/mfa` | Vendor MFA self-enrollment, QR code setup, and recovery code management |
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

## Multi-Factor Authentication

Venshield's TOTP-based MFA is available to vendor portal users independently of internal user MFA. All vendor MFA features are self-service — no admin action is required for enrollment beyond optionally enforcing MFA at the organisation level.

### Self-Enrollment

Vendors can enable MFA at any time by navigating to **Settings → MFA** (`/external/settings/mfa`):

1. A TOTP secret is generated server-side and encrypted at rest using `MFA_ENCRYPTION_KEY` (AES-256-GCM).
2. A QR code URI is shown once — the vendor scans it with any TOTP Authenticator app (Google Authenticator, Aegis, 1Password, etc.).
3. The vendor confirms enrollment with a one-time code.
4. Ten single-use recovery codes are generated (128-bit, bcrypt-10 hashed). Store them securely — they are displayed only once.

### Login Flow (MFA Enabled)

1. Vendor enters access code and password.
2. `vendor-auth.ts` detects `mfaEnabled = true`.
3. A short-lived `venshield-vendor-mfa-pending` cookie is set (5-minute TTL, HMAC-SHA256 signed).
4. The vendor is redirected to `/external/mfa-verify`.
5. The vendor enters their TOTP code (or a recovery code to consume one of their ten single-use codes).
6. On success: the pending cookie is cleared, a full `VENDOR`-role `AuthSession` is created, and the vendor is redirected to the portal.
7. On failure: a `MFA_FAILED_ATTEMPT` audit event is written.

### Recovery Codes

- 10 codes generated at enrollment, regeneratable at any time from the MFA settings page (requires a valid TOTP confirmation).
- Each code is single-use — consumed codes are removed atomically.
- Rate-limited: 3 recovery-code attempts per 15 minutes per vendor account.

### Org-Wide MFA Policy

If an organisation administrator has enabled the **Require MFA for all users** policy (`Company.mfaRequired = true`), vendors without MFA enabled are blocked at the login step and directed to enroll before accessing the portal.

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
