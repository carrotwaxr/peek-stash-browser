---
name: pre-release
description: Run all validation checks before tagging a new release
---

# Pre-Release Checks

Run this before tagging a new version to ensure everything works.

## Checklist

Run steps 1-5 in parallel where possible (server and client checks are independent).

1. **Server Unit Tests**
   ```bash
   cd server && npm test
   ```
   Expected: All tests pass

2. **Server Linter + Type Check**
   ```bash
   cd server && npm run lint
   ```
   Expected: No errors (warnings OK)
   ```bash
   cd server && npx tsc --noEmit
   ```
   Expected: No type errors

3. **Client Unit Tests**
   ```bash
   cd client && npm test
   ```
   Expected: All tests pass

4. **Client Linter**
   ```bash
   cd client && npm run lint
   ```
   Expected: No errors (warnings OK)

5. **Integration Tests**
   ```bash
   cd server && npm run test:integration
   ```
   Expected: All tests pass
   Note: Requires testEntities.ts to be configured

6. **Client Build**
   ```bash
   cd client && npm run build
   ```
   Expected: Build succeeds without errors

7. **Docker Build**
   ```bash
   docker build -f Dockerfile.production -t peek:test .
   ```
   Expected: Image builds successfully

## Fixing Failures

When a check fails, invoke the relevant skill for guidance before attempting fixes:

| Failure | Skill to invoke |
|---|---|
| Test failures (writing/fixing tests) | `writing-tests` |
| TypeScript type errors | `typescript-advanced-types` |
| Prisma/migration issues | `prisma-sqlite-expert` |
| Docker build failures | `docker-best-practices` |
| React/client lint or build errors | `vercel-react-best-practices` |
| Server lint or runtime errors | `nodejs-backend-patterns` |

## After All Checks Pass

Report summary:
- Unit tests: X passed
- Integration tests: X passed
- Linter: Clean
- Type check: Clean
- Build: Success
- Docker: Success

Ready to proceed with release tagging.
