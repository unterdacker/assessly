# Venshield — Documentation Home

[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](https://www.apache.org/licenses/LICENSE-2.0) [![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-blue?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org) [![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com) [![NIS2](https://img.shields.io/badge/NIS2-compliant-green?style=flat-square)](https://nis2directive.eu) [![GDPR](https://img.shields.io/badge/GDPR-compliant-green?style=flat-square)](https://gdpr.eu)

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
| [Vendor Portal](Vendor-Portal.md) | External portal for vendors, invite-token flow |
| [Internationalisation](Internationalisation.md) | Locale routing (en / de), next-intl setup |
| [Testing](Testing.md) | Vitest unit tests, Playwright E2E, audit-chain verification |
| [Deployment](Deployment.md) | Docker Compose, production hardening, key generation |
| [Environment Variables Reference](Environment-Variables-Reference.md) | Full variable list with requirements |
| [Scripts Reference](Scripts-Reference.md) | All npm scripts explained |
| [Product Roadmap](Product-Roadmap.md) | Strategic roadmap for platform growth and commercial expansion |

---

## Quick Links

- **Live demo accounts:** `admin@venshield.local / admin123` · `auditor@venshield.local / auditor123`
- **License:** Apache 2.0
