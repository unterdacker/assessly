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

- Framework: Next.js (App Router), React 19, TypeScript
- Styling/UI: Tailwind CSS, Radix UI primitives, Lucide icons
- i18n: next-intl
- Database: Prisma ORM with PostgreSQL
- AI Integration: Mistral SDK and configurable local endpoint support
- Notifications: Sonner

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

AVRA ships with three email delivery strategies controlled by a single environment variable. The default (`log`) prints a formatted simulation to the console, so the app works out of the box without any mail configuration.

| `MAIL_STRATEGY` | When to use |
|---|---|
| `log` | Local development — no SMTP or API key needed (default) |
| `smtp` | Any standard SMTP relay: Gmail, Outlook, Postmark SMTP, private on-prem mail servers |
| `resend` | Serverless / edge deployments via [Resend](https://resend.com) |

**Option A — Standard SMTP** (works with Gmail, Outlook, Postmark, any SMTP relay):

```bash
MAIL_STRATEGY="smtp"
MAIL_FROM="AVRA Compliance <noreply@yourdomain.com>"
MAIL_COMPANY_NAME="Your Company Name"
SMTP_HOST="smtp.yourdomain.com"
SMTP_PORT="587"
SMTP_USER="noreply@yourdomain.com"
SMTP_PASSWORD="your_smtp_password"
```

> For Gmail: enable "App Passwords" in your Google Account, set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`.  
> For Postmark: use your Postmark SMTP credentials from the Postmark dashboard.

**Option B — Resend API** (recommended for Vercel / serverless):

```bash
MAIL_STRATEGY="resend"
MAIL_FROM="AVRA Compliance <noreply@yourdomain.com>"
MAIL_COMPANY_NAME="Your Company Name"
RESEND_API_KEY="re_your_api_key_here"
```

> Get your free API key at [resend.com/api-keys](https://resend.com/api-keys). You must verify your sending domain in the Resend dashboard before production use.

**Option C — Log mode** (default, no config needed):

```bash
MAIL_STRATEGY="log"
```

Invite emails are printed to the server console in a formatted block. Useful for local development and demos.

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
npm run dev
npm run build
npm run start
npm run lint
npm run db:push
npm run db:migrate
npm run db:seed
npm run db:studio
```

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