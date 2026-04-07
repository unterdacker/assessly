# Scripts Reference

All scripts are available via `npm run <command>`.

---

## Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Next.js development server (runs `ready-check` and `clean:dev` first) |
| `npm run dev:turbo` | Start with Turbopack bundler (faster HMR) |
| `npm run build` | Production build (runs `env:validate`, `compute-themes-hash`, `prisma generate`) |
| `npm run start` | Start the production server (after `build`) |
| `npm run lint` | Run Next.js ESLint |

---

## Database

| Command | Description |
|---------|-------------|
| `npm run db:migrate` | Create and apply a new Prisma migration (`prisma migrate dev`) |
| `npm run db:push` | Push schema changes to the database without a migration file (development only) |
| `npm run db:seed` | Run the Prisma seed script (`prisma/seed.ts`) to populate demo data |
| `npm run db:studio` | Open Prisma Studio — a visual database browser at `http://localhost:5555` |

---

## Testing

| Command | Description |
|---------|-------------|
| `npm run test` | Run all Vitest unit tests once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:coverage` | Run Vitest with coverage report |
| `npm run test:e2e` | Run Playwright E2E tests (headless) |
| `npm run test:e2e:ui` | Run Playwright with interactive UI |

---

## Audit Trail

| Command | Script | Description |
|---------|--------|-------------|
| `npm run audit:verify-chain` | `scripts/verify-audit-chain.ts` | Verify hash-chain integrity for all companies |
| `npm run audit:tamper-test` | `scripts/forensic-tamper-test.ts` | Intentionally corrupt a test entry and verify detection |
| `npm run audit:simulate-trace` | `scripts/simulate-traceability-chain.ts` | Create a synthetic audit chain for compliance demonstration |

---

## Environment & Configuration

| Command | Script | Description |
|---------|--------|-------------|
| `npm run env:validate` | `scripts/env-check.mjs` | Validate all environment variables against the Zod schema |
| `npm run compute-themes-hash` | `scripts/compute-themes-hash.mjs` | Pre-compute CSP hash for the theme script (runs automatically before build) |

---

## Maintenance

| Command | Script | Description |
|---------|--------|-------------|
| `npm run clean` | `scripts/clean.mjs --mode=all` | Remove all build and dev artefacts |
| `npm run clean:dev` | `scripts/clean.mjs --mode=dev` | Remove development cache (`.next/`, etc.) |
| `npm run clean:build` | `scripts/clean.mjs --mode=build` | Remove production build output |
| `npm run ready-check` | `scripts/ready-check.mjs` | Pre-flight check before dev/build (verifies `node_modules`, `prisma client`) |

---

## Data Backfill Scripts

These scripts are used for migrating data when schema scoring changes are deployed:

| Script | Description |
|--------|-------------|
| `scripts/backfill-new-scoring.ts` | Re-calculates compliance scores for all assessments using the current scoring algorithm |
| `scripts/backfill-risk-levels.ts` | Re-derives `riskLevel` from `complianceScore` for all assessments |
| `scripts/verify-risk-levels.ts` | Queries all assessments and reports any where stored `riskLevel` doesn't match derived value |

Run these with `npx tsx scripts/<name>.ts` directly.
