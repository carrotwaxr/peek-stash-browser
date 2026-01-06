# Scalability Audit: 500TB / 500k+ Scene Libraries

**Date**: 2026-01-06
**Triggered by**: Discord user report - "Sync from Stash" feature crashed system with 500k scenes
**Version**: 3.1.1
**Updated**: 2026-01-06 (Phase 1 fixes implemented)

---

## Executive Summary

Despite significant scalability improvements in 3.x, **several critical paths remain that do not scale** to 500k+ scene libraries. The most severe offender is the **"Sync from Stash" feature** in Server Settings > User Management, which attempts to load all entities into memory in a single unbounded GraphQL query.

### Severity Ratings & Fix Status

| Issue | Severity | Status | PR/Commit |
|-------|----------|--------|-----------|
| Sync from Stash - `per_page: -1` | **CRITICAL** | ✅ FIXED | Paginated fetching (PAGE_SIZE=1000) |
| Sync from Stash - N+1 upserts | **CRITICAL** | ✅ FIXED | Bulk upserts (BATCH_SIZE=500) |
| StashCacheManager refresh | ~~HIGH~~ **N/A** | ✅ DELETED | Dead code removed (~600 lines) |
| INCLUDE mode restrictions | **HIGH** | ✅ FIXED | Database queries replace cache |
| SearchableSelect (client) | **MEDIUM** | ✅ FIXED | Search-only mode (per_page=50) |
| Performance logging gaps | **LOW** | ✅ FIXED | Added to 5 entity endpoints |
| StashSyncService cleanup | **MEDIUM** | ⏳ DEFERRED | Future PR |
| findXxxMinimal endpoints | **LOW** | ⏳ DEFERRED | Future PR |
| Tags endpoint - heavy computation | **MEDIUM** | ⏳ DEFERRED | Future PR |
| Similar/Recommended scenes | **MEDIUM** | ⏳ DEFERRED | Future PR |
| Entity query builders | **MEDIUM** | ⏳ DEFERRED | Future PR |

---

## Phase 1: Critical Fixes (COMPLETED)

### ✅ Issue #1: "Sync from Stash" Feature - FIXED

**File**: [server/controllers/user.ts](../../server/controllers/user.ts)

**Problem (was)**: Fetched ALL entities with `per_page: -1`, then did N+1 individual upserts.

**Fix Applied**:
1. **Paginated fetching** - Added `fetchPaginated<T>()` helper with PAGE_SIZE=1000
2. **Bulk upserts** - Replaced individual upserts with batched `prisma.$transaction()` (BATCH_SIZE=500)

**Performance Impact**:
- Before: OOM crash on 500k scenes, ~2M individual DB operations
- After: Paginated memory usage, ~1k batched transactions

**Commits**: `2334506`, `1f3296c`

---

### ✅ Issue #2: StashCacheManager - DELETED

**File**: ~~server/services/StashCacheManager.ts~~ (deleted)

**Problem (was)**: Dead code - `initialize()` was never called, all Maps empty.

**Fix Applied**: Deleted entire file (~600 lines) and removed all references.

**Commit**: `4d14918`

---

### ✅ Issue #3: INCLUDE Mode Restrictions - FIXED

**File**: [server/services/ExclusionComputationService.ts](../../server/services/ExclusionComputationService.ts)

**Problem (was)**: `getAllEntityIds()` called never-initialized StashCacheManager, returning empty arrays. INCLUDE mode restrictions were silently non-functional.

**Fix Applied**:
1. Changed `getAllEntityIds()` from sync to async
2. Now queries database directly via Prisma
3. Added `TransactionClient` parameter for transaction safety
4. Added integration test to prevent regression

**Test Added**: `server/integration/api/content-restrictions-include-mode.integration.test.ts`

**Commit**: `86b56f4`

---

### ✅ Issue #4: SearchableSelect Client Loading - FIXED

**File**: [client/src/components/ui/SearchableSelect.jsx](../../client/src/components/ui/SearchableSelect.jsx)

**Problem (was)**: Fetched ALL entities with `per_page: -1` when opening dropdown.

**Fix Applied**:
1. Changed to `per_page: 50` always
2. Search query added only when user types
3. Updated placeholder to "Type to search..."

**Commit**: `855a273`

---

### ✅ Issue #5: Missing Performance Logging - FIXED

**Files**: 5 entity endpoint controllers

**Problem (was)**: No timing instrumentation on `findPerformers`, `findStudios`, `findTags`, `findGalleries`, `findGroups`.

**Fix Applied**: Added `startTime` capture and `logger.info()` completion logs with:
- totalTime (ms)
- totalCount
- returnedCount
- page, perPage

**Commit**: `c9b74eb`

---

## Phase 2: Future Optimizations (DEFERRED)

### ⏳ Issue #6: Tags Endpoint - Heavy Computation

