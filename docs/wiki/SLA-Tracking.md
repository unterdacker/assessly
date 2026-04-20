# SLA Tracking & Automated Vendor Reminders

> **Free plan** includes due dates, overdue alerts, and manual reminders.
> **Premium plan** adds automated email reminders, SLA policies, escalation workflows, and dashboard compliance rate widgets.

Venshield's SLA Tracking feature gives compliance teams visibility into assessment timelines and automates the reminder lifecycle so no vendor deadline slips without notice.

---

## Feature Tiers

### Free Plan
- Set assessment due dates (1-day grace past, max 3 years future)
- View overdue badge on assessment cards (red if >3 days overdue, amber if ≤3 days)
- Send manual reminders via the assessment detail page (rate-limited: 5 per hour per assessment per user)
- `slaBreached` flag set automatically by cron; email NOT sent on Free

### Premium Plan
Everything in Free, plus:
- Create and manage SLA policies with pre-due reminder windows (1–30 days) and escalation recipients
- Automated email reminders dispatched by cron job (every 15 minutes): pre-due, overdue, escalation
- **SLA Compliance Rate** dashboard widget (green ≥ 80%, amber ≥ 50%, red < 50%)
- **Overdue Assessments** dashboard table widget (sortable by vendor, due date, days overdue)

---

## SLA Policies *(Premium — ADMIN only)*

**Where to configure:** Settings → SLA Policies

An SLA policy defines the reminder cadence for assessments assigned to it:

| Field | Description | Constraints |
|---|---|---|
| Name | Internal label | Unique per company |
| Pre-due window (days) | Days before `dueDate` to send the first reminder | 1–30 |
| Escalation recipient | Optional ADMIN user for escalation emails | Optional |

**Limits:** max 20 SLA policies per company; one policy per assessment.

To assign an SLA policy to an assessment, use the **SLA Policy Selector** dropdown on the assessment detail page.

---

## Assessment Due Dates

**Who can set:** ADMIN, RISK_REVIEWER (`INTERNAL_WRITE_ROLES`)  
**Where to set:** Vendor assessment detail page → Due Date Picker

**Validation rules:**
- Past dates: 1-day grace (allows backdating to yesterday)
- Future dates: maximum 3 years ahead
- Clearing the due date (null) removes the deadline entirely

When a due date passes without the assessment being completed, `slaBreached` is set to `true` automatically by the cron job on the next run.

---

## Reminder Types

| Type | Trigger | Recipient | Plan Required |
|---|---|---|---|
| `PRE_DUE` | `dueDate − preDueWindowDays` reached | Vendor email | Premium |
| `OVERDUE` | `dueDate` passed, assessment incomplete | Vendor email | Premium |
| `ESCALATION` | Overdue + SLA policy has escalation recipient | Escalation recipient (ADMIN user) | Premium |
| `MANUAL` | User clicks "Send Manual Reminder" button | Vendor email | Free |

---

## Cron Job

The automated reminder cron job must be called externally (cron scheduler, systemd timer, Kubernetes CronJob).

**Endpoint:** `POST /api/cron/sla-reminders`

**Authentication:** `Authorization: Bearer ${CRON_SECRET}` (timing-safe comparison, fail-closed)

**Recommended schedule:** every 15 minutes

**Behaviour:**
- Sets `slaBreached` flag **before** the email attempt (compliance state is independent of delivery success)
- Free plan: marks `AssessmentReminder.sentAt` without sending email
- Escalation: fail-closed — skips silently and writes an audit log entry if no escalation recipient is assigned; does NOT fall back to the first available admin
- Batch size: 50 reminders per run; logs a `SYSTEM_HEALTH` audit event if the batch is capped

**Generate CRON_SECRET:**
```bash
openssl rand -hex 32
```

Set in your environment:
```env
CRON_SECRET=<64-char hex string>
```

---

## Components

### Free Plan
| Component | Location | Purpose |
|---|---|---|
| `OverdueBadge` | Assessment cards & detail page | Shows red/amber alert when assessment is overdue |
| `DueDatePicker` | Assessment detail page | Calendar input for setting due dates |
| `ManualReminderButton` | Assessment detail page | AlertDialog-confirmed manual reminder dispatch |

### Premium Plan
| Component | Location | Purpose |
|---|---|---|
| `SlaPolicyForm` | Settings → SLA Policies | Create/edit SLA policies |
| `SlaPolicySelector` | Assessment detail page | Assign an SLA policy to an assessment |
| `OverdueDashboardWidget` | Dashboard | Sortable table of all overdue assessments |
| `SlaComplianceRateLazy` | Dashboard | SLA compliance rate gauge (green/amber/red) |

---

## Audit Trail

Every SLA-related action is logged to the cryptographic audit trail under `DATA_OPERATIONS`:

| Action | When |
|---|---|
| `sla_policy.created` | SLA policy created |
| `sla_policy.updated` | SLA policy updated |
| `sla_policy.deleted` | SLA policy deleted |
| `assessment.due_date_set` | Due date added or changed |
| `assessment.manual_reminder_sent` | Manual reminder dispatched |
| `assessment.sla_breached` | `slaBreached` flag set by cron |

---

## Rate Limiting

| Endpoint / Action | Limit | Scope |
|---|---|---|
| Manual reminder button | 5 per hour | Per assessment per user |
| SLA policy mutations | 30 per 60 seconds | Per company |
| Cron endpoint | Authentication-only | CRON_SECRET required |

---

## GDPR Compliance

- `AssessmentReminder.recipientEmail` is personal data subject to retention policy
- SLA breach flags (`slaBreached`) are retained as part of the compliance audit trail
- Audit log actor IDs are anonymised via `SET NULL` on user deletion (GDPR erasure support)
- Do not store personally identifiable reminder recipient data beyond the configured retention window

---

## Database Schema

New models added by this feature:

```prisma
enum ReminderType {
  PRE_DUE
  OVERDUE
  ESCALATION
  MANUAL
}

model SlaPolicy {
  id                      String
  companyId               String
  name                    String         // @@unique([companyId, name])
  preDueWindowDays        Int
  escalationRecipientUserId String?      // FK → User (SET NULL on delete)
}

model AssessmentReminder {
  id             String
  assessmentId   String                  // FK → Assessment (CASCADE)
  type           ReminderType
  recipientEmail String                  // PII — 90-day retention
  sentAt         DateTime?               // null = pending / retry
}
```

Assessment model additions:
```prisma
dueDate      DateTime?
slaPolicyId  String?    // FK → SlaPolicy (SET NULL)
slaBreached  Boolean    @default(false)
```
