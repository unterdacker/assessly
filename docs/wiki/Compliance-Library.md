# Compliance Template Library

## Overview

The Compliance Template Library provides a set of pre-built, read-only questionnaire templates aligned to major security and compliance frameworks. Admins and risk reviewers can browse the library and **deploy** any template — Venshield creates an editable copy in your company's questionnaire workspace, ready to send to vendors immediately.

**Where to find it:** Settings → Compliance Template Library

**Required role:** ADMIN or RISK_REVIEWER

---

## Framework Tiers

| Framework | Tier | Description |
|---|---|---|
| **NIS2** | Free | EU NIS2 Directive — Article 21 supply chain cybersecurity measures |
| **DORA** | Free | EU Digital Operational Resilience Act — ICT risk management for financial entities |
| **ISO 27001** | Premium | Information security management system — Annex A controls |
| **SOC 2 Type II** | Premium | AICPA Trust Services Criteria — security, availability, confidentiality |
| **HIPAA** | Premium | US Health Insurance Portability and Accountability Act — healthcare data controls |
| **NIST CSF** | Premium | NIST Cybersecurity Framework 2.0 — Govern, Identify, Protect, Detect, Respond, Recover |
| **CIS Controls v8** | Premium | Center for Internet Security Critical Security Controls — 18 top-priority control groups |

NIS2 and DORA templates are available on all plans. ISO 27001, SOC 2 Type II, HIPAA, NIST CSF, and CIS Controls v8 require a **Premium** plan.

---

## Deploying a Template

1. Navigate to **Settings → Compliance Template Library**.
2. Browse the available frameworks. Premium-only templates display a lock icon on the Free plan.
3. Click **Deploy** on the desired template.
4. Venshield creates an editable copy in your questionnaire workspace (`Settings → Questionnaires`).
5. The deployed template is linked to its source framework via a `systemTemplateKey` — re-deploying the same framework is blocked (each framework can only be deployed once per company).

**Rate limit:** 10 deploys per company per 5-minute window.

---

## Relationship to Custom Questionnaire Builder

Deployed templates appear alongside custom templates in `Settings → Questionnaires` and behave identically — sections and questions can be edited, reordered, or extended after deployment. The Compliance Template Library provides a starting point; the Custom Questionnaire Builder (Premium) lets you build from scratch.

| Feature | Compliance Template Library | Custom Questionnaire Builder |
|---|---|---|
| Starting point | Pre-built framework template | Blank template |
| Requires Premium | NIS2 & DORA: No; others: Yes | Yes |
| Editable after deploy | Yes | Yes |
| Create multiple copies | No (one per framework per company) | Yes (up to 20 templates) |

---

## Audit Logging

Every template deployment is recorded in the audit trail under the `DATA_OPERATIONS` category with action `compliance_template.deployed`, including the deploying user, company, and framework key.

---

## Access Control

| Role | Can view library | Can deploy |
|---|---|---|
| SUPER_ADMIN | Yes | Yes |
| ADMIN | Yes | Yes |
| RISK_REVIEWER | Yes | Yes |
| AUDITOR | No | No |
| VENDOR | No | No |
