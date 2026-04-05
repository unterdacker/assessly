# Audit Logger / Details Forensic Stress-Test

## Scenario 1: Tamper Test

Run:

```bash
npm run audit:tamper-test -- --company <companyId>
```

Expected:
- Script mutates one `AuditLog` row directly in DB.
- In UI (`/en/admin/audit-logs`), open that row in Details modal.
- Click `Verify Integrity` in Hash-Chain section.
- Status must be `INVALID`.
- `Download Forensic Bundle` must be blocked with integrity mismatch error.

## Scenario 2: Traceability Chain

Run:

```bash
npm run audit:simulate-trace -- --company <companyId> --user <userId>
```

Expected:
- Script writes three events with shared `requestId`/trace ID:
  - `LOGIN_SUCCESS`
  - `SETTINGS_UPDATED`
  - `AI_GENERATION`
- Open Details for emitted `AI_GENERATION` event.
- `Trace ID / Correlation` shows the shared ID.
- `Related Events` lists login + settings events.

## Scenario 3: GDPR Art. 17 Scrub

Use `scrubUserLogs` in `lib/gdpr-erasure.ts`:
- Redacts non-hash-bound sensitive fields using `[REDACTED_BY_REQUEST_ART17]`.
- Keeps `previousLogHash` and `eventHash` untouched.
- Chain integrity remains verifiable.

Note:
- Hash-bound canonical fields are immutable by design: `companyId`, `userId`, `action`, `entityType`, `entityId`, `timestamp`, `previousLogHash`, `eventHash`.

## Scenario 4: Localization / UA Parsing

Manual checks:
- Open `/de/admin/audit-logs`.
- In Details modal, user agent displays localized phrasing (e.g. `Chrome 124 auf Windows`).
- GDPR tooltip uses localized next-intl key under `AuditDetails.privacy.gdprArt5Minimization`.
