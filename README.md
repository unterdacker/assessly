# AVRA - Automated Vendor Risk Assessment

AVRA is a modern Vendor Risk Management dashboard that helps security teams evaluate digital supply chain risk with NIS2-aligned workflows, structured evidence handling, and AI-assisted document analysis.

It is built for practical day-to-day operations: invite vendors, run assessments, review AI suggestions, and maintain an auditable decision trail.

---

## English

### What Problem AVRA Solves

Security officers often manage third-party assessments in fragmented spreadsheets, email threads, and manual reviews. AVRA centralizes this process into a single workspace where teams can:

- onboard and track vendors,
- run NIS2-aligned questionnaires,
- analyze uploaded PDF evidence with AI,
- and maintain transparent, reviewable compliance decisions.

### Key Features

- Bilingual interface (English and German) powered by next-intl.
- Light and dark mode support.
- Vendor management table with search, sorting, status indicators, and access code lifecycle.
- Secure vendor invitation flow with split credential delivery (email/SMS concept).
- Internal Assessment Workspace for auditors and security officers.
- External Vendor Portal for access-code-based assessment completion.
- NIS2-aligned questionnaire flow with progress tracking.
- AI document audit workflow for PDF evidence.
- Manual answer override with justification and supplemental evidence support.
- Audit trail-aware architecture and EU-sovereign deployment posture.

### Tech Stack

- Framework: Next.js (App Router), React 19, TypeScript
- Styling/UI: Tailwind CSS, Radix UI primitives, Lucide icons
- i18n: next-intl
- Database: Prisma ORM with SQLite (local development)
- AI Integration: Mistral SDK and configurable local endpoint support
- Notifications: Sonner

### Architecture Overview

- Internal admin routes: vendor oversight, assessment workspace, settings.
- External vendor routes: isolated access portal and token/code-based assessment pages.
- Prisma models for companies, vendors, assessments, answers, questions, and audit logs.
- Message catalogs in `messages/en.json` and `messages/de.json`.

### Getting Started (Local Development)

#### 1. Prerequisites

- Node.js 20+
- npm 10+
- Git

#### 2. Clone the Repository

```bash
git clone https://github.com/unterdacker/AVRA.git
cd AVRA
```

#### 3. Install Dependencies

```bash
npm install
```

#### 4. Configure Environment Variables

Create a `.env` file in the project root:

```bash
DATABASE_URL="file:./dev.db"
```

Optional AI/provider settings (only if needed):

```bash
AI_PROVIDER="mistral"
MISTRAL_API_KEY="<your-key>"
LOCAL_AI_ENDPOINT="http://localhost:11434/v1"
LOCAL_AI_MODEL="mistral"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
CRON_SECRET="<optional-secret>"
```

#### 5. Initialize the Database

```bash
npx prisma generate
npx prisma db push
```

Optional seed data:

```bash
npx prisma db seed
```

#### 6. Start the Development Server

```bash
npm run dev --turbopack
```

Open:

```text
http://localhost:3000
```

### Useful Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:push
npm run db:migrate
npm run db:seed
npm run db:studio
```

### Repository Information

- Git remote: `https://github.com/unterdacker/AVRA.git`
- Default local app URL: `http://localhost:3000`

### Screenshots / Demo Assets

There are currently no image assets committed in the repository.

Recommended structure for visual documentation:

```text
docs/
	assets/
		dashboard-overview.png
		vendor-workspace.png
		external-portal.png
```

Then reference them in this README, for example:

```md
![Dashboard Overview](docs/assets/dashboard-overview.png)
```

### License

No `LICENSE` file is currently present in the repository.

If you plan to share this project externally, add a license file (for example MIT, Apache-2.0, or a proprietary internal license) and update this section.

### Contributing

Contributions are welcome. A practical flow for this codebase:

1. Fork the repository (or create a branch in the main repo).
2. Create a feature branch:

```bash
git checkout -b feat/short-description
```

3. Run checks locally before opening a PR:

