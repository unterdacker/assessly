#!/bin/sh
# =============================================================================
# AVRA — container entrypoint
#
# 1. Pushes the Prisma schema to the database (creates tables on first start,
#    applies any schema drift on subsequent starts).
#    --accept-data-loss is intentional for dev/test convenience; in a full
#    production workflow replace this with `prisma migrate deploy`.
# 2. Runs the seeder so the demo company, NIS2 questions, and preview vendors
#    are always present after a fresh database.
# 3. Starts the Next.js standalone server.
# =============================================================================

set -e

# Ensure locally installed binaries (tsx, prisma, etc.) are always found
# when Prisma spawns child processes (e.g. the seed runner).
export PATH=/app/node_modules/.bin:$PATH

# Pre-flight: confirm the Prisma binary is present before attempting to run it.
echo "[entrypoint] Checking Prisma binary..."
ls -la ./node_modules/.bin/prisma

PRISMA="./node_modules/.bin/prisma"

echo "[entrypoint] Running prisma db push..."
$PRISMA db push --accept-data-loss

echo "[entrypoint] Running prisma db seed..."
$PRISMA db seed

echo "[entrypoint] Starting Next.js server..."
exec node server.js
