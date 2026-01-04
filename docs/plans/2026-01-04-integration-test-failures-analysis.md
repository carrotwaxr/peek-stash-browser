# Integration Test Failures Analysis

**Date:** 2026-01-04
**Status:** RESOLVED
**Final Results:** 76 passed, 0 failed

---

## Summary

The original test run showed 46 passed, 30 failed. After investigation, **all 30 failures were test implementation issues, not application bugs**. The tests have been fixed and all 76 tests now pass.

---

## Issues Found and Fixed

### Issue 1: adminClient Singleton Not Shared Across Processes

**Root Cause:** Vitest's `globalSetup.ts` runs in a separate process from the test workers. The `adminClient.login()` call in globalSetup authenticated a different instance than the one imported by test files.

**Fix:** Added `beforeAll(async () => { await adminClient.login(...) })` to each test file that uses `adminClient`.

**Files Changed:**
- `integration/api/scenes.integration.test.ts`
- `integration/api/performers.integration.test.ts`
- `integration/api/studios.integration.test.ts`
- `integration/api/tags.integration.test.ts`
- `integration/api/galleries.integration.test.ts`
- `integration/api/groups.integration.test.ts`
- `integration/api/images.integration.test.ts`

---

### Issue 2: Incorrect API Response Format Expectations

**Root Cause:** Tests expected `response.data.scenes` but the API returns `response.data.findScenes.scenes`.

**API Response Formats:**
| Endpoint | Response Format |
|----------|-----------------|
| `/api/library/scenes` | `{ findScenes: { count, scenes } }` |
| `/api/library/performers` | `{ findPerformers: { count, performers } }` |
| `/api/library/studios` | `{ findStudios: { count, studios } }` |
| `/api/library/tags` | `{ findTags: { count, tags } }` |
| `/api/library/galleries` | `{ findGalleries: { count, galleries } }` |
| `/api/library/groups` | `{ findGroups: { count, groups } }` |
| `/api/library/images` | `{ findImages: { count, images } }` |
| `/api/library/*/minimal` | `{ <entities>: [...] }` (no wrapper) |

**Fix:** Updated all test files to use correct response paths.

---

### Issue 3: Incorrect Request Body Format

**Root Cause:** Tests sent `{ page: 1, per_page: 10 }` but the API expects `{ filter: { page: 1, per_page: 10 } }`.

**Correct Request Formats:**
\`\`\`typescript
// Pagination
{ filter: { page: 1, per_page: 10, sort: "created_at", direction: "DESC" } }

// Filtering by entity
{ filter: { per_page: 50 }, scene_filter: { performers: { value: ["123"], modifier: "INCLUDES" } } }

// Fetch by ID
{ ids: ["123", "456"] }
\`\`\`

**Fix:** Updated test requests to use the correct nested structure.

---

### Issue 4: Role Case Mismatch

**Root Cause:** Tests expected lowercase `"admin"` but the API returns uppercase `"ADMIN"` (matching Prisma enum).

**Fix:** Changed `expect(role).toBe("admin")` to `expect(role).toBe("ADMIN")`.

**Files Changed:**
- `integration/api/auth.integration.test.ts`

---

### Issue 5: Wrong Route Paths

**Root Cause:** Tests called `/api/scenes` but the actual routes are at `/api/library/scenes`.

**Fix:** Updated route paths in protected routes authentication tests.

**Files Changed:**
- `integration/api/auth.integration.test.ts`

---

## Verification

After all fixes, the full test suite passes:

\`\`\`
Test Files  10 passed (10)
Tests       76 passed (76)
\`\`\`

---

## Lessons Learned

1. **Vitest globalSetup runs in a separate process** - Module singletons don't share state with test workers. Use `beforeAll` in test files for setup that requires shared state.

2. **Test against actual API contracts** - Before writing tests, verify the actual request/response format by checking:
   - Controller code (`res.json(...)` calls)
   - Frontend API service calls
   - TypeScript types

3. **Integration tests successfully validated the infrastructure** - Even though the failures were test issues, the process of fixing them verified that:
   - The test server starts correctly
   - Database migrations work
   - Authentication flows correctly
   - Stash sync completes
   - Library endpoints return data

---

## No Application Bugs Found

The integration test infrastructure is working correctly. All 30 "failures" were due to incorrect test implementation, not application bugs.

The pre-release skill (\`/pre-release\`) can now be used with confidence - if tests fail, they're detecting real issues.
