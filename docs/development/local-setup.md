# Local Development Setup

This guide covers setting up Peek for local development with hot reloading and debugging capabilities.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (20+ recommended)
- [Docker](https://www.docker.com/) and Docker Compose
- [Git](https://git-scm.com/)
- A running Stash server with GraphQL API enabled

## Quick Start (Docker Compose)

The fastest way to get a development environment running:

1. **Clone the repository**:

    ```bash
    git clone https://github.com/carrotwaxr/peek-stash-browser.git
    cd peek-stash-browser
    ```

2. **Set up environment**:

    ```bash
    cp .env.example .env
    ```

3. **Configure `.env`**:

    ```bash
    DATABASE_URL=file:./data/peek-stash-browser.db
    # JWT_SECRET is optional: Peek generates one in CONFIG_DIR when unset
    ```

4. **Start the development stack**:

    ```bash
    docker compose up --build -d
    ```

5. **Access the app**: Open `http://localhost:6969`

6. **Complete the Setup Wizard** to connect to your Stash server

## Development Ports

| Port   | Service      | Description                              |
| ------ | ------------ | ---------------------------------------- |
| `6969` | Frontend UI  | Vite dev server with hot reloading       |
| `8000` | Backend API  | Express server (internal Docker network) |

## Native Development (Without Docker)

For faster iteration and debugging, you can run the frontend and backend natively.

### Backend Setup

```bash
cd server
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

The backend runs on `http://localhost:8000`.

### Frontend Setup

```bash
cd client
npm install
npm run dev
```

The frontend runs on `http://localhost:6969` with hot module replacement (HMR).

### Environment Variables

Create a `.env` file in the `server/` directory:

```bash
# Required
DATABASE_URL=file:./data/peek-db.db

# Optional
NODE_ENV=development
LOG_LEVEL=debug
# JWT_SECRET is optional: when unset, Peek generates one into CONFIG_DIR
# (default /app/data). Outside Docker, set CONFIG_DIR to a writable folder
# or set JWT_SECRET.
```

## Database Management

Peek uses SQLite with Prisma ORM.

### View Database

```bash
cd server
npx prisma studio
```

Opens a web UI at `http://localhost:5555` to browse and edit data.

### Reset Database

```bash
cd server
rm -rf data/peek-db.db
npx prisma migrate dev
```

### Generate Prisma Client

After schema changes:

```bash
cd server
npx prisma generate
```

### Create Migration

After modifying `prisma/schema.prisma`:

```bash
cd server
npx prisma migrate dev --name your_migration_name
```

## Testing

### Run Backend Tests

```bash
cd server
npm test
```

### Run Frontend Tests

```bash
cd client
npm test
```

### Integration Tests

`cd server && npm run test:integration:replay` runs the integration tests against a synthetic replay of the test Stash, with no setup. `npm run test:integration` runs them against a live test Stash (`STASH_TEST_URL` and `STASH_TEST_API_KEY` in the root `.env`). See the [Regression Testing Guide](regression-testing.md) for manual checks.

## Debugging

### Backend Debugging (VS Code)

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "skipFiles": ["<node_internals>/**"],
      "cwd": "${workspaceFolder}/server",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Frontend Debugging

Use browser DevTools (F12). The Vite dev server provides source maps for debugging TypeScript/React code.

### View Logs

```bash
# Docker Compose logs
docker compose logs -f

# Backend only
docker compose logs -f peek-server

# Frontend only
docker compose logs -f peek-client
```

## Code Style

The project uses ESLint and Prettier for code formatting.

### Format Code

```bash
# Root (runs on all packages)
npm run format

# Or in specific directory
cd client && npm run format
cd server && npm run format
```

### Lint Check

```bash
npm run lint
```

### Type Check

```bash
# Server: source, then unit and integration tests (tsconfig.tests.json)
cd server && npm run typecheck

# Client: source and tests
cd client && npm run typecheck
```

The server tests are checked with the same flags as the source. CI runs the server check.

## Building for Production

### Build Docker Image

```bash
docker build -f Dockerfile.production -t peek-stash-browser:local .
```

### Smoke Test the Image

`node docker/smoke-test.mjs peek-stash-browser:local` boots it against an empty volume and runs the checks CI runs. It uses a throwaway container and volume on port 8080 (pass another port as a second argument) and removes both afterwards.

### Test Production Build Locally

```bash
docker run -d \
  --name peek-local-test \
  -p 6969:80 \
  -v peek-test-data:/app/data \
  peek-stash-browser:local
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 6969
lsof -i :6969

# Kill it
kill -9 <PID>
```

### Prisma Client Out of Sync

The dev server regenerates the Prisma client and applies migrations every time it starts. After changing `schema.prisma` or adding a migration, restart it: `docker compose restart peek-server`.

### Docker Compose Issues

Rebuild the containers with `docker compose up --build -d`. Each container reinstalls its dependencies itself when `package-lock.json` changed since its `node_modules` volume was filled, so no `-V` is needed after pulling a dependency change.

### Clear Node Modules

```bash
rm -rf node_modules client/node_modules server/node_modules
npm install
cd client && npm install
cd ../server && npm install
```

## Next Steps

- [Technical Overview](technical-overview.md) - Understand the architecture
- [Sync Architecture](sync-architecture.md) - How Stash sync works
- [API Reference](api-reference.md) - Backend API documentation
