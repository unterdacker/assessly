# Environment Variables Reference

All environment variables are validated at startup by `lib/env.ts` using Zod. In production (`NODE_ENV=production`), missing or placeholder values cause a fatal error.

---

## Required Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/assessly?schema=public` | PostgreSQL connection string. Must begin with `postgresql://` or `postgres://` |

---

## Security Secrets

All secrets must be generated with `crypto.randomBytes()`. Never use placeholder values in production.

| Variable | Length | Generate Command | Description |
|----------|--------|-----------------|-------------|
| `AUTH_SESSION_SECRET` | 128 hex chars | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` | HMAC-SHA256 key for session cookie signing |
| `SETTINGS_ENCRYPTION_KEY` | 64 hex chars | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | AES-256-GCM key for encrypting SMTP passwords and API keys at rest |
| `MFA_ENCRYPTION_KEY` | 64 hex chars | Same as above | AES-256-GCM key for encrypting TOTP secrets at rest |
| `AUDIT_BUNDLE_SECRET` | 64 hex chars | Same as above | HMAC-SHA256 key for signing forensic audit bundle exports |
| `AUDIT_EXPORT_KEY` | 64 hex chars | Same as above | Key for audit export operations |
| `AUDIT_PSEUDONYMIZATION_KEY` | 64 hex chars | Same as above | HMAC key for deterministic GDPR pseudonymisation |
| `CRON_SECRET` | 64 hex chars | Same as above | Bearer token for `/api/cron/*` endpoints |

---

## Application URL

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public-facing application URL. **Must be `https://`** in production |
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
| `MAIL_STRATEGY` | `log` | `smtp` \| `resend` \| `log`. Overridden by SystemSettings DB row when set |
| `MAIL_FROM` | `Assessly <noreply@assessly.local>` | Sender address and display name |
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP authentication username |
| `SMTP_PASSWORD` | — | SMTP password (plaintext in env var; stored encrypted in DB when configured via UI) |
| `RESEND_API_KEY` | — | Resend API key |

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
