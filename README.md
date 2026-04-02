![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)

# AVRA - Automated Vendor Risk Assessment

AVRA is a modern Vendor Risk Management dashboard that helps security teams evaluate digital supply chain risk with NIS2-aligned workflows, structured evidence handling, and AI-assisted document analysis.

It is built for practical day-to-day operations: invite vendors, run assessments, review AI suggestions, and maintain an auditable decision trail.

---

### What Problem AVRA Solves

Security officers often manage third-party assessments in fragmented spreadsheets, email threads, and manual reviews. AVRA centralizes this process into a single workspace where teams can:

- onboard and track vendors,
- run NIS2-aligned questionnaires,
- analyze uploaded PDF evidence with AI,
- and maintain transparent, reviewable compliance decisions.

### Key Features

- Bilingual interface (English and German) powered by next-intl.
- Light and dark mode support.
- Vendor management table with search, sorting, status indicators, and access code lifecycle.
- Secure vendor invitation flow with split credential delivery (email/SMS concept).
- Internal Assessment Workspace for auditors and security officers.
- External Vendor Portal for access-code-based assessment completion.
- NIS2-aligned questionnaire flow with progress tracking.
- AI document audit workflow for PDF evidence.
- Manual answer override with justification and supplemental evidence support.
- Privacy-First Forensic Logging: cryptographic hash-chain audit log covering EU AI Act, NIS2/DORA, ISO 27001/SOC2, BSI Grundschutz, and GDPR requirements.
- Compliance filter and Forensic Bundle export (Admin-only, HMAC-SHA256 signed JSON) in the Audit Logs view.

### Enterprise & Compliance

AVRA is designed for an enterprise/open-source hybrid operating model, with controls that map to real-world regulatory and audit expectations.

- Sovereign AI principles: local LLM endpoint support is available for organizations that require strict data residency and processing control.
- Full auditability: PostgreSQL-backed audit logs provide durable and reviewable change history across internal and external assessment workflows.
- NIS2 / DORA alignment: hash-chain sequencing on every audit log row ensures forensic integrity; no log can be silently deleted from the middle of the chain without detection.
- EU AI Act (Art. 12 / 14): every AI-assisted action records the model identity, a SHA-256 hash of the input context, and a mandatory Human-in-the-Loop reviewer field.
- ISO 27001 / SOC2: failed login and MFA events are first-class audit types; configuration changes capture before/after field diffs.
- GDPR / DSGVO by default: IP addresses are truncated at write time, user IDs are HMAC-pseudonymized in exports, and PII fields are scrubbed from the forensic bundle before delivery to external auditors.

### Tech Stack

- Framework: Next.js 15 (App Router), React 19, TypeScript 5
- Styling/UI: Tailwind CSS, Radix UI primitives, Lucide icons, Framer Motion
- i18n: next-intl (English and German)
- Forms & Validation: React Hook Form, Zod
- Database: Prisma 6 ORM with PostgreSQL 16
- AI Integration: Mistral SDK and configurable local endpoint support
- PDF Processing: pdfjs-dist (client-side text extraction for AI document audit)
- MFA: otplib (TOTP), qrcode.react (QR provisioning)
- Charts: Recharts
- Notifications: Sonner
- Testing: Vitest (unit), Playwright (E2E)

### Architecture Overview

- Internal admin routes: vendor oversight, assessment workspace, settings.
- External vendor routes: isolated access portal and token/code-based assessment pages.
- Prisma models for companies, vendors, assessments, answers, questions, and audit logs.
- Message catalogs in `messages/en.json` and `messages/de.json`.

#### Forensic Audit Log Architecture

The `AuditLog` table implements a cryptographic hash-chain and multi-framework compliance tagging:

| Field | Purpose |
|---|---|
| `eventHash` | SHA-256 over `(action, actorId, entityId, metadata, timestamp)` — tamper evidence |
| `previousLogHash` | Hash of the preceding row — chain-break detection (NIS2/DORA) |
| `complianceCategory` | Auto-tagged framework: `EU_AI_ACT`, `NIS2_DORA`, `ISO_SOC2`, `CONFIG`, `AUTH` |
| `reason` | Mandatory GDPR purpose-limitation note on sensitive actions |
| `requestId` | Correlates UI actions with server-side API traces |
| `aiModelId` / `aiProviderName` | LLM identity for EU AI Act Art. 12 transparency |
| `inputContextHash` | SHA-256 of the AI prompt — never the raw text |
| `hitlVerifiedBy` | Human-in-the-Loop reviewer ID (EU AI Act Art. 14) |

