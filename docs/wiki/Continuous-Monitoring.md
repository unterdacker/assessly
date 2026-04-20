# Continuous Compliance Monitoring

> **Free plan** includes manual reassessment triggers and schedule creation (auto-send disabled).
> **Premium plan** adds automatic assessment dispatch, compliance regression detection with email alerts, compliance timeline charts, and portfolio-wide trend analysis.

Venshield's Continuous Compliance Monitoring module keeps vendor risk data current by scheduling recurring assessments, capturing compliance snapshots, and alerting your team when a vendor's compliance score drops below an acceptable threshold.

---

## Feature Tiers

### Free Plan
- Create recurring assessment schedules for individual vendors (auto-send disabled)
- Manually trigger a reassessment from the vendor assessment detail page
- View `RecurrenceBadge` on assessment cards showing the active schedule interval

### Premium Plan
Everything in Free, plus:
- **Auto-send** recurring assessments dispatched automatically by cron job
- **Regression detection** — alerts sent to all ADMIN and RISK_REVIEWER users when a vendor's compliance score drops by more than the configured threshold
- **Compliance Timeline Chart** on the vendor assessment detail page
- **Portfolio Compliance Widget** and **Compliance Timeline Chart** on the dashboard
- Query historical compliance snapshots for trend analysis

---

## Recurrence Schedules

A recurrence schedule links a vendor to a recurring assessment cadence.

**Where to configure:** Vendor assessment detail page → Recurrence Schedule Form

**Recurrence intervals:**

| Interval | Frequency |
|---|---|
| `MONTHLY` | Every calendar month |
| `QUARTERLY` | Every 3 months |
| `SEMI_ANNUAL` | Every 6 months |
| `ANNUAL` | Once per year |

**Schedule fields:**

| Field | Description | Plan |
|---|---|---|
| Interval | How often to send the reassessment | Free |
| Auto-send | Automatically dispatch when `nextDueAt` arrives | Premium |
| Regression threshold (%) | Score drop that triggers an alert (1–100) | Premium |
| Active | Whether the schedule is running | Free |

Each vendor can have at most one active recurrence schedule. Schedules advance from their own `nextDueAt` value (not from the current timestamp) to prevent drift.

---

## Compliance Snapshots

The compliance snapshot cron job captures a point-in-time record of overall and per-category compliance for the entire company portfolio.

**Snapshot fields:**

| Field | Description |
|---|---|
| `snapshotDate` | Date the snapshot was taken |
| `overallScore` | Portfolio-wide compliance percentage (0.00–100.00) |
| `categoryScores` | Per-category breakdown (JSON) |
| `vendorCount` | Number of active vendors at snapshot time |
| `frameworkKey` | Optional compliance framework key (e.g. `nis2`, `iso27001`) |

Snapshots are used to power:
- **Compliance Timeline Chart** (vendor-level and dashboard-level)
- **Portfolio Compliance Widget** (dashboard, Premium-gated)
- Historical trend queries via the Premium REST API

---

## Regression Detection *(Premium)*

Regression detection runs as part of the compliance snapshot cron job. When the overall score drops by more than the configured `regressionThreshold` compared to the previous snapshot, an alert email is sent.

**Alert recipients:** All users with `ADMIN` or `RISK_REVIEWER` roles in the company.

**Audit log:** A `compliance.regression_detected` event is written to the audit trail (`DATA_OPERATIONS` category) with the previous and current scores.

**Threshold configuration:** Set `regressionThreshold` (1–100) on the recurrence schedule. A value of `10` means a drop of more than 10 percentage points triggers an alert.

---

## Cron Jobs

Both cron endpoints require `Authorization: Bearer ${CRON_SECRET}`.

### 1 — Compliance Scheduler

**Endpoint:** `POST /api/cron/compliance-scheduler`

**Purpose:** Advances `nextDueAt` for all active schedules and, for Premium companies with `autoSend = true`, dispatches a new vendor assessment.

**Schedule recommendation:** Hourly or every 30 minutes (assessments are dispatched only when `nextDueAt ≤ now`).

**Batch size:** 50 schedules per run.

### 2 — Compliance Snapshot

**Endpoint:** `POST /api/cron/compliance-snapshot`

**Purpose:** Captures compliance snapshots for all companies and runs regression detection.

**Schedule recommendation:** Daily (e.g. `0 2 * * *` — 02:00 UTC).

---

## Generate CRON_SECRET

Both cron endpoints share the `CRON_SECRET` environment variable used by all cron jobs in Venshield:

```bash
openssl rand -hex 32
```

```env
CRON_SECRET=<64-char hex string>
```

---

## Dashboard Components *(Premium)*

| Component | Location | Purpose |
|---|---|---|
| `PortfolioComplianceWidget` | Dashboard | Overall portfolio compliance score with trend indicator |
| `ComplianceTimelineChartLazy` | Dashboard | Historical compliance timeline for the full portfolio |

## Assessment Detail Components

| Component | Location | Plan | Purpose |
|---|---|---|---|
| `RecurrenceBadge` | Assessment detail | Free | Shows active schedule interval (MONTHLY, QUARTERLY, etc.) |
| `RecurrenceScheduleForm` | Assessment detail | Free (create) / Premium (auto-send) | Create or edit recurring schedule |
| `ManualReassessmentButton` | Assessment detail | Free | Trigger immediate reassessment |
| `RegressionAlertBanner` | Assessment detail | Premium | Shows regression alert banner if latest snapshot shows a drop |

---

## Audit Trail

| Action | When |
|---|---|
| `compliance.schedule_created` | Recurrence schedule created |
| `compliance.schedule_updated` | Recurrence schedule updated |
| `compliance.schedule_deleted` | Recurrence schedule deleted |
| `compliance.reassessment_triggered` | Manual reassessment dispatched |
| `compliance.snapshot_captured` | Compliance snapshot written |
| `compliance.regression_detected` | Score drop exceeds threshold |

---

## Database Schema

New models added by this feature:

```prisma
enum RecurrenceInterval {
  MONTHLY
  QUARTERLY
  SEMI_ANNUAL
  ANNUAL
}

model RecurrenceSchedule {
  id                   String
  vendorId             String             // @@unique([vendorId, companyId])
  companyId            String
  interval             RecurrenceInterval
  autoSend             Boolean            @default(false)  // Premium only
  regressionThreshold  Int                // 1–100 percentage points
  nextDueAt            DateTime
  isActive             Boolean            @default(true)
  lastAssessmentId     String?
  createdByUserId      String?            // SET NULL on delete (GDPR)
}

model ComplianceSnapshot {
  id              String
  companyId       String
  snapshotDate    DateTime
  overallScore    Decimal(5,2)
  categoryScores  Json
  vendorCount     Int
  frameworkKey    String?
}
```

---

## Security Considerations

- **Cron authentication:** `CRON_SECRET` uses constant-time comparison to prevent timing attacks. Generate with `openssl rand -hex 32` (256-bit entropy).
- **Regression email recipients:** Limited to ADMIN and RISK_REVIEWER roles — no third-party or vendor email addresses receive regression alerts.
- **Batch caps:** Both cron jobs process a maximum of 50 records per run, preventing DoS-style workload spikes. A `SYSTEM_HEALTH` audit event is written when the cap is hit.
- **Schedule advancement:** `nextDueAt` advances from the schedule's own previous value (not `new Date()`), preventing schedule drift from missed runs.
