# PowerShell setup script for Stash Player authentication system

Write-Host "🚀 Setting up Stash Player with new authentication system..." -ForegroundColor Green

# Navigate to server directory  
Set-Location "C:\Users\charl\code\stash-player\server"

Write-Host "📦 Installing server dependencies..." -ForegroundColor Yellow
# Install authentication packages
npm install bcryptjs jsonwebtoken cookie-parser

Write-Host "📦 Installing TypeScript types..." -ForegroundColor Yellow  
# Install TypeScript types
npm install --save-dev @types/bcryptjs @types/jsonwebtoken @types/cookie-parser

Write-Host "🔧 Generating Prisma client..." -ForegroundColor Yellow
# Generate Prisma client
npx prisma generate

Write-Host "💾 Running database migrations..." -ForegroundColor Yellow
# Run database migrations
npx prisma migrate dev --name "init-auth-system"

Write-Host "🌱 Seeding database with admin user..." -ForegroundColor Yellow
# Seed with admin user (username: admin, password: admin)
npx prisma db seed

Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🔐 Default admin credentials:" -ForegroundColor Cyan
Write-Host "   Username: admin" -ForegroundColor White
Write-Host "   Password: admin" -ForegroundColor White
Write-Host ""
Write-Host "🚀 To start the server:" -ForegroundColor Cyan
Write-Host "   cd server" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "🌐 To start the client:" -ForegroundColor Cyan
Write-Host "   cd client" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor White  
Write-Host ""
Write-Host "📋 See IMPLEMENTATION_SUMMARY.md for full details of changes made." -ForegroundColor Cyan