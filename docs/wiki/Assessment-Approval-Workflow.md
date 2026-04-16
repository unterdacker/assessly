# Assessment Approval Workflow *(Premium — full lifecycle)*

## Overview

The Assessment Approval Workflow introduces a structured, multi-step review lifecycle for vendor assessments. Every status transition is actor-stamped, timestamped, and recorded in an immutable `AssessmentApprovalStep` audit trail, satisfying NIS2 Article 21 and DORA chain-of-custody requirements.

**Where to find it:** Vendor detail page → Assessment panel (approval controls appear inline based on your role and plan)

**Required role:** ADMIN or RISK_REVIEWER

---

## Status Lifecycle

### Free Plan

```
PENDING → UNDER_REVIEW → COMPLETED
                       ↘ REJECTED  (comment required)
```

### Premium Plan

```
PENDING → SUBMITTED → REVIEWER_APPROVED → SIGN_OFF → ARCHIVED
                ↘ REJECTED (comment required, ADMIN only)
     REVIEWER_APPROVED ↘ REJECTED (comment required, ADMIN only)
             SIGN_OFF   ↘ REJECTED (comment required, ADMIN only)
```

---

## Transition Matrix

| From | To | Allowed Roles | Premium | Comment Required |
|---|---|---|---|---|
| PENDING | UNDER_REVIEW | ADMIN, RISK_REVIEWER | No | No |
| UNDER_REVIEW | COMPLETED | ADMIN | No | No |
| UNDER_REVIEW | REJECTED | ADMIN | No | **Yes (≥ 10 chars)** |
| PENDING | SUBMITTED | ADMIN, RISK_REVIEWER | Yes | No |
| SUBMITTED | REVIEWER_APPROVED | ADMIN, RISK_REVIEWER | Yes | No |
| REVIEWER_APPROVED | SIGN_OFF | ADMIN | Yes | No |
| SIGN_OFF | ARCHIVED | ADMIN | Yes | No |
| SUBMITTED | REJECTED | ADMIN | Yes | **Yes (≥ 10 chars)** |
| REVIEWER_APPROVED | REJECTED | ADMIN | Yes | **Yes (≥ 10 chars)** |
| SIGN_OFF | REJECTED | ADMIN | Yes | **Yes (≥ 10 chars)** |

---

## Reviewer Assignment *(Premium)*

An ADMIN can assign or reassign a reviewer to any assessment before or during the review cycle. Re-assignment is recorded as an approval step. Uses an optimistic lock (`expectedCurrentReviewerId`) to prevent concurrent re-assignment conflicts.

---

## Email Notifications *(Premium)*

On every successful status transition, Venshield sends a fire-and-forget notification email to all active ADMIN and RISK_REVIEWER users in the company. Email delivery failures are logged to the audit trail but do not roll back the transition.

---

## Audit Trail

Every transition writes an `AssessmentApprovalStep` record containing:

| Field | Description |
|---|---|
| `fromStatus` | Status before the transition |
| `toStatus` | Status after the transition |
| `actorUserId` | User who triggered the transition |
| `comment` | Optional (required for rejections) |
| `createdAt` | Timestamp |

Additionally, each transition logs a `ASSESSMENT_STATUS_TRANSITIONED` event to the company audit log with `retentionPriority: HIGH`.

---

## Rate Limiting

Status transitions are rate-limited to **30 per company per 60-second window** to prevent automated abuse.

---

## Concurrency Safety

The transition uses an optimistic lock via `updateMany WHERE status = fromStatus`. If a concurrent transition has already changed the status, the action returns an error (`"Status was changed concurrently"`) without partial writes.