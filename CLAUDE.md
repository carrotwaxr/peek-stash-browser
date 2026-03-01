# Peek Stash Browser

Web application for browsing and streaming Stash media with multi-instance support, playlists, ratings, and multi-user access control.

## Tech Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS 3, Video.js 7
- **Backend**: Node.js/Express 5, TypeScript (strict), Prisma 6, SQLite
- **Video**: Proxies Stash's native HLS streams with playlist URL rewriting
- **Deployment**: Docker (dev: docker-compose, prod: single container + Nginx)
- **Stash API**: Internal `StashClient` using `graphql-request` + GraphQL codegen SDK

## Quick Reference

```bash
# Dev environment
docker-compose up --build -d
docker-compose logs -f peek-server
docker-compose logs -f peek-client

# Linting
cd client && npm run lint
cd server && npm run lint

# Tests
cd client && npm test
cd server && npm test
cd server && npm run test:integration

# E2E tests (requires docker-compose running, or set E2E_BASE_URL)
npm run test:e2e
npm run test:e2e:headed    # with browser visible
npm run test:e2e:ui        # Playwright UI mode

# Coverage
cd client && npm run test:coverage
cd server && npm run test:coverage
```

Docker is required for the full dev environment. Direct Node.js (`npm run dev`) works for quick validation but isn't fully functional.

## Core Architecture

### Multi-Instance Support (affects everything)

Peek connects to **multiple Stash servers** simultaneously. This is the most important architectural pattern to understand:

- All cached entity tables use **composite keys**: `@@id([id, stashInstanceId])`
- Query builders, stats, and user data functions all require `instanceId` awareness
- `StashInstanceManager` manages connections and credentials per instance
- Every data operation must be instance-scoped — forgetting this causes silent data mixing bugs

### Video Streaming

Peek proxies Stash's native HLS streams — it does **not** transcode. The proxy rewrites playlist URLs, strips API keys from segment URLs for security, and routes per-instance. See `server/controllers/video.ts` and `server/controllers/proxy.ts`.

### Authentication

JWT in HTTP-only cookies (24h expiry, auto-refresh). Roles: ADMIN, USER. Supports reverse proxy auth via `PROXY_AUTH_HEADER`. Middleware in `server/middleware/auth.ts`.

## Database

**Always use migrations, never `prisma db push`.** Due to FTS virtual tables, `prisma migrate dev` causes false drift detection — use manual migrations per the `prisma-sqlite-expert` skill. Schema: `server/prisma/schema.prisma`.

## Skill Directory

These skills contain detailed reference material. Invoke the relevant skill when working in that area:

| Area | Skill | What it covers |
|------|-------|----------------|
| **Session start** | `start-session` | Branch context, plan docs, recent history, structured briefing |
| **API routes & controllers** | `express5-api-patterns` | Route handlers, middleware, proxy controllers, streaming endpoints |
| **Database & migrations** | `prisma-sqlite-expert` | Schema design, FTS5, migration process (including FTS workaround) |
| **Testing** | `writing-tests` | Vitest + RTL (client), integration tests (server), test Stash instance setup |
| **E2E testing** | `playwright-skill` | Playwright E2E tests, locators, auth patterns, CI integration |
| **UI components** | `visual-style` | Color system, spacing, theme variables, component conventions |
| **React performance** | `react-spa-performance` | Code splitting, re-renders, virtualization, bundle optimization |
| **Code review** | `self-review` | Quality checklist, invokes relevant skills per diff area |
| **Releases** | `release-workflow` | Full lifecycle; also `/pre-release`, `/release-stable`, `/release-beta` |
| **Documentation** | `updating-docs` | MkDocs conventions, doc structure, plan formatting |
| **GraphQL** | `graphql-patterns` | Stash ecosystem GraphQL, codegen, query patterns |
| **Stash API** | `stash` | Stash GraphQL API, plugin system, scraper system |

## Development Lifecycle

### Starting a session

Run `/start-session` at the beginning of every session. This gathers branch context, plan documents, and recent history before any code is written. **Do not skip this step** — it prevents the cold-start problem where the agent works without context.

### Working on a ticket

Follow this chain:

1. **Orient** → `/start-session` (gather context, present briefing, confirm direction)
2. **Pick up ticket** → invoke `work-ticket` (handles branch creation, plan review, implementation)
3. **Write tests** → invoke `writing-tests` for conventions
4. **Verify** → `superpowers:verification-before-completion` (evidence before claims)
5. **Self-review** → `self-review` (code quality, invokes relevant best-practice skills)
6. **Complete** → `superpowers:finishing-a-development-branch` (merge/PR/keep/discard)

### Lifecycle Gates

These are **mandatory** — do not skip or rationalize around them.

**Before creating a branch:**
- Have a ticket or clear scope for the work
- If non-trivial, have a plan document reviewed by the human

**Before creating a PR:**
- All tests pass: `cd client && npm test` and `cd server && npm test`
- Coverage thresholds pass: `cd client && npm run test:coverage` and `cd server && npm run test:coverage`
- Lint clean: `cd client && npm run lint` and `cd server && npm run lint`
- TypeScript compiles: `cd server && npx tsc --noEmit`
- Client builds: `cd client && npm run build`
- Integration tests pass (if touching server logic): `cd server && npm run test:integration`
- Self-review completed via `self-review` skill
- Documentation updated if behavior changed (invoke `updating-docs`)

**Coverage thresholds** (enforced in CI via `vitest.config` — ratchet up after coverage PRs):

| Metric | Client | Server |
|--------|--------|--------|
| Statements | 33% | 53% |
| Branches | 75% | 71% |
| Functions | 37% | 62% |
| Lines | 33% | 53% |

**Before merging:**
- CI passes (when available)
- Human has reviewed the PR

### Release Process

Use `/release-workflow` for the full process overview. Quick reference:
1. Run `/pre-release` to validate (tests, lint, build, Docker build)
2. Run `/release-stable` (stable) or `/release-beta` (beta) to bump versions, commit, tag, and push
3. GitHub Actions (`.github/workflows/docker-build.yml`) builds Docker image and creates release

## Environment Variables

Required: `DATABASE_URL`, `JWT_SECRET`
Instance config: `STASH_URL` and `STASH_API_KEY` (legacy env-based setup, now configurable via Setup Wizard UI)
Optional: `PROXY_AUTH_HEADER`, `SECURE_COOKIES`, `CONFIG_DIR`, `PEEK_DATA_DIR`, `PEEK_FRONTEND_PORT`, `PEEK_BACKEND_PORT`

## Issue Tracking

- GitHub: https://github.com/carrotwaxr/peek-stash-browser/issues
- Discourse: https://discourse.stashapp.cc/t/peek-stash-browser/4018
