# =============================================================================
# Venshield — Multi-stage Dockerfile
# Base: node:20-alpine (small footprint, musl libc)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — deps
# Install all dependencies (including devDependencies) needed by the builder.
# This layer is cached independently so a source-only change does not
# re-run `npm ci`.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

# libc6-compat: shim for glibc symbols required by some native addons on musl.
# openssl: required by the Prisma "library" engine at runtime.
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package*.json ./
# Copy the schema so `prisma generate` can run immediately after install.
COPY prisma ./prisma/
# Copy scripts needed by the postinstall hook (compute-themes-hash.mjs).
COPY scripts ./scripts/
# The postinstall script writes lib/csp-hashes.ts; ensure the directory exists.
RUN mkdir -p ./lib

RUN npm install

# Generate the Prisma client immediately after install so the builder stage
# receives a node_modules that already contains the compiled client.
RUN ./node_modules/.bin/prisma generate

# -----------------------------------------------------------------------------
# Stage 2 — builder
# Run `prisma generate` and `next build` to produce the standalone output.
# The prebuild npm script contains host-specific checks (ready-check,
# env:validate, clean:build) that must not run inside Docker; we call the
# underlying tools directly.
# A synthetic DATABASE_URL is provided so Prisma can generate the client
# without a live database connection.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time DATABASE_URL — required by Prisma for schema introspection during
# generate; no actual TCP connection is made. Override via --build-arg in CI.
ARG DATABASE_URL="postgresql://build:build@localhost:5432/builddb?schema=public"
ENV DATABASE_URL=$DATABASE_URL

# ---------------------------------------------------------------------------
# Build-time security key stubs
#
# env-check.mjs (prebuild) and lib/env.ts both validate security keys strictly
# when NODE_ENV=production, but they only check format and entropy — they do
# not encrypt or decrypt anything during `next build`.  We therefore supply
# syntactically valid, clearly commented dummy values here so the build stage
# passes validation without baking real secrets into the image layers.
#
# ⚠️  These values are BUILD-TIME ONLY and carry zero security weight.
#     At runtime every ARG below is overridden by the environment variables
#     injected by docker-compose.yml (or your .env / secrets manager).
#     Never use these stub values in production.
#
# To supply different build-time stubs (e.g. in CI), pass:
#   --build-arg SETTINGS_ENCRYPTION_KEY=<64-hex>
# ---------------------------------------------------------------------------

# 64-char hex (32 bytes) — satisfies the AES-256-GCM key format check.
ARG SETTINGS_ENCRYPTION_KEY="a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
ENV SETTINGS_ENCRYPTION_KEY=$SETTINGS_ENCRYPTION_KEY

# 64-char hex (32 bytes) — satisfies the AES-256-GCM key format check.
ARG MFA_ENCRYPTION_KEY="b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3"
ENV MFA_ENCRYPTION_KEY=$MFA_ENCRYPTION_KEY

# 64-char hex (32 bytes) — satisfies the AES-256-GCM key format check.
ARG STORAGE_ENCRYPTION_KEY="c4d5e6f7a8b9c4d5e6f7a8b9c4d5e6f7a8b9c4d5e6f7a8b9c4d5e6f7a8b9c4d5"
ENV STORAGE_ENCRYPTION_KEY=$STORAGE_ENCRYPTION_KEY

# 64-char hex (32 bytes) — satisfies the AES-256-GCM key format check.
ARG WEBHOOK_ENCRYPTION_KEY="d5e6f7a8b9c0d5e6f7a8b9c0d5e6f7a8b9c0d5e6f7a8b9c0d5e6f7a8b9c0d5e6"
ENV WEBHOOK_ENCRYPTION_KEY=$WEBHOOK_ENCRYPTION_KEY

# 64-char hex — satisfies the ≥32-char HMAC signing key check.
ARG AUDIT_BUNDLE_SECRET="c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
ENV AUDIT_BUNDLE_SECRET=$AUDIT_BUNDLE_SECRET

# 64-char hex — satisfies the ≥32-char AUDIT_EXPORT_KEY check.
ARG AUDIT_EXPORT_KEY="f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1"
ENV AUDIT_EXPORT_KEY=$AUDIT_EXPORT_KEY

