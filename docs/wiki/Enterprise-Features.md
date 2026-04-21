# Enterprise Features

Venshield offers a **Premium plan** for organisations that require enterprise identity management and advanced compliance reporting capabilities. Both features are included in the Premium Docker image distributed via GitHub Container Registry (GHCR) — no license file required.

---

## OIDC Single Sign-On

Enterprise SSO allows users to authenticate using an existing corporate identity provider (IdP) via the OpenID Connect standard. Users no longer need a separate Venshield password — they log in through your organisation's existing identity infrastructure.

**Who configures it:** An **ADMIN** at **Settings → SSO**.

### Capabilities

- **OpenID Connect (OIDC) support with PKCE support** — compatible with Microsoft Entra ID (Azure AD), Okta, Keycloak, Auth0, and any standards-compliant OIDC provider
- **Just-in-time (JIT) user provisioning** — new users are automatically created in Venshield the first time they log in via SSO, with no manual invite step required
- **Email domain allowlisting** — optionally restrict JIT provisioning to specific corporate email domains (e.g. `example.com`) to prevent unwanted accounts
- **AUDITOR role by default** — users provisioned via JIT receive the read-only **AUDITOR** role; an ADMIN can elevate them to RISK_REVIEWER or ADMIN at any time via **Settings → Users**
- **Full audit trail** — every SSO login attempt, success, and new user provisioning event is written to the cryptographic audit log

> **⚠️ MFA for SSO Users** — Venshield's built-in MFA enforcement (org-wide policy and per-user TOTP) **does not apply** to users who authenticate via SSO. If your organisation requires MFA, it must be enforced at the **Identity Provider level** (for example, Conditional Access in Microsoft Entra ID, a Sign-On Policy in Okta, or an authentication policy in Keycloak). Relying solely on Venshield's MFA settings will not protect SSO-authenticated accounts.

### Login Flow

1. A user visits the SSO sign-in page and enters their work email address.
2. Venshield looks up the OIDC provider configured for the user's company and redirects the browser to the identity provider's authorisation endpoint.
3. The user authenticates with the identity provider (password, MFA, etc. — entirely managed by the IdP).
4. The IdP redirects back to Venshield with an authorisation code.
5. Venshield validates the response, exchanges the code for an identity token, verifies the user's identity, and creates a session.
6. The user is redirected to the dashboard.

### Audit Events

| Event | When it fires |
|-------|---------------|
| `SSO_LOGIN_SUCCESS` | Successful SSO login |
| `SSO_LOGIN_FAILED` | Any failure in the SSO flow |
| `SSO_USER_PROVISIONED` | A new user was created via JIT provisioning |

All events are written to the tamper-evident audit log with category `AUTH`.

---

## Advanced Reporting

Advanced Reporting generates structured compliance reports that combine vendor assessment data, NIS2 control scores, and an AI-written executive summary. Reports can be reviewed, refined, and exported as PDF for sharing with boards, external auditors, and regulators.

**Where to find it:** The **Reporting** item in the main navigation.

### Capabilities

- **AI-generated executive summaries** — powered by your configured AI provider (Ollama or Mistral AI). The summary covers category risk scores, overall compliance posture, and top remediation priorities.
- **Interactive report editor** — review and refine the AI-drafted summary before publishing. All edits are saved explicitly.
- **One-click PDF export** — generate a formatted PDF report ready for distribution. The download is available directly from the report detail view.
- **Report history** — a report card list shows all generated reports with their creation date and status.
- **EU AI Act compliant** — all AI invocations are logged to the audit trail with model identification and input traceability (Art. 12/14), consistent with the rest of the platform.

---

## Outbound Webhooks

Outbound Webhooks let you push real-time HTTP event notifications to external endpoints when key events occur in your organisation. Webhooks are HMAC-signed for authenticity and delivered over HTTPS — no polling required.

**Who configures it:** An **Admin** at **Settings → Webhooks**.

### Supported Events

| Event | Trigger |
|---|---|
| `assessment.completed` | An assessment is marked completed by a reviewer |
| `assessment.submitted` | A vendor submits their assessment questionnaire |
| `vendor.created` | A new vendor is added to the organisation |
| `vendor.risk_changed` | A vendor's risk level changes on assessment update |

### Capabilities

- **HMAC-SHA256 signatures** — every delivery is signed so receivers can verify authenticity
- **Replay attack prevention** — 5-minute timestamp window enforced on the `X-Venshield-Timestamp` header
- **SSRF protection** — private IPs, loopback, and cloud metadata endpoints are blocked at registration and delivery time
- **DNS rebinding protection** — DNS resolved fresh at delivery rather than trusted from registration
- **Secrets encrypted at rest** — signing secrets stored with AES-256-GCM using a dedicated `WEBHOOK_ENCRYPTION_KEY`
- **Displayed once** — the signing secret is shown only at creation and after explicit regeneration; store it in your secret manager immediately
- **Full audit trail** — webhook creation, updates, deletions, secret rotations, and delivery attempts are all logged

