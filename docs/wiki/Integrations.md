# Integrations

Venshield integrates with external services for mail delivery, SMS, AI inference, object storage, and enterprise SSO. All integrations are **optional** except PostgreSQL — the platform runs fully air-gapped with local fallbacks for every other category.

Configuration is done entirely via environment variables validated at startup by `lib/env.ts`. See [Environment Variables Reference](Environment-Variables-Reference.md) for the complete list.

---

## Mail

Mail is used for vendor invitation emails, password resets, and system notifications.

| Provider | Type | Env var | Link |
|---|---|---|---|
| **SMTP** | Any RFC 5321-compliant relay | `MAIL_STRATEGY=smtp` | — |
| **Resend** | SaaS email API | `MAIL_STRATEGY=resend` | [resend.com](https://resend.com) |
| **Log** | Console simulation (dev default) | `MAIL_STRATEGY=log` | — |

### SMTP configuration

```env
MAIL_STRATEGY=smtp
MAIL_FROM=Venshield <noreply@yourdomain.com>
MAIL_COMPANY_NAME=Venshield
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=your_smtp_password
```

### Resend configuration

```env
MAIL_STRATEGY=resend
MAIL_FROM=Venshield <noreply@yourdomain.com>
RESEND_API_KEY=re_your_api_key
```

See [Mail System](Mail-System.md) for full details.

---

## SMS

SMS is used for MFA one-time password delivery. All supported providers are GDPR-compliant EU companies. `SMS_PROVIDER=log` is **blocked in production** — a real provider must be configured.

`SMS_PSEUDONYM_KEY` (64 hex chars) is required when using any real provider — raw phone numbers are never stored, only their HMAC-SHA256 pseudonym (GDPR Art. 4(5)).

| Provider | Headquarters | Env var | Link |
|---|---|---|---|
| **46elks** | Sweden | `SMS_PROVIDER=46elks` | [46elks.com](https://46elks.com) |
| **Sinch** | Sweden | `SMS_PROVIDER=sinch` | [sinch.com](https://www.sinch.com) |
| **Infobip** | Croatia / EU | `SMS_PROVIDER=infobip` | [infobip.com](https://www.infobip.com) |
| **Log** | Console simulation (dev only) | `SMS_PROVIDER=log` | — |

### 46elks configuration

```env
SMS_PROVIDER=46elks
ELKS_API_USERNAME=your_username
ELKS_API_PASSWORD=your_password
ELKS_FROM=Venshield
SMS_PSEUDONYM_KEY=<64-char hex>
```

### Sinch configuration

```env
SMS_PROVIDER=sinch
SINCH_SERVICE_PLAN_ID=your_service_plan_id
SINCH_API_TOKEN=your_api_token
SINCH_FROM=+4900000000
SMS_PSEUDONYM_KEY=<64-char hex>
```

### Infobip configuration

```env
SMS_PROVIDER=infobip
INFOBIP_API_KEY=your_api_key
INFOBIP_BASE_URL=https://<region>.api.infobip.com
INFOBIP_FROM=Venshield
SMS_PSEUDONYM_KEY=<64-char hex>
```

See [SMS System](SMS-System.md) for full details.

---

## AI / LLM

AI is used for NIS2 document analysis, vendor questionnaire pre-filling, and executive risk summaries. All inference runs on infrastructure you control — no assessment data is sent to US cloud services.

| Provider | Type | Env var | Link |
|---|---|---|---|
| **Ollama** | Self-hosted, on-premise | `AI_PROVIDER=local` | [ollama.com](https://ollama.com) |
| **Mistral AI** | EU-hosted SaaS LLM | `AI_PROVIDER=mistral` | [mistral.ai](https://mistral.ai) |

### Ollama (default)

```env
AI_PROVIDER=local
LOCAL_AI_ENDPOINT=http://your-ollama-host:11434
LOCAL_AI_MODEL=ministral-3:8b
```

### Mistral AI

```env
AI_PROVIDER=mistral
MISTRAL_API_KEY=your_mistral_api_key
```

> AI provider can also be configured per-company in **Settings → AI** — the env var serves as the global default.

See [AI Integration](AI-Integration.md) for full details.

---

## Object Storage

Evidence files and report attachments can be stored on the local filesystem (default) or any S3-compatible object store.

| Provider | Type | Link |
|---|---|---|
| **Local filesystem** | Default, no config required | — |
| **AWS S3** | Managed cloud object storage | [aws.amazon.com/s3](https://aws.amazon.com/s3) |
| **MinIO** | Self-hosted S3-compatible | [min.io](https://min.io) |
| **Hetzner Object Storage** | EU S3-compatible | [hetzner.com/storage/object-storage](https://www.hetzner.com/storage/object-storage) |
| **Cloudflare R2** | Global S3-compatible, no egress fees | [cloudflare.com/r2](https://www.cloudflare.com/developer-platform/r2/) |
| **Backblaze B2** | Cost-effective S3-compatible | [backblaze.com/b2](https://www.backblaze.com/cloud-storage) |

### S3 configuration

```env
S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com
S3_REGION=eu-central-1
S3_BUCKET=venshield-storage
S3_ACCESS_KEY_ID=your_access_key_id
S3_SECRET_ACCESS_KEY=your_secret_access_key
S3_FORCE_PATH_STYLE=false
```

> Set `S3_FORCE_PATH_STYLE=true` for MinIO and other self-hosted S3-compatible stores that do not support virtual-hosted-style URLs.

---

## Identity Provider / SSO *(Premium)*

Venshield supports any [OpenID Connect](https://openid.net/connect/)-compliant IdP via PKCE for enterprise single sign-on with just-in-time user provisioning.

| Provider | Link |
|---|---|
| **Microsoft Entra ID** (Azure AD) | [microsoft.com/entra](https://www.microsoft.com/en-us/security/business/microsoft-entra) |
| **Okta** | [okta.com](https://www.okta.com) |
| **Keycloak** (self-hosted) | [keycloak.org](https://www.keycloak.org) |
| **Google Workspace** | [workspace.google.com](https://workspace.google.com) |
| **Auth0** | [auth0.com](https://auth0.com) |
| **Authentik** (self-hosted) | [goauthentik.io](https://goauthentik.io) |
| **Dex** (self-hosted) | [dexidp.io](https://dexidp.io) |
| **Any OIDC-compliant IdP** | — |

> **Premium plan required.** SSO is configured per-company via **Settings → SSO**. The `OIDC_STATE_SECRET` env var is always required regardless of plan (it protects the OIDC state cookie).

See [Enterprise Features](Enterprise-Features.md) and [Authentication & Authorization](Authentication-and-Authorization.md) for full details.

---

## Database

| Provider | Link |
|---|---|
| **PostgreSQL 16** | [postgresql.org](https://www.postgresql.org) |

Managed PostgreSQL options that work with Venshield:

| Service | Link |
|---|---|
| **Supabase** | [supabase.com](https://supabase.com) |
| **Neon** | [neon.tech](https://neon.tech) |
| **Railway** | [railway.app](https://railway.app) |
| **Hetzner Managed DB** | [hetzner.com/managed-databases](https://www.hetzner.com/managed-databases) |
| **AWS RDS** | [aws.amazon.com/rds](https://aws.amazon.com/rds/postgresql/) |
| **Self-hosted** | Any PostgreSQL 14+ instance | — |

```env
DATABASE_URL=postgresql://user:password@host:5432/venshield?schema=public
```