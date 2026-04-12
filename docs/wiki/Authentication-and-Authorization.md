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

> **SUPER_ADMIN** has the same path-level rights as ADMIN and is intended for platform-level cross-company administration. **RISK_REVIEWER** has internal read + write access but cannot manage users, settings, or the general admin panel. **AUDITOR** is read-only across all internal routes.

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

---

## Vendor Authentication

Vendors authenticate via a separate flow — they do **not** have platform accounts by default.

### Invite-Token Flow (Recommended)

1. Admin clicks **Send Invite** for a vendor
2. Server generates a cryptographically random invite token and sends an email containing a one-time invite link
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

> **Premium plan feature.** SSO requires a Premium subscription. See the [Enterprise Features](Enterprise-Features) page for a full capability overview.

Assessly supports **OpenID Connect (OIDC)** single sign-on, allowing organisations to authenticate internal users through their existing identity provider (IdP) — such as Microsoft Entra ID, Okta, Keycloak, Auth0, or any standards-compliant OIDC provider.

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
2. Assessly looks up the configured IdP for the user's company and redirects the browser to the provider's authorisation endpoint
3. User authenticates with the IdP
4. IdP redirects back to Assessly; Assessly validates the response, verifies the identity token, and creates a session
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
