# Authentication & Authorization

## Session Architecture

Venshield uses a **stateful cookie-based session** system — no NextAuth, no JWT. Every session is a row in the `AuthSession` table.

### Login Flow

```
POST /api/auth/sign-in
  1. Validate email + password (bcrypt compare)
  2. Check isActive flag
  3. If MFA enabled → set mfa-pending cookie, return { mfaRequired: true }
  4. Create AuthSession row:
       - id = crypto.randomUUID()
       - tokenHash = HMAC-SHA256(token, AUTH_SESSION_SECRET)
      - expiresAt = now + 12 hours
  5. Set HTTP-only, SameSite=Lax session cookie
  6. Write LOGIN_SUCCESS audit event
  7. Return { role, redirectTo }
```

### Session Validation (Middleware)

The Next.js middleware runs on every request in the Edge Runtime. It:

1. Reads the session cookie
2. Verifies the HMAC signature using `AUTH_SESSION_SECRET`
3. Looks up the `AuthSession` row in the database
4. Checks `expiresAt` and `revokedAt`
5. Extracts `{ userId, companyId, vendorId, role }` and passes them as request headers to Server Components

### Logout Flow

```
POST /api/auth/sign-out
  1. Read session cookie
  2. Set revokedAt = now on AuthSession row
  3. Delete session cookie
  4. Write USER_LOGOUT audit event
```

---

## Roles and Permissions

### Role Groups

Three predefined role groups control access at both path and server-action level (`lib/auth/permissions.ts`):

| Group | Members | Purpose |
|-------|---------|---------|
| `ADMIN_ONLY_ROLES` | ADMIN | Settings, user management, non-audit admin routes |
| `INTERNAL_WRITE_ROLES` | ADMIN, RISK_REVIEWER | State-changing server actions (create, update, delete) |
| `INTERNAL_READ_ROLES` | ADMIN, RISK_REVIEWER, AUDITOR | All internal read operations |

### Role Matrix

| Action | ADMIN | RISK_REVIEWER | AUDITOR | VENDOR |
|--------|-------|---------------|---------|--------|
| View dashboard | ✅ | ✅ | ✅ | ❌ |
| View vendors & assessments | ✅ | ✅ | ✅ | ❌ |
| Write vendors & assessments | ✅ | ✅ | ❌ | ❌ |
| Upload evidence documents | ✅ | ✅ | ❌ | ❌ |
| Generate AI summaries | ✅ | ✅ | ❌ | ❌ |
| View audit logs | ✅ | ✅ | ✅ | ❌ |
| Manage users | ✅ | ❌ | ❌ | ❌ |
| Manage settings | ✅ | ❌ | ❌ | ❌ |
| Access vendor portal | ❌ | ❌ | ❌ | ✅ |
| Complete questionnaire | ❌ | ❌ | ❌ | ✅ |

> **RISK_REVIEWER** has internal read + write access but cannot manage users, settings, or the general admin panel. **AUDITOR** is read-only across all internal routes.

### Path-Level Guards (`lib/auth/permissions.ts`)

The middleware enforces path guards before any Server Component renders:

| Path prefix | Allowed roles |
|-------------|---------------|
| `/dashboard` | ADMIN, RISK_REVIEWER, AUDITOR |
| `/dashboard/users` | ADMIN |
| `/vendors` | ADMIN, RISK_REVIEWER, AUDITOR |
| `/settings` | ADMIN |
| `/admin` (general) | ADMIN |
| `/admin/audit-logs` | ADMIN, RISK_REVIEWER, AUDITOR |
| `/external/` | VENDOR |
| `/portal` | VENDOR |
| `/auth/sign-in` | Public |
| `/auth/mfa-setup-required` | Authenticated users pending forced MFA enrollment |
| `/external/mfa-verify` | VENDOR (vendor MFA pending cookie required) |
| `/external/settings/mfa` | VENDOR |

Any role violation results in a `302` redirect — VENDOR to `/external/portal`, internal roles to `/dashboard`.

---

## Multi-Factor Authentication (MFA)

MFA is implemented with **TOTP** (Time-based One-Time Password) via the `otplib` library.

### Setup Flow

1. Admin enables MFA for a user in the admin panel
2. A TOTP secret is generated and encrypted at rest using `MFA_ENCRYPTION_KEY`
3. A QR code URI is generated and shown once to the user for Authenticator app setup
4. User scans the QR code, confirms with a TOTP code

### Login with MFA

1. Password validation succeeds
2. Server detects `mfaEnabled = true`
3. Sets a short-lived `mfa-pending` cookie with a signed pending session ID
4. Client is redirected to the MFA verify page
5. User enters TOTP code from their Authenticator app
6. On success: create full `AuthSession`, clear pending cookie
7. On failure: write `MFA_FAILED_ATTEMPT` audit event

