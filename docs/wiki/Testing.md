# Testing

## Test Infrastructure

| Tool | Purpose |
|------|---------|
| Vitest | Unit and integration tests |
| Playwright | End-to-end (E2E) browser tests |
| Custom scripts | Audit trail integrity verification |

---

## Unit Tests (Vitest)

### Configuration

`vitest.config.ts` configures Vitest with the Next.js environment.

### Running Tests

```bash
npm run test              # Run all unit tests once
npm run test:watch        # Watch mode (re-runs on file change)
npm run test:coverage     # Generate coverage report
```

### Test Location

```
tests/unit/
```

### What is Unit-Tested

- Scoring logic (`calculateRiskLevel`, `riskLevelFromScore`, `supplyChainRiskScore`)
- Compliance score calculations
- Audit sanitization functions (PII scrubbing, IP truncation)
- Cryptographic helpers (encrypt/decrypt round-trip)
- Zod validation schemas for server actions
- NIS2 question catalogue completeness

---

## End-to-End Tests (Playwright)

### Configuration

`playwright.config.ts` configures Playwright.

### Running Tests

```bash
npm run test:e2e          # Run all E2E tests (headless)
npm run test:e2e:ui       # Run with Playwright UI mode (interactive)
```

### Test Location

```
tests/e2e/
```

### What is E2E-Tested

- Login flow (admin, auditor, vendor roles)
- MFA setup and verification
- Vendor creation and onboarding
- Questionnaire completion via vendor portal
- Assessment workspace — answer override, AI suggestion confirmation
- PDF document upload and evidence viewer
- Audit log access and filtering
- Settings changes (mail, AI configuration)
- GDPR erasure flow

---

## Audit Chain Verification Scripts

These CLI scripts verify the cryptographic integrity of the audit trail:

### `npm run audit:verify-chain`

```bash
npx tsx scripts/verify-audit-chain.ts
```

Walks all `AuditLog` entries for all companies in the database, recomputes each `eventHash`, and verifies that `previousLogHash` values are consistent. Reports any breaks in the chain. Use this:

- After a database migration
- After a bulk data operation
- As part of a compliance audit preparation

### `npm run audit:tamper-test`

```bash
npx tsx scripts/forensic-tamper-test.ts
```

Intentionally mutates a test audit entry and confirms that `verify-audit-chain` detects the tamper. Used to validate that the hash-chain mechanism is working correctly.

### `npm run audit:simulate-trace`

```bash
npx tsx scripts/simulate-traceability-chain.ts
```

Creates a synthetic chain of audit events and demonstrates the chain verification works end-to-end in a controlled scenario. Useful for compliance demonstrations.

---

## Risk Level Verification

```bash
npx tsx scripts/verify-risk-levels.ts
```

Queries all assessments and verifies that the stored `riskLevel` matches the expected value derived from `complianceScore` using the canonical `calculateRiskLevel()` function. Detects data inconsistencies from manual DB edits or migration issues.

---

## Environment Check

```bash
npm run env:validate
```

Validates all environment variables against the Zod schema in `lib/env.ts`. Useful before deploying to catch misconfiguration early.

---

## CI Pipeline (`.github/workflows/ci.yml`)

The project ships with a production-grade 9-job GitHub Actions pipeline triggered on every push to `main` and on all pull requests.

### Pipeline Structure

```
Phase 1 (parallel)          Phase 2 (gated)    Phase 3 (parallel)
─────────────────────       ───────────────    ──────────────────
lint                  ─┐
unit-test             ─┤
secret-scan           ─┼──▶  build  ──▶  e2e
audit                 ─┘                 a11y
─────────────────────
codeql                ──────────────────────── (independent, not a gate)
dependency-review     ──────────────────────── (PRs only, not a gate)
```

### Phase 1 — Parallel checks (no dependencies)

| Job | What it does |
|-----|-------------|
| `lint` | ESLint + TypeScript `tsc --noEmit` |
| `unit-test` | Vitest with PostgreSQL service; uploads coverage report (7-day retention) |
| `secret-scan` | Gitleaks v8.30.1; SARIF uploaded to GitHub Code Scanning |
| `codeql` | GitHub CodeQL SAST (javascript-typescript, security-extended + security-and-quality queries) |
| `audit` | `npm audit --audit-level=high`; uploads JSON report (30-day retention) |
| `dependency-review` | Software Composition Analysis on PR diffs; fails on high-severity runtime dependencies |

### Phase 2 — Build (gated on lint + unit-test + secret-scan + audit)

The `build` job:
1. Runs `npx next build` (bypasses prebuild scripts that require a live DB)
2. Verifies `.next/BUILD_ID` exists
3. Uploads the `.next/` artifact (3-day retention) for Phase 3 reuse
4. Generates a CycloneDX SBOM (`sbom.cdx.json`, 90-day retention) — non-blocking

### Phase 3 — Parallel test jobs (both require the build artifact)

| Job | What it does |
|-----|-------------|
| `e2e` | Downloads build artifact → seeds DB → starts `next start` → runs Playwright tests (Chromium) |
| `a11y` | Downloads build artifact → starts `next start` → runs `axe-core` WCAG 2.1/2.2 AA scan against `/en` and `/en/sign-in` |

### Concurrency

Each ref gets at most one in-progress run (`cancel-in-progress: true`). All jobs run with least-privilege token (`contents: read`); only `secret-scan`, `codeql`, and `dependency-review` request elevated permissions.

### Required GitHub Actions Secrets

| Secret | Description |
|--------|-------------|
| `CI_AUTH_SESSION_SECRET` | ≥32 chars random hex |
| `CI_SETTINGS_ENCRYPTION_KEY` | Exactly 64 hex chars (32 bytes) |
| `CI_MFA_ENCRYPTION_KEY` | Exactly 64 hex chars |
| `CI_AUDIT_BUNDLE_SECRET` | ≥32 chars |
| `CI_CRON_SECRET` | ≥32 chars |
| `CI_SERVER_ACTIONS_KEY` | Base64-encoded 32 bytes |
| `GITLEAKS_LICENSE` | Optional (open-source tier needs no license) |
