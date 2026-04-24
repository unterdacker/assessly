# Security Architecture

## Security Headers

Security headers are injected on every response by the Next.js middleware (`middleware.ts`). A fresh cryptographic nonce is generated per request using `crypto.getRandomValues()` (Edge-Runtime compatible).

| Header | Value / Policy |
|--------|---------------|
| `Content-Security-Policy` | Strict CSP with per-request nonce for inline scripts; `default-src 'self'`; `connect-src` restricted to same-origin + AI endpoints |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (2 years) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Restricts camera, microphone, geolocation |

The CSP hash for the theme script is pre-computed at build time by `scripts/compute-themes-hash.mjs` and stored in `lib/csp-hashes.ts`, preventing FOUC (flash of unstyled content) without compromising CSP.

---

## Cryptography

### AES-256-GCM Encryption (`lib/crypto.ts`)

Used for encrypting sensitive values at rest (SMTP passwords, API keys, Mistral API key, OIDC client secrets for SSO):

- **Algorithm:** AES-256-GCM
- **Key:** 32 bytes / 256 bits from `SETTINGS_ENCRYPTION_KEY` (64 hex chars)
- **IV:** 12 bytes (96-bit)  NIST recommended for GCM mode  generated fresh per encryption
- **Format stored in DB:** `<iv_hex>:<tag_hex>:<ciphertext_hex>`
- **Authentication:** GCM authentication tag verified on decryption  any tampering throws

### MFA Secret Encryption (`lib/mfa.ts`)

Same AES-256-GCM scheme, separate key (`MFA_ENCRYPTION_KEY`). TOTP secrets are encrypted before being stored in `User.mfaSecret`.

### Evidence File Encryption (`lib/storage.ts`)

Uploaded PDF evidence files stored in `.venshield-storage/` are encrypted at rest using the same AES-256-GCM scheme:

- **Key:** `STORAGE_ENCRYPTION_KEY` (64 hex chars / 32 bytes), validated at startup by `lib/env.ts`
- **Scope:** Every file written by `lib/storage.ts` is encrypted on write and decrypted on read; raw plaintext bytes never reach disk
- **Format:** Same `<iv_hex>:<tag_hex>:<ciphertext_hex>` structure as OIDC client secrets
- **Key rotation:** Requires re-encrypting stored files; no automated rotation is built in — incorporate into your key management policy

### Webhook Signing Secret Encryption

Webhook HMAC-SHA256 signing secrets are encrypted at rest using the same AES-256-GCM scheme:

- **Key:** `WEBHOOK_ENCRYPTION_KEY` (64 hex chars / 32 bytes), validated at startup by `lib/env.ts`
- **Scope:** Every webhook signing secret written to the `WebhookEndpoint` table is encrypted on write and decrypted only at webhook delivery time; plaintext secrets never persist in the database
- **Format:** Same `<iv_hex>:<tag_hex>:<ciphertext_hex>` structure as other encrypted fields
- **⚠️ Deployment note:** The Dockerfile contains a non-production default for this variable. Replace it with a freshly generated value before any deployment — see key generation commands below.

### Session Token Integrity (`lib/auth/token.ts`)

- Session tokens are signed with **HMAC-SHA256** using `AUTH_SESSION_SECRET`
- Only the `tokenHash` is stored in the database  the raw token never persists
- `verifySessionToken()` computes the HMAC and compares in constant time to prevent timing attacks

### Audit Hash Chain (`lib/audit-sanitize.ts`)

- `computeEventHash()`: SHA-256 of canonical entry fields
- `pseudonymizeUserId()`: Deterministic HMAC-SHA256 pseudonym for GDPR erasure
- IP truncation: `/24` for IPv4, `/48` for IPv6

---

## CSRF Protection

The middleware enforces CSRF protection for all state-changing HTTP methods (POST, PUT, PATCH, DELETE):

- Checks for the `Origin` header matching the configured `NEXT_PUBLIC_APP_URL`
- API routes that accept cross-origin requests (e.g. vendor portal invites) explicitly allowlist origins

---

## API Rate Limiting

All public API routes (`/api/v1/*` and `/api/auth/sign-out`) enforce two independent fixed-window rate limits per 60-second window. Both limits are applied in-process without an external dependency such as Redis.

| Limit type | Threshold | Scope | Eviction |
|---|---|---|---|
| Per API key | 100 req/min | Each individual API key | FIFO |
| Per source IP | 300 req/min | Each source IP or IPv6 /64 subnet | LRU |
| Unknown source IP | 30 req/min | All requests with no detectable source IP | LRU (shared bucket) |