### Limits

- Max 25 webhooks per organisation
- Delivery timeout: 30 seconds
- HTTPS public endpoints only (no private IPs)
- 1–4 events per webhook subscription
- Fire-and-forget delivery (single attempt; no automatic retry)

For the full payload schemas, signature verification algorithm, Node.js receiver example, and GDPR compliance notes, see the [Outbound Webhooks](Webhooks.md) documentation page.

---

## Custom Questionnaire Builder

ADMIN users can build fully custom questionnaire templates as an alternative to the fixed NIS2 catalogue. Templates contain sections; sections contain questions of six configurable types.

**Who configures it:** An **ADMIN** at **Settings → Questionnaires**.

**Capabilities:**
- Up to 20 templates per company, 15 sections per template, 50 questions per section
- Six question types: Text, Single Choice, Multi Choice, Scale, Boolean, File Upload
- Templates can be **duplicated** (deep copy), **exported** (JSON), and **imported**
- Per-operation rate limiting to prevent abuse
- Active/inactive toggle to control visibility without deleting

_See [Questionnaire Builder](Questionnaire-Builder.md) for the full reference._

---

## Compliance Template Library

The Compliance Template Library provides pre-built questionnaire templates aligned to major compliance frameworks. Admins can browse the library and deploy any template into their company's questionnaire workspace as an editable copy.

**Who configures it:** An **ADMIN** or **RISK_REVIEWER** at **Settings → Compliance Template Library**.

### Frameworks

| Framework | Plan | Description |
|---|---|---|
| **NIS2** | Free | EU NIS2 Directive — Article 21 supply chain cybersecurity measures |
| **DORA** | Free | EU Digital Operational Resilience Act — ICT risk management for financial entities |
| **ISO 27001** | Premium | Information security management system — Annex A controls |
| **SOC 2 Type II** | Premium | AICPA Trust Services Criteria — security, availability, confidentiality |
| **HIPAA** | Premium | US HIPAA — healthcare data controls |
| **NIST CSF** | Premium | NIST Cybersecurity Framework 2.0 |
| **CIS Controls v8** | Premium | CIS Critical Security Controls — 18 top-priority control groups |

### Capabilities

- **Browse and deploy** — each framework can be deployed once per company; re-deploying is blocked after the first deployment
- **Editable copies** — deployed templates behave exactly like custom templates and can be edited, extended, or reordered after deployment
- **Rate limited** — 10 deploys per company per 5-minute window
- **Full audit trail** — every deployment is logged under `DATA_OPERATIONS` with the deploying user, company, and framework key

_See [Compliance Template Library](Compliance-Library.md) for the full reference._

---

## Assessment Approval Workflow

Venshield provides a structured multi-step review lifecycle for vendor assessments. Each status transition is actor-stamped and written to the cryptographic audit trail.

**Who uses it:** ADMIN and RISK_REVIEWER roles manage the lifecycle; VENDOR users submit assessments.

### Status Lifecycle

**Free plan (3-step flow):**

```
PENDING → UNDER_REVIEW → COMPLETED
```

**Premium plan (full 5-step chain):**

```
PENDING → SUBMITTED → REVIEWER_APPROVED → SIGN_OFF → ARCHIVED
```

### Premium Capabilities

- **Reviewer assignment** — an ADMIN can assign a specific RISK_REVIEWER to an assessment before review begins
- **Email notifications** — all ADMIN and RISK_REVIEWER users in the company receive email notifications at each transition
- **Rejection comments** — any rejection requires a written comment that is persisted and audited
- **Full audit trail** — every transition, including the actor and timestamp, is written to the tamper-evident audit log

_See [Assessment Approval Workflow](Assessment-Approval-Workflow.md) for the full reference._

---

## SLA Tracking & Automated Vendor Reminders

Venshield's SLA Tracking feature gives compliance teams visibility into assessment timelines and automates the reminder lifecycle so no vendor deadline slips without notice.

**Who configures it:** An **ADMIN** at **Settings → SLA Policies**. Due dates can be set by any ADMIN or RISK_REVIEWER.

### Free Plan Capabilities

- Set assessment due dates on any assessment
- View overdue badge on assessment cards (red if >3 days overdue, amber if ≤3 days)
- Send manual reminders to the vendor on demand (rate-limited)

### Premium Capabilities

