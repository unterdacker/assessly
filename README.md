![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)

# Assessly - Sovereign Vendor Risk Assessment Platform

Assessly is an enterprise-grade vendor risk assessment platform for NIS2-aligned supply chain assurance.
It combines auditable compliance workflows with sovereign AI options so organizations can keep control of data, models, and deployment boundaries.

## Why Assessly

Security and compliance teams often run third-party risk processes across disconnected spreadsheets, inboxes, and ad-hoc evidence stores.
Assessly centralizes this into one operational workspace for vendor onboarding, assessment execution, evidence review, and remediation tracking.

## Sovereign and Local AI Positioning

Assessly is built for sovereign operation from day one.

- Local LLM inference via Ollama: run AI analysis on your own infrastructure so no assessment data leaves your deployment boundary.
- EU AI Act compliance by design: AI-assisted actions are traceable, reviewable, and governance-ready.
- Air-gapped capable: deploy fully isolated environments for high-assurance sectors.
- GDPR-first architecture: data minimization, role-scoped access, and compliance-ready auditability.
- No cloud AI lock-in: choose local models or EU-hosted providers based on policy and risk posture.

## Core Capabilities

- NIS2-aligned vendor questionnaires and remediation workflows.
- Internal workspace for Admin and Auditor roles.
- External vendor portal with isolated access-code based sessions.
- AI-assisted document analysis for evidence PDFs.
- Cryptographic audit-trail integrity checks and forensic export support.
- English/German localization with next-intl.

## Compliance Focus

Assessly is designed to support real-world assurance programs with emphasis on:

- NIS2 and DORA control traceability.
- EU AI Act transparency and human oversight evidence.
- ISO 27001 and SOC2-aligned operational controls.
- GDPR/DSGVO privacy-by-default principles.

## Technology Stack

- Next.js 15 (App Router), React 19, TypeScript 5
- Prisma ORM + PostgreSQL 16
- Tailwind CSS + Radix UI
- next-intl localization
- Mistral SDK and local AI endpoint support (including Ollama)
- Vitest (unit) + Playwright (E2E)

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (or Docker Engine + Compose)

### Clone and Install

```bash
git clone https://github.com/unterdacker/assessly.git
cd assessly
npm install
```

### Configure Environment

Create `.env` in the project root:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/assessly?schema=public"
```

Optional AI configuration:

```bash
AI_PROVIDER="local"
LOCAL_AI_ENDPOINT="http://localhost:11434"
LOCAL_AI_MODEL="ministral-3:8b"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Run with Docker Compose

```bash
docker-compose up -d
```

### Initialize Database

```bash
npx prisma generate
npx prisma db push
```

### Start Development Server

```bash
npm run dev
```

Open `http://localhost:3000`.

## Mail and Invite Flow

Mail delivery is configured in the UI under Settings -> Mail.
Assessly supports Log, SMTP, and Resend strategies with encrypted secret storage.
Vendor invite flows support split credential delivery patterns suitable for stronger operational security.

## Demo Accounts (Development Only)

- Admin: `admin@assessly.local` / `admin123`
- Auditor: `auditor@assessly.local` / `auditor123`

These credentials are for local development and demo use only.

## Local and Air-Gapped Deployment Notes

For sovereign deployments:

- Keep `AI_PROVIDER=local`.
- Point `LOCAL_AI_ENDPOINT` to your internal Ollama endpoint.
- Disable outbound network egress where required.
- Use internal PKI, secrets management, and hardened PostgreSQL policies.

## Useful Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run test:e2e
npm run audit:verify-chain
npm run env:validate
```

## Repository

- Git remote: `https://github.com/unterdacker/assessly.git`
- Default app URL: `http://localhost:3000`

## License

Apache License 2.0.

## Contributing

1. Create a feature branch.
2. Run checks locally (`lint`, `test`, `build`).
3. Open a PR with scope, validation notes, and screenshots for UI changes.
