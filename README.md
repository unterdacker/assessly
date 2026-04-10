![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg) ![Version](https://img.shields.io/badge/version-0.1.0-informational) [![CI](https://github.com/unterdacker/assessly/actions/workflows/ci.yml/badge.svg)](https://github.com/unterdacker/assessly/actions/workflows/ci.yml)

# Assessly - Sovereign Vendor Risk Assessment Platform

Assessly helps security and compliance teams manage third-party vendor risk in line with **NIS2** requirements. It replaces disconnected spreadsheets and inboxes with one auditable workspace covering vendor onboarding, questionnaire execution, evidence review, and remediation tracking.

### Key advantages

- **NIS2 & DORA ready** — structured vendor questionnaires, control traceability, and remediation workflows aligned to NIS2 Article 21 supply chain obligations.
- **Data stays in Europe** — AI analysis runs on your own infrastructure via [Ollama](https://ollama.com/) or EU-hosted providers. No assessment data is sent to US cloud services.
- **EU AI Act compliant by design** — every AI-assisted action is traceable, human-reviewable, and logged. Meets transparency and oversight requirements out of the box.
- **Cryptographic audit trail** — tamper-evident chain-of-custody for all compliance events, exportable for auditors and regulators.
- **Air-gap capable** — fully self-hostable with no mandatory external dependencies.
- **Enterprise SSO (Premium)** — OIDC single sign-on with PKCE, JIT provisioning, and per-company IdP configuration. Available on the Premium plan.

**Stack:** Next.js 15.1 · React 19 · TypeScript 5.7 · Prisma 6 · PostgreSQL 16 · Tailwind CSS 3 · Radix UI · next-intl 4

## Screenshots

### Dashboard — Supply chain risk overview
Mission-control view of your vendor portfolio: aggregated compliance score, assessment status counters, NIS2 category radar, vendors-by-risk bar chart, and an AI-generated executive summary.

![Dashboard overview](docs/screenshots/dashboard.png)

### Vendors — Manage your third-party ecosystem
Search, invite, and monitor all vendors in one table. Each row shows access code status, compliance score, risk level, and quick actions to resend invites or open the assessment workspace.

![Vendors table](docs/screenshots/vendors.png)

### Vendor Assessment Portal — Questionnaire workspace
The vendor-facing portal where suppliers answer NIS2 controls, upload evidence documents, and fill in their company profile — all in a clean step-by-step interface.

![Vendor assessment workspace](docs/screenshots/external-assessment.png)

### Audit Trail — Cryptographic chain of custody
Every compliance event is hash-chained (NIS2 / DORA Art. 9), AI actions are traced per EU AI Act Art. 12/14, and field-level diffs follow ISO 27001 A.12.4. Each record is exportable for regulators.

![Audit trail details](docs/screenshots/audit-trail.png)

## Quick Start

**Prerequisites:** Node.js 20+, npm 10+, Docker Desktop

```bash
git clone https://github.com/unterdacker/assessly.git
cd assessly
npm install
```

Create `.env`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/assessly?schema=public"
```

```bash
docker-compose up -d
npx prisma generate
npx prisma db push
npx prisma db seed
npm run dev
```

> ⚠️ **Development only.** `npx prisma db seed` creates demo accounts with default passwords (`admin123`, `auditor123`). Never run this against a production database. Set `ASSESSLY_ADMIN_PASSWORD` and `ASSESSLY_AUDITOR_PASSWORD` environment variables to override the defaults before seeding.

Open `http://localhost:3000`.

## Demo Accounts (Development Only)

| Role    | Email                      | Password   |
|---------|----------------------------|------------|
| Admin   | `admin@assessly.local`     | `admin123` |
| Auditor | `auditor@assessly.local`   | `auditor123` |

## Commands

```bash
npm run dev                # development server
npm run build              # production build
npm run test               # unit tests (Vitest)
npm run test:e2e           # E2E tests (Playwright)
npm run test:coverage      # unit tests with coverage report
npm run lint               # linter
npm run audit:verify-chain # audit trail integrity
npm run audit:tamper-test  # forensic tamper simulation
npm run env:validate       # environment validation
npm run db:migrate         # create and apply a named migration
npm run db:push            # push schema without a migration file (dev only)
npm run db:seed            # re-seed demo data
npm run db:studio          # open Prisma Studio
```

## Plans

| Plan | Description |
|------|-------------|
| **Free** | Full access to NIS2 questionnaires, vendor portal, AI analysis, audit trail, and dashboard. |
| **Premium** | Everything in Free, plus **OIDC/SSO** (single sign-on with JIT provisioning), and priority support. |

> SSO requires the Premium plan. Contact us to upgrade.

## License

Apache License 2.0.
