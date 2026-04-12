# Enterprise Features

Venshield offers a **Premium plan** for organisations that require enterprise identity management and advanced compliance reporting capabilities. Both features are available after upgrading and placing the signed license file provided by the Venshield team.

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

## Obtaining a Premium License

To activate Premium features, contact the Venshield team to obtain a signed license file for your organisation. Once issued, follow the enterprise setup documentation shipped with your license to place the license file and configure the required environment variables.