**File**: [server/controllers/library/tags.ts:128-288](../../server/controllers/library/tags.ts#L128)

**Problem**: `enhanceTagsWithPerformerScenes()` loads ALL scenes + ALL performers to compute counts on EVERY tag list request.

**Recommended Fix**:
1. Pre-compute `scene_count_via_performers` during sync
2. Store in database column
3. Update on sync, not on read

**Effort**: Medium - requires schema change

---

### ⏳ Issue #7: Similar/Recommended Scenes - Full Table Scan

**Files**:
- [scenes.ts:1274-1408](../../server/controllers/library/scenes.ts#L1274) (Similar)
- [scenes.ts:1418-1619](../../server/controllers/library/scenes.ts#L1418) (Recommended)

**Problem**: Scores ALL scenes in memory using `getScenesForScoring()`.

**Recommended Fix**:
1. SQL-based candidate pre-filtering (scenes sharing performer/tag/studio)
2. Inverted indexes for O(1) candidate lookup
3. Move scoring to SQL aggregation

**Effort**: High - complex optimization

---

### ⏳ Issue #8: Entity Query Builders

**Files**: performers.ts, studios.ts, tags.ts, galleries.ts, groups.ts

**Problem**: All use "load all then filter in memory" pattern.

**Recommended Fix**: Create SQL-based query builders like `SceneQueryBuilder`:
- `PerformerQueryBuilder`
- `StudioQueryBuilder`
- `TagQueryBuilder`
- `GalleryQueryBuilder`
- `GroupQueryBuilder`

**Effort**: High - large refactor

---

### ⏳ Issue #9: StashSyncService Cleanup

**File**: [server/services/StashSyncService.ts:1071-1150](../../server/services/StashSyncService.ts#L1071)

**Problem**: `cleanupDeletedEntities` fetches ALL IDs from Stash with `per_page: -1`.

**Recommended Fix**:
1. Paginated ID fetching
2. Chunked comparison
3. Cursor-based deletion

**Effort**: Medium

---

### ⏳ Issue #10: Entity Exclusion Helper - Uncached

**File**: [server/services/EntityExclusionHelper.ts](../../server/services/EntityExclusionHelper.ts)

**Problem**: Queries database on EVERY call, no caching of exclusion sets.

**Recommended Fix**: Cache exclusion sets per user/type with short TTL (30-60s).

**Effort**: Low

---

## Deviations from Original Plan

### Plan vs Implementation

| Planned | Actual | Reason |
|---------|--------|--------|
| `fetchPaginated` termination: `results.length >= totalCount` | `fetchedCount >= totalCount` | Code review caught bug: filtered results count differs from total |
| BATCH_SIZE declared once | BATCH_SIZE declared 6x initially | Code review feedback led to consolidation |
| No type annotations on filter functions | Added `: boolean` return types | TypeScript compilation errors |
| `console.log` for sync progress | Changed to `logger.info` | Code review consistency feedback |

### Unexpected Discoveries

1. **StashCacheManager was completely dead code** - Investigation revealed `initialize()` was never called anywhere, not just for the scheduler paths we initially examined.

2. **INCLUDE mode was functionally broken** - Not just a performance issue but a complete functional bug. Users with INCLUDE restrictions were seeing all content instead of filtered content.

3. **Test mocks hid the bug** - Unit tests mocked StashCacheManager to return empty arrays, which matched the real broken behavior, so tests passed despite the feature being broken.

---

## Verification Performed

### Automated Tests
- ✅ Unit tests: 492 passed
- ✅ Integration tests: All passed (including new INCLUDE mode test)
- ✅ TypeScript compilation: No errors
- ✅ Linting: No new issues

### Manual Verification Needed
- [ ] Sync from Stash with 20k+ scenes
- [ ] INCLUDE mode restriction filters correctly
- [ ] SearchableSelect dropdowns don't freeze
- [ ] Check Docker logs for new performance timing

---

## Appendix: Memory Estimates at 500k Scale

| Entity Type | Count | Per-entity Size | Total Memory |
|-------------|-------|-----------------|--------------|
| Scenes | 500,000 | ~3KB | 1.5GB |
| Performers | ~50,000 | ~1KB | 50MB |
| Studios | ~5,000 | ~500B | 2.5MB |
| Tags | ~10,000 | ~300B | 3MB |
| Galleries | ~100,000 | ~1KB | 100MB |
| Groups | ~5,000 | ~500B | 2.5MB |
| **Total** | | | **~1.7GB** |

Node.js heap default: ~1.4GB
Node.js string limit: ~512MB

Both limits will be exceeded by loading all scenes at once - hence the paginated approach.

---

## Part 2: Library Endpoint Performance Deep Dive

(Preserved from original audit - see Phase 2 issues above for fix plans)

### Performance Logging Coverage

**Now Instrumented** (Phase 1 fix):
- `findPerformers` ✅
- `findStudios` ✅
- `findTags` ✅
- `findGalleries` ✅
- `findGroups` ✅

**Still Missing** (Phase 2):
- `findSimilarScenes`
- `getRecommendedScenes`
- `findXxxMinimal` endpoints

---

## SQLite/Prisma Constraints

When implementing Phase 2 fixes, consider:

### What Works Well
1. Raw SQL with `$queryRawUnsafe`
2. `GROUP_CONCAT` for aggregation
3. Chunked operations (already in use)
4. Bulk raw SQL updates

### What Doesn't Work
1. Prisma `createMany` with upsert - not supported
2. Large `IN` clauses - SQLite ~999 param limit
3. Parameterized bulk updates - too slow

### Patterns to Use
1. Temp tables via raw SQL
2. CASE statements for conditional updates
3. Chunked transactions
4. Raw SQL aggregation

---

## Existing Optimizations to Preserve

| Commit | Optimization | Status |
|--------|--------------|--------|
| b595870 | EntityImageCountService SQL aggregation | Preserved |
| b595870 | mergeScenesWithUserData small-set optimization | Preserved |
| 322f6e3 | Chunked NOT IN clauses | Preserved |
| 134114e / 1061abc | Raw SQL CASE for bulk tag inheritance | Preserved |
| eb4b1f4 / cab5dc8 | Two-phase query for similar/recommended | Preserved |
| 4f5c347 | getScenesForScoring lightweight query | Preserved |
