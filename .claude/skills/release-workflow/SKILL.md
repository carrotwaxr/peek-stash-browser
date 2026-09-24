---
name: release-workflow
description: Use when preparing or executing a release of peek-stash-browser. Covers the full release lifecycle from validation through Docker image publishing.
---

# Release Workflow

## Overview

Releases are triggered by pushing git tags. GitHub Actions builds and publishes Docker images automatically.

```
Pre-release validation → Version bump → Commit → Tag → Push → GitHub Actions → Docker Hub
```

## Version Scheme

- **Stable**: `X.Y.Z` (e.g., `3.3.1`)
- **Beta**: `X.Y.Z-beta.N` (e.g., `3.3.2-beta.1`)
- **Tag format**: `vX.Y.Z` or `vX.Y.Z-beta.N`

Both `client/package.json` and `server/package.json` must always have identical versions.

## Step 1: Pre-Release Validation

Run `/pre-release` to execute all checks; checks 3-8 follow CI's jobs and their steps in order:

1. CI on HEAD: `gh run list --commit "$(git rev-parse HEAD)" --workflow CI --json status,conclusion,databaseId` shows one `completed`, `success` run, whose jobs include `Image Smoke Test / amd64` and `/ arm64`
2. Clean shared types build: `rm -rf shared/dist shared/tsconfig.tsbuildinfo && (cd shared && npm run build)`
3. Format: `npm run format:check`
4. Client checks: `(cd client && npm run typecheck && npm run lint && npm run build && npm run test:coverage)`
5. Server checks: `(cd server && npx prisma generate && npm run lint && npm run typecheck && npm run test:coverage)`; `typecheck` covers the source and the tests
6. Dependency audit: `npm audit --omit=dev --audit-level=high` in `server`, `client`, `shared` and the root
7. E2E tests: covered by check 1
8. Integration tests: `(cd server && npm run test:integration:replay)`
9. Docker image: covered by check 1 (CI built and booted it on amd64 and arm64); to debug one locally, `docker build -f Dockerfile.production -t peek:test . && node docker/smoke-test.mjs peek:test`

All 9 checks must pass before proceeding.

## Step 2: Version Bump & Tag

### Beta Release

Run `/release-beta`:

- Increment beta number: `3.3.2-beta.1` → `3.3.2-beta.2`
- Or start new beta: `3.3.1` → `3.3.2-beta.1`

### Stable Release

Run `/release-stable`:

- Remove beta suffix: `3.3.2-beta.8` → `3.3.2`
- Or increment: `3.3.2` → `3.3.3` or `3.4.0`

### What the Release Skills Do

1. Verify on `main` branch and up to date
2. Update version in `client/package.json` and `server/package.json`
3. Commit: `chore: bump version to X.Y.Z`
4. Push commit to main
5. Create tag: `git tag vX.Y.Z`
6. Push tag: `git push origin vX.Y.Z`

## Step 3: Automated CI/CD

GitHub Actions (`.github/workflows/docker-build.yml`) triggers on `v*` tags:

1. **Smoke**: `image-smoke.yml` builds the image natively on amd64 and arm64, boots each against an empty volume and pushes it by digest.
2. **Publish**: once both pass, the version, `beta` or `latest`/`stable` tags point at those two digests. Nothing is tagged if either fails.
3. **Platforms**: `linux/amd64` + `linux/arm64`, each built on its own native runner (no QEMU). If one architecture fails, fix or re-run that job: the other may have left an untagged digest on Docker Hub, and no tag moved.
4. **Push to Docker Hub**: `carrotwaxr/peek-stash-browser`
5. **Tag strategy**:
   - Semver: `3.3.2`
   - Major.minor: `3.3`
   - `latest` (stable releases only)
   - `stable` (stable releases only)
   - `beta` (beta releases only)
6. **GitHub Release**: Auto-created with generated release notes, marked as prerelease if the tag has a hyphen

## Docker Hub Tags After Release

| Release Type | Tags Applied |
|-------------|-------------|
| `v3.3.2` (stable) | `3.3.2`, `3.3`, `latest`, `stable` |
| `v3.3.2-beta.1` | `3.3.2-beta.1`, `beta` |

Any tag with a hyphen is a prerelease: it never moves `latest`, `stable` or the major.minor tag, and its GitHub Release is marked prerelease. Only `-beta` tags move `beta`, so a `v3.4.0-rc.1` gets `3.4.0-rc.1` alone.

## Updating on unRAID

After GitHub Actions completes:

```bash
# SSH to your deployment server
ssh root@<server-ip>

# Pull new image
docker pull carrotwaxr/peek-stash-browser:latest  # or :beta

# Restart container via unRAID WebGUI or CLI
docker stop peek-stash-browser && docker start peek-stash-browser
```

## Semantic Versioning Guide

- **Patch** (3.3.X): Bug fixes, minor tweaks, no new features
- **Minor** (3.X.0): New features, backward-compatible changes
- **Major** (X.0.0): Breaking changes (rare — major UI overhauls, API changes)
