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

### Role Matrix

| Action | ADMIN | AUDITOR | VENDOR |
|--------|-------|---------|--------|
| View dashboard | ✅ | ✅ | ❌ |
| Manage vendors (CRUD) | ✅ | ❌ | ❌ |
| Run assessments | ✅ | ✅ | ❌ |
| Override assessment answers | ✅ | ✅ | ❌ |
| Upload evidence documents | ✅ | ✅ | ❌ |
| Generate AI summaries | ✅ | ✅ | ❌ |
| View audit logs | ✅ | ✅ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| Manage settings | ✅ | ✅ | ❌ |
| Access vendor portal | ❌ | ❌ | ✅ |
| Complete questionnaire | ❌ | ❌ | ✅ |

### Path-Level Guards (`lib/auth/permissions.ts`)

The middleware enforces path guards before any Server Component renders:

| Path prefix | Allowed roles |
|-------------|---------------|
| `/dashboard` | ADMIN, AUDITOR |
| `/vendors` | ADMIN, AUDITOR |
| `/settings` | ADMIN, AUDITOR |
| `/admin` | ADMIN (audit-logs: also AUDITOR) |
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
