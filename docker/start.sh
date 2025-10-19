#!/bin/bash
set -e

echo "Starting Peek Stash Browser..."

# Start nginx in background
echo "Starting nginx..."
nginx

# Initialize database
echo "Initializing database..."
export DATABASE_URL="file:/app/data/peek-stash-browser.db"
cd /app
npx prisma generate
npx prisma db push --accept-data-loss

# Start backend
echo "Starting backend server..."
exec node backend/index.js
