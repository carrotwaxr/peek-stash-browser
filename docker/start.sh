#!/bin/bash
# Runs as the app user (PUID:PGID); docker/entrypoint.sh has already given it
# /app/data and started nginx.
set -euo pipefail

echo "Starting Peek Stash Browser..."

# Initialize database with proper migrations
echo "Initializing database..."
DB_FILE=/app/data/peek-stash-browser.db
if [ "${DATABASE_URL:-}" != "file:$DB_FILE" ]; then
    echo "WARNING: DATABASE_URL (${DATABASE_URL:-unset}) is ignored in the Docker image; the database is always $DB_FILE. Remove the variable."
fi
export DATABASE_URL="file:$DB_FILE"
cd /app

# The Prisma client is generated at build time; node_modules is read-only here
PRISMA=./node_modules/.bin/prisma

# Check if this is an existing database created with 'db push' (no migrations table)
# We detect this by checking if the User table exists but _prisma_migrations doesn't
if sqlite3 "$DB_FILE" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='User';" 2>/dev/null | grep -q 1; then
    # User table exists - this is an existing database
    if ! sqlite3 "$DB_FILE" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='_prisma_migrations';" 2>/dev/null | grep -q 1; then
        # No migrations table - this was created with db push, needs baselining
        echo "Detected existing database without migration history - baselining..."

        # Create backup before any migration operations
        BACKUP_FILE="$DB_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        echo "Creating backup at: $BACKUP_FILE"
        cp "$DB_FILE" "$BACKUP_FILE"

        # Mark baseline migration as already applied (without running it)
        "$PRISMA" migrate resolve --applied 0_baseline
        echo "Baseline migration marked as applied"
    fi
fi

# Run any pending migrations (safe for both new and existing databases)
echo "Running database migrations..."
"$PRISMA" migrate deploy

# Start backend
echo "Starting backend server..."
exec node backend/index.js
