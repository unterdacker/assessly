![Version](https://img.shields.io/badge/version-0.1.0-informational) [![CI](https://github.com/unterdacker/venshield/actions/workflows/ci.yml/badge.svg)](https://github.com/unterdacker/venshield/actions/workflows/ci.yml) [![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-blue?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org) [![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com) ![Visitors](https://visitor-badge.laobi.icu/badge?page_id=venshield.assessly)

[![Stack](https://skillicons.dev/icons?i=nextjs,postgres,docker,ts,prisma,redis)](https://skillicons.dev)

# Venshield — Sovereign Vendor Risk Assessment Platform

Venshield helps security and compliance teams manage third-party vendor risk in line with **NIS2** and **DORA** requirements. It replaces disconnected spreadsheets and inboxes with one auditable workspace covering vendor onboarding, questionnaire execution, AI-assisted document analysis, evidence review, and remediation tracking.

### Key advantages

- **NIS2 & DORA ready** — structured vendor questionnaires, control traceability, and remediation workflows aligned to NIS2 Article 21 supply chain obligations.
- **Data stays in Europe** — AI analysis runs on your own infrastructure via [Ollama](https://ollama.com/) or EU-hosted providers. No assessment data is sent to US cloud services.
- **EU AI Act compliant by design** — every AI-assisted action is traceable, human-reviewable, and logged. Meets transparency and oversight requirements out of the box.
- **Cryptographic audit trail** — tamper-evident chain-of-custody for all compliance events, exportable for auditors and regulators.
- **Air-gap capable** — fully self-hostable with no mandatory external dependencies.
- **Enterprise SSO (Premium)** — OIDC single sign-on with PKCE support, just-in-time user provisioning, and per-company identity provider configuration. Available on the Premium plan.
- **Advanced Reporting (Premium)** — AI-generated compliance reports with one-click PDF export, executive summaries, and a built-in report editor. Available on the Premium plan.

**Stack:** Next.js 15.1 · React 19 · TypeScript 5.7 · Prisma 6 · PostgreSQL 16 · Tailwind CSS 3 · Radix UI · next-intl 4

---

## Screenshots

New screenshots are being prepared. Below is an overview of the five key screens that will be documented visually.

### 1 — Dashboard: Supply Chain Risk at a Glance
Mission-control overview of your vendor portfolio: aggregated NIS2 compliance score, pending and completed assessment counters, category compliance radar chart, vendors-by-risk distribution bar chart, and an AI-generated executive risk summary. The ideal first screen for security and compliance teams starting their morning review.

<!-- screenshot placeholder: docs/screenshots/dashboard.png -->

### 2 — Vendor Assessment Workspace: NIS2 Review in One Place
The internal auditor view of a live vendor assessment: 20 NIS2 control questions with AI-pre-filled answers, an embedded evidence document viewer, side-panel compliance scoring, and a remediation action panel. Replaces the spreadsheet-and-inbox workflow entirely.

<!-- screenshot placeholder: docs/screenshots/assessment-workspace.png -->

### 3 — Audit Trail: Cryptographic Chain of Custody
Every compliance event — logins, assessments, file uploads, AI actions, role changes — is hash-chained, timestamped, IP-truncated, and exportable for regulators. Demonstrates built-in NIS2 Article 21, DORA Art. 9, and EU AI Act Art. 12/14 readiness at a glance.

<!-- screenshot placeholder: docs/screenshots/audit-trail.png -->

### 4 — Advanced Reporting: AI Compliance Reports with PDF Export *(Premium)*
The reporting dashboard listing all generated compliance reports. Opening a report shows the AI-written executive summary, per-category risk breakdown, and a one-click PDF export button for sharing with boards, auditors, and regulators. Available exclusively on the Premium plan.

<!-- screenshot placeholder: docs/screenshots/advanced-reporting.png -->

### 5 — Enterprise SSO: Identity Provider Configuration *(Premium)*
The **Settings → SSO** admin panel where an ADMIN configures the OIDC issuer URL, client credentials, and just-in-time provisioning rules including email domain allow-listing. Enterprise-grade identity management with a full cryptographic audit trail. Available exclusively on the Premium plan.

<!-- screenshot placeholder: docs/screenshots/sso-settings.png -->

---

## Quick Start

**Prerequisites:** Node.js 20+, npm 10+, Docker Desktop

```bash
git clone https://github.com/unterdacker/venshield.git
cd venshield
npm install
```

Create `.env`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/venshield?schema=public"
```

```bash
docker-compose up -d
npx prisma generate
npx prisma db push
npx prisma db seed
npm run dev
```

> ⚠️ **Development only.** `npx prisma db seed` creates demo accounts with default passwords (`admin123`, `auditor123`). Never run this against a production database. Set `VENSHIELD_ADMIN_PASSWORD` and `VENSHIELD_AUDITOR_PASSWORD` environment variables to override the defaults before seeding.

Open `http://localhost:3000`.

## Demo Accounts (Development Only)

| Role    | Email                      | Password   |
|---------|----------------------------|------------|
| Admin   | `admin@venshield.local`     | `admin123` |
| Auditor | `auditor@venshield.local`   | `auditor123` |

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
| **Premium** | Everything in Free, plus **OIDC/SSO** (single sign-on with just-in-time provisioning), **Advanced Reporting** (AI compliance reports, PDF export, executive summaries), and priority support. |

> Interested in Premium? [Contact us](mailto:venshield@proton.me) — paying customers receive access to the pre-built Docker image hosted on GitHub Container Registry (GHCR).

## Documentation

Full documentation is available in the [wiki](docs/wiki/Home.md):

- [Getting Started](docs/wiki/Getting-Started.md)
- [Architecture Overview](docs/wiki/Architecture-Overview.md)
- [Enterprise Features (SSO & Advanced Reporting)](docs/wiki/Enterprise-Features.md)
- [Deployment](docs/wiki/Deployment.md)
- [Security Architecture](docs/wiki/Security-Architecture.md)

## Premium Distribution

The Premium plan is delivered as a pre-built Docker image hosted on **GitHub Container Registry (GHCR)**. Paying customers are granted pull access to the image for their organisation. There is no license file to manage — access is controlled at the registry level.

[Contact us](mailto:venshield@proton.me) to subscribe. See [Enterprise Features](docs/wiki/Enterprise-Features.md) for full details.
