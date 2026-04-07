# Assessly — Documentation Home

> **Sovereign Vendor Risk Assessment Platform for NIS2 & GDPR-compliant organisations**

Assessly replaces disconnected spreadsheets and inboxes with one auditable workspace covering vendor onboarding, NIS2-aligned questionnaire execution, AI-assisted document analysis, evidence review, and remediation tracking — with all data staying inside your own infrastructure.

---

## Table of Contents

| Page | Description |
|------|-------------|
| [Architecture Overview](Architecture-Overview) | System design, technology stack, runtime model |
| [Getting Started](Getting-Started) | Local setup, Docker, environment variables |
| [Database Schema](Database-Schema) | Full entity model with field annotations |
| [Authentication & Authorization](Authentication-and-Authorization) | Session model, roles, MFA, permissions |
| [NIS2 Compliance Module](NIS2-Compliance-Module) | Questionnaire catalogue, scoring, risk levels |
| [AI Integration](AI-Integration) | Ollama / Mistral provider, document analysis, executive summaries |
| [Audit Trail & Forensic Logging](Audit-Trail-and-Forensic-Logging) | Hash-chain, GDPR redaction, compliance categories |
| [Security Architecture](Security-Architecture) | Cryptography, CSP, rate limiting, secrets |
| [Mail System](Mail-System) | SMTP / Resend strategies, invitation flow |
| [Vendor Portal](Vendor-Portal) | External portal for vendors, invite-token flow |
| [Internationalisation](Internationalisation) | Locale routing (en / de), next-intl setup |
| [Testing](Testing) | Vitest unit tests, Playwright E2E, audit-chain verification |
| [Deployment](Deployment) | Docker Compose, production hardening, key generation |
| [Environment Variables Reference](Environment-Variables-Reference) | Full variable list with requirements |
| [Scripts Reference](Scripts-Reference) | All npm scripts explained |

---

## Quick Links

- **Live demo accounts:** `admin@assessly.local / admin123` · `auditor@assessly.local / auditor123`
- **License:** Apache 2.0
- **Support the project:** [Buy Me A Coffee](https://buymeacoffee.com/assessly)
