# Environment Variables Reference

All environment variables are validated at startup by `lib/env.ts` using Zod. In production (`NODE_ENV=production`), missing or placeholder values cause a fatal error.

---

## Required Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/venshield?schema=public` | PostgreSQL connection string. Must begin with `postgresql://` or `postgres://` |

---

## Security Secrets

All secrets must be generated with `crypto.randomBytes()`. Never use placeholder values in production.

| Variable | Length | Generate Command | Description |
|----------|--------|-----------------|-------------|
| `AUTH_SESSION_SECRET` | 128 hex chars | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` | HMAC-SHA256 key for session cookie signing. Legacy alias: `NEXTAUTH_SECRET` (lower priority) |
| `OIDC_STATE_SECRET` | ≥32 chars | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | **Required in all environments.** HMAC key for OIDC state parameter signing (prevents CSRF on SSO callbacks) |
| `SETTINGS_ENCRYPTION_KEY` | 64 hex chars | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | AES-256-GCM key for encrypting SMTP passwords and API keys at rest |
| `MFA_ENCRYPTION_KEY` | 64 hex chars | Same as above | AES-256-GCM key for encrypting TOTP secrets at rest |
| `STORAGE_ENCRYPTION_KEY` | 64 hex chars | Same as above | AES-256-GCM key for encrypting uploaded evidence files at rest in `.venshield-storage/` |
| `AUDIT_BUNDLE_SECRET` | 64 hex chars | Same as above | HMAC-SHA256 key for signing forensic audit bundle exports |
| `AUDIT_EXPORT_KEY` | 64 hex chars | Same as above | Key for audit export operations |
| `AUDIT_PSEUDONYMIZATION_KEY` | 64 hex chars | Same as above | HMAC key for deterministic GDPR pseudonymisation |
| `CRON_SECRET` | 64 hex chars | Same as above | Bearer token for `/api/cron/*` endpoints |

---

## Application URL

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public-facing application URL. **Must be `https://`** in production |
| `APP_URL` | — | **Required.** Internal server-side application URL used in OIDC callbacks and server-to-server requests. Must be a valid URL. Must be `https://` in production |
| `NODE_ENV` | `development` | Set to `production` for production deployments |
| `ALLOW_INSECURE_LOCALHOST` | `false` | Set to `true` ONLY in Docker Compose / CI when running on `http://localhost` with `NODE_ENV=production`. Never in a real deployment |

---

## AI Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PROVIDER` | `local` | `local` (Ollama) or `mistral` (Mistral AI cloud) |
| `LOCAL_AI_ENDPOINT` | `http://localhost:11434` | Ollama HTTP API base URL. Inside Docker: `http://host.docker.internal:11434` |
| `LOCAL_AI_MODEL` | `ministral-3:8b` | Ollama model name to use |
| `MISTRAL_API_KEY` | — | Mistral AI API key (required when `AI_PROVIDER=mistral`). Also configurable per-company in the admin UI |

---

## Mail

| Variable | Default | Description |
|----------|---------|-------------|
| `MAIL_STRATEGY` | `log` | `smtp` \| `resend` \| `log` \| `mailpit`. `mailpit` routes to a local Mailpit SMTP trap and is **blocked at runtime if `NODE_ENV=production`**. `mailhog` is accepted as a backward-compat alias for `mailpit`. Overridden by SystemSettings DB row when set |
| `MAIL_FROM` | `Venshield <noreply@venshield.local>` | Sender address and display name |
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP authentication username |
| `SMTP_PASSWORD` | — | SMTP password (plaintext in env var; stored encrypted in DB when configured via UI) |
| `RESEND_API_KEY` | — | Resend API key |
| `MAIL_COMPANY_NAME` | `Venshield` | Company display name injected into email templates |
| `MAILPIT_SMTP_HOST` | `localhost` | Mailpit SMTP hostname. Must be a plain hostname (no `http://` prefix). Docker Compose overrides this to `venshield-mailpit` |
| `MAILPIT_SMTP_PORT` | `1025` | Mailpit SMTP port (1–65535). Consumers should `parseInt()` this value |
| `MAILHOG_SMTP_HOST` | `localhost` | Backward-compat alias for `MAILPIT_SMTP_HOST`. Prefer `MAILPIT_SMTP_HOST` in new setups |
| `MAILHOG_SMTP_PORT` | `1025` | Backward-compat alias for `MAILPIT_SMTP_PORT`. Prefer `MAILPIT_SMTP_PORT` in new setups |

> The Mailpit web UI is accessible at `http://localhost:8025` when running the Docker Compose stack. All captured messages are ephemeral and lost on container restart.

---

## Storage (S3-Compatible — Optional)

The application stores uploaded PDF evidence files on the **local filesystem** under `.venshield-storage/`. The S3 adapter (`lib/storage.ts`) is available for organisations that wish to migrate to an S3-compatible object store, but it has no active callers in the current release — the local filesystem remains the active storage layer.

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_ENDPOINT` | — | S3-compatible endpoint URL. Must be `https://` in production (validated at startup). Example: `https://s3.eu-central-1.amazonaws.com` |
| `S3_REGION` | — | AWS region or equivalent. Example: `eu-central-1` |
| `S3_BUCKET` | — | Bucket name for document storage |
| `S3_ACCESS_KEY_ID` | — | Access key ID. Placeholder values (`change-me`, etc.) are rejected at startup in production |
| `S3_SECRET_ACCESS_KEY` | — | Corresponding secret access key |
| `S3_FORCE_PATH_STYLE` | `false` | Set to `true` for MinIO and other path-style S3-compatible endpoints |

---

## SMS

SMS delivery is used to send temporary passwords during vendor onboarding. Provider selection and GDPR pseudonymisation are controlled by environment variables.

| Variable | Default | Description |
|----------|---------|-------------|
| `SMS_PROVIDER` | `log` | `log` \| `46elks` \| `sinch` \| `infobip`. `log` simulates delivery (prints a masked phone number to stdout; message body is always redacted). **Blocked in production** unless `ALLOW_INSECURE_LOCALHOST=true` — see note below |
| `SMS_PSEUDONYM_KEY` | — | HMAC-SHA256 key (≥32 chars) for pseudonymising phone numbers in `VendorSmsLog`. Raw phone numbers are never stored — only `HMAC(phone, key)`. **Required in production when `SMS_PROVIDER` is not `log`**. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

> **`SMS_PROVIDER=log` in production:** `SMS_PROVIDER=log` with `NODE_ENV=production` causes a fatal startup error **unless `ALLOW_INSECURE_LOCALHOST=true`** is also set. When that escape hatch is active, `log` is permitted and SMS codes are silently dropped (console simulation only, no real delivery). This override is intended exclusively for Docker Compose / CI environments — it must never appear in a real production deployment.

> **`SMS_PSEUDONYM_KEY` rotation warning:** Rotating or losing this key severs the HMAC linkage between `VendorSmsLog` entries and original phone numbers. Existing pseudonyms become irrecoverable, creating a GDPR obligation to re-pseudonymise affected log entries with the new key or purge them entirely. Treat this key with the same care as `AUDIT_PSEUDONYMIZATION_KEY`.

### 46elks (`SMS_PROVIDER=46elks`)

Sweden-based, GDPR-compliant EU provider. No SDK dependency — uses the 46elks REST API directly.

| Variable | Required | Description |
|----------|----------|-------------|
| `ELKS_API_USERNAME` | Yes | 46elks API username |
| `ELKS_API_PASSWORD` | Yes | 46elks API password |
| `ELKS_FROM` | No | Sender name (alphanumeric, max 11 chars) or E.164 number. Defaults to `Venshield` |

### Sinch (`SMS_PROVIDER=sinch`)

Sweden-based, GDPR-compliant EU provider.

| Variable | Required | Description |
|----------|----------|-------------|
| `SINCH_SERVICE_PLAN_ID` | Yes | Sinch service plan ID |
| `SINCH_API_TOKEN` | Yes | Sinch API token |
| `SINCH_FROM` | Yes | E.164 sender number provisioned in the Sinch dashboard |

### Infobip (`SMS_PROVIDER=infobip`)

Croatia/EU-based, GDPR-compliant provider.

| Variable | Required | Description |
|----------|----------|-------------|
| `INFOBIP_API_KEY` | Yes | Infobip API key |
| `INFOBIP_BASE_URL` | Yes | Personal base URL, format `https://<region>.api.infobip.com`. Only Infobip-owned domains are accepted (validated at startup) |
| `INFOBIP_FROM` | No | Sender name or alphanumeric ID. Defaults to `Venshield` |

---

## Cron

| Variable | Description |
|----------|-------------|
| `CRON_SECRET` | Bearer token required by all `/api/cron/*` route handlers. Generate a 64-hex-char random string |

---

## Telemetry

| Variable | Value | Description |
|----------|-------|-------------|
| `NEXT_TELEMETRY_DISABLED` | `1` | Disables Next.js anonymous telemetry. Already set in `docker-compose.yml` |

---

## Development Fallbacks

In `development` and `test` modes, missing secrets fall back to deterministic dev-only values with a console warning. **These fallbacks are never used in production** — the startup validation throws a fatal error if any required production secret is missing or matches a placeholder pattern.

The placeholder detector rejects values matching:
- `change-me`, `change_me`
- `dev-only`, `dev_only`
- `placeholder`
- `your_*`, `example_*`
- Values starting with `CHANGE_ME`

---

## Premium Features

The following environment variables are required only when Premium modules (SSO and/or Advanced Reporting) are enabled.

| Variable | Description |
|----------|-------------|
| `LICENSE_FILE_PATH` | Path to the license file provided by Venshield for Premium features. Default: `modules/license.json` relative to the application root. |
| `LICENSE_KEY` | License activation key for Premium modules. Provided by Venshield with your license package. Store as a multiline value or mount as a file — it must not be prefixed with `NEXT_PUBLIC_`. |
| `LICENSE_AUDIENCE` | License audience identifier that must match the value issued with your license. Case-sensitive. Provided in your license delivery. |

> All Premium-specific secrets (`OIDC_STATE_SECRET`, `SETTINGS_ENCRYPTION_KEY`) are operator-generated and covered in the **Security Secrets** section above — they are not provided by Venshield.
