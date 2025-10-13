#!/bin/bash

echo "🚀 Setting up Stash Player with new authentication system..."

# Navigate to server directory
cd "C:\Users\charl\code\stash-player\server"

echo "📦 Installing server dependencies..."
# Install authentication packages
npm install bcryptjs jsonwebtoken cookie-parser

echo "📦 Installing TypeScript types..."
# Install TypeScript types
npm install --save-dev @types/bcryptjs @types/jsonwebtoken @types/cookie-parser

echo "🔧 Generating Prisma client..."
# Generate Prisma client
npx prisma generate

echo "💾 Running database migrations..."
# Run database migrations
npx prisma migrate dev --name "init-auth-system"

echo "🌱 Seeding database with admin user..."
# Seed with admin user (username: admin, password: admin)
npx prisma db seed

echo ""
echo "✅ Setup complete!"
echo ""
echo "🔐 Default admin credentials:"
echo "   Username: admin"  
echo "   Password: admin"
echo ""
echo "🚀 To start the server:"
echo "   cd server"
echo "   npm run dev"
echo ""
echo "🌐 To start the client:"
echo "   cd client" 
echo "   npm run dev"
echo ""
echo "📋 See IMPLEMENTATION_SUMMARY.md for full details of changes made."