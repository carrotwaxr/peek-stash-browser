---
name: pre-release
description: Run all validation checks before tagging a new release
---

# Pre-Release Checks

Run this before tagging a new version to ensure everything works. Step 2 goes through CI's jobs (`.github/workflows/ci.yml`) in order and runs each one's steps locally in the same order; the image and E2E jobs are left to CI (Step 0).

## Step 0: Verify HEAD is green on CI

**Do this first, before any local checks.** All branches should already be merged to main.

```bash
git branch --show-current                      # expect: main
git fetch origin && git status -sb | head -1   # expect: ## main...origin/main, nothing ahead or behind
gh run list --commit "$(git rev-parse HEAD)" --workflow CI --json status,conclusion,databaseId
gh run view <databaseId> --json jobs -q '.jobs[] | "\(.name): \(.conclusion)"'
```

Expected: one run, `completed` and `success`. Check this commit's run, not the latest run on main: that one can belong to another commit, or be cancelled. Its jobs include `Image Smoke Test / amd64` and `Image Smoke Test / arm64`, both `success`: CI built the production image natively on each architecture and booted it against an empty volume. If the run is still in progress, `gh run watch <databaseId>`. If it failed, or there is no run, **stop and resolve before continuing**.

## Step 1: Clean shared types build

Nuke the shared dist to simulate CI's clean checkout. This catches missing build steps.

```bash
rm -rf shared/dist shared/tsconfig.tsbuildinfo
(cd shared && npm run build)
```

Expected: Build succeeds and `shared/dist/` is populated.

## Step 2: Local checks

Run each block from the repo root. 2b and 2c are independent and can run in parallel.

### 2a. Format (CI: `Format`)
```bash
npm run format:check
```
Expected: All matched files use Prettier code style

### 2b. Client Checks (CI: `Client Checks`)
```bash
(cd client && npm run typecheck && npm run lint && npm run build && npm run test:coverage)
```
Expected: No type or lint errors (warnings OK), the build succeeds, all tests pass and the coverage thresholds hold

### 2c. Server Checks (CI: `Server Checks`)
```bash
(cd server && npx prisma generate && npm run lint && npm run typecheck && npm run test:coverage)
```
Expected: No lint or type errors (warnings OK), all tests pass and the coverage thresholds hold. `npm run typecheck` is CI's two type checks in order: `tsc --noEmit` (source), then `npm run typecheck:tests` (`tests/` and `integration/`).

### 2d. Dependency Audit (CI: `Dependency Audit`)
```bash
(cd server && npm audit --omit=dev --audit-level=high)
(cd client && npm audit --omit=dev --audit-level=high)
(cd shared && npm audit --omit=dev --audit-level=high)
npm audit --omit=dev --audit-level=high
```
Expected: Each exits 0 (no high or critical advisory in runtime dependencies)

### 2e. E2E Tests (CI: `E2E Tests`)
Covered by Step 0: CI ran the suite on this commit.

### 2f. Integration Tests (CI: `Integration Tests`, skipped there: CI has no test Stash)
```bash
(cd server && npm run test:integration:replay)
```
Expected: All tests pass, none skipped (`server/integration/results/summary.json`)
Note: Runs against the synthetic replay of the test Stash and needs no setup. When the test Stash is reachable (`STASH_TEST_URL` and `STASH_TEST_API_KEY` in the root `.env`), also run `npm run fixtures:record -- --check` from the root: it exits 1 when the test Stash has drifted from the recorded fixture.

## Step 3: Docker image

Covered by Step 0 (CI built and booted it on amd64 and arm64). `docker-build.yml` runs the same smoke test again on the tagged commit and tags only images that passed on both architectures. To debug an image locally:

```bash
docker build -f Dockerfile.production -t peek:test . && node docker/smoke-test.mjs peek:test
```

`docker/smoke-test.mjs` publishes the container on `127.0.0.1:8080`; pass another port as a second argument if that one is taken. It removes its container and volume when it ends.

## Fixing Failures

When a check fails, find the root cause with `/fluffer:code-debug` before changing code. Test and migration conventions load from `.claude/rules/tests.md` and `.claude/rules/prisma.md` when you open those files. For Docker build failures, use `homelab:docker-best-practices`.

## After All Checks Pass

Report summary:
- CI on HEAD: Green (run ID)
- Shared types: Clean build
- Format: Clean
- Type check: server and client
- Linter: Clean
- Client build: Success
- Unit tests: X passed (client) + X passed (server), coverage thresholds met
- Dependency audit: Clean
- E2E: Passed in CI
- Integration tests: X passed
- Docker: smoke-tested in CI (amd64, arm64)

Ready to proceed with release tagging.
