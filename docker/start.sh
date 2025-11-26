#!/bin/bash
set -e

echo "Starting Peek Stash Browser..."

# Start nginx in background
echo "Starting nginx..."
nginx

# Initialize database with proper migrations
echo "Initializing database..."
export DATABASE_URL="file:/app/data/peek-stash-browser.db"
cd /app

# Generate Prisma client
npx prisma generate

# Check if this is an existing database created with 'db push' (no migrations table)
# We detect this by checking if the User table exists but _prisma_migrations doesn't
if sqlite3 /app/data/peek-stash-browser.db "SELECT 1 FROM sqlite_master WHERE type='table' AND name='User';" 2>/dev/null | grep -q 1; then
    # User table exists - this is an existing database
    if ! sqlite3 /app/data/peek-stash-browser.db "SELECT 1 FROM sqlite_master WHERE type='table' AND name='_prisma_migrations';" 2>/dev/null | grep -q 1; then
        # No migrations table - this was created with db push, needs baselining
        echo "Detected existing database without migration history - baselining..."

        # Create backup before any migration operations
        BACKUP_FILE="/app/data/peek-stash-browser.db.backup.$(date +%Y%m%d_%H%M%S)"
        echo "Creating backup at: $BACKUP_FILE"
        cp /app/data/peek-stash-browser.db "$BACKUP_FILE"

        # Mark baseline migration as already applied (without running it)
        npx prisma migrate resolve --applied 0_baseline
        echo "Baseline migration marked as applied"
    fi
fi

# Run any pending migrations (safe for both new and existing databases)
echo "Running database migrations..."
npx prisma migrate deploy

# Start backend
echo "Starting backend server..."
exec node backend/index.js
