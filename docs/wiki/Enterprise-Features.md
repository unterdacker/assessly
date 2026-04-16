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

## Getting Access — Premium Docker Image

Premium features are delivered as a pre-built Docker image hosted on GitHub Container Registry (GHCR). Paying customers are granted pull access to the image for their organisation — no license file to manage.

> **Note:** Certain deployment configurations (air-gapped or on-premise) additionally accept a `LICENSE_FILE_PATH` / `LICENSE_KEY` / `LICENSE_AUDIENCE` environment variable bundle. These are documented in [Environment Variables Reference](Environment-Variables-Reference.md#premium-features).

To get started, [contact the Venshield team](mailto:venshield@proton.me). Once your subscription is confirmed you will receive GHCR credentials and deployment instructions.

```bash
docker pull ghcr.io/unterdacker/venshield-premium:latest
```

See the [Deployment guide](Deployment.md) for the full production setup.