**Implementation details (`lib/api-rate-limit.ts`):**

- **IP check before key validation** — the IP limit is checked before any database lookup, preventing timing-based API key enumeration.
- **LRU eviction for the IP store** — active IP entries are moved to the tail of the Map on every access (delete + re-insert); eviction targets the head (least-recently-used), ensuring high-traffic IPs are never displaced.
- **IPv6 /64 grouping** — all addresses within the same /64 subnet share a counter, preventing host-hopping within a subnet. IPv4-mapped IPv6 addresses (`::ffff:x.x.x.x`) are unwrapped to their embedded IPv4 address before bucketing.
- **Injection resistance** — `normalizeIp()` validates all values via Node's `net.isIPv4` / `net.isIPv6` before use; XSS payloads and arbitrary strings fall through to the strict `"unknown"` bucket.
- **Audit logging** — every rate limit violation emits an `AuditLogger.auth("API_RATE_LIMIT_EXCEEDED")` event with `securityIncident: true`, preserving the normalized IP without truncation for forensic purposes.
- **`Retry-After: 60`** — all 429 responses across every route include this header.

> **Deployment note:** Accurate IP-based limiting requires a trusted reverse proxy (nginx `real_ip_from`, Cloudflare, or equivalent) to populate `X-Real-IP` or `X-Forwarded-For`. Without this, all traffic appears as a single IP to the application.

---

## Input Sanitization

User-supplied HTML input (e.g. rich-text fields) is sanitized with `sanitize-html` before persistence. The `lib/audit-sanitize.ts` module additionally scrubs known PII field names from audit payloads.

---

## Content Security Policy Hashes

Theme switching scripts require inline execution. Rather than using the unsafe `'unsafe-inline'` directive, Venshield:

1. Computes the SHA-256 hash of the theme script at build time (`scripts/compute-themes-hash.mjs`)
2. Stores the hash in `lib/csp-hashes.ts`
3. Injects the hash into the per-request CSP string in middleware

This maintains a strict CSP while supporting the theme-persistence script.

---

## Environment Variable Security

The `lib/env.ts` module validates all environment variables at server startup using Zod:

- **Placeholder detection:** Values matching patterns like `change-me`, `your_key`, `placeholder` are rejected in production
- **Format validation:** Encryption keys must be exactly 64 hex chars; session secrets minimum 32 chars
- **URL validation:** `NEXT_PUBLIC_APP_URL` must be HTTPS in production (localhost blocked unless `ALLOW_INSECURE_LOCALHOST=true`)
- **Fail-fast:** In production, the first validation error terminates the process with a full list of issues before serving any traffic

---

## Rate Limiting

Login and authentication endpoints use a consecutive-failure rate limiter (`lib/rate-limit.ts`). See [Authentication & Authorization](Authentication-and-Authorization.md#rate-limiting) for details.

---

## Dependency Security

The platform avoids known-vulnerable packages. Notable choices:

- `bcryptjs` v3 for password hashing (cost factor 12)
- `sanitize-html` for HTML input sanitization
- Zod v4 for runtime schema validation at all trust boundaries
- No `eval()` or `Function()` constructors used anywhere

Run `npm audit` to check for known CVEs in the dependency tree.

---

## Secrets Generation Reference

| Secret | Command | Notes |
|--------|---------|-------|
| `AUTH_SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` | 64 bytes  128 hex chars |
| `SETTINGS_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 32 bytes  64 hex chars |
| `MFA_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 32 bytes  64 hex chars |
| `STORAGE_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | AES-256-GCM key for evidence file encryption at rest |
| `WEBHOOK_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | AES-256-GCM key for webhook signing secret encryption at rest |
| `AUDIT_BUNDLE_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 32 bytes  64 hex chars |
| `AUDIT_EXPORT_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 32 bytes  64 hex chars |
| `AUDIT_PSEUDONYMIZATION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 32 bytes  64 hex chars |
| `CRON_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 32 bytes  64 hex chars |

> **Important:** Never reuse keys across environments. Rotate all secrets when deploying to production. Store secrets in a secrets manager (Vault, AWS Secrets Manager, etc.)  never in the repository.

---

## Air-Gap Capability

Venshield has **no mandatory external network dependencies**. Every feature works without internet access when configured with:

- `AI_PROVIDER=local` + local Ollama instance
- `MAIL_STRATEGY=smtp` + local SMTP relay
- Self-hosted PostgreSQL

This makes the platform suitable for classified environments, air-gapped networks, and high-security data centres.


