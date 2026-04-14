# Contributing to Venshield

Thank you for your interest in Venshield. This guide explains how to set up a development environment, follow coding standards, and submit contributions.

---

## Getting Started

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 20 or higher |
| npm | 10 or higher |
| Docker Desktop | Latest stable |

### Setup

```bash
git clone https://github.com/unterdacker/venshield.git
cd venshield
npm install
```

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Minimum values for local development:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/venshield?schema=public
APP_URL=http://localhost:3000
OIDC_STATE_SECRET=dev-only-change-me-at-least-32-chars
```

Start the database and run the dev server:

```bash
docker-compose up -d
npx prisma db push
npx prisma db seed
npm run dev
```

---

## Development Workflow

### Branching

- `main` — stable branch; all PRs target `main`
- Feature branches: `feat/<description>`
- Bug fixes: `fix/<description>`

### Code Quality

Before submitting a PR, ensure all of the following pass locally:

```bash
npm run lint        # ESLint + TypeScript strict checks
npm run test        # Vitest unit tests
npm run test:e2e    # Playwright E2E tests (requires running app)
npm run env:validate # Validate environment configuration
```

The CI pipeline enforces all of these — a failing PR will not be merged.

### TypeScript

- All new code must be TypeScript with strict mode.
- No `any` types without an explanatory comment.
- Server-side code must not leak secrets to client components.

### Security

- Never log passwords, tokens, secrets, or personal data.
- All user input crossing trust boundaries must be validated with Zod.
- New API routes must be protected by session and role checks.
- Read [Security Architecture](docs/wiki/Security-Architecture.md) before contributing to authentication or audit trail code.

---

## Testing

### Unit Tests (Vitest)

Tests live in `tests/unit/`. Run with:

```bash
npm run test           # single run
npm run test:watch     # watch mode
npm run test:coverage  # coverage report
```

New business logic should include unit tests. Aim for coverage of:
- Scoring and risk level calculations
- Input validation schemas
- Cryptographic helper functions

### End-to-End Tests (Playwright)

Tests live in `tests/e2e/`. Run with:

```bash
npm run test:e2e
```

E2E tests require a running application with seeded data. Use the Docker Compose stack for a consistent environment.

---

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add vendor CSV import validation
fix: correct session TTL in auth token
docs: update deployment guide for entrypoint
chore: update Playwright to 1.59
```

---

## Pull Request Process

1. Fork the repository and create a feature branch
2. Make your changes with appropriate tests
3. Ensure all CI checks pass locally
4. Submit a pull request with a clear description of what changed and why
5. Address review comments promptly

PRs that fail the CI pipeline or reduce test coverage without justification will not be merged.

---

## Private `modules/` Submodule

The `modules/` directory is a private git submodule containing Premium enterprise features (SSO and Advanced Reporting). External contributors cannot access this submodule. All contributions to the open-source platform (`main` branch) must work correctly without the contents of `modules/`.

---

## License

By contributing, you agree that your contributions will be licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**, the same license as the project.

See [LICENSE](LICENSE) for the full license text.

---

## Code of Conduct

Be respectful and constructive. Harassment or abusive behaviour of any kind will not be tolerated.