```bash
npm run lint
npm run build
```

4. If schema changes were made, include Prisma updates and migration notes.
5. Open a pull request with:
: scope and intent,
: screenshots (if UI changed),
: test/verification notes.

### Release Process

A lightweight release process recommendation:

1. Ensure `main` is green (`lint` + `build`).
2. Bump version in `package.json` as needed.
3. Create a release tag:

```bash
git tag v0.x.y
git push origin v0.x.y
```

4. Deploy with production environment variables and a production-grade database.
5. Add release notes summarizing features, fixes, and migration impacts.

### Internationalization Notes

- Add/adjust translation keys in:
	- `messages/en.json`
	- `messages/de.json`
- Route localization is handled with locale prefixes (`/en`, `/de`).

### Security and Compliance Notes

- AVRA is designed for EU-oriented security workflows and NIS2-aligned assessments.
- Use production-grade secrets management for API keys and cron secrets.
- For production, prefer managed EU-region databases and hardened deployment settings.

### Troubleshooting

- If you see `MISSING_MESSAGE`, verify keys exist in both locale files and that the correct namespace is used in `useTranslations(...)`.
- If Prisma errors occur, re-run:

```bash
npx prisma generate
npx prisma db push
```

- If development startup fails after dependency changes, try:

```bash
rm -rf .next
npm install
npm run dev
```

---

## Deutsch

### Welches Problem AVRA loest

Sicherheitsverantwortliche steuern Drittanbieter-Bewertungen haeufig ueber verteilte Tabellen, E-Mails und manuelle Reviews. AVRA buendelt diesen Prozess in einem zentralen Workspace, in dem Teams:

- Anbieter verwalten und nachverfolgen,
- NIS2-orientierte Frageboegen bearbeiten,
- hochgeladene PDF-Nachweise KI-gestuetzt analysieren,
- und nachvollziehbare, auditierbare Entscheidungen dokumentieren.

### Kernfunktionen

- Bilinguale Oberflaeche (Deutsch und Englisch) mit next-intl.
- Light- und Dark-Mode.
- Interaktive Anbieter-Tabelle mit Suche, Sortierung, Status und Access-Code-Lebenszyklus.
- Sicherer Einladungsfluss fuer Anbieter mit getrennter Zustellung der Zugangsdaten.
- Interner Assessment-Workspace fuer Auditoren und Security-Teams.
- Externes Anbieter-Portal fuer code-/token-basierten Zugriff.
- NIS2-orientierter Fragebogen mit Fortschrittsanzeige.
- KI-Dokumentenpruefung fuer PDF-Nachweise.
- Manueller Override mit Begruendung und zusaetzlichem Nachweis.
- Audit-Trail-orientierte Architektur mit EU-Souveraenitaetsfokus.

### Technologie-Stack

- Framework: Next.js (App Router), React 19, TypeScript
- Styling/UI: Tailwind CSS, Radix UI, Lucide Icons
- i18n: next-intl
- Datenbank: Prisma ORM mit SQLite (lokale Entwicklung)
- KI-Integration: Mistral SDK und konfigurierbarer lokaler Endpoint
- Notifications: Sonner

### Architekturueberblick

- Interne Admin-Routen: Anbieterverwaltung, Assessment-Workspace, Einstellungen.
- Externe Anbieter-Routen: isoliertes Portal sowie token-/code-basierte Assessment-Seiten.
- Prisma-Modelle fuer Companies, Vendors, Assessments, Answers, Questions und Audit Logs.
- Uebersetzungen in `messages/en.json` und `messages/de.json`.

### Lokales Setup (Schritt fuer Schritt)

#### 1. Voraussetzungen

- Node.js 20+
- npm 10+
- Git

#### 2. Repository klonen

```bash
git clone https://github.com/unterdacker/AVRA.git
cd AVRA
```

#### 3. Abhaengigkeiten installieren

```bash
npm install
```

#### 4. Umgebungsvariablen konfigurieren

