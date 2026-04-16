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
- MFA (TOTP + recovery codes), org-wide MFA policy, admin-enforced MFA
- Email notifications (SMTP + Resend)
- English and German UI
- Docker Compose deployment
- CI/CD pipeline (GitHub Actions: lint, Vitest unit tests, CodeQL SAST, secret scanning, Playwright E2E, accessibility audit, CycloneDX SBOM)
- **[Premium]** OIDC/SSO single sign-on (PKCE, JIT provisioning, encrypted secrets, SSRF-safe IdP discovery, audit trail)
- **[Premium]** Advanced Reporting — AI-generated compliance reports, interactive editor, one-click PDF export, AI executive summaries
- **[Premium]** Custom questionnaire builder (multi-section, 6 question types, import/export, reordering)
- **[Premium]** REST API v1 with Bearer token auth, plan-scoped permissions (`vendors:read/write`, `assessments:read/write`, `metrics:read`)
- FREE / PREMIUM subscription tier model with `lib/enterprise-bridge.ts` plan gate
- S3-compatible file storage (`lib/storage.ts`) — S3 adapter with local-disk fallback; AES-256 SSE; `@aws-sdk/client-s3`
- **[Premium]** API key management UI — issue/revoke/rotate keys in Settings → API Keys; scoped permissions, usage tracking, expiry; `modules/api-keys/`
- **[Premium]** Webhook delivery engine — HMAC-SHA256 signed payloads, SSRF guard, fire-and-forget dispatch; `modules/webhooks/`

---

## Roadmap

The roadmap is organized around four phases. Each phase is designed to advance the product toward an acquisition exit by a large enterprise GRC, cybersecurity, or ERP vendor (e.g. ServiceNow, SAP, OneTrust, IBM OpenPages, Qualys).

---

### Phase 1 — Revenue Proof (0–3 months)
*Goal: demonstrate real MRR to acquirers. A product without billing is worth zero on a term sheet.*

- [ ] **Stripe billing** — self-service plan upgrades (FREE → PREMIUM), subscription management portal, webhook-based plan sync, Stripe Customer Portal (cancellation, invoice history)
- [x] **S3-compatible file storage** — replace local disk uploads (MinIO for self-hosted, S3 for cloud); prerequisite for SaaS offering
- [x] **API key management UI** — issue/revoke API keys in Settings → API Keys (Premium); key rotation, last-used tracking
- [x] **Webhook delivery engine** — implement `modules/webhooks/` module; HMAC-signed payloads, retry logic, delivery log, Premium gate
- [ ] **Wire rate limiting to all public API routes** — consistent per-IP and per-key limits
- [ ] **OpenAPI 3.1 spec** — auto-generated from route handlers; hosted at `/api/v1/openapi.json` + Swagger UI at `/api/v1/docs`
- [ ] **Expand test coverage to > 80%** — auth, audit trail, GDPR flows, plan gate paths; required for due diligence

---

### Phase 2 — Enterprise Readiness (3–9 months)
*Goal: land large enterprise logos. Acquirers pay multiples for ARR from named enterprise accounts.*

- [ ] **SAML 2.0** — IdP-initiated and SP-initiated flows; metadata import; attribute mapping; Premium plan only
- [ ] **Assessment approval workflow** — multi-step review → approve → sign-off; role-gated; full audit trail per step; email notifications at each transition
- [ ] **SLA tracking and automated vendor reminders** — due-date enforcement, escalation rules, overdue notifications
- [ ] **Compliance template library** — ISO 27001, SOC 2, DORA, HIPAA, NIST CSF, CIS Controls; Premium unlocks additional frameworks beyond NIS2
- [ ] **Continuous compliance monitoring** — recurring assessment schedules, risk trend charts, regression detection, automated re-assessment triggers
- [ ] **Vendor risk scoring v2** — weighted category scoring, industry benchmarks, peer comparison, risk delta since last assessment
- [ ] **Admin analytics dashboard** — feature adoption metrics, active vendors per tenant, assessment completion rates, time-to-completion histograms (also useful for acquirer due diligence data room)
- [ ] **SOC 2 Type II certification prep** — select a readiness audit partner; map controls to existing audit trail and security architecture

---

### Phase 3 — Scale & Distribution (9–18 months)
*Goal: generate growth signals (customer count, logo diversity, integrations) that a strategic acquirer will pay a revenue multiple for.*

- [ ] **Managed SaaS offering** — multi-tenant cloud deployment on EU infrastructure; self-service signup; onboarding wizard; usage-based billing tiers (per active vendor, per assessment)
- [ ] **AWS / Azure Marketplace listings** — direct listing makes acquisition due diligence faster and signals enterprise distribution fit
- [ ] **Integrations: Jira, ServiceNow, Slack, Microsoft Teams** — bi-directional risk item sync; ServiceNow integration specifically signals intent toward that acquirer; Teams + Slack are table stakes for enterprise buyers
- [ ] **Kubernetes Helm chart** — required for enterprise self-hosted procurement; also enables cloud marketplace container listing
- [ ] **Vendor directory with verified assessment badges** — public-facing badges embeddable in vendor websites; network effect moat; increases data density that makes the product sticky
- [ ] **Multi-region EU deployment** — Frankfurt + Amsterdam; EU data residency as contractual SLA; GDPR processor agreements at platform level
- [ ] **NPS + in-app feedback** — collect and publish customer satisfaction signals; NPS > 40 is a due diligence positive
- [ ] **MSSP / reseller partner program** — channel partnerships with managed security service providers; increases ARR and logo count without proportional headcount

---

### Phase 4 — Exit Readiness (18+ months)
*Goal: maximize valuation multiple and minimize acquirer friction during due diligence.*

- [ ] **SOC 2 Type II certificate** — table stakes for enterprise acquisition; needed for procurement sign-off at acquirer's enterprise customers
- [ ] **ISO 27001 certification** — required for EU enterprise and public sector procurement; signals mature ISMS
- [ ] **G2 / Gartner Peer Insights presence** — 25+ verified reviews across both platforms; category placement in "GRC" or "Vendor Risk Management" creates social proof that acquirers reference
- [ ] **Data room documentation** — architecture diagrams (C4 model), threat model, security runbook, DR/BCP plan, dependency inventory (SBOM already generated), IP ownership confirmation
- [ ] **Acquirer-aligned integration depth** — deepen the most relevant integration (ServiceNow GRC or SAP GRC) to the point it becomes a co-sell motion; this is often how acquisitions are initiated
- [ ] **Clean cap table + IP assignment audit** — ensure all contributor agreements and third-party OSS licenses are clear; FOSS license compatibility report from SBOM

---

## Open-Core Boundary (current)

| Capability | FREE (self-hosted) | PREMIUM (module) |
|---|---|---|
| NIS2 vendor questionnaire | ✓ | ✓ |
| Vendor portal + evidence upload | ✓ | ✓ |
| Risk scoring + dashboard | ✓ | ✓ |
| Audit trail + forensic export | ✓ | ✓ |
| Email notifications | ✓ | ✓ |
| MFA (TOTP + recovery codes) | ✓ | ✓ |
| Docker Compose self-hosted | ✓ | ✓ |
| OIDC / SSO | — | ✓ |
| Advanced Reporting + PDF | — | ✓ |
| Custom questionnaire builder | — | ✓ |
| REST API (write scopes) | — | ✓ |
| Webhooks | — | ✓ |
| SAML 2.0 | — | ✓ |
| Compliance template library | NIS2 only | ✓ All frameworks |
| Assessment approval workflow | — | ✓ |
| Continuous monitoring | — | ✓ |
