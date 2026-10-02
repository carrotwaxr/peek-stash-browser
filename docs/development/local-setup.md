# Local Development Setup

This guide covers setting up Peek for local development with hot reloading and debugging capabilities.

## Prerequisites

- [Node.js](https://nodejs.org/) 22 (the version in `.nvmrc`), for native development and running the tests outside Docker
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

3. **Configure `.env`**. The copied file already holds what the stack needs:

    ```bash
    DATABASE_URL=file:/app/data/peek-stash-browser.db
    # JWT_SECRET is optional: Peek generates one in CONFIG_DIR when unset
    ```

    The dev server container reads this file. `/app/data` is the container's side of the `PEEK_DATA_DIR` bind mount (`./.peek-data` by default), so the database is `.peek-data/peek-stash-browser.db` on your machine. The production image ignores `DATABASE_URL` and always uses that same file name.

4. **Start the development stack**:

    ```bash
    docker compose up --build -d
    ```

5. **Access the app**: Open `http://localhost:6969`

6. **Complete the Setup Wizard** to connect to your Stash server

## Development Ports

| Port   | Service      | Description                              |
| ------ | ------------ | ---------------------------------------- |
| `6969` | Frontend UI  | Vite dev server with hot reloading (Docker maps 6969 to Vite's 5173) |
| `8000` | Backend API  | Express server, also published on the host |

## Native Development (Without Docker)

For faster iteration and debugging, you can run the frontend and backend natively.

### Backend Setup

```bash
cd server
npm install
npx prisma generate
npm run dev
```

The backend runs on `http://localhost:8000`. It applies pending migrations itself each time it starts, so there is no separate migrate step. Set the variables below first.

### Frontend Setup

```bash
cd client
npm install
VITE_API_PROXY_TARGET=http://localhost:8000 npm run dev
```

The frontend runs on `http://localhost:5173` with hot module replacement (HMR). Vite proxies `/api` to `http://peek-server:8000`, the Docker Compose service name, unless `VITE_API_PROXY_TARGET` points it at your native backend. Port 6969 exists only in the Docker stack.

### Environment Variables

The server reads the `.env` in the repository root (`server/index.ts`), the same file Docker Compose uses. Outside Docker, give it a database path that exists on your machine instead of the container path:

```bash
# Required. A relative path is resolved from server/prisma/
DATABASE_URL=file:./dev.db

# Optional
NODE_ENV=development
LOG_LEVEL=debug
# Development and tests only; the Docker image's nginx expects 8000
PEEK_SERVER_PORT=8000
# JWT_SECRET is optional: when unset, Peek generates one into CONFIG_DIR
# (default /app/data). Outside Docker, set CONFIG_DIR to a writable folder
# or set JWT_SECRET.
```

## Database Management

Peek uses SQLite with Prisma ORM. In the Docker stack the database is `.peek-data/peek-stash-browser.db`; natively it is the file `DATABASE_URL` names.

### View Database

```bash
cd server
DATABASE_URL=file:./dev.db npx prisma studio   # the same value as your .env
```

Opens a web UI at `http://localhost:5555` to browse and edit data.

### Reset Database

Stop the server, delete the database file (and its `-wal` and `-shm` files), and start the server again: it creates the file and applies every migration. In the Docker stack, run `docker compose stop peek-server`, delete the files under `.peek-data/`, and `docker compose start peek-server`. That wipes every user and the synced library, so copy the file first if you want it back.

### Generate Prisma Client

After schema changes:

```bash
cd server
npx prisma generate
```

In the Docker stack, `docker compose restart peek-server` does this.

### Create a Migration

Migrations are written by hand. Never let Prisma generate or apply one for you: no dev-mode migrate, no `prisma db push`.

1. Change `server/prisma/schema.prisma`.
2. Create `server/prisma/migrations/YYYYMMDD000000_short_name/migration.sql`, dated after the newest folder, and write the SQL in one transaction. `.claude/rules/prisma.md` has the template and the rules for rebuilding tables.
3. Start the server (or restart `peek-server`): it applies pending migrations before it listens.
4. Check that the migrations and the schema agree:

    ```bash
    cd server
    npm run db:drift
    ```

    It must print an empty migration. CI runs it.

## Testing

### Run Backend Tests

```bash
cd server
npm run test:run
npm run test:coverage   # CI enforces the thresholds in vitest.config
```

### Run Frontend Tests

```bash
cd client
npm run test:run
npm run test:coverage   # CI enforces the thresholds in vitest.config
```

`npm test` in either package starts Vitest in watch mode, which suits a terminal and nothing else.

The server's `tsc` and the client's `typecheck` read the built shared types, so run `cd shared && npm run build` first after a clone or a change under `shared/`. Vite and Vitest read `shared/types` directly and do not need it.

### Integration Tests

`cd server && npm run test:integration:replay` runs the integration tests against a synthetic replay of the test Stash, with no setup. `npm run test:integration` runs them against a live test Stash (`STASH_TEST_URL` and `STASH_TEST_API_KEY` in the root `.env`).

### End-to-end tests

The Playwright suite lives in `e2e/`. Before the first run:

```bash
npm ci                                # root: Playwright
(cd client && npm ci)
(cd server && npm ci && npx prisma generate)
(cd shared && npm ci && npm run build)
npx playwright install chromium
```

`npm run test:e2e` from the root is hermetic, locally and in CI. Playwright starts the Stash replay, serving a larger variant of the integration tests' synthetic library, then its own server and Vite client beside the dev stack, on a throwaway database (in `/dev/shm` when it exists) that is replaced at every run. Their ports come from a hash of the checkout's path (table below), so the suite can run in two worktrees at once; the run's log names them. Global setup creates that database's only admin, points its one Stash instance at the replay and waits for the sync, and the tests sign in as that admin. The replay refuses writes, and the run fails at teardown if Peek sent it one or asked for something it does not serve. The dev stack can keep running, and nothing the suite does reaches it or a real Stash.

`E2E_BASE_URL=http://localhost:6969 npm run test:e2e` runs the suite against the dev stack instead, for manual runs on real data. Nothing is started. `.env.e2e` in the root (gitignored) names an admin of that stack:

```bash
E2E_USERNAME=your-admin
E2E_PASSWORD=your-password
```

That account only creates a throwaway admin for the run (`e2e-<run id>-admin`) and deletes it afterwards, with the users and groups the run created. No test signs in as it.

| Variable          | Default                             | Purpose                                                            |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `E2E_SERVER_PORT` | 20000-21999, from the checkout path | The hermetic run's server                                          |
| `E2E_CLIENT_PORT` | 22000-23999, from the checkout path | The hermetic run's Vite client                                     |
| `E2E_STASH_PORT`  | 24000-25999, from the checkout path | The hermetic run's Stash replay                                    |
| `E2E_TMP_DIR`     | `/dev/shm`, else the temp dir       | Where the run's database directory, `peek-e2e-<server port>`, goes |
| `E2E_BASE_URL`    | unset                               | Set: dev-stack mode against the Peek at this URL                   |

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
# Root (Prettier, all packages)
npm run format

# Or in specific directory
cd client && npm run format
cd server && npm run format
```

### Lint Check

The root has no lint script. Run it in each package:

```bash
cd client && npm run lint
cd server && npm run lint
```

### Type Check

```bash
# Server: source, then unit and integration tests (tsconfig.tests.json)
cd server && npm run typecheck

# Client: source and tests
cd client && npm run typecheck
```

Build the shared types first (`cd shared && npm run build`) and check the schema after a migration (`cd server && npm run db:drift`).

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
- [API Reference](../reference/api-reference.md) - Backend API documentation