- **SLA Policies** — create named reminder cadences with pre-due windows (1–30 days) and an optional escalation recipient
- **Automated email reminders** — cron-driven dispatch every 15 minutes: pre-due, overdue, and escalation notifications
- **SLA Compliance Rate widget** — dashboard panel showing the percentage of assessments completed on time (green ≥ 80%, amber ≥ 50%, red < 50%)
- **Overdue Assessments table** — dashboard widget listing all overdue assessments, sortable by vendor, due date, and days overdue
- Escalation emails are delivered to the designated ADMIN recipient; if no recipient is configured the escalation is skipped and audit-logged (fail-closed)

_See [SLA Tracking & Automated Vendor Reminders](SLA-Tracking.md) for the full reference._

---

## Continuous Compliance Monitoring

Venshield's Continuous Compliance Monitoring module keeps vendor risk data current by scheduling recurring assessments, capturing compliance snapshots, and alerting your team when a vendor's compliance posture deteriorates.

**Who configures it:** ADMIN users, on the vendor assessment detail page.

### Free Plan Capabilities

- Create recurring assessment schedules for vendors (auto-send disabled)
- Manually trigger a reassessment from the vendor assessment detail page
- View a recurrence badge on assessment cards showing the configured interval

### Premium Capabilities

- **Auto-send** — assessments are automatically dispatched to vendors when the scheduled date is reached
- **Regression detection** — when a vendor's overall compliance score drops by more than the configured threshold, an alert email is sent to all ADMIN and RISK_REVIEWER users in the company
- **Compliance Timeline Chart** — per-vendor compliance trend chart on the assessment detail page
- **Portfolio Compliance Widget** — dashboard panel showing the portfolio-wide compliance trend

### Recurrence Intervals

| Interval | Frequency |
|---|---|
| Monthly | Every calendar month |
| Quarterly | Every 3 months |
| Semi-annual | Every 6 months |
| Annual | Once per year |

_See [Continuous Compliance Monitoring](Continuous-Monitoring.md) for the full reference._

---

## REST API

Venshield exposes a versioned REST API for programmatic access to vendor and assessment data.

**Base path:** `/api/v1/`

**Who uses it:** Developers and integrators building automation on top of Venshield.

### Authentication

All API requests require a Bearer token issued from **Settings → API Keys**:

```http
Authorization: Bearer <api_key>
```

### Permission Scopes

| Scope | Plan | Description |
|---|---|---|
| `vendors:read` | Free | List and retrieve vendor records |
| `vendors:write` | Premium | Create and update vendors |
| `assessments:read` | Free | List and retrieve assessment records |
| `assessments:write` | Premium | Update assessment state |
| `metrics:read` | Free | Read dashboard and compliance metrics |

### Rate Limiting

- **100 requests per minute** per API key
- **300 requests per minute** per IP address
- Exceeded limits return HTTP 429 with `Retry-After: 60`

### API Documentation

- **OpenAPI 3.1 spec:** `/api/v1/openapi.json` — public, no authentication required
- **Interactive Swagger UI:** `/api/v1/docs` — public, no authentication required

_See [REST API Reference](REST-API.md) for the full endpoint reference._

---

## API Key Management

API keys are managed from the Settings panel and are required to use the REST API.

**Who configures it:** An **ADMIN** at **Settings → API Keys**.

### Capabilities

- **Issue keys** — create new API keys with a name, permission scope selection, and optional expiry date
- **Scope control** — each key is issued with explicit permission scopes
- **Shown once** — the full key value is displayed only at creation; store it in your secret manager immediately
- **Revoke and rotate** — keys can be revoked at any time; revocation takes effect immediately
- **Last-used tracking** — each key records the last API call timestamp so unused keys can be identified and cleaned up
- **Full audit trail** — key issuance, revocation, and rotation events are logged to the tamper-evident audit trail

_See [REST API Reference](REST-API.md) for the full API reference._

---

## Getting Access — Premium Docker Image

Premium features are delivered as a pre-built Docker image hosted on GitHub Container Registry (GHCR). Paying customers are granted pull access to the image for their organisation — no license file to manage.

> **Note:** Certain deployment configurations (air-gapped or on-premise) additionally accept a `LICENSE_FILE_PATH` / `LICENSE_KEY` / `LICENSE_AUDIENCE` environment variable bundle. These are documented in [Environment Variables Reference](Environment-Variables-Reference.md#premium-features).

To get started, [contact the Venshield team](mailto:venshield@proton.me). Once your subscription is confirmed you will receive GHCR credentials and deployment instructions.

```bash
docker pull ghcr.io/unterdacker/venshield-premium:latest
```

See the [Deployment guide](Deployment.md) for the full production setup.
