# Development Setup

This guide will help you set up a local development environment for Peek Stash Browser.

## Prerequisites

### Required Software

- **Node.js 18+** - JavaScript runtime
- **Docker & Docker Compose** - Container platform
- **Git** - Version control
- **Code Editor** - VS Code recommended

### Recommended VS Code Extensions

- ES7+ React/Redux/React-Native snippets
- Tailwind CSS IntelliSense
- Prisma
- Docker
- ESLint

## Initial Setup

### 1. Clone Repository

```bash
git clone https://github.com/carrotwaxr/peek-stash-browser.git
cd peek-stash-browser
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your Stash server settings:

```bash
STASH_URL=http://your-stash-server:9999/graphql
STASH_API_KEY=your_api_key
DATABASE_URL=file:./data/peek-stash-browser.db
TMP_DIR=/path/to/temp/directory
NODE_ENV=development
JWT_SECRET=dev-secret-change-in-production
```

### 3. Start Development Environment

```bash
# Starts both frontend and backend with hot reloading
docker-compose up -d
```

!!! success "Hot Reloading Enabled"
    Both frontend and backend have hot reloading - changes are reflected immediately!

SQLite database is automatically initialized - no separate database container needed.

### 4. Access Development Environment

| Service | URL | Credentials |
|---------|-----|-------------|
| **Frontend** | `http://localhost:6969` | admin / admin |
| **Backend API** | `http://localhost:8000` | - |

!!! warning "Change Default Password"
    Change the default admin password immediately after first login!

## Making Changes

### Frontend Development

- **Location**: `client/src/`
- **Effect**: Browser refreshes automatically
- **Technology**: React 19 + Vite + Tailwind CSS

```bash
# Run frontend tests
cd client && npm test

# Run linter
cd client && npm run lint

# Build for production
cd client && npm run build
```

### Backend Development

- **Location**: `server/`
- **Effect**: Server restarts automatically (nodemon)
- **Technology**: Node.js + Express + TypeScript

```bash
# Run backend tests
cd server && npm test

# Run linter
cd server && npm run lint

# Build for production
cd server && npm run build
```

### Database Changes

- **Database**: SQLite (embedded)
- **ORM**: Prisma
- **Location**: `server/prisma/schema.prisma`

```bash
# Generate Prisma client after schema changes
cd server && npx prisma generate

# Create migration
cd server && npx prisma migrate dev --name your_migration_name

# Apply migrations
cd server && npx prisma migrate deploy
```

## Development Workflow

### Creating a Feature

```bash
# 1. Create feature branch
git checkout -b feature/your-feature-name

# 2. Make changes (hot reload active)

# 3. Run tests
cd client && npm test
cd server && npm test

# 4. Run linters
cd client && npm run lint
cd server && npm run lint

# 5. Commit changes
git add .
git commit -m "feat: your feature description"

# 6. Push to GitHub
git push origin feature/your-feature-name
```

### Testing

Peek uses **Vitest** for unit testing in both frontend and backend.

=== "Frontend Tests"

    ```bash
    # Run in watch mode
    cd client && npm test

    # Run with UI
    cd client && npm run test:ui

    # Run once (CI mode)
    cd client && npm run test:run

    # Example test files
    # client/src/components/video-player/videoPlayerUtils.test.js
    ```

=== "Backend Tests"

    ```bash
    # Run in watch mode
    cd server && npm test

    # Run with UI
    cd server && npm run test:ui

    # Run once (CI mode)
    cd server && npm run test:run

    # Example test files
    # server/utils/pathMapping.test.ts
    ```

### Code Quality

Peek uses **ESLint 9** with flat config format for both frontend and backend.

```bash
# Lint frontend (React/JSX)
cd client && npm run lint

# Lint backend (TypeScript)
cd server && npm run lint
```

**Configuration Files**:

- Frontend: `client/eslint.config.js` (React hooks, React refresh)
- Backend: `server/eslint.config.js` (TypeScript strict mode)

## Project Structure

```
peek-stash-browser/
├── client/                 # React frontend
│   ├── public/            # Static assets
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API services
│   │   ├── utils/         # Utility functions
│   │   ├── themes/        # Theme configuration
│   │   └── contexts/      # React contexts
│   ├── package.json
│   └── vite.config.js
├── server/                # Node.js backend
│   ├── controllers/       # Route controllers
│   ├── middleware/        # Express middleware
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   ├── utils/             # Utility functions
│   ├── prisma/           # Database schema
│   ├── package.json
│   └── tsconfig.json
├── docs/                  # Documentation
├── .github/workflows/     # CI/CD
├── docker-compose.yml     # Development
└── README.md
```

## Debugging

### VS Code Debug Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/server/src/index.ts",
      "env": {
        "NODE_ENV": "development"
      },
      "runtimeArgs": ["-r", "ts-node/register"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Viewing Logs

```bash
# View all logs
docker-compose logs -f

# View backend logs only
docker-compose logs -f backend

# View frontend logs only
docker-compose logs -f frontend
```

### Common Issues

**Port already in use**:
```bash
# Stop all containers
docker-compose down

# Start again
docker-compose up -d
```

**Database connection issues**:
```bash
# Reset database
docker-compose down -v
docker-compose up -d
```

**Hot reload not working**:
```bash
# Restart containers
docker-compose restart
```

## Next Steps

- [Architecture Overview](architecture.md)
- [API Reference](api-reference.md)
- [Testing Guide](testing.md)
- [Contributing Guidelines](contributing.md)

## Additional Resources

- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
