# Authentication & Authorization

## Session Architecture

Assessly uses a **stateful cookie-based session** system — no NextAuth, no JWT. Every session is a row in the `AuthSession` table.

### Login Flow

```
POST /api/auth/sign-in
  1. Validate email + password (bcrypt compare)
  2. Check isActive flag
  3. If MFA enabled → set mfa-pending cookie, return { mfaRequired: true }
  4. Create AuthSession row:
       - id = crypto.randomUUID()
       - tokenHash = HMAC-SHA256(token, AUTH_SESSION_SECRET)
       - expiresAt = now + 7 days
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
| `ADMIN_ONLY_ROLES` | SUPER_ADMIN, ADMIN | Settings, user management, non-audit admin routes |
| `INTERNAL_WRITE_ROLES` | SUPER_ADMIN, ADMIN, RISK_REVIEWER | State-changing server actions (create, update, delete) |
| `INTERNAL_READ_ROLES` | SUPER_ADMIN, ADMIN, RISK_REVIEWER, AUDITOR | All internal read operations |

### Role Matrix

| Action | SUPER_ADMIN | ADMIN | RISK_REVIEWER | AUDITOR | VENDOR |
|--------|-------------|-------|---------------|---------|--------|
| View dashboard | ✅ | ✅ | ✅ | ✅ | ❌ |
| View vendors & assessments | ✅ | ✅ | ✅ | ✅ | ❌ |
| Write vendors & assessments | ✅ | ✅ | ✅ | ❌ | ❌ |
| Upload evidence documents | ✅ | ✅ | ✅ | ❌ | ❌ |
| Generate AI summaries | ✅ | ✅ | ✅ | ❌ | ❌ |
| View audit logs | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manage users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| Access vendor portal | ❌ | ❌ | ❌ | ❌ | ✅ |
| Complete questionnaire | ❌ | ❌ | ❌ | ❌ | ✅ |

> **SUPER_ADMIN** has the same path-level rights as ADMIN and is intended for platform-level cross-company administration. **RISK_REVIEWER** has internal read + write access but cannot manage users, settings, or the general admin panel. **AUDITOR** is read-only across all internal routes. `RISK_REVIEWER` is not shown in the internal user creation form — it must be assigned directly.

### Path-Level Guards (`lib/auth/permissions.ts`)

The middleware enforces path guards before any Server Component renders:

| Path prefix | Allowed roles |
|-------------|---------------|
| `/dashboard` | SUPER_ADMIN, ADMIN, RISK_REVIEWER, AUDITOR |
| `/dashboard/users` | SUPER_ADMIN, ADMIN |
| `/vendors` | SUPER_ADMIN, ADMIN, RISK_REVIEWER, AUDITOR |
| `/settings` | SUPER_ADMIN, ADMIN |
| `/admin` (general) | SUPER_ADMIN, ADMIN |
| `/admin/audit-logs` | SUPER_ADMIN, ADMIN, RISK_REVIEWER, AUDITOR |
| `/external/` | VENDOR |
| `/portal` | VENDOR |
| `/auth/sign-in` | Public |

Any role violation results in a `302` redirect — VENDOR to `/external/portal`, internal roles to `/dashboard`.

---

## Multi-Factor Authentication (MFA)

MFA is implemented with **TOTP** (Time-based One-Time Password) via the `otplib` library.

### Setup Flow

1. Admin enables MFA for a user in the admin panel
2. A TOTP secret is generated: `generateTotpSecret()`
3. The secret is encrypted with AES-256-GCM: `encryptMfaSecret(secret)` using `MFA_ENCRYPTION_KEY`
4. The encrypted secret is stored in `User.mfaSecret`
5. A QR code URI is generated and shown once to the user for Authenticator app setup
6. User scans the QR code, confirms with a TOTP code → `verifySync(token, secret)`

### Login with MFA

1. Password validation succeeds
2. Server detects `mfaEnabled = true`
3. Sets a short-lived `mfa-pending` cookie with a signed pending session ID
4. Client is redirected to the MFA verify page
5. User enters TOTP code from their Authenticator app
6. `POST /api/auth/mfa-verify` decrypts the TOTP secret and calls `verifySync`
7. On success: create full `AuthSession`, clear pending cookie
8. On failure: write `MFA_FAILED_ATTEMPT` audit event

### Secret Storage

TOTP secrets are stored **AES-256-GCM encrypted** in `User.mfaSecret` using the `MFA_ENCRYPTION_KEY` environment variable (32 bytes / 64 hex characters). The key is never written to logs. In development, a deterministic fallback key is used and a warning is emitted.

---

## Vendor Authentication

Vendors authenticate via a separate flow — they do **not** have platform accounts by default.

### Invite-Token Flow (Recommended)

1. Admin clicks **Send Invite** for a vendor
2. Server generates a cryptographically random `inviteToken` (stored hashed) and sends an email containing a one-time invite link
3. Vendor clicks the link → lands on `/external/force-password-change`
4. Vendor sets a password; `isFirstLogin` is cleared
5. Subsequent logins via `/external/portal` use email + password

### Access-Code Flow (Legacy)

1. Admin generates a short access code for the vendor
2. Vendor enters the code on the portal login page
3. After successful entry, a VENDOR-role `AuthSession` is created

---

## Password Security

- Passwords hashed with **bcrypt** at cost factor 12 (`bcryptjs`)
- Minimum length and complexity enforced by Zod validation schemas
- Vendors are forced to change their password on first login (`isFirstLogin = true`)
- Admins can trigger a forced password reset for any vendor (`vendor-force-reset-password.ts`)

---

## Rate Limiting

Login endpoints are protected by an in-process consecutive-failure rate limiter (`lib/rate-limit.ts`):

- Tracks failures per IP address (and per email for brute-force on specific accounts)
- After N consecutive failures, the key is blocked for a configurable duration
- Store is pinned to `globalThis` to survive Next.js HMR reloads in development
- Capacity-capped at 100,000 entries with FIFO eviction
- Cleanup interval runs every 5 minutes

> **Note:** For multi-replica production deployments, replace the in-process Map with a Redis-backed store to share state across instances.

---

## OIDC / Single Sign-On

> **Premium plan feature.** SSO requires a Premium subscription. Attempting to configure or use SSO on the Free plan will not be permitted.

Assessly supports **OIDC 1.0** (OpenID Connect) single sign-on, allowing organisations to authenticate internal users via their own identity provider (IdP) — such as Okta, Azure AD, Keycloak, or any standards-compliant OIDC provider.

### Architecture

| Component | Location |
|-----------|----------|
| Login page | `app/[locale]/auth/sso/page.tsx` |
| Login initiation (server action) | `app/actions/oidc-auth.ts` → `initiateOidcLogin()` |
| OIDC client library | `lib/oidc/client.ts` (openid-client v6) |
| State cookie | `lib/oidc/state-cookie.ts` |
| SSRF guard | `lib/oidc/ssrf-guard.ts` |
| Config retrieval | `lib/oidc/config.ts` |
| Callback handler | `app/api/auth/oidc/callback/route.ts` |
| Settings page (admin) | `app/[locale]/settings/sso/page.tsx` |
| Settings action | `app/actions/oidc-settings.ts` → `saveOidcSettings()` |

### Configuration (Admin UI)

Admins configure SSO at **Settings → SSO**. The following fields are required:

| Field | Description |
|-------|-------------|
| Issuer URL | The OIDC issuer discovery URL (e.g. `https://accounts.google.com`) |
| Client ID | OAuth2 client identifier from your IdP |
| Client Secret | OAuth2 client secret — stored AES-256-GCM encrypted in `OidcConfig.clientSecretEncrypted` |
| Enable SSO | Toggle to activate the OIDC flow for this company |
| JIT Provisioning | Auto-create new users on first SSO login |
| Allowed Email Domains | Optional allowlist for JIT provisioning (e.g. `example.com`) |

