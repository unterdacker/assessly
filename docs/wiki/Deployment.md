# Deployment

## Overview

Venshield ships as a Docker container and is designed for self-hosted deployments in EU data centres, air-gapped networks, or any environment where data sovereignty is required.

---

## Local Testing with the GHCR Image

Venshield is distributed as a pre-built Docker image at `ghcr.io/unterdacker/venshield:main` (private registry).
This section covers everything needed to pull and run the image locally.

### 1 — Create a GitHub PAT with the correct scopes

The image is private. A Personal Access Token (classic) with **`read:packages`** scope is required to pull it.
The `SUBMODULE_PAT` used in CI only has `repo` scope and **cannot** pull from GHCR — a separate token is needed.

| Scope | Purpose |
|---|---|
| `repo` | CI submodule checkout (`SUBMODULE_PAT`) |
| `read:packages` | Pull image from GHCR (local / customer use) |

Generate at: **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**

### 2 — Login and pull

```bash
echo "ghp_YOUR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
docker pull ghcr.io/unterdacker/venshield:main
```

> **Apple Silicon (M1/M2/M3):** The image is built for `linux/amd64`. Docker Desktop runs it via Rosetta.
> You will see a platform mismatch warning — this is expected and harmless.

### 3 — Create the env file

Create a file named `venshield.env` (no quotes around values — Docker's `--env-file` does not strip them):

```env
DATABASE_URL=postgresql://user:password@db:5432/venshield?schema=public
APP_URL=http://localhost:3000
OIDC_STATE_SECRET=<output of: openssl rand -hex 32>
ALLOW_INSECURE_LOCALHOST=true
SMS_PROVIDER=log
NODE_ENV=production
```

Generate `OIDC_STATE_SECRET`:
```bash
openssl rand -hex 32
```

> `ALLOW_INSECURE_LOCALHOST=true` is required for any local run with `NODE_ENV=production`.
> It bypasses the `APP_URL` localhost check and the `SMS_PROVIDER=log` production block — both are intentional
> safety guards that only apply to real deployments.

### 4a — Option A: docker-compose with bundled Postgres (recommended)

Create `docker-compose.yml` next to `venshield.env`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: venshield
    volumes:
      - pgdata:/var/lib/postgresql/data

  app:
    image: ghcr.io/unterdacker/venshield:main
    platform: linux/amd64
    ports:
      - "3000:3000"
    env_file:
      - venshield.env
    depends_on:
      - db

volumes:
  pgdata:
```

Start:
```bash
docker compose up
```

### 4b — Option B: docker run against an existing local Postgres

If Postgres is already running on the Mac (e.g. Postgres.app, DBngin, or another Docker container),
use `host.docker.internal` as the hostname — `localhost` inside a container refers to the container itself,
not the Mac host.

```bash
# Check which port the local Postgres is listening on
lsof -i :5432

# Update DATABASE_URL in venshield.env:
# DATABASE_URL=postgresql://user:password@host.docker.internal:5432/venshield?schema=public

docker run --env-file venshield.env -p 3000:3000 ghcr.io/unterdacker/venshield:main
```

### 5 — Access the application

Open **http://localhost:3000** in your browser.

**Default seed credentials:**

| Role | Email | Password |
|---|---|---|
| Admin | `admin@venshield.local` | `admin123` |
| Auditor | `auditor@venshield.local` | `auditor123` |

> ⚠️ Change these credentials immediately for any non-throwaway environment.

---

### Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `403` on `docker pull` | PAT missing `read:packages` scope | Create a new PAT with `read:packages` |
| `DATABASE_URL must begin with postgresql://` | Quotes in env file — `DATABASE_URL="postgresql://..."` | Remove the surrounding quotes |
| `APP_URL must not point to localhost in production` | `NODE_ENV=production` + localhost URL | Add `ALLOW_INSECURE_LOCALHOST=true` |
| `SMS_PROVIDER='log' is not permitted in production` | `NODE_ENV=production` + log provider | Add `ALLOW_INSECURE_LOCALHOST=true` |
| `P1001: Can't reach database server at localhost:…` | `localhost` resolves to the container, not the Mac | Use `host.docker.internal` instead of `localhost` |
| `Invalid credentials` on login | Using wrong email domain | Use `admin@venshield.local` (not `assessly.local`) |

---

## Docker Architecture

### Container Images

| Image | Tag | Purpose |
|-------|-----|---------|
| `venshield-web` | Custom (Dockerfile) | Next.js application |
| `postgres` | `16-alpine` | Primary database |

### Dockerfile

The production `Dockerfile` builds a Next.js standalone output:

1. `npm ci` — install dependencies
2. `prisma generate` — generate Prisma client (no DB connection required at build)
3. `next build` — produce `/app/.next/standalone`
4. Final image copies only the standalone output and `public/` assets

### `entrypoint.sh`

The entrypoint script runs on container startup:

1. Waits for the database to be reachable
2. Runs `prisma db push --accept-data-loss` to apply schema changes. For a full production workflow with migration history, replace this with `prisma migrate deploy` in `entrypoint.sh`
3. Runs the seed if the DB is empty (development/first-run only)
4. Starts `node server.js`

---

## Production Deployment Steps

> ⚠️ **Before going to production:** The default `entrypoint.sh` uses `prisma db push --accept-data-loss` for developer convenience. This command will **silently drop columns and tables** when the schema changes, which can destroy audit log rows and break the cryptographic hash chain. For real production deployments, edit `entrypoint.sh` to replace:
> ```
> $PRISMA db push --accept-data-loss
> ```
> with:
> ```
> $PRISMA migrate deploy
> ```
> Then create a baseline migration with `npm run db:migrate` before first deployment.

### 1 — Generate Secrets

```bash
# AUTH_SESSION_SECRET (64 bytes)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# All other secrets (32 bytes each) — run once per variable
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Run for: SETTINGS_ENCRYPTION_KEY, MFA_ENCRYPTION_KEY, STORAGE_ENCRYPTION_KEY,
#          AUDIT_BUNDLE_SECRET, AUDIT_EXPORT_KEY, AUDIT_PSEUDONYMIZATION_KEY,
#          CRON_SECRET, OIDC_STATE_SECRET, SMS_PSEUDONYM_KEY
```

### 2 — Create Production `.env`

```env
# ── Core ─────────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@your-db-host:5432/venshield?schema=public
NODE_ENV=production
APP_URL=https://venshield.yourdomain.com
NEXT_PUBLIC_APP_URL=https://venshield.yourdomain.com

# ── Session & OIDC ────────────────────────────────────────────────────────────
# AUTH_SESSION_SECRET: min 128 hex chars (64 bytes)
AUTH_SESSION_SECRET=<128-char hex>
# OIDC_STATE_SECRET: min 64 hex chars (32 bytes) — always required
OIDC_STATE_SECRET=<64-char hex>

# ── Encryption keys (exactly 64 hex chars = 32 bytes each) ───────────────────
SETTINGS_ENCRYPTION_KEY=<64-char hex>
MFA_ENCRYPTION_KEY=<64-char hex>
STORAGE_ENCRYPTION_KEY=<64-char hex>

# ── Audit log signing ─────────────────────────────────────────────────────────
AUDIT_BUNDLE_SECRET=<64-char hex>
AUDIT_EXPORT_KEY=<64-char hex>
AUDIT_PSEUDONYMIZATION_KEY=<64-char hex>

# ── Cron ─────────────────────────────────────────────────────────────────────
CRON_SECRET=<64-char hex>

# ── AI provider ──────────────────────────────────────────────────────────────
# AI_PROVIDER: mistral | local (default: local — uses Ollama)
AI_PROVIDER=local
LOCAL_AI_ENDPOINT=http://your-ollama-host:11434
LOCAL_AI_MODEL=ministral-3:8b
# Mistral SaaS (set AI_PROVIDER=mistral to use)
# MISTRAL_API_KEY=your_mistral_api_key

# ── Mail ─────────────────────────────────────────────────────────────────────
# MAIL_STRATEGY: smtp | resend | log
# mailpit and mailhog are BLOCKED in production
MAIL_STRATEGY=smtp
MAIL_FROM=Venshield <noreply@yourdomain.com>
MAIL_COMPANY_NAME=Venshield
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=your_smtp_password
# Resend SaaS alternative (set MAIL_STRATEGY=resend to use)
# RESEND_API_KEY=your_resend_api_key

# ── SMS ───────────────────────────────────────────────────────────────────────
# SMS_PROVIDER=log is BLOCKED in production — configure a real EU provider
# Choose one of: 46elks | sinch | infobip

# Option A: 46elks (Sweden, GDPR-compliant)
SMS_PROVIDER=46elks
ELKS_API_USERNAME=your_46elks_username
ELKS_API_PASSWORD=your_46elks_password
ELKS_FROM=Venshield

# Option B: Sinch (Sweden, GDPR-compliant) — uncomment, remove Option A
# SMS_PROVIDER=sinch
# SINCH_SERVICE_PLAN_ID=your_service_plan_id
# SINCH_API_TOKEN=your_api_token
# SINCH_FROM=+4900000000

# Option C: Infobip (Croatia/EU, GDPR-compliant) — uncomment, remove Option A
# SMS_PROVIDER=infobip
# INFOBIP_API_KEY=your_api_key
# INFOBIP_BASE_URL=https://<region>.api.infobip.com
# INFOBIP_FROM=Venshield

# Required when SMS_PROVIDER != log — HMAC key for phone pseudonymisation (GDPR Art. 4(5))
SMS_PSEUDONYM_KEY=<64-char hex>

# ── S3-compatible storage (optional — falls back to local filesystem) ─────────
# S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com
# S3_REGION=eu-central-1
# S3_BUCKET=venshield-storage
# S3_ACCESS_KEY_ID=your_access_key_id
# S3_SECRET_ACCESS_KEY=your_secret_access_key
# S3_FORCE_PATH_STYLE=false
```

### 3 — Deploy with Docker Compose

```bash
docker-compose --env-file .env.production up -d
```

The production `docker-compose.yml` reads secrets from the `.env` file via `${VAR:-default}` interpolation. Always supply real values for production — the hex defaults in the file are **development-only**.

### 4 — TLS / Reverse Proxy

Place Venshield behind a TLS-terminating reverse proxy. Example nginx snippet:

```nginx
server {
    listen 443 ssl http2;
    server_name venshield.yourdomain.com;

    ssl_certificate /etc/ssl/certs/venshield.crt;
    ssl_certificate_key /etc/ssl/private/venshield.key;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

### 5 — Database Backup

Set up automated backups for the PostgreSQL volume:

```bash
# Example: daily pg_dump
docker exec venshield-postgres pg_dump -U postgres venshield | gzip > venshield-$(date +%Y%m%d).sql.gz
```

---

## Health Check

The application exposes a health endpoint:

```
GET /api/health
```

Returns `200 OK` with `{ status: "ok" }` when the application and database are reachable. Use this for load balancer health checks and uptime monitoring.

---

## Resource Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 512 MB | 1 GB |
| Disk | 10 GB | 50 GB (for PDF evidence storage) |
| PostgreSQL | Shared | Dedicated instance for production |

---

## Security Hardening Checklist

- [ ] All secrets generated with `crypto.randomBytes()` — none are the placeholder defaults
- [ ] `NODE_ENV=production` set
- [ ] `NEXT_PUBLIC_APP_URL` is your `https://` domain
- [ ] `ALLOW_INSECURE_LOCALHOST` is NOT set (or is `false`)
- [ ] TLS enforced at reverse proxy
- [ ] PostgreSQL not exposed to the public internet (bind to `127.0.0.1` or Docker internal network only)
- [ ] `.venshield-storage/` directory has restricted filesystem permissions (`chmod 700`)
- [ ] Demo accounts (`admin@venshield.local`) deactivated or removed
- [ ] SMTP credentials in DB (encrypted) — not in environment variables
- [ ] Container running as non-root user
- [ ] Docker socket not mounted into the container
- [ ] Regular `npm audit` scheduled in CI

---

## Scaling Considerations

Venshield is a single-process Node.js application. For horizontal scaling:

- Use a **shared PostgreSQL** instance (not container-local)
- Use a **shared file store** (NFS, S3, or similar) for `.venshield-storage/` — the local filesystem approach does not work across replicas
- The in-process rate limiter **must** be replaced with a Redis-backed store when running multiple replicas
- Session state is fully database-backed — no sticky sessions required once the rate limiter is externalised

---

## Upgrading

1. Pull the new image: `docker pull <image>`
2. Run `prisma migrate deploy` against the new schema
3. Restart the container

Prisma migrations are forward-only. Always back up the database before applying a new migration.
