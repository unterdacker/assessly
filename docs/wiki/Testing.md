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

## CI Pipeline Recommendations

A typical CI pipeline for Assessly should include:

```yaml
1. npm ci
2. npm run env:validate
3. npm run lint
4. npm run test:coverage
5. npm run build
6. docker-compose up -d (test database)
7. npx prisma db push
8. npm run test:e2e
9. npm run audit:verify-chain
```
