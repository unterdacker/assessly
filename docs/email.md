# Email System — Developer Guide

This document describes how Venshield sends transactional emails, how to test
mail delivery locally, and how to configure a production mail provider.

---

## Architecture: dual-config with escape hatch

Mail settings are resolved in this priority order at runtime:

```
MAIL_FORCE_ENV=true?
  └─ YES → use env vars immediately (skip DB)
  └─ NO  → read DB (SystemSettings.mailStrategy)
             └─ DB has a real strategy (SMTP/RESEND)? → use DB settings
             └─ DB is LOG or unreachable?             → fall back to env vars
```

| Situation | Which config wins |
|---|---|
| First-time local dev (DB empty / LOG) | `.env` / `.env.local` |
| Production — configured via Admin › Settings › Mail | DB (takes precedence) |
| Local dev — DB has SMTP from a previous UI session | DB (takes precedence) |
| Local dev — DB has SMTP, `MAIL_FORCE_ENV=true` | env vars (escape hatch) |

**Decision: `.env` vs web UI?**
Use both — they serve different purposes:
- **Web UI** (`Admin › Settings › Mail`): production settings, no server restart needed, AES-256-GCM encrypted, audit trailed.
- **`.env` / `.env.local`**: development defaults and Docker Compose integration.

---

## `MAIL_FORCE_ENV` — bypassing the DB

If production SMTP was previously configured through the web UI, those settings
are stored encrypted in the database and override your `.env` file.

To force env-var resolution without touching the database:

```ini
MAIL_FORCE_ENV="true"
MAIL_STRATEGY="smtp"
SMTP_HOST="smtp.yourdomain.com"
SMTP_PORT="587"
SMTP_USER="noreply@yourdomain.com"
SMTP_PASSWORD="your_smtp_password"
```

**Never set `MAIL_FORCE_ENV=true` in production** — `env.ts` blocks this with
a fatal startup error. Note: this protection only activates when
`NODE_ENV=production` is set, which all production deployments must do.

---

## Available strategies

| Strategy | Use case | Config required |
|---|---|---|
| `log` | Default dev/CI — prints to stdout | None |
| `smtp` | Production SMTP relay | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` |
| `resend` | Production Resend API | `RESEND_API_KEY` |

---

## Production setup

1. Configure SMTP or Resend via **Admin › Settings › Mail** in the web UI.
2. Test the configuration with the built-in "Send test email" button.
3. Ensure `MAIL_STRATEGY` is set to `smtp` or `resend` in your production `.env`.
4. Ensure `MAIL_FORCE_ENV` is NOT set to `true` in production.

---

## All mail-related environment variables

| Variable | Default | Description |
|---|---|---|
| `MAIL_STRATEGY` | `log` | Active strategy: `log`, `smtp`, `resend` |
| `MAIL_FROM` | `Venshield <noreply@venshield.local>` | Sender address shown to recipients |
| `MAIL_COMPANY_NAME` | `Venshield` | Company name in email templates |
| `SMTP_HOST` | — | SMTP relay hostname |
| `SMTP_PORT` | `587` | SMTP port (587 = STARTTLS, 465 = implicit TLS) |
| `SMTP_USER` | — | SMTP auth username |
| `SMTP_PASSWORD` | — | SMTP auth password |
| `RESEND_API_KEY` | — | Resend API key |
| `MAIL_FORCE_ENV` | `false` | Skip DB config and use env vars (dev only) |
