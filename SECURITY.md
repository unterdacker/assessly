# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main` branch | ✅ Active |
| Older releases | ❌ Not supported |

Venshield is currently in pre-release (`0.1.0`). Security fixes are applied to the `main` branch only.

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities as public GitHub issues.**

Report vulnerabilities responsibly by emailing:

**[venshield@proton.me](mailto:venshield@proton.me)**

Include in your report:
- A description of the vulnerability and its impact
- Steps to reproduce (proof of concept if possible)
- Affected component(s) and environment
- Your suggested fix (optional but appreciated)

All reports are encrypted end-to-end via ProtonMail.

---

## Response Timeline

| Milestone | Target |
|-----------|--------|
| Acknowledgement | Within 2 business days |
| Initial triage | Within 5 business days |
| Status update | Weekly |
| Fix or mitigation | Depends on severity (see below) |

### Severity-Dependent Fix Timelines

| Severity | Target Fix / Mitigation |
|----------|------------------------|
| Critical (CVSS ≥ 9.0) | 7 days |
| High (CVSS 7.0–8.9) | 14 days |
| Medium (CVSS 4.0–6.9) | 30 days |
| Low (CVSS < 4.0) | Next release cycle |

---

## Scope

### In Scope

- The Venshield web application (Next.js, API routes, server actions)
- Authentication and session management
- Cryptographic audit trail
- OIDC/SSO implementation
- Vendor portal and assessment workflow
- Self-hosted Docker deployments

### Out of Scope

- Third-party dependencies (report via the dependency's own security policy)
- Issues requiring physical access to the server
- Social engineering attacks
- Spam or brute-force attacks against demo credentials
- Findings from automated scanners without demonstrated exploitability

---

## Coordinated Disclosure

We follow a **90-day coordinated disclosure** policy:

1. You report the vulnerability privately.
2. We confirm receipt and begin remediation.
3. We notify you when a fix is available.
4. After 90 days (or after the fix is publicly released, whichever comes first), you may publish your findings.

We will credit reporters in the release notes unless you prefer to remain anonymous.

---

## Security Architecture

For details on Venshield's security design, see:
- [Security Architecture](docs/wiki/Security-Architecture.md)
- [Authentication & Authorization](docs/wiki/Authentication-and-Authorization.md)
- [Audit Trail & Forensic Logging](docs/wiki/Audit-Trail-and-Forensic-Logging.md)
