# SMS System

## Overview

The SMS system delivers temporary passwords to vendor contacts during onboarding. It is implemented in `lib/sms/` and supports four strategies selectable via `SMS_PROVIDER`:

| Strategy | When to use |
|----------|-------------|
| `log` | Development / CI (simulated delivery, no real SMS sent) |
| `46elks` | Production — Sweden-based, GDPR-compliant EU provider |
| `sinch` | Production — Sweden-based, GDPR-compliant EU provider |
| `infobip` | Production — Croatia/EU-based, GDPR-compliant provider |

The entry point is `lib/sms/index.ts`, which exports a single `sendSms(to, body)` function. It never throws — it returns a `SmsResult` discriminated union (`{ ok: true; messageId?: string }` or `{ ok: false; error: string }`). Callers are responsible for recording failures via the audit trail.

---

## Provider Selection

```
SMS_PROVIDER env var
        |
        |---> "46elks"  --> ElksSmsProvider    (lib/sms/providers/46elks.ts)
        |---> "sinch"   --> SinchSmsProvider   (lib/sms/providers/sinch.ts)
        |---> "infobip" --> InfobipSmsProvider (lib/sms/providers/infobip.ts)
        `---> "log"     --> LogSmsProvider     (lib/sms/providers/log.ts)   [default]
```

Providers are loaded lazily via dynamic `import()` so unused provider SDKs do not add startup time.

---

## `log` Provider (Development / CI)

The `log` provider prints a **masked** phone number to stdout and explicitly redacts the message body. It is the safest default because it never transmits PII over a network.

> **Production block:** `SMS_PROVIDER=log` with `NODE_ENV=production` causes a **fatal startup error** unless `ALLOW_INSECURE_LOCALHOST=true` is also set. When that escape hatch is active, `log` is permitted and SMS codes are silently dropped — no real delivery occurs. This override is intended exclusively for Docker Compose / CI environments and must never appear in a real production deployment. This behaviour mirrors the `mailpit` block in the Mail System.

---

## Production Providers

### 46elks

| Field | Value |
|-------|-------|
| Headquarters | Sweden |
| GDPR status | EU provider, subject to Swedish and EU data protection law |
| Transport | HTTPS REST API (`https://api.46elks.com/a1/SMS`) |
| Authentication | HTTP Basic (`ELKS_API_USERNAME` : `ELKS_API_PASSWORD`) |

Required environment variables:

| Variable | Description |
|----------|-------------|
| `ELKS_API_USERNAME` | 46elks API username |
| `ELKS_API_PASSWORD` | 46elks API password |
| `ELKS_FROM` | Sender name (alphanumeric, max 11 chars) or E.164 number. Optional — defaults to `Venshield` |

### Sinch

| Field | Value |
|-------|-------|
| Headquarters | Sweden |
| GDPR status | EU provider, subject to Swedish and EU data protection law |
| Authentication | Service Plan ID + API Token |

Required environment variables:

| Variable | Description |
|----------|-------------|
| `SINCH_SERVICE_PLAN_ID` | Sinch service plan ID |
| `SINCH_API_TOKEN` | Sinch API token |
| `SINCH_FROM` | E.164 sender number provisioned in the Sinch dashboard |

### Infobip

| Field | Value |
|-------|-------|
| Headquarters | Croatia (EU) |
| GDPR status | EU provider, subject to Croatian and EU data protection law |
| Authentication | API Key (header) |

Required environment variables:

| Variable | Description |
|----------|-------------|
| `INFOBIP_API_KEY` | Infobip API key |
| `INFOBIP_BASE_URL` | Personal base URL, format `https://<region>.api.infobip.com`. Only Infobip-owned domains are accepted — the format is validated at startup by `lib/env.ts` |
| `INFOBIP_FROM` | Sender name or alphanumeric ID. Optional — defaults to `Venshield` |

---

## GDPR Pseudonymisation

Phone numbers are never stored in plaintext. Every `VendorSmsLog` entry stores only `HMAC-SHA256(e164_number, SMS_PSEUDONYM_KEY)`. This satisfies GDPR Art. 4(5) (pseudonymisation) by design.

| Field | Stored value |
|-------|-------------|
| `recipientPseudonym` | `HMAC-SHA256(e164, SMS_PSEUDONYM_KEY)` — hex-encoded |
| Raw phone number | Never persisted to database |

### Key Rotation Warning

> **Rotating or losing `SMS_PSEUDONYM_KEY` severs the HMAC linkage between `VendorSmsLog` entries and original phone numbers.** Existing pseudonyms become irrecoverable. This creates a GDPR obligation to re-pseudonymise affected log entries using the new key, or to purge them entirely from the `VendorSmsLog` table. Treat `SMS_PSEUDONYM_KEY` with the same care as `AUDIT_PSEUDONYMIZATION_KEY` — store it in a secrets manager and never rotate it without a migration plan.

Generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Environment Variables Quick Reference

| Variable | Required in production | Default | Description |
|----------|----------------------|---------|-------------|
| `SMS_PROVIDER` | Yes | `log` | Active SMS strategy. `log` is blocked in production (unless `ALLOW_INSECURE_LOCALHOST=true`) |
| `SMS_PSEUDONYM_KEY` | When provider ≠ log | — | HMAC key for phone number pseudonymisation. Min 32 chars |
| `ELKS_API_USERNAME` | When `SMS_PROVIDER=46elks` | — | 46elks username |
| `ELKS_API_PASSWORD` | When `SMS_PROVIDER=46elks` | — | 46elks password |
| `ELKS_FROM` | No | `Venshield` | 46elks sender ID |
| `SINCH_SERVICE_PLAN_ID` | When `SMS_PROVIDER=sinch` | — | Sinch service plan ID |
| `SINCH_API_TOKEN` | When `SMS_PROVIDER=sinch` | — | Sinch API token |
| `SINCH_FROM` | When `SMS_PROVIDER=sinch` | — | Sinch E.164 sender number |
| `INFOBIP_API_KEY` | When `SMS_PROVIDER=infobip` | — | Infobip API key |
| `INFOBIP_BASE_URL` | When `SMS_PROVIDER=infobip` | — | Infobip personal base URL |
| `INFOBIP_FROM` | No | `Venshield` | Infobip sender ID |

---

## Custom Provider Guide

To add a new SMS provider:

1. Create `lib/sms/providers/<name>.ts` implementing the `SmsProvider` interface from `lib/sms/types.ts`
2. Add the new provider name to the `SMS_PROVIDER` enum in `lib/env.ts`
3. Add a `case "<name>":` branch in the `switch` block in `lib/sms/index.ts` with the required env var guard and lazy `import()`
4. Add the provider's credentials to `lib/env.ts` as optional fields

> **Security requirement:** Provider implementations must **never log the `body` parameter** — it contains a temporary password.