### Secret Storage

TOTP secrets are stored **AES-256-GCM encrypted** in `User.mfaSecret` using the `MFA_ENCRYPTION_KEY` environment variable. The key is never written to logs.

### Recovery Codes

Internal users can generate **10 single-use recovery codes** as a fallback when their Authenticator app is unavailable.

- **Format:** Each code is 128 bits of random entropy displayed as 32 hex characters in four groups of 8 (e.g. `a1b2c3d4-e5f6a7b8-c9d0e1f2-a3b4c5d6`)
- **Storage:** Each code is hashed with **bcrypt cost 10** and stored in `User.mfaRecoveryCodes String[]`; plaintext is never persisted after the initial display
- **Consumption:** Redeemed with an optimistic lock (`updateMany WHERE mfaRecoveryCodes equals currentCodes`) to prevent concurrent double-use
- **Rate limiting:** Recovery code attempts are limited to **3 per 15 minutes** per user (bucket key `rcv:<userId>`)
- **Regeneration:** Users can regenerate a fresh set of 10 codes at **Settings → Security → MFA** after confirming their TOTP code; previous codes are atomically invalidated

**UI:** `components/mfa-settings.tsx` — the recovery code panel is shown only after MFA is enabled.

---

### Admin-Enforced MFA

Admins can force individual users to enroll in MFA before they can access any protected route.

**Schema field:** `User.mfaEnforced Boolean @default(false)`

**Enforcement flow:**

1. An ADMIN toggles **Enforce MFA** for a user in **Settings → Users**
2. Server action `setUserMfaEnforced` sets `User.mfaEnforced = true` (tenant-isolated; requires `ADMIN_ONLY_ROLES` guard)
3. On the user's next login, `internal-auth.ts` detects `mfaEnforced = true` AND `mfaEnabled = false`
4. A short-lived signed cookie `venshield-mfa-setup-pending` (15-minute TTL, HMAC-SHA256) is set
5. User is redirected to `/[locale]/auth/mfa-setup-required`
6. The page (`components/mfa-setup-required-content.tsx`) runs the full TOTP enrollment flow (QR code → confirm → save)
7. Enrollment uses an atomic `updateMany WHERE mfaEnabled=false` to prevent double-enrollment races
8. On success: the setup cookie is cleared and the user continues to their original destination

**SSO bypass:** Users with `user.ssoProviderId` set are **never** redirected to the forced-setup page — their MFA is managed by the identity provider.

---

### Org-Wide MFA Policy

Administrators can require MFA for **all users** in their organisation (including vendor portal users).

**Schema field:** `Company.mfaRequired Boolean @default(false)`

**Configuration:** Navigate to **Settings → Security → Organisation MFA Policy** and toggle **Require MFA for all users** (`components/org-mfa-policy-form.tsx`).

The server action `setOrgMfaRequired` first verifies that `admin.mfaEnabled = true` — an admin cannot enable org-wide MFA while they themselves do not have MFA active (self-lockout guard).

**Runtime check:** `Company.mfaRequired` is checked at login time in both `internal-auth.ts` and `vendor-auth.ts`. If the flag is `true` and a user does not yet have MFA enabled, the login is rejected with a `MFA_REQUIRED` response, directing the user to enable MFA before their next sign-in attempt.

---

### Vendor TOTP (MFA for Vendor Portal Users)

Vendor portal users can enroll in — and as a result of org-wide policy be required to use — TOTP-based MFA.

**Login flow with vendor MFA:**

1. Vendor submits credentials at the portal login page
2. `vendor-auth.ts` checks `user.mfaEnabled`
3. If enabled: sets a short-lived signed cookie `venshield-vendor-mfa-pending` (5-minute TTL, HMAC-SHA256) and returns `{ mfaRequired: true }`
4. Client is redirected to `/[locale]/external/mfa-verify`
5. Vendor enters TOTP code or recovery code (`components/vendor-mfa-verify-form.tsx`)
6. On success: a `VENDOR`-role `AuthSession` is created and `venshield-vendor-mfa-pending` is cleared
7. Vendor is redirected to `/[locale]/external/assessment`

Vendors can self-enroll at `/[locale]/external/settings/mfa`. Recovery codes are equally available to vendor users.

---

## Vendor Authentication

Vendors authenticate via a separate flow — they do **not** have platform accounts by default.

### Invite-Token Flow (Recommended)

