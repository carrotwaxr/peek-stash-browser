# Integration Test Failures Analysis

**Date:** 2026-01-04
**Goal:** Identify and prioritize bugs found by integration tests for 3.1.0 release
**Test Results:** 46 passed, 30 failed

---

## Summary

After running integration tests against a real Stash server, we identified **30 failing tests**. Analysis reveals these fall into **3 categories**:

| Category | Count | Priority | Type |
|----------|-------|----------|------|
| Test assertion issues (not bugs) | 5 | Low | Fix tests |
| Library API endpoints returning 503 | ~20 | **Critical** | Real bug |
| Hidden entity cascade errors | 5 | Medium | Real bug |

---

## Category 1: Test Assertion Issues (Fix Tests, Not App)

**Priority: Low** - These are incorrect test expectations, not application bugs.

### Issue 1.1: Role case mismatch
- **Tests:** `auth.integration.test.ts` - login and /me endpoints
- **Error:** `expected 'ADMIN' to be 'admin'`
- **Root Cause:** Test expects lowercase `'admin'` but API returns `'ADMIN'`
- **Fix:** Update test to expect `'ADMIN'` (matches Prisma enum)

### Issue 1.2: Wrong route paths for unauthenticated access
- **Tests:** `auth.integration.test.ts` - "Protected routes require authentication"
- **Error:** `expected 404 to be 401`
- **Root Cause:** Tests call `/api/scenes` but routes are at `/api/library/scenes`
- **Fix:** Update test to use correct routes (`/api/library/scenes`)

**Action:** Create `bugfix/fix-integration-test-assertions` branch

---

## Category 2: Library API Endpoints Returning 503 (CRITICAL)

**Priority: Critical** - These affect all library browsing functionality.

### Issue 2.1: All library endpoints failing for test user

**Affected Endpoints:**
- `POST /api/library/scenes` - pagination, filtering, by ID
- `POST /api/library/performers` - pagination, minimal, by ID
- `POST /api/library/studios` - pagination, minimal, by ID
- `POST /api/library/tags` - pagination, minimal, by ID
- `POST /api/library/groups` - pagination, minimal, by ID
- `POST /api/library/galleries` - pagination, by ID, images
- `POST /api/library/images` - pagination
- `GET /api/library/scenes/:id/similar`

**Error Pattern:** `response.ok` is `false` (non-2xx status)

**Likely Root Cause:** The `requireCacheReady` middleware is returning 503 "Server is initializing" for the test user, even though:
1. Sync has completed
2. Admin user can access data (health tests pass)

**Hypothesis:** The `stashEntityService.isReady()` check may be failing for non-admin users, OR there's a timing issue where the cache isn't marked ready for the integration test user's session.

**Investigation Steps:**
1. Check `stashEntityService.isReady()` logic
2. Verify sync state timestamps are set correctly
3. Check if there's a per-user cache readiness issue

**Action:** Create `bugfix/library-endpoints-503-cache-ready` branch

---

## Category 3: Hidden Entity Cascade Errors

**Priority: Medium** - Affects content restrictions feature.

### Issue 3.1: Prisma createMany validation errors

**Location:** `UserHiddenEntityService` or `ExclusionComputationService`

**Errors:**
```
Error hiding entity: PrismaClientValidationError
Error hiding entity: PrismaClientKnownRequestError
```

**Context:** Occurs during cascade operations when hiding a performer that appears in multiple scenes.

**Root Cause:** The `createMany` operation for cascade exclusions may be:
1. Missing a required field
2. Hitting a unique constraint violation
3. Passing invalid data types

**Affected Tests:**
- `content-restrictions.integration.test.ts` - hide/unhide entity operations

**Action:** Create `bugfix/hidden-entity-cascade-prisma-errors` branch

---

## Recommended Fix Order for 3.1.0 Release

### Phase 1: Critical (Must Fix)
1. **`bugfix/library-endpoints-503-cache-ready`**
   - Fix the cache readiness check so library endpoints work
   - This blocks ~20 tests and affects core browsing functionality
   - Estimated scope: Small (likely a timing/state issue)

### Phase 2: Medium Priority
2. **`bugfix/hidden-entity-cascade-prisma-errors`**
   - Fix Prisma validation in cascade logic
   - Affects content restrictions feature
   - Estimated scope: Medium (need to debug Prisma query)

### Phase 3: Test Fixes (Can Be Done Anytime)
3. **`bugfix/fix-integration-test-assertions`**
   - Fix incorrect test expectations (role case, route paths)
   - No app changes needed
   - Estimated scope: Small (5 test file edits)

---

## After Fixes: Expected Results

Once all fixes are applied:
- **76 tests should pass** (current 46 + 30 fixed)
- All library endpoints functional
- Content restrictions working
- Integration tests provide reliable pre-release validation

---

## Notes

- The integration test infrastructure is working correctly
- Tests are successfully exposing real issues
- Most failures trace to a single root cause (cache readiness)
- Fixing Category 2 will likely resolve 20+ tests at once
