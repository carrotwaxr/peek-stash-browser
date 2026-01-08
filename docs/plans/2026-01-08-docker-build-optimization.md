# Docker Build Optimization Plan

**Date:** 2026-01-08
**Branch:** `feature/docker-build-optimization`
**Goal:** Reduce production Docker image size and improve build times

## Current State

- **Image size:** 997MB
- **Build time:** ~2-3 minutes (no-cache)
- **Node versions:** Inconsistent (dev: 18/20, prod: 22)

## Root Causes Identified

### 1. Dev dependencies leaking into production (~120MB)

The `npx prisma generate` command in the runtime stage auto-installs the `prisma` CLI when not found, pulling in:

| Package | Size | Why it's there |
|---------|------|----------------|
| `prisma` CLI | 67MB | `npx` auto-installs it |
| `effect` | 33MB | Transitive dep of `@prisma/config` |
| `typescript` | 23MB | Transitive dep of prisma |

**Fix:** Generate Prisma client in build stage, copy only the generated client.

### 2. Non-production files in image (~3MB)

| File | Location | Size |
|------|----------|------|
| `stats.html` | Frontend dist | 1.2MB |
| `dev.db` | `/app/prisma/` | 900KB |
| `seed.ts` | `/app/prisma/` | 4KB |
| `singleton.ts` | `/app/prisma/` | 4KB |
| `vitest.config.js` | `/app/backend/` | 4KB |

**Fix:** Selective COPY commands instead of copying entire directories.

### 3. Duplicate apt-get operations (~15s build time)

Three stages all run `apt-get update` independently:
- `frontend-build` (implicit in node:22-slim)
- `backend-build` (explicit for python3, make, g++)
- `production` (explicit for nginx, sqlite3, etc.)

**Fix:** Create shared base stage or use BuildKit cache mounts.

### 4. Inconsistent Node versions in dev Dockerfiles

| File | Node Version |
|------|--------------|
| `client/Dockerfile.dev` | 20 |
| `server/Dockerfile.dev` | 18 |
| `Dockerfile.production` | 22 |

**Fix:** Standardize all on Node 22.

## Implementation Plan

### Step 1: Fix Prisma generation in production Dockerfile

Move `prisma generate` to the backend-build stage where dev dependencies exist:

```dockerfile
# In backend-build stage (has devDeps)
RUN npx prisma generate

# In production stage
COPY --from=backend-build /app/server/node_modules/.prisma ./node_modules/.prisma
```

**Expected savings:** ~120MB

### Step 2: Exclude stats.html from production

Option A: Conditional vite config (only generate in dev/CI)
Option B: Delete after build in Dockerfile
Option C: Add to .dockerignore pattern

Recommend Option B for simplicity:
```dockerfile
RUN npm run build && rm -f dist/stats.html
```

**Expected savings:** 1.2MB

### Step 3: Selective Prisma directory copy

Replace:
```dockerfile
COPY server/prisma ./prisma
```

With:
```dockerfile
COPY server/prisma/schema.prisma ./prisma/
COPY server/prisma/migrations ./prisma/migrations
```

**Expected savings:** ~1MB

### Step 4: Exclude vitest.config.js from backend dist

The TypeScript build copies this file. Options:
- Add to tsconfig exclude
- Delete after build in Dockerfile
- Move test config outside src

Recommend checking tsconfig first, then delete in Dockerfile if needed.

**Expected savings:** 4KB (trivial, but cleaner)

### Step 5: Standardize Node versions in dev Dockerfiles

Update both dev Dockerfiles to use Node 22:
- `client/Dockerfile.dev`: 20 → 22
- `server/Dockerfile.dev`: 18 → 22

**Expected savings:** None (consistency improvement)

### Step 6: Optimize apt-get with BuildKit cache mounts (optional)

```dockerfile
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    apt-get update && apt-get install -y ...
```

**Expected savings:** ~10-15s on rebuilds

## Actual Results

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Image size | 997MB | **719MB** | **278MB (28%)** |

### Why Not 525MB?

Initial testing removed the Prisma CLI entirely (achieving 525MB), but runtime migrations require the CLI. The Prisma CLI depends on `effect` which depends on `fast-check` and `pure-rand`. These are all required at runtime.

The only removable package is `typescript` (23MB peer dependency).

### Additional Changes Made

- **Removed TMP_DIR env var** - Hardcoded `/app/data/tmp` path instead of relying on environment variable
- **Removed duplicate `npx prisma generate`** from `database.ts` (already done in `start.sh`)
- **Pruned typescript** - The only peer dep that's truly optional at runtime

### Verification Completed

```
$ npx prisma --version
prisma                  : 6.17.0
@prisma/client          : 6.17.0
```

## Rollback

If issues arise, revert the branch. No database migrations or breaking changes involved.
