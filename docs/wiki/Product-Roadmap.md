# Product Roadmap

## What's built

- NIS2-aligned vendor questionnaire (20 questions, 7 categories)
- Vendor self-assessment portal with evidence uploads
- AI-assisted document analysis (Mistral cloud EU + Ollama self-hosted)
- Compliance scoring and risk levels (LOW / MEDIUM / HIGH)
- Supply chain risk dashboard with charts
- Tamper-evident audit trail (SHA-256 hash chain)
- Forensic export bundle (HMAC-signed JSON)
- GDPR erasure, pseudonymization, IP truncation
- Role-based access (ADMIN, RISK_REVIEWER, AUDITOR, VENDOR)
- Multi-tenancy (full company-scoped data isolation)
- MFA (TOTP), session management, rate limiting
- Email notifications (SMTP + Resend)
- English and German UI
- Docker Compose deployment
- CI/CD pipeline (GitHub Actions: lint, Vitest unit tests, CodeQL SAST, secret scanning, Playwright E2E, accessibility audit, CycloneDX SBOM)
- OIDC/SSO single sign-on — **Premium plan only** (PKCE support, just-in-time provisioning, encrypted client secrets, SSRF-safe IdP discovery, full audit trail)
- Advanced Reporting — AI-generated compliance reports, interactive report editor, one-click PDF export, AI executive summaries — **Premium plan only**
- FREE / PREMIUM subscription tiers

---

## What's coming up

### Near-term

- Expand test coverage to > 80% (auth, audit trail, GDPR flows)
- OpenAPI spec for all API routes
- Wire rate limiting to all public routes
- Replace local file storage with S3-compatible backend

### Mid-term

- SAML 2.0 support (OIDC already available on Premium)
- Billing UI with Stripe integration (Premium plan self-service upgrade)
- API keys and webhook subscriptions
- Custom questionnaire builder (not just NIS2)
- Assessment approval workflow (review → approve → sign-off)
- SLA tracking and automated vendor reminders
- More compliance templates (ISO 27001, SOC2, DORA, HIPAA)

### Later

- Managed cloud SaaS offering with self-service signup
- Integrations: Jira, Slack, ServiceNow, Microsoft Teams
- Continuous compliance monitoring (recurring assessments, risk trends)
- SOC2 Type II and ISO 27001 certification for the SaaS product
- Kubernetes Helm chart
- Vendor directory with verified assessment badges
