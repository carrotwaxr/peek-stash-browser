# Scalability Audit: 500TB / 500k+ Scene Libraries

**Date**: 2026-01-06
**Triggered by**: Discord user report - "Sync from Stash" feature crashed system with 500k scenes
**Version**: 3.1.1
**Updated**: 2026-01-07 (Phase 2 fixes implemented)

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
| Performance logging gaps | **LOW** | ✅ FIXED | Added to all entity endpoints |
| StashSyncService cleanup | **MEDIUM** | ✅ FIXED | PR #260 - Paginated ID fetching |
| Tags endpoint - heavy computation | **MEDIUM** | ✅ FIXED | PR #260 - Pre-computed during sync |
| Similar/Recommended scenes | **MEDIUM** | ✅ FIXED | PR #260 - SQL candidate filtering |
| Entity Exclusion Helper | **LOW** | ⏳ DEFERRED | Already fast, low impact |
| findXxxMinimal endpoints | **LOW** | ⏳ DEFERRED | Future PR |
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

## Phase 2: Performance Optimizations (COMPLETED)

**PR**: #260
**Commits**: `ca01038`, `7ca05a1`, `3d796d6`, `77fa1d5`, `16a967f`, `bf9f0ac`

### ✅ Issue #6: Tags Endpoint - Heavy Computation - FIXED

**File**: [server/controllers/library/tags.ts](../../server/controllers/library/tags.ts)

**Problem (was)**: `enhanceTagsWithPerformerScenes()` loaded ALL scenes + ALL performers to compute counts on EVERY tag list request.

**Fix Applied**:
1. Added `sceneCountViaPerformers` column to `StashTag` schema
2. Created `computeTagSceneCountsViaPerformers()` in StashSyncService
3. SQL query computes counts during sync: `SELECT COUNT(DISTINCT sceneId) FROM PerformerTag JOIN ScenePerformer...`
4. `enhanceTagsWithPerformerScenes()` now uses pre-computed value (O(1) lookup)

**Commits**: `3d796d6`

---

### ✅ Issue #7: Similar/Recommended Scenes - Full Table Scan - FIXED

**Files**:
- [StashEntityService.ts](../../server/services/StashEntityService.ts) - `getSimilarSceneCandidates()`
- [scenes.ts](../../server/controllers/library/scenes.ts) - `findSimilarScenes`

**Problem (was)**: Scored ALL 500k scenes in memory using `getScenesForScoring()`.

**Fix Applied**:
1. Added `getSimilarSceneCandidates()` SQL method
2. Uses CTE with UNION ALL to find scenes sharing performers/tags/studio
3. Weights: performers=3, studio=2, tags=1 (per match)
4. Returns max 500 candidates sorted by weight DESC, date DESC
5. Updated `findSimilarScenes` to use SQL candidates instead of full table scan
6. Changed frontend from "Load More" to standard pagination

**Performance Impact**:
- Before: Load 500k scenes (~1.5GB), score all in memory
- After: SQL query returns max 500 candidates, fetch only paginated results

**Commits**: `16a967f`

---

### ✅ Issue #8: StashSyncService Cleanup - FIXED

**File**: [server/services/StashSyncService.ts](../../server/services/StashSyncService.ts)

**Problem (was)**: `cleanupDeletedEntities` fetched ALL IDs from Stash with `per_page: -1`.

**Fix Applied**:
1. Paginated ID fetching with `CLEANUP_PAGE_SIZE = 5000`
2. Added infinite loop guard: throws if response lacks `count` field
3. Accumulates IDs across pages, then compares with database

**Commits**: `ca01038`, `7ca05a1`

---

### ✅ Issue #9: Performance Logging - Extended

**Files**: Multiple controllers

**Fix Applied**: Added performance logging to remaining endpoints:
- `findSimilarScenes` - logs candidateCount, resultCount, totalTime
- `getRecommendedScenes` - logs candidateCount, resultCount, totalTime
- `syncFromStash` - logs entity counts and totalTime

**Commits**: `77fa1d5`

---

### ⏳ Issue #10: Entity Exclusion Helper - DEFERRED

**File**: [server/services/EntityExclusionHelper.ts](../../server/services/EntityExclusionHelper.ts)

**Problem**: Queries database on EVERY call, no caching.

**Decision**: Deferred - database queries are already fast (<5ms). The overhead of cache management (invalidation on hide/unhide) may not be worth the complexity for the minimal gain.

---

## Phase 3: Future Optimizations (DEFERRED)

### ⏳ Issue #11: Entity Query Builders

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

### ⏳ Issue #12: findXxxMinimal Endpoints

**Problem**: Minimal endpoints still load full entities.

**Recommended Fix**: Create truly minimal queries returning only id/name.

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
- ✅ Unit tests: 493 passed (Phase 2)
- ✅ Integration tests: 442 passed (Phase 2)
- ✅ TypeScript compilation: No errors
- ✅ Linting: 0 errors (221 pre-existing warnings)

### Manual Verification Needed
- [ ] Sync from Stash with 20k+ scenes
- [ ] INCLUDE mode restriction filters correctly
- [ ] SearchableSelect dropdowns don't freeze
- [ ] Check Docker logs for new performance timing
- [ ] Similar scenes endpoint with large library
- [ ] Tags endpoint response time with 500k scenes

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

**Now Instrumented** (Phase 1 + Phase 2):
- `findPerformers` ✅
- `findStudios` ✅
- `findTags` ✅
- `findGalleries` ✅
- `findGroups` ✅
- `findSimilarScenes` ✅ (Phase 2)
- `getRecommendedScenes` ✅ (Phase 2)
- `syncFromStash` ✅ (Phase 2)

**Still Missing**:
- `findXxxMinimal` endpoints (low priority)

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