Lege im Projektroot eine `.env` an:

```bash
DATABASE_URL="file:./dev.db"
```

Optionale KI-/Provider-Variablen:

```bash
AI_PROVIDER="mistral"
MISTRAL_API_KEY="<dein-key>"
LOCAL_AI_ENDPOINT="http://localhost:11434/v1"
LOCAL_AI_MODEL="mistral"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
CRON_SECRET="<optional-secret>"
```

#### 5. Datenbank initialisieren

```bash
npx prisma generate
npx prisma db push
```

Optional Seed-Daten laden:

```bash
npx prisma db seed
```

#### 6. Entwicklungsserver starten

```bash
npm run dev --turbopack
```

Aufruf im Browser:

```text
http://localhost:3000
```

### Nuetzliche Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:push
npm run db:migrate
npm run db:seed
npm run db:studio
```

### Repository-Informationen

- Git-Remote: `https://github.com/unterdacker/AVRA.git`
- Standard-URL lokal: `http://localhost:3000`

### Screenshots / Demo-Assets

Aktuell sind keine Bild-Assets im Repository versioniert.

Empfohlene Struktur fuer visuelle Dokumentation:

```text
docs/
	assets/
		dashboard-overview.png
		vendor-workspace.png
		external-portal.png
```

Danach kannst du sie in dieser README einbinden, zum Beispiel:

```md
![Dashboard Overview](docs/assets/dashboard-overview.png)
```

### Lizenz

Derzeit gibt es keine `LICENSE`-Datei im Repository.

Wenn das Projekt extern geteilt wird, solltest du eine Lizenzdatei hinzufuegen (z. B. MIT, Apache-2.0 oder eine interne proprietaere Lizenz) und diesen Abschnitt aktualisieren.

### Mitwirken (Contributing)

Beitraege sind willkommen. Sinnvoller Ablauf fuer dieses Projekt:

1. Repository forken (oder Branch im Hauptrepository erstellen).
2. Feature-Branch anlegen:

```bash
git checkout -b feat/kurze-beschreibung
```

3. Vor dem Pull Request lokale Checks ausfuehren:

```bash
npm run lint
npm run build
```

4. Bei Schema-Aenderungen Prisma-Updates und Migrationshinweise mitliefern.
5. Pull Request mit folgendem Inhalt erstellen:
: Umfang und Ziel,
: Screenshots (bei UI-Aenderungen),
: Test-/Verifikationsnotizen.

### Release-Prozess

Empfohlener schlanker Release-Ablauf:

1. Sicherstellen, dass `main` gruen ist (`lint` + `build`).
2. Version in `package.json` bei Bedarf erhoehen.
3. Release-Tag erstellen:

```bash
git tag v0.x.y
git push origin v0.x.y
```

4. Deployment mit Produktions-Umgebungsvariablen und produktionsfaehiger Datenbank.
5. Release Notes mit Features, Fixes und Migrationsauswirkungen erfassen.

### Hinweise zur Internationalisierung

- Uebersetzungen pflegst du in:
	- `messages/en.json`
	- `messages/de.json`
- Lokalisierte Routen werden ueber Prefixe umgesetzt (`/en`, `/de`).

### Sicherheit und Compliance

- AVRA ist auf EU-orientierte Sicherheitsprozesse und NIS2-nahe Assessments ausgerichtet.
- Nutze in Produktion ein sicheres Secret-Management fuer API-Keys und Cron-Secrets.
- Fuer produktive Umgebungen empfehlen sich EU-hosted Datenbanken und gehaertete Deployments.

### Troubleshooting

- Bei `MISSING_MESSAGE`: Schluessel in beiden Locale-Dateien pruefen und Namespace in `useTranslations(...)` abgleichen.
- Bei Prisma-Problemen erneut ausfuehren:

```bash
npx prisma generate
npx prisma db push
```

- Wenn der Dev-Server nach Aenderungen nicht startet:

```bash
rm -rf .next
npm install
npm run dev
```