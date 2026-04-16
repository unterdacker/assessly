# Custom Questionnaire Builder *(Premium)*

## Overview

The Custom Questionnaire Builder allows **ADMIN** users to create fully custom vendor questionnaire templates beyond the standard NIS2 catalogue. Instead of being limited to the fixed 20-question NIS2 set (defined in `lib/nis2-questions.ts`), admins can compose templates with any number of sections and questions using six configurable question types.

**Requires:** Premium plan. Users on the Free plan see a `PremiumGateBanner` in place of the builder UI.

**Where to find it:** Settings → Questionnaires

The built-in NIS2 catalogue (20 questions across 7 categories, fixed) remains available on all plans. Custom templates complement it for other frameworks (ISO 27001, SOC2, DORA, HIPAA, etc.).

---

## Platform Limits

| Resource | Limit |
|---|---|
| Templates per company | 20 |
| Sections per template | 15 |
| Questions per section | 50 |
| Template name | 200 characters |
| Section title | 200 characters |
| Description | 2,000 characters |
| Question text | 1,000 characters |
| Help text | 2,000 characters |
| Choice options per question | 20 |
| Import file size | 512 KB |

---

## Question Types

| Type | Description | Companion fields |
|---|---|---|
| `TEXT` | Free-text answer | — |
| `SINGLE_CHOICE` | One option from a list | `options` (≥ 2 items required) |
| `MULTI_CHOICE` | One or more options from a list | `options` (≥ 2 items required) |
| `SCALE` | Numeric range (e.g. 1–5) | `scaleMin`, `scaleMax` (`scaleMin` must be strictly less than `scaleMax`) |
| `BOOLEAN` | Yes / No | — |
| `FILE_UPLOAD` | Vendor uploads a supporting document | — |

---

## UI Navigation

- **`/settings/questionnaires`** — template list page: shows all templates newest-first with section count, total question count, and active status badge. Provides **Create** and **Import** buttons.
- **`/settings/questionnaires/[templateId]`** — template detail / editor page: collapsible section accordion, per-section question list, reorder controls (up/down), and an **Export** button.

---

## Template Management

### Creating

Click **Create** on the template list page. Provide a name (required, max 200 chars) and an optional description. The new template starts inactive with no sections.

### Editing

Open a template and use the inline edit controls to update its name, description, or active status. Changes are saved immediately via server actions.

### Duplicating

Any template can be deep-copied (all sections and questions are cloned). The duplicate counts toward the 20-template cap. Provide a new name when duplicating.

### Deleting

Deleting a template is **irreversible** and cascades to all its sections and questions. A confirmation prompt is shown before the delete action is submitted.

### Active / Inactive toggle

Templates can be toggled active or inactive without deletion. **Inactive** templates are excluded from the assignment UI (they cannot be assigned to a vendor assessment) but remain fully editable. This is useful for drafts or retired templates.

---

## Section Management

- Sections require a title (max 200 chars); description is optional.
- A template may have at most **15 sections**.
- Deleting a section cascades to all its questions — this is irreversible.
- Sections can be **reordered** using up/down controls. Each reorder is a single atomic database write (`$transaction`).
- **Rate limit:** 20 section creations per minute per company.

---

## Question Management

- Each section may contain at most **50 questions**.
- Fields: question text (required), optional help text, question type, required flag, and type-specific companion fields (`options` for choice types; `scaleMin`/`scaleMax` for `SCALE`).
- Questions can be **edited** and **deleted** (deletion is immediate and irreversible).
- Questions can be **reordered** within their section using up/down controls (atomic write).
- **Rate limit:** 30 question creations per minute per company.

---

## Import & Export

### Export

Clicking **Export** on the template detail page serialises the entire template (all sections and questions) to a JSON file and triggers a browser download.

- **PII-free payload** — no user IDs, company IDs, or other metadata are included. Only structural content (name, description, sections, questions).
- **Rate limit:** 20 exports per minute per company.

### Import

Clicking **Import** on the template list page opens a file picker. The uploaded file is validated and written as a new template.

