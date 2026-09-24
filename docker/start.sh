#!/bin/bash
# Runs as the app user (PUID:PGID); docker/entrypoint.sh has already given it
# /app/data and started nginx.
set -euo pipefail

echo "Starting Peek Stash Browser..."

DB_FILE=/app/data/peek-stash-browser.db
if [ "${DATABASE_URL:-}" != "file:$DB_FILE" ]; then
    echo "WARNING: DATABASE_URL (${DATABASE_URL:-unset}) is ignored in the Docker image; the database is always $DB_FILE. Remove the variable."
fi
export DATABASE_URL="file:$DB_FILE"
cd /app

# The server applies pending migrations itself before it listens
# (server/initializers/migrations.ts)
echo "Starting backend server..."
exec node backend/index.js