The issuer URL is validated against SSRF-safe discovery before saving. The connection to the IdP is tested automatically during save.

### Login Flow

```
1. User visits /auth/sso and enters their work email
2. initiateOidcLogin() server action:
  a. Rate-limited (8 failures / 10 min)
  b. Looks up user's company via email domain
  c. Fetches and decrypts OidcConfig for the company
  d. Discovers OIDC provider metadata (SSRF-safe fetch)
  e. Generates PKCE verifier (64 random bytes, S256 code challenge)
  f. Generates 32-byte state + 32-byte nonce (base64url)
  g. Sets assessly-oidc-state cookie (HMAC-SHA256, TTL 10 min)
  h. Returns authorization URL for browser redirect
3. Browser redirects to the IdP authorization endpoint
4. User authenticates with IdP
5. IdP redirects back to /api/auth/oidc/callback with code + state
6. Callback handler:
  a. Validates state cookie (HMAC, expiry, type)
  b. Exchanges authorization code for ID token (PKCE verification)
  c. Validates ID token (signature, nonce, email_verified claim)
  d. Looks up user by ssoProviderId, falls back to email
  e. If JIT provisioning enabled and user not found → creates user (role=AUDITOR)
  f. Creates AuthSession, sets session cookie
  g. Clears OIDC state cookie
  h. Writes audit event (SSO_LOGIN_SUCCESS)
  i. Redirects to dashboard
```

### JIT (Just-in-Time) Provisioning

When `jitProvisioning = true`, users who authenticate via SSO for the first time are automatically created:

- Role assigned: `AUDITOR` (read-only internal access)
- Email domain validated against `jitAllowedEmailDomains` (if the list is non-empty)
- `ssoProviderId` (the OIDC `sub` claim) stored for future logins — immutable link
- Audit event `SSO_USER_PROVISIONED` written

### Security Controls

| Control | Implementation |
|---------|----------------|
| PKCE | S256 code challenge; verifier never sent over the network after initiation |
| State + Nonce | 32 random bytes each; HMAC-signed in cookie; validated on callback |
| SSRF protection | `createSsrfSafeFetch()` blocks private IP ranges and localhost for IdP discovery |
| Client secret at rest | AES-256-GCM encrypted using `SETTINGS_ENCRYPTION_KEY` |
| Rate limiting | 8 failures / 10 minutes on `initiateOidcLogin()` |
| `email_verified` | Callback rejects ID tokens where `email_verified` is false |
| State cookie TTL | 10 minutes (`assessly-oidc-state`) |

### Audit Events

| Event | Trigger |
|-------|---------|
| `SSO_LOGIN_SUCCESS` | Successful SSO login |
| `SSO_LOGIN_FAILED` | Any failure in the SSO flow (with `errorCode`) |
| `SSO_USER_PROVISIONED` | JIT provisioning created a new user |

All events are written to the tamper-evident `AuditLog` with `complianceCategory = AUTH`.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `OIDC_STATE_SECRET` | HMAC key for the OIDC state cookie (≥32 chars, always required) |
| `SETTINGS_ENCRYPTION_KEY` | AES-256-GCM key for encrypting the OIDC client secret (64 hex chars) |

The OIDC client secret is stored encrypted in the database — you do **not** need a separate env var for it after initial setup via the admin UI.