- Counts toward the **20-template cap**; the cap check is part of the same database transaction.
- A **byte-length check** (512 KB) is applied before `JSON.parse` to prevent memory exhaustion.
- The payload is validated with a **`.strict()` Zod schema** — unknown keys (including `__proto__`, `constructor`, `prototype`) are rejected at parse time (prototype-poison protection).
- The entire write (template + sections + questions) runs in a single **`$transaction`** for atomicity.
- **Rate limit:** 5 imports per minute per company.
- Imported templates are **owned by the importing company**; they are not linked to the originating company.

---

## Access Control

- Every server action calls `requireAdminUser()` **and** `requirePremiumPlan()` — both checks must pass (double guard).
- All database queries are scoped to `session.companyId`. No client-supplied company identifier is trusted.
- **Ownership verification** is a 3-hop chain: question → section → template → `companyId`. This prevents cross-tenant writes even if a valid session exists.
- **Prototype-poison protection:** Zod `.strict()` schemas used for import reject `__proto__`, `constructor`, and `prototype` keys, preventing object prototype pollution via imported JSON.

---

## Rate Limits Reference

| Operation | Limit |
|---|---|
| Template create | 10 / minute / company |
| Template duplicate | 5 / minute / company |
| Template export | 20 / minute / company |
| Template import | 5 / minute / company |
| Section create | 20 / minute / company |
| Question create | 30 / minute / company |

> **Note:** Limits are per **company**, not per user. One admin saturating the limit will block all admins in the same tenant until the sliding window resets. Implemented as a PostgreSQL-backed sliding window (`RateLimitEntry` table, `lib/action-rate-limit.ts`).

---

## Internationalisation

All UI strings are under the `"QuestionnaireBuilder"` key in `messages/en.json` and `messages/de.json`.

Sub-keys:

| Sub-key | Contents |
|---|---|
| `title` | Page and section headings |
| `list` | Template list page strings |
| `detail` | Template detail / editor page strings |
| `templateForm` | Create / edit template form labels and validation |
| `sectionForm` | Create / edit section form labels and validation |
| `questionForm` | Create / edit question form labels and validation |
| `questionTypes` | Human-readable labels for each question type |
| `actions` | Button labels (Create, Save, Cancel, Delete, …) |
| `errors` | Error messages (limit exceeded, validation failures, etc.) |
| `success` | Success toast messages |
| `sectionAccordion` | Accordion expand/collapse labels and counts |

---

## Database Schema

See [Database Schema](Database-Schema.md) for full field annotations. Four models were added for this feature:

- **`QuestionnaireTemplate`** — top-level template record, scoped to a company.
- **`TemplateSection`** — ordered section within a template.
- **`TemplateQuestion`** — ordered question within a section, with type-specific fields.
- **`QuestionType`** enum — `TEXT`, `SINGLE_CHOICE`, `MULTI_CHOICE`, `SCALE`, `BOOLEAN`, `FILE_UPLOAD`.
- **`RateLimitEntry`** — shared sliding-window rate limit table (also used by other features).

### GDPR Note

> `createdByUserId` is set to `NULL` when a user account is deleted, anonymising authorship attribution. **Template content (question text, section titles) is retained after user deletion. Authors should not embed personal data in question or section text fields. Only authorship attribution (`createdByUserId`) is anonymised.**

---

## Testing

### Unit Tests

Six unit test files cover the module:

| File | Scope |
|---|---|
| `validation` | Zod schema correctness, edge cases, prototype-poison rejection |
| `template-actions` | Create, update, delete, duplicate, export, import — happy paths |
| `section-actions` | Create, update, delete, reorder sections |
| `section-actions-extended` | Cap enforcement, rate limiting, ownership checks for sections |
| `question-actions` | Create, update, delete, reorder questions |
| `question-actions-extended` | Cap enforcement, rate limiting, ownership checks for questions |

### E2E Tests

One Playwright spec: `tests/e2e/questionnaire-builder.spec.ts`

- Navigation and access-control flows are covered (non-premium gate, admin-only access).
- Full CRUD E2E tests are **skipped pending a PREMIUM seed fixture** — they will be enabled once a seeded premium company is available in the E2E environment.
