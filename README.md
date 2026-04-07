![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buy-me-a-coffee)](https://buymeacoffee.com/assessly)

# Assessly - Sovereign Vendor Risk Assessment Platform

Assessly helps security and compliance teams manage third-party vendor risk in line with **NIS2** requirements. It replaces disconnected spreadsheets and inboxes with one auditable workspace covering vendor onboarding, questionnaire execution, evidence review, and remediation tracking.

### Key advantages

- **NIS2 & DORA ready** — structured vendor questionnaires, control traceability, and remediation workflows aligned to NIS2 Article 21 supply chain obligations.
- **Data stays in Europe** — AI analysis runs on your own infrastructure via [Ollama](https://ollama.com/) or EU-hosted providers. No assessment data is sent to US cloud services.
- **EU AI Act compliant by design** — every AI-assisted action is traceable, human-reviewable, and logged. Meets transparency and oversight requirements out of the box.
- **Cryptographic audit trail** — tamper-evident chain-of-custody for all compliance events, exportable for auditors and regulators.
- **Air-gap capable** — fully self-hostable with no mandatory external dependencies.

**Stack:** Next.js 15 · React 19 · TypeScript · Prisma · PostgreSQL 16 · Tailwind CSS · Radix UI

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
npm run dev
```

Open `http://localhost:3000`.

## Demo Accounts (Development Only)

| Role    | Email                      | Password   |
|---------|----------------------------|------------|
| Admin   | `admin@assessly.local`     | `admin123` |
| Auditor | `auditor@assessly.local`   | `auditor123` |

## Commands

```bash
npm run dev            # development server
npm run build          # production build
npm run test           # unit tests (Vitest)
npm run test:e2e       # E2E tests (Playwright)
npm run lint           # linter
npm run audit:verify-chain  # audit trail integrity
npm run env:validate   # environment validation
```

## License

Apache License 2.0.
