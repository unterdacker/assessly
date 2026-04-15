# Venshield — Documentation Home

> **Sovereign Vendor Risk Assessment Platform for NIS2 & GDPR-compliant organisations**

Venshield replaces disconnected spreadsheets and inboxes with one auditable workspace covering vendor onboarding, NIS2-aligned questionnaire execution, AI-assisted document analysis, evidence review, and remediation tracking — with all data staying inside your own infrastructure. Premium customers additionally benefit from OIDC single sign-on with just-in-time provisioning and AI-powered Advanced Reporting with PDF export.

---

## Table of Contents

| Page | Description |
|------|-------------|
| [Architecture Overview](Architecture-Overview.md) | System design, technology stack, runtime model |
| [Getting Started](Getting-Started.md) | Local setup, Docker, environment variables |
| [Database Schema](Database-Schema.md) | Full entity model with field annotations |
| [Authentication & Authorization](Authentication-and-Authorization.md) | Session model, roles, MFA, OIDC/SSO (Premium), permissions |
| [Enterprise Features](Enterprise-Features.md) | Premium OIDC/SSO and Advanced Reporting |
| [NIS2 Compliance Module](NIS2-Compliance-Module.md) | Questionnaire catalogue, scoring, risk levels |
| [AI Integration](AI-Integration.md) | Ollama / Mistral provider, document analysis, executive summaries, Advanced Reporting (Premium) |
| [Audit Trail & Forensic Logging](Audit-Trail-and-Forensic-Logging.md) | Hash-chain, GDPR redaction, compliance categories |
| [Security Architecture](Security-Architecture.md) | Cryptography, CSP, rate limiting, secrets |
| [Mail System](Mail-System.md) | SMTP / Resend strategies, invitation flow |
| [SMS System](SMS-System.md) | ~~Removed~~ — SMS was removed in April 2026 (`20260415000000_invite_link_flow`). Vendor credentials are now delivered via email invite-link only. See page for GDPR migration notes. |
| [Vendor Portal](Vendor-Portal.md) | External portal for vendors, invite-token flow |
| [Internationalisation](Internationalisation.md) | Locale routing (en / de), next-intl setup |
| [Testing](Testing.md) | Vitest unit tests, Playwright E2E, audit-chain verification |
| [Integrations](Integrations.md) | Mail, SMS, AI, storage, SSO — all supported providers with configuration examples |
| [Deployment](Deployment.md) | Docker Compose, production hardening, key generation |
| [Environment Variables Reference](Environment-Variables-Reference.md) | Full variable list with requirements |
| [Scripts Reference](Scripts-Reference.md) | All npm scripts explained |
| [REST API Reference](REST-API.md) | Programmatic access to vendors and assessments via API keys (Premium) |
| [Outbound Webhooks](Webhooks.md) | Real-time HMAC-signed event notifications for downstream integrations (Premium) |
| [Product Roadmap](Product-Roadmap.md) | Strategic roadmap for platform growth and commercial expansion |

---

## Quick Links

- **Demo accounts (development only):** `admin@venshield.local / admin123` · `auditor@venshield.local / auditor123` — never use against a production database.
- **License:** GNU AGPL 3.0