1. Admin clicks **Send Invite** for a vendor
2. Server generates a cryptographically random invite token and sends an email containing a one-time setup link (`/[locale]/vendor/accept-invite?token=<plain-hex-token>`)
3. Vendor opens the setup page and creates their own password
4. Invite token is redeemed exactly once and expires after 48 hours
5. Subsequent logins via `/external/portal` use Access Code + password

### Vendor Password Setup Page

When a vendor is invited, they receive an email with a one-time setup link:
`/[locale]/vendor/accept-invite?token=<plain-hex-token>`

The page:
- Is publicly accessible (no session required)
- Accepts the token from the URL via a Server Component, then strips it from the browser URL using `history.replaceState` on mount
- Validates: token must exist in DB as a SHA-256 hash match, must not be expired (48h), must not already be redeemed
- Uses a Serializable transaction with `SELECT ... FOR UPDATE` to prevent concurrent redemption (TOCTOU prevention)
- On success: sets `Vendor.passwordHash` (bcrypt cost >=10), clears `setupToken` and `setupTokenExpires`
- Audit event: `VENDOR_INVITE_ACCEPTED`

### Internal User Invite Page

When an Admin creates an internal user (Admin/Auditor role), the user receives an invite email:
`/[locale]/auth/accept-invite?token=<plain-hex-token>`

The page follows the same token-validation pattern as the Vendor Password Setup Page.
- User is created with `isActive: false`, `passwordHash: null` until invite is accepted
- On acceptance: `isActive: true`, `passwordHash` set, token cleared
- Existing unactivated users (no `passwordHash`) get a new token on re-invite rather than an error
- Audit event: `USER_INVITE_ACCEPTED`

---

## Password Security

- Passwords hashed with **bcrypt** at cost factor 12 (`bcryptjs`)
- Minimum length and complexity enforced by Zod validation schemas
- Admins can trigger a forced password reset for any vendor

---

## Rate Limiting

Login endpoints are protected by an in-process consecutive-failure rate limiter:

- Tracks failures per IP address and per email
- After N consecutive failures, the key is blocked for a configurable duration
- Capacity-capped with FIFO eviction and a cleanup interval

> **Note:** For multi-replica production deployments, replace the in-process store with a Redis-backed store to share state across instances.

---

## SSO / OIDC Single Sign-On (Premium)

> **Premium plan feature.** SSO requires a Premium subscription. See the [Enterprise Features](Enterprise-Features.md) page for a full capability overview.

Venshield supports **OpenID Connect (OIDC)** single sign-on, allowing organisations to authenticate internal users through their existing identity provider (IdP) — such as Microsoft Entra ID, Okta, Keycloak, Auth0, or any standards-compliant OIDC provider.

### Configuration

Admins configure SSO at **Settings → SSO**. The following fields are required:

| Field | Description |
|-------|-------------|
| Issuer URL | The OIDC issuer discovery URL provided by your IdP (e.g. `https://login.microsoftonline.com/{tenant}/v2.0`) |
| Client ID | OAuth2 client identifier from your IdP |
| Client Secret | OAuth2 client secret — stored encrypted at rest |
| Enable SSO | Toggle to activate the OIDC flow for this company |
| JIT Provisioning | Auto-create new users on first SSO login |
| Allowed Email Domains | Optional domain allowlist for JIT provisioning (e.g. `example.com`) |

The issuer URL is validated for safety before saving. The connection to the IdP is tested automatically during save.

### Login Flow

1. User visits `/auth/sso` and enters their work email address
2. Venshield looks up the configured IdP for the user's company and redirects the browser to the provider's authorisation endpoint
3. User authenticates with the IdP
4. IdP redirects back to Venshield; Venshield validates the response, verifies the identity token, and creates a session
5. User is redirected to the dashboard

### JIT Provisioning

When JIT provisioning is enabled, users who authenticate via SSO for the first time are automatically created:

- Role assigned: **AUDITOR** (read-only internal access)
- Email domain validated against the allowed-domains list (if configured)
- User is permanently linked to their IdP identity; an ADMIN can promote them to RISK_REVIEWER or ADMIN at any time

### Audit Events

| Event | When it fires |
|-------|---------------|
| `SSO_LOGIN_SUCCESS` | Successful SSO login |
| `SSO_LOGIN_FAILED` | Any failure in the SSO flow |
| `SSO_USER_PROVISIONED` | A new user was created via JIT provisioning |

All events are written to the tamper-evident audit log with category `AUTH`.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `OIDC_STATE_SECRET` | HMAC key for SSO state validation (≥32 chars, always required even without SSO) |
| `SETTINGS_ENCRYPTION_KEY` | AES-256-GCM key for encrypting the OIDC client secret at rest |
