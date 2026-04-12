# Deployment

## Overview

Venshield ships as a Docker container and is designed for self-hosted deployments in EU data centres, air-gapped networks, or any environment where data sovereignty is required.

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
2. Runs `prisma migrate deploy` to apply pending migrations
3. Runs the seed if the DB is empty (development/first-run only)
4. Starts `node server.js`

---

## Production Deployment Steps

### 1 — Generate Secrets

```bash
# AUTH_SESSION_SECRET (64 bytes)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# SETTINGS_ENCRYPTION_KEY (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# MFA_ENCRYPTION_KEY (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# AUDIT_BUNDLE_SECRET (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# AUDIT_EXPORT_KEY (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# AUDIT_PSEUDONYMIZATION_KEY (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# CRON_SECRET (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2 — Create Production `.env`

```env
# Required
DATABASE_URL="postgresql://user:password@your-db-host:5432/venshield?schema=public"
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://venshield.yourdomain.com

# Security secrets (generated above)
AUTH_SESSION_SECRET=<128-char hex>
SETTINGS_ENCRYPTION_KEY=<64-char hex>
MFA_ENCRYPTION_KEY=<64-char hex>
AUDIT_BUNDLE_SECRET=<64-char hex>
AUDIT_EXPORT_KEY=<64-char hex>
AUDIT_PSEUDONYMIZATION_KEY=<64-char hex>
CRON_SECRET=<64-char hex>

# AI (optional — defaults to local/Ollama)
AI_PROVIDER=local
LOCAL_AI_ENDPOINT=http://your-ollama-host:11434

# Mail
MAIL_STRATEGY=smtp
MAIL_FROM="Venshield <noreply@yourdomain.com>"
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=your_smtp_password
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