The `/api/audit-logs/forensic-bundle` endpoint (Admin-only) exports a company-scoped, HMAC-SHA256 signed JSON bundle with a `chainIntegrity` verification report suitable for BaFin, BSI, or EU AI Office audits.

### Getting Started (Local Development)

#### 1. Prerequisites

- Node.js 20+
- npm 10+
- Git
- Docker Desktop (or Docker Engine + Compose)

#### 2. Clone the Repository

```bash
git clone https://github.com/unterdacker/AVRA.git
cd AVRA
```

#### 3. Install Dependencies

```bash
npm install
```

#### 4. Configure Environment Variables

Create a `.env` file in the project root:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/avra?schema=public"
```

Local Docker defaults used by this repository:

- POSTGRES_USER: `postgres`
- POSTGRES_PASSWORD: `postgres`
- POSTGRES_DB: `avra`
- Port mapping: `5432:5432`

Optional AI/provider settings (only if needed):

```bash
AI_PROVIDER="mistral"
MISTRAL_API_KEY="<your-key>"
LOCAL_AI_ENDPOINT="http://localhost:11434/v1"
LOCAL_AI_MODEL="mistral"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
CRON_SECRET="<optional-secret>"
```

#### 5. Configure Email Delivery (optional for local dev)

AVRA defaults to **Log mode** out of the box — invite emails are printed to the server console so the app works immediately without any mail configuration.

**Mail is configured through the web console — no `.env` mail variables needed.** Once the app is running, sign in as Admin and go to **Settings → Mail** (`http://localhost:3000/en/settings/mail`). Choose a strategy, enter your credentials, and send a test email — all from the browser. Credentials (SMTP password, Resend API key) are stored encrypted at rest using AES-256-GCM.

