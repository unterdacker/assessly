# Architecture Overview

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Framework | Next.js | 15 | Full-stack React, App Router, Server Actions |
| UI | React | 19 | Component rendering |
| Language | TypeScript | 5.7 | End-to-end type safety |
| ORM | Prisma | 6.x (6.19.3) | Database access layer |
| Database | PostgreSQL | 16 | Primary persistent store |
| Styling | Tailwind CSS | 3 | Utility-first CSS |
| Component library | Radix UI | — | Accessible headless components |
| Charts | Recharts | 3 | Risk dashboards |
| Animations | Framer Motion | 12 | UI transitions |
| Validation | Zod | 4 | Schema validation on actions & env |
| Forms | React Hook Form | 7 | Client-side form handling |
| AI (cloud) | Mistral AI SDK | 2 | LLM document analysis (opt-in) |
| AI (local) | Ollama HTTP API | — | Self-hosted LLM (default) |
| Mail (SMTP) | Nodemailer | 8 | Transactional email |
| Mail (API) | Resend SDK | 6 | Transactional email alternative |
| PDF rendering | pdfjs-dist | 5 | In-browser PDF evidence viewer |
| MFA | otplib | 13 | TOTP generation/verification |
| i18n | next-intl | 4 | Locale routing (en / de) |
| Testing (unit) | Vitest | — | Unit & integration tests |
| Testing (E2E) | Playwright | 1.59 | End-to-end browser tests |

---

## Application Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser  │  React 19 components, Radix UI, Recharts, Framer Motion │
├─────────────────────────────────────────────────────────────────────┤
│  Edge     │  Next.js Middleware (i18n routing, session validation,   │
│  Runtime  │  CSP headers, CSRF guard, structured JSON logging)       │
├─────────────────────────────────────────────────────────────────────┤
│  Node.js  │  Next.js App Router — Server Components, Server Actions  │
│  Runtime  │  Prisma queries, AI provider calls, mail dispatch,       │
│           │  audit-log writes, encryption/decryption                 │
├─────────────────────────────────────────────────────────────────────┤
│  Data     │  PostgreSQL 16 (Docker)                                  │
│           │  .assessly-storage/ for uploaded PDF evidence files      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
assessly/
├── app/                          # Next.js App Router
│   ├── [locale]/                 # Localised routes (en / de)
│   │   ├── auth/                 # Sign-in page
│   │   ├── dashboard/            # Dashboard for ADMIN / AUDITOR
│   │   ├── vendors/              # Vendor list & workspace
│   │   ├── settings/             # Company & user settings
│   │   ├── admin/                # Admin panel, audit logs, user mgmt
│   │   ├── external/             # Vendor-facing portal routes
│   │   └── portal/               # Legacy portal redirect
│   ├── api/                      # API route handlers
│   │   ├── auth/                 # Login, logout, MFA verify
│   │   ├── vendors/              # Vendor CRUD
│   │   ├── documents/            # PDF upload/download
│   │   ├── remediation/          # Remediation email endpoint
│   │   ├── audit-logs/           # Audit log query endpoint
│   │   ├── cron/                 # Cron-protected maintenance routes
│   │   ├── health/               # Liveness probe
│   │   └── exit-portal/          # Vendor session termination
│   ├── actions/                  # Next.js Server Actions
│   ├── dashboard/                # Root dashboard redirect
│   └── settings/                 # Root settings redirect
├── components/                   # Shared React components
│   ├── ui/                       # Primitive UI (Button, Input, …)
│   ├── admin/                    # Admin-only components
│   └── emails/                   # React Email templates
├── lib/                          # Server-side business logic
│   ├── auth/                     # Session token, permissions, MFA pending
│   ├── ai/                       # AI provider abstraction, executive summaries
│   ├── queries/                  # Prisma read queries (dashboard, assessments)
│   ├── types/                    # Shared TypeScript types
│   └── validation/               # Zod schemas for actions
├── prisma/
│   ├── schema.prisma             # Database schema
│   └── seed.ts                   # Demo data seeder
├── messages/
│   ├── en.json                   # English translations
│   └── de.json                   # German translations
├── scripts/                      # CLI maintenance scripts
├── tests/
│   ├── unit/                     # Vitest test suites
│   └── e2e/                      # Playwright specs
├── docs/                         # Project documentation
├── Dockerfile                    # Production container image
└── docker-compose.yml            # Local all-in-one stack
```

---

## Request Lifecycle

```
Browser Request
      │
      ▼
Next.js Middleware (Edge Runtime)
  ├── next-intl locale detection & prefix routing
  ├── Session cookie validation (HMAC-SHA256)
  ├── Role-based path guard → 302 redirect if unauthorized
  ├── CSRF check (state-changing methods)
  ├── Security headers injection (CSP, HSTS, X-Frame-Options, …)
  └── Structured JSON access log emitted to stdout
      │
      ▼
Server Component / Server Action (Node.js Runtime)
  ├── Zod input validation
  ├── Prisma database query
  ├── AI provider call (optional)
  ├── Audit log write (hash-chained)
  └── Response
```

---

## Multi-Tenancy

Each tenant is represented by a **Company** record. All entities (Vendor, Assessment, AuditLog, User) carry a `companyId` foreign key. Prisma queries always scope to the authenticated user's `companyId`, preventing cross-tenant data leakage. There is no shared table without a `companyId` filter.

---

## File Storage

Uploaded PDF evidence files are stored on the local filesystem under `.assessly-storage/` relative to the working directory. The `Document` model records `storagePath` (relative path), `filename`, `mimeType`, and `fileSize`. Download is served through the `/api/documents/[id]` route handler, which re-validates session access before streaming the file.