# 64-char hex — satisfies the ≥32-char AUDIT_PSEUDONYMIZATION_KEY check.
ARG AUDIT_PSEUDONYMIZATION_KEY="a1f6b2e3c4d5a1f6b2e3c4d5a1f6b2e3c4d5a1f6b2e3c4d5a1f6b2e3c4d5a1f6"
ENV AUDIT_PSEUDONYMIZATION_KEY=$AUDIT_PSEUDONYMIZATION_KEY

# 64-char hex (64 bytes encoded) — satisfies the ≥32-char session secret check.
ARG AUTH_SESSION_SECRET="d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5"
ENV AUTH_SESSION_SECRET=$AUTH_SESSION_SECRET

# 64-char hex — satisfies the ≥32-char cron bearer token check.
ARG CRON_SECRET="e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6"
ENV CRON_SECRET=$CRON_SECRET

# Must be an https:// URL that is not localhost to pass the production URL check.
ARG NEXT_PUBLIC_APP_URL="https://build-time-dummy.local"
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# 64-char hex — satisfies the ≥32-char OIDC state signing key check.
ARG OIDC_STATE_SECRET="f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2"
ENV OIDC_STATE_SECRET=$OIDC_STATE_SECRET

# Must be an https:// URL — satisfies the APP_URL required URL check.
ARG APP_URL="https://build-time-dummy.local"
ENV APP_URL=$APP_URL

# Ed25519 public key for license signature verification (64-char hex).
# Baked into the image at build time. Empty default disables license enforcement.
# Override via --build-arg LICENSE_PUBLIC_KEY=<key> or GitHub Actions secret.
ARG LICENSE_PUBLIC_KEY=""
ENV LICENSE_PUBLIC_KEY=$LICENSE_PUBLIC_KEY

# Disable Next.js telemetry during build.
ENV NEXT_TELEMETRY_DISABLED=1

# NODE_ENV must be production so the prebuild env validator runs in strict mode
# and confirms the stub values above satisfy all format requirements.
ENV NODE_ENV=production
ENV ALLOW_INSECURE_LOCALHOST=true

# 1. Generate the Prisma client from the schema.
RUN ./node_modules/.bin/prisma generate

# 2. Ensure the public directory exists — Next.js standalone COPY fails if
#    the source path is absent and the project has no static public assets.
RUN mkdir -p public

# 3. Build the Next.js application (standalone mode enabled in next.config.mjs).
RUN npx next build

# -----------------------------------------------------------------------------
# Stage 3 — runner
# Minimal production image. Only the standalone output, static assets, and the
# public directory are copied — no node_modules ballast.
# A dedicated non-root user is created for security.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a dedicated non-root system user and group.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy the standalone server and its auto-traced node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy the content-hashed static chunks into the expected location.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy public assets (favicons, fonts, icons, etc.).
# The COPY instruction is a no-op when the source directory is empty.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy the Prisma schema so `prisma db push` and `prisma db seed` can run
# inside the container without the full build-stage source tree.
COPY --from=builder /app/prisma ./prisma

# Copy the lib directory so seed.ts can resolve relative imports such as
# '../lib/nis2-questions' at runtime inside the container.
COPY --from=builder /app/lib ./lib

# Copy the complete node_modules from the deps stage.
# Next.js standalone traces only the runtime subset; the full tree is needed
# so the Prisma CLI has every transitive dependency (engines, effect, etc.).
COPY --from=deps /app/node_modules /app/node_modules

# Install the entrypoint script, strip Windows CRLF line endings, and make it
# executable.  Without the sed step the Alpine /bin/sh interpreter cannot parse
# the shebang when the file was checked out with \r\n on Windows.
COPY entrypoint.sh ./entrypoint.sh
RUN sed -i 's/\r$//' ./entrypoint.sh && chmod +x ./entrypoint.sh

# Transfer ownership of the entire working directory to the non-root user
# after all copies are complete (copies above run as root).
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# `server.js` is generated by Next.js standalone output.
# entrypoint.sh runs `prisma db push`, `prisma db seed`, then `node server.js`.
# Invoke sh explicitly so CRLF-contaminated shebangs never cause "not found".
CMD ["/bin/sh", "/app/entrypoint.sh"]
