# AVRA — Automated Vendor Risk Assessment (EU-Sovereign)

**AVRA** is an AI-powered platform designed for IT Security Officers to automate third-party risk management under the **EU NIS2 Directive**.

## 🇪🇺 Key Highlights
- **Sovereign AI:** Switch between Mistral AI (EU) and Local LLMs (On-Premise).
- **GDPR-First:** Zero US CDNs, local fonts, and strict data isolation.
- **Audit-Ready:** Automated NIS2 gap analysis with full audit trails.

## 🛠 Setup
1. `npm install`
2. Configure `.env` (Mistral Key or Local Endpoint)
3. `npx prisma migrate dev && npx prisma db seed`
4. `npm run dev`