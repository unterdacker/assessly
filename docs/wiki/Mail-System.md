# Mail System

## Overview

The mail system supports three delivery strategies and resolves configuration in a priority order that allows per-organisation overrides without redeployment.

---

## Strategy Resolution Order

```
1. SystemSettings (database row, id = "singleton")
   └── If mailStrategy ≠ LOG → use DB config (takes precedence)

2. Environment variables (fallback)
   MAIL_STRATEGY, MAIL_FROM, SMTP_*, RESEND_API_KEY
```

This means admins can change mail settings via **Settings → Mail** without restarting the container.

---

## Delivery Strategies

### `SMTP`

Uses the `nodemailer` library with a configurable SMTP relay.

Required settings:
| Field | Description |
|-------|-------------|
| `smtpHost` | SMTP server hostname |
| `smtpPort` | Default `587` (STARTTLS) |
| `smtpUser` | SMTP authentication username |
| `smtpPassword` | Password — stored **AES-256-GCM encrypted** in DB |

### `RESEND`

Uses the Resend SDK (`resend`). A good choice for organisations that want a simple API-based transactional mail service hosted in the EU.

Required settings:
| Field | Description |
|-------|-------------|
| `resendApiKey` | Resend API key — stored **AES-256-GCM encrypted** in DB |

### `LOG` (Default)

Prints the email content (recipient, subject, HTML body) to `stdout`. No mail is actually sent. Safe for development and testing.

### `MAILHOG` (Local dev SMTP trap — Mailpit)

Routes email to a local [Mailpit](https://github.com/axllent/mailpit) container via
SMTP on port 1025. All captured messages are visible in the Mailpit web UI at
`http://localhost:8025`. No email is delivered to real recipients.

> **Security constraints**
> - Opt-in only: requires `MAIL_STRATEGY=mailhog` explicitly. Never inferred from `NODE_ENV`.
> - **Blocked at runtime** when `NODE_ENV=production` — falls back to `log`.
> - Docker ports are bound to `127.0.0.1` only (not exposed to the network).
> - Inbox is **ephemeral** — all messages are lost on container restart.

Required environment variables:
| Variable | Default (host-only dev) | Docker Compose default |
|---|---|---|
| `MAILHOG_SMTP_HOST` | `localhost` | `assessly-mailpit` (auto-set) |
| `MAILHOG_SMTP_PORT` | `1025` | `1025` (auto-set) |

---

## Email Templates

Email templates are React components in `components/emails/`:

| Template | Description |
|----------|-------------|
| `vendor-invite.ts` | Invitation email sent to a new vendor with their one-time invite link |

Templates produce HTML with inline styles for maximum email client compatibility.

---

## Invitation Flow

1. Admin navigates to a vendor and clicks **Send Invite**
2. `send-invite.ts` action:
   - Generates a secure `inviteToken` (cryptographically random, stored hashed)
   - Sets `inviteTokenExpires` to 7 days from now
   - Sends an email via the configured mail strategy containing:
     - A link to `/external/force-password-change?token=<inviteToken>`
     - Vendor name and organisation name
3. The vendor clicks the link → forced to set a password
4. An `INVITE_SENT` audit event is written

### Refreshing an invite

If the invite expires or the vendor requests a new link, the admin uses **Refresh Invite**:
- A new `inviteToken` is generated
- The previous token is invalidated
- A `VENDOR_INVITE_REFRESHED` audit event is written

---

## Mail Configuration via Admin UI

Accessible at **Settings → Mail** (ADMIN and AUDITOR roles):

1. Select strategy: SMTP / Resend / Log
2. Enter sender address and display name
3. Enter SMTP or Resend credentials
4. Save — credentials are encrypted before DB write (never stored in plaintext)
5. Send a test email to verify the configuration

---

## Environment Variable Fallback

If the SystemSettings row has `mailStrategy = LOG` (the default), these environment variables are used:

```env
MAIL_STRATEGY=smtp          # smtp | resend | log | mailhog
MAIL_FROM="Assessly <noreply@yourdomain.com>"
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=your_smtp_password
# or:
RESEND_API_KEY=re_your_resend_key
```

### Local dev trap (Mailpit)

```env
MAIL_STRATEGY=mailhog
MAILHOG_SMTP_HOST=localhost    # or assessly-mailpit inside Docker Compose
MAILHOG_SMTP_PORT=1025
```

Start Mailpit: `docker compose up mailpit`
View captured mail at: `http://localhost:8025`
