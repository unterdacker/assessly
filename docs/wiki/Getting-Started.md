# Getting Started

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 20 or higher |
| npm | 10 or higher |
| Docker Desktop | Latest stable |

---

## Local Development (with Docker database)

### 1 — Clone and install

```bash
git clone https://github.com/unterdacker/assessly.git
cd assessly
npm install
```

### 2 — Create `.env`

Create a `.env` file in the project root with at minimum:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/assessly?schema=public"
```

For AI-assisted document analysis using a local Ollama instance (recommended):

```env
AI_PROVIDER=local
LOCAL_AI_ENDPOINT=http://localhost:11434
LOCAL_AI_MODEL=ministral-3:8b
```

For Mistral AI (cloud, EU-hosted):

```env
AI_PROVIDER=mistral
MISTRAL_API_KEY=your_key_here
```

### 3 — Start PostgreSQL

```bash
docker-compose up -d
```

This starts a `postgres:16-alpine` container on port `5432` with a persistent volume.

### 4 — Push the schema and seed demo data

```bash
npx prisma generate
npx prisma db push
npx prisma db seed
```

The seed creates two demo companies and the following accounts:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@assessly.local` | `admin123` |
| Auditor | `auditor@assessly.local` | `auditor123` |

> **Warning:** These credentials are for local development only. Never use them in any internet-accessible environment.

### 5 — Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Full Docker Stack (App + Database)

To run both the web application and database as containers:

```bash
docker-compose up
```

The `web` service depends on the `db` health check, so the application waits for PostgreSQL to be ready before starting. The Prisma schema is applied automatically via the `entrypoint.sh` script.

Access the app at [http://localhost:3000](http://localhost:3000).

---

## Production Deployment

See the [Deployment](Deployment) page for full hardening instructions, secret generation, and reverse-proxy configuration.

Key differences from the local setup:

- Set `NODE_ENV=production`
- Set `NEXT_PUBLIC_APP_URL` to your `https://` domain
- Generate all secrets with the commands documented in [Environment Variables Reference](Environment-Variables-Reference)
- Use a managed PostgreSQL instance or a properly volume-backed container
- Place Assessly behind a TLS-terminating reverse proxy (nginx, Caddy, Traefik)

---

## Database Management Commands

```bash
npm run db:migrate     # Create and apply a named migration
npm run db:push        # Push schema changes without a migration file (dev only)
npm run db:seed        # Re-seed demo data
npm run db:studio      # Open Prisma Studio (visual DB browser)
```

---

## Environment Validation

```bash
npm run env:validate
```

This script (`scripts/env-check.mjs`) validates all required environment variables before a build. In production mode, missing or placeholder values cause a fatal error so the container fails fast before serving any traffic.