| Strategy | When to use |
|---|---|
| **Log** | Local development — no credentials needed (default) |
| **SMTP** | Any standard SMTP relay: Gmail, Outlook, Postmark, private on-prem servers |
| **Resend** | Serverless / edge deployments via [Resend](https://resend.com) |

> For Gmail SMTP: enable "App Passwords" in your Google Account and use host `smtp.gmail.com`, port `587`.  
> For Resend: get a free API key at [resend.com/api-keys](https://resend.com/api-keys) and verify your sending domain before production use.

**All three strategies share the same template.** Vendor invite emails are rendered in the user's locale (English or German) and include the vendor name, a prominent access code badge, and a direct portal link.

#### 5. Start PostgreSQL (Docker)

```bash
docker-compose up -d
```

#### 6. Initialize the Database

```bash
npx prisma generate
npx prisma db push
```

During the initial database setup, AVRA automatically provisions the default demo company, the NIS2 questionnaire set, and three preview vendors so the dashboard is immediately usable after `npx prisma db push`.

#### 7. Start the Development Server

```bash
npm run dev
```

Optional fast path for local-only experimentation:

```bash
npm run dev:turbo
```

Open:

```text
http://localhost:3000
```

### Quick Start Tutorial (PowerShell)

A single, copy-paste-ready sequence to go from zero to a running development environment. Run each block in order in a PowerShell terminal.

**Step 1 — Start a fresh PostgreSQL container**

Stop any existing container and volumes, then bring PostgreSQL up clean.

```powershell
docker-compose down -v
Start-Sleep -Seconds 2
docker-compose up -d
Start-Sleep -Seconds 5
```

**Step 2 — Verify PostgreSQL is ready**

Confirm the database server is accepting connections before proceeding.

```powershell
docker-compose exec postgres pg_isready -U postgres
```

Expected output: `localhost:5432 - accepting connections`

**Step 3 — Remove old SQLite migrations**

SQLite-generated migration files are incompatible with PostgreSQL and must be deleted before pushing the schema.

```powershell
Remove-Item -Path "prisma/migrations" -Recurse -Force -ErrorAction SilentlyContinue
```

**Step 4 — Clear Prisma cache and regenerate the client**

Clears any stale type cache and regenerates the Prisma Client for PostgreSQL.

```powershell
Remove-Item -Path "node_modules/.prisma" -Recurse -Force -ErrorAction SilentlyContinue
npx prisma generate
```

**Step 5 — Push schema and provision the preview environment**

Creates all tables from `prisma/schema.prisma` directly into the running database.

```powershell
npx prisma db push
```

On first setup, this also provisions the default demo environment so the dashboard is populated immediately after the schema is created.

**Step 6 — Start the development server**

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Docker Quickstart (Production-like Container Deployment)

Use this path to run the full AVRA stack — application and database — as Docker containers on any machine with Docker Engine and Compose installed. No Node.js installation is required on the host.

#### Prerequisites

- Docker Engine 24+ with the Compose plugin (or Docker Desktop).
- A copy of `.env.example` (included in the repository root).

#### 1. Configure Environment Variables

The AVRA web container reads runtime secrets from environment variables. The recommended approach is to create a `.env` file in the project root **before** bringing containers up. Docker Compose automatically loads it and substitutes values into the `web` service's `environment` block.

Copy the example file and fill in every required value:

```bash
cp .env.example .env
```

Key variables to set for a container deployment:

```dotenv
# Points to the postgres service by its Compose service name — do not use localhost.
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/avra?schema=public"

# HMAC-SHA256 session signing key — 64 random bytes encoded as hex.
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
AUTH_SESSION_SECRET="<64-byte-hex>"

# AES-256-GCM key for encrypting settings at rest (SMTP passwords, API keys).
# Must be exactly 64 hex characters (32 bytes).
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SETTINGS_ENCRYPTION_KEY="<64-hex-chars>"

# AES-256-GCM key for encrypting TOTP / MFA secrets — same format.
MFA_ENCRYPTION_KEY="<64-hex-chars>"
```

> **Security note:** Never commit `.env` to version control. It is already listed in `.gitignore`. For production deployments prefer a secrets manager (Docker Secrets, HashiCorp Vault, AWS Secrets Manager) over a plain file.

> **Build-time vs. runtime keys:** The `Dockerfile` builder stage supplies syntactically valid dummy hex strings for `SETTINGS_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY`, `AUDIT_BUNDLE_SECRET`, and `AUTH_SESSION_SECRET` via `ARG`/`ENV` so the environment validator (`env-check.mjs`) passes during `docker-compose up --build`. These stub values are **build-time only** — they are never baked into the final runner image and carry no security weight. At container startup every key is replaced by the real values you provide in `docker-compose.yml` → `environment:` or your `.env` file. If you see a blank or incorrect key at runtime, verify that your `docker-compose.yml` (or runtime secret store) is supplying all four keys.

#### 2. Build and Start All Services

```bash
docker-compose up -d
```

This single command:

1. Builds the AVRA image from the `Dockerfile` (three-stage build: deps → builder → runner).
2. Starts the PostgreSQL 16 container and its persistent named volume (`postgres_data`).
3. Waits for the database health check to pass before starting the `web` container.
4. Starts AVRA on port `3000`.

#### 3. Initialize the Database

On first launch, run Prisma migrations against the running database container:

```bash
docker-compose exec web npx prisma db push
```

This also provisions the default demo company, NIS2 questionnaire catalog, and three preview vendors so the dashboard is immediately usable.

#### 4. Open the Application

```
http://localhost:3000
```

#### How Environment Variables Are Handled Inside the Container

The container is a standard Node.js process; it reads environment variables at **runtime**, not at build time. The Dockerfile does not bake any `.env` secrets into the image layers. There are three ways to supply them:

| Method | When to use |
|---|---|
| `.env` file in the project root | Local / development — Docker Compose loads it automatically |
| `environment:` block in `docker-compose.yml` | Staging pipelines where values are injected by CI |
| Docker Secrets / external secret store | Production — mount secrets as files and reference with `_FILE` suffix where supported |

#### `env-check` Logic Still Protects the Container

The `scripts/env-check.mjs` script is part of the `prebuild` npm lifecycle. It runs during container image construction (the builder stage calls `npm run build` which triggers `prebuild`) and will **fail the build** if any required variable is missing or malformed. This means a container image that was successfully built is already guaranteed to have passed the environment validation gate.

At runtime, Next.js itself validates the presence of variables referenced via `lib/env.ts` on server startup, so misconfigured containers are caught early — before the first request is served — rather than failing silently on a specific code path.

#### Useful Container Commands

```bash
# View live logs from the web container
docker-compose logs -f web

# Run a Prisma migration against the running database
docker-compose exec web npx prisma db push

# Open a psql shell inside the database container
docker-compose exec postgres psql -U postgres -d avra

# Stop all containers (preserves the postgres_data volume)
docker-compose down

# Stop all containers and delete data (full reset)
docker-compose down -v
```

---

### Demo Environment

After the initial `npx prisma db push`, AVRA starts with a preview company, the built-in NIS2 questionnaire catalog, and these three demo vendors:

| Demo vendor | Service type | Initial assessment state | Initial risk |
| --- | --- | --- | --- |
| Northwind Analytics | SaaS / Data Analytics | Completed | Low |
| Contoso Cloud IAM | Identity & Access | In review | Medium |
| Fabrikam Payments | Payment Processing | Pending | High |

This preview data helps you inspect the dashboard, vendor list, and assessment flows immediately after the first database initialization.

---

### Test Accounts & Roles

> **⚠️ Development & Demo Only** — These credentials exist exclusively for local development and demonstration purposes. **Do not use them in production.**

All accounts below are automatically provisioned during `npx prisma db push` (or on first app start). No manual seeding step is required.

#### Sign-In Routes

| Role type | Sign-in route |
| --- | --- |
| Admin / Auditor (internal) | `http://localhost:3000/en/auth/sign-in` |
| Vendor (external portal) | Unique access code delivered via the invite flow — no password login |

#### Internal Accounts (Admin & Auditor)

Use the **Internal Workspace Sign-In** page (`/auth/sign-in`) for these roles. They have access to the full dashboard, vendor list, assessment workspaces, AI configuration, settings, and audit logs based on their role.

| Role | Email | Password | Access Scope |
| --- | --- | --- | --- |
| **Admin** | `admin@avra.local` | `admin123` | Full system control — vendor management, AI config, user settings, audit logs |
| **Auditor** | `auditor@avra.local` | `auditor123` | Read-only — assessments, compliance charts, audit trail (no write access) |

#### External Vendor Account

Vendor users do **not** use a password login. They receive a time-limited access code and a portal link via the invite flow initiated by an Admin from the Vendors table.

| Vendor | Contact email | Login method | Access Scope |
| --- | --- | --- | --- |
| Northwind Analytics | `contact@northwind.local` | Access code (via invite) | External assessment portal — questionnaire completion and document upload only |

To generate a vendor invite: open the **Vendors** table as Admin → locate the vendor row → click **Send invite** → distribute the generated portal link and access code.

---

### Database Reset (PostgreSQL Re-Init)

Use this when switching from SQLite migrations or when local DB state is corrupted.

PowerShell:

```powershell
docker-compose down -v
docker-compose up -d
Remove-Item -Path "prisma/migrations" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "node_modules/.prisma" -Recurse -Force -ErrorAction SilentlyContinue
npx prisma generate
npx prisma db push
```

Bash:

```bash
docker-compose down -v
docker-compose up -d
rm -rf prisma/migrations
rm -rf node_modules/.prisma
npx prisma generate
npx prisma db push
```

Running `npx prisma db push` after a reset recreates the preview environment automatically.

### Prisma Config Note

This repository no longer uses the deprecated `package.json#prisma` field. This keeps the project compatible with upcoming Prisma 7 behavior.

### Useful Scripts

```bash
# Development
npm run dev               # Start dev server (with pre-flight checks)
npm run dev:turbo         # Start dev server with Turbopack
npm run build             # Production build (runs env validation + prisma generate)
npm run start             # Start production server

# Code quality
npm run lint

# Database
npm run db:push           # Push schema changes without a migration file
npm run db:migrate        # Create and apply a named Prisma migration
npm run db:seed           # Run the Prisma seed script manually
npm run db:studio         # Open Prisma Studio (browser-based DB explorer)

# Testing
npm run test              # Run unit tests once (Vitest)
npm run test:watch        # Run unit tests in watch mode
npm run test:coverage     # Run unit tests with v8 coverage report
npm run test:e2e          # Run E2E tests (Playwright)
npm run test:e2e:ui       # Open Playwright UI runner

# Utilities
npm run audit:verify-chain   # Verify the cryptographic audit log hash-chain
npm run env:validate         # Validate required environment variables
npm run ready-check          # Pre-flight check (Docker / DB reachability)
npm run clean                # Remove all build and dev caches
npm run clean:dev            # Remove dev caches only (.next)
npm run clean:build          # Remove build artefacts only
```

### Testing

AVRA ships with both unit tests (Vitest) and end-to-end tests (Playwright).

#### Unit Tests

Located in `tests/unit/`. Cover domain logic such as risk scoring and audit log sanitization.

```bash
npm run test              # Run once
npm run test:watch        # Watch mode
npm run test:coverage     # With v8 coverage report
```

#### End-to-End Tests

Located in `tests/e2e/`. Cover critical user flows (vendor invitation, assessment completion) against a running development server.

```bash
# Requires a running app (npm run dev) and a seeded database
npm run test:e2e          # Headless Chromium run
npm run test:e2e:ui       # Playwright interactive UI
```

Configuration is in `playwright.config.ts` (base URL: `http://localhost:3000`).

#### Audit Chain Verification

After running the app with real data, verify the forensic audit log hash-chain with:

```bash
npm run audit:verify-chain
```

This replays every `eventHash` and `previousLogHash` in sequence and reports any broken links.

---

### Repository Information

- Git remote: `https://github.com/unterdacker/AVRA.git`
- Default local app URL: `http://localhost:3000`

### License

This project is licensed under the Apache License 2.0. It is designed for enterprise-grade compliance and is open for community contributions while maintaining a posture suitable for corporate integration.

### Contributing

Contributions are welcome. A practical flow for this codebase:

1. Fork the repository (or create a branch in the main repo).
2. Create a feature branch:

```bash
git checkout -b feat/short-description
```

3. Run checks locally before opening a PR:

```bash
npm run lint
npm run test
npm run build
```

4. If schema changes were made, include Prisma updates and migration notes.
5. Open a pull request with:
: scope and intent,
: screenshots (if UI changed),
: test/verification notes.

### Release Process

A lightweight release process recommendation:

1. Ensure `main` is green (`lint` + `build`).
2. Bump version in `package.json` as needed.
3. Create a release tag:

```bash
git tag v0.x.y
git push origin v0.x.y
```

4. Deploy with production environment variables and a production-grade database.
5. Add release notes summarizing features, fixes, and migration impacts.

### Internationalization Notes

- Add/adjust translation keys in:
	- `messages/en.json`
	- `messages/de.json`
- Route localization is handled with locale prefixes (`/en`, `/de`).

### Security and Compliance Notes

- AVRA is designed for EU-oriented security workflows and NIS2-aligned assessments.
- Use production-grade secrets management for API keys and cron secrets.
- For production, prefer managed EU-region databases and hardened deployment settings.
- Set `SETTINGS_ENCRYPTION_KEY` in production to a 64-character hex string (32 bytes). This key encrypts mail credentials stored via the web console (AES-256-GCM). It cannot be configured through the UI — it must be present before the app starts. Generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. In local dev it can be omitted; a deterministic fallback is used automatically.
- Set `AUDIT_SIGNING_SECRET` in production to a high-entropy random string (min. 32 bytes). This key signs the forensic bundle HMAC. Without it, bundles fall back to `dev-secret` and must not be used as legal evidence.
- The audit log is append-only by design. No application-level delete or update path exists for `AuditLog` rows. Enforce this at the database level with a restrictive role that has `INSERT`/`SELECT` only on the `AuditLog` table.
- IP truncation and user-ID pseudonymization are applied automatically by `lib/audit-sanitize.ts`. Do not bypass these helpers when writing custom log calls.
- The forensic bundle endpoint (`GET /api/audit-logs/forensic-bundle`) is restricted to the `ADMIN` role and is company-scoped. It must sit behind your network perimeter or an API gateway in production.

### Troubleshooting

- If you see `MISSING_MESSAGE`, verify keys exist in both locale files and that the correct namespace is used in `useTranslations(...)`.
- If Prisma errors occur, re-run:

```bash
npx prisma generate
npx prisma db push
```

- If development startup fails after dependency changes, try:

```bash
Remove-Item -Path ".next" -Recurse -Force -ErrorAction SilentlyContinue
npm install
npm run dev
```

On Bash, you can use:

```bash
rm -rf .next
npm install
npm run dev
```