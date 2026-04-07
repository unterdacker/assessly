# Product Roadmap

## What's built

- NIS2-aligned vendor questionnaire (20 questions, 7 categories)
- Vendor self-assessment portal with evidence uploads
- AI-assisted document analysis (Mistral cloud + Ollama self-hosted)
- Compliance scoring and risk levels (LOW / MEDIUM / HIGH)
- Supply chain risk dashboard with charts
- Tamper-evident audit trail (SHA-256 hash chain)
- Forensic export bundle (HMAC-signed JSON)
- GDPR erasure, pseudonymization, IP truncation
- Role-based access (ADMIN, AUDITOR, VENDOR)
- Multi-tenancy (full company-scoped data isolation)
- MFA (TOTP), session management, rate limiting
- Email notifications (SMTP + Resend)
- English and German UI
- Docker Compose deployment

---

## What's coming up

### Near-term

- CI/CD pipeline (GitHub Actions: lint, tests, Docker build on every PR)
- Expand test coverage to > 80% (auth, audit trail, GDPR flows)
- OpenAPI spec for all API routes
- Wire rate limiting to all public routes
- Replace local file storage with S3-compatible backend

### Mid-term

- SAML 2.0 / OIDC single sign-on
- API keys and webhook subscriptions
- Custom questionnaire builder (not just NIS2)
- Assessment approval workflow (review ? approve ? sign-off)
- SLA tracking and automated vendor reminders
- PDF report generation per vendor
- More compliance templates (ISO 27001, SOC2, DORA, HIPAA)

### Later

- Managed cloud SaaS offering with self-service signup
- Billing and pricing tiers (Stripe)
- Integrations: Jira, Slack, ServiceNow, Microsoft Teams
- Continuous compliance monitoring (recurring assessments, risk trends)
- SOC2 Type II and ISO 27001 certification for the SaaS product
- Kubernetes Helm chart
- Vendor directory with verified assessment badges
