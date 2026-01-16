---
name: pre-release
description: Run all validation checks before tagging a new release
---

# Pre-Release Checks

Run this before tagging a new version to ensure everything works.

## Checklist

1. **Server Unit Tests**
   ```bash
   cd server && npm test
   ```
   Expected: All tests pass

2. **Server Linter**
   ```bash
   cd server && npm run lint
   ```
   Expected: No errors (warnings OK)

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

## After All Checks Pass

Report summary:
- Unit tests: X passed
- Integration tests: X passed
- Linter: Clean
- Build: Success

Ready to proceed with release tagging.
