# Scalability Audit: 500TB / 500k+ Scene Libraries

**Date**: 2026-01-06
**Triggered by**: Discord user report - "Sync from Stash" feature crashed system with 500k scenes
**Version**: 3.1.1

---

## Executive Summary

Despite significant scalability improvements in 3.x, **several critical paths remain that do not scale** to 500k+ scene libraries. The most severe offender is the **"Sync from Stash" feature** in Server Settings > User Management, which attempts to load all entities into memory in a single unbounded GraphQL query.

### Severity Ratings

| Issue | Severity | Estimated Impact at 500k scenes |
|-------|----------|--------------------------------|
| Sync from Stash (user.ts) | **CRITICAL** | System crash, OOM |
| StashCacheManager refresh | ~~HIGH~~ **N/A** | Dead code - never initialized |
| INCLUDE mode restrictions | **HIGH** | Functional bug - restrictions don't work |
| SearchableSelect (client) | **MEDIUM** | UI freeze when loading all entities |
| StashSyncService cleanup | **MEDIUM** | Large memory spike during cleanup |
| findXxxMinimal endpoints | **LOW** | Memory pressure but usually survivable |

---

## Critical Issue #1: "Sync from Stash" Feature

**File**: [server/controllers/user.ts](../../server/controllers/user.ts#L987-L1419)

### Problem

The `syncFromStash` function fetches ALL entities with `per_page: -1` for multiple entity types:

```typescript
// Line 1002-1007 - ALL SCENES
const scenesData = await stash.findScenes({
  filter: { per_page: -1 },
  scene_filter: ...
});

// Line 1133-1138 - ALL PERFORMERS
const performersData = await stash.findPerformers({
  filter: { per_page: -1 },
  ...
});

// Line 1226-1231 - ALL STUDIOS
const studiosData = await stash.findStudios({
  filter: { per_page: -1 },
  ...
});

// Line 1303-1307 - ALL TAGS
const tagsData = await stash.findTags({
  filter: { per_page: -1 },
  ...
});

// Line 1339-1344 - ALL GALLERIES
const galleriesData = await stash.findGalleries({
  filter: { per_page: -1 },
  ...
});

// Line 1383-1388 - ALL GROUPS
const groupsData = await stash.findGroups({
  filter: { per_page: -1 },
  ...
});
```

### Impact at Scale

With 500k scenes:
- **GraphQL response size**: ~1.5GB JSON (500k * ~3KB per scene)
- **Node.js string limit**: ~512MB - **WILL CRASH** with `ERR_STRING_TOO_LONG`
- **Memory pressure**: Even if JSON fits, parsing 1.5GB requires 3-4GB heap

### Additionally: N+1 Query Pattern

After fetching, the code iterates and does **individual upserts per entity**:

```typescript
for (const scene of filteredScenes) {
  // Line 1042-1046: Individual DB lookup per scene
  const existingRating = await prisma.sceneRating.findUnique({...});
  // Line 1048-1059: Individual upsert per scene
  await prisma.sceneRating.upsert({...});
  // Line 1077-1081: ANOTHER individual DB lookup per scene
  const existingWatchHistory = await prisma.watchHistory.findUnique({...});
  // Line 1083-1097: ANOTHER individual upsert per scene
  await prisma.watchHistory.upsert({...});
}
```

For 500k scenes with both rating and oCounter enabled, this results in:
- 500k `findUnique` calls for ratings
- 500k `upsert` calls for ratings
- 500k `findUnique` calls for watch history
- 500k `upsert` calls for watch history
- **Total: 2 million database operations**, executed sequentially

### Recommended Fix

1. **Paginated fetching**: Fetch entities in batches of 5000
2. **Bulk upserts**: Use `prisma.$transaction` with batched operations
3. **Progress tracking**: Add progress events for UI feedback
4. **Cancellation support**: Allow aborting long-running syncs

---

## Issue #2: StashCacheManager - DEAD CODE with Hidden Bug

**File**: [server/services/StashCacheManager.ts](../../server/services/StashCacheManager.ts#L140-L290)

### Investigation Findings (2026-01-06)

**StashCacheManager is NEVER initialized.** The `initialize()` method is never called:

```typescript
// server/index.ts - Only initializes StashInstanceManager
await stashInstanceManager.initialize();
// stashCacheManager.initialize() is NOT called

// The Maps are always empty:
cache.scenes = new Map()      // Always empty
cache.performers = new Map()  // Always empty
cache.tags = new Map()        // Always empty
// etc.
```

### Current Usage

Only one consumer: [ExclusionComputationService.ts:796-809](../../server/services/ExclusionComputationService.ts#L796)

```typescript
private getAllEntityIds(entityType: string): string[] {
  switch (entityType) {
    case "tags":
      return stashCacheManager.getAllTags().map((t) => t.id);  // Returns []
    case "studios":
      return stashCacheManager.getAllStudios().map((s) => s.id);  // Returns []
    case "groups":
      return stashCacheManager.getAllGroups().map((g) => g.id);  // Returns []
    case "galleries":
      return stashCacheManager.getAllGalleries().map((g) => g.id);  // Returns []
    // ...
  }
}
```

### HIDDEN BUG: INCLUDE Mode Restrictions Are Broken

Because `getAllEntityIds()` always returns `[]`, the INCLUDE mode logic at line 223-237 never excludes anything:

```typescript
} else if (restriction.mode === "INCLUDE") {
  // INCLUDE mode: exclude everything NOT in the list
  const allEntityIds = this.getAllEntityIds(restriction.entityType);  // Returns []!
  const includeSet = new Set(entityIds);

  for (const entityId of allEntityIds) {  // Loop never runs!
    if (!includeSet.has(entityId)) {
      exclusions.push({...});  // Never reached
    }
  }
}
```

**Impact**: Any user with INCLUDE mode restrictions on tags/studios/groups/galleries has **non-functional restrictions**. They see everything instead of only their allowed list.

### Recommended Action

1. **Delete StashCacheManager entirely** - It's dead code
2. **Fix ExclusionComputationService.getAllEntityIds()** - Query database instead:
   ```typescript
   private async getAllEntityIds(entityType: string): Promise<string[]> {
     switch (entityType) {
       case "tags":
         const tags = await prisma.stashTag.findMany({
           where: { deletedAt: null },
           select: { id: true }
         });
         return tags.map(t => t.id);
       // etc.
     }
   }
   ```
3. **Add integration test** for INCLUDE mode restrictions

### Severity Reassessment

- **StashCacheManager per_page: -1**: ~~HIGH~~ → **N/A** (code is never executed)
- **INCLUDE mode bug**: **HIGH** (functional bug, not just performance)

### Test Gap Analysis

**Unit test problem**: [ExclusionComputationService.test.ts:79-85](../../server/services/__tests__/ExclusionComputationService.test.ts#L79)
```typescript
// Mock StashCacheManager for INCLUDE mode inversion
vi.mock("../StashCacheManager.js", () => ({
  stashCacheManager: {
    getAllTags: vi.fn(() => []),      // Mocks return empty arrays!
    getAllStudios: vi.fn(() => []),   // This mirrors the real broken behavior
    getAllGroups: vi.fn(() => []),    // So tests pass but feature is broken
    getAllGalleries: vi.fn(() => []),
  },
}));
```

**Integration test problem**: [content-restrictions.integration.test.ts](../../server/integration/api/content-restrictions.integration.test.ts)
- Tests only verify CRUD operations (save/load/validate restrictions)
- **No test verifies that INCLUDE mode actually filters entities**
- A user with `mode: "INCLUDE", entityIds: ["tag-1"]` should ONLY see tag-1, but no test asserts this

### Dead Code Summary

**StashCacheManager.ts** (~600 lines) can be safely deleted:
- `initialize()` is never called
- `refreshCache()` is never called
- `refreshInterval` timer is never started
- Only usage is `getAllXxx()` methods returning empty arrays

**Related cleanup**:
- Remove import from ExclusionComputationService
- Remove mock from ExclusionComputationService.test.ts

---

## Medium Issue #3: Client SearchableSelect

**File**: [client/src/components/ui/SearchableSelect.jsx](../../client/src/components/ui/SearchableSelect.jsx#L176)

### Problem

When no search term is provided, fetches ALL entities:

```javascript
// Line 176
const filter = search
  ? { per_page: 50 }  // Limited for search - GOOD
  : { per_page: -1, sort: "name", direction: "ASC" }; // ALL results - BAD
```

### Impact

- Opening a dropdown with 500k performers would freeze the UI
- Browser may OOM trying to render 500k options
- Network transfer of massive payload

### Affected Components

Used by filter dropdowns for:
- Performers
- Studios
- Tags
- Groups
- Galleries

---

## Medium Issue #4: StashSyncService Cleanup

**File**: [server/services/StashSyncService.ts](../../server/services/StashSyncService.ts#L1071-L1150)

### Problem

The `cleanupDeletedEntities` function fetches ALL IDs from Stash:

```typescript
// Line 1084 - ALL SCENE IDs
const result = await stash.findSceneIDs({ filter: { per_page: -1, page: 1 } });
stashIds = result.findScenes.scenes.map((s) => s.id);

// Similar for performers, studios, tags, groups, galleries, images
```

### Impact

- 500k IDs as strings = ~5MB (manageable)
- But `findSceneIDs` still fetches full scene objects, not just IDs - need to verify
- The `.map()` creates another 500k element array in memory
- Prisma `notIn` clause with 500k IDs may cause issues (SQLite has limits)

### Recommended Fix

1. Verify `findSceneIDs` returns minimal data (just IDs)
2. Process cleanup in chunks
3. Consider cursor-based comparison instead of `notIn`

---

## Low Issue #5: findXxxMinimal Endpoints

**Files**:
- [server/controllers/library/performers.ts](../../server/controllers/library/performers.ts#L900)
- [server/controllers/library/studios.ts](../../server/controllers/library/studios.ts#L483)
- [server/controllers/library/tags.ts](../../server/controllers/library/tags.ts#L659)
- [server/controllers/library/groups.ts](../../server/controllers/library/groups.ts#L361)
- [server/controllers/library/galleries.ts](../../server/controllers/library/galleries.ts#L509)

### Problem

These "minimal" endpoints load ALL entities from database, then filter/sort in memory:

```typescript
// Example from groups.ts:361
let groups = await stashEntityService.getAllGroups();
// ... then filter, sort, map in memory
```

### Impact

- With SQLite backing, this reads all rows from disk
- For performers/studios/tags (typically <100k each), usually OK
- For galleries (could be millions), may cause issues

---

## Architecture Note: What's Already Fixed

The 3.x SQLite migration addressed the core browse/pagination paths:

1. **Scene browsing**: Uses `SceneQueryBuilder` with SQL pagination
2. **Entity sync**: Uses paginated fetches in `StashSyncService.syncScenes()`
3. **Exclusion computation**: Works on cached IDs, not full objects

---

## Recommended Prioritization

### Immediate (blocks 500k users)

1. **Fix "Sync from Stash"** - Paginate fetches, batch upserts
2. **Remove or deprecate StashCacheManager** - Ensure no code paths hit it

### Short-term

3. **Fix SearchableSelect** - Add virtual scrolling or async search-only mode
4. **Audit findXxxMinimal** - Add pagination support

### Medium-term

5. **Refactor cleanup** - Chunked comparison instead of full ID lists
6. **Add memory monitoring** - Warn admins before OOM

---

## Testing Recommendations

To verify fixes work at scale:

1. **Synthetic data**: Script to generate 500k scene records in SQLite
2. **Memory profiling**: Monitor heap usage during sync operations
3. **Timeout testing**: Ensure long operations don't timeout
4. **Cancellation testing**: Verify abort signals work mid-operation

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

Both limits will be exceeded by loading all scenes at once.

---

## Part 2: Library Endpoint Performance Deep Dive

### Performance Logging Coverage

**Well-Instrumented Endpoints:**
- `findScenes` - Detailed timing for exclusions, DB pagination, merge, filters, sort
- `executeCarouselQuery` - Timing for each pipeline stage
- `getAllScenes` / `getScenesForScoring` - Query/transform/hydrate timing

**Missing Performance Logging:**
- `findPerformers` - No timing instrumentation
- `findStudios` - No timing instrumentation
- `findTags` - No timing instrumentation
- `findGalleries` - No timing instrumentation
- `findGroups` - No timing instrumentation
- `findSimilarScenes` - No timing instrumentation
- `getRecommendedScenes` - No timing instrumentation
- `findXxxMinimal` endpoints - No timing instrumentation

---

## Issue #6: Tags Endpoint - Heavy Computation

**File**: [server/controllers/library/tags.ts:128-288](../../server/controllers/library/tags.ts#L128)

### Problem

The `findTags` endpoint performs expensive operations on every request:

```typescript
// Line 170 - Calls enhanceTagsWithPerformerScenes which:
//   1. Loads ALL scenes via stashEntityService.getAllScenes()
//   2. Loads ALL performers via stashEntityService.getAllPerformers()
//   3. Iterates ALL scenes to count performer tags
tags = await enhanceTagsWithPerformerScenes(tags);

// Line 173-178 - Runs an aggregate query for performer counts
const performerCountsQuery = await prisma.$queryRaw<...>`
  SELECT pt.tagId, COUNT(*) as count
  FROM PerformerTag pt
  JOIN StashPerformer p ON p.id = pt.performerId AND p.deletedAt IS NULL
  GROUP BY pt.tagId
`;
```

### Impact at Scale

- `enhanceTagsWithPerformerScenes` loads 500k scenes + 50k performers into memory on EVERY tag list request
- The nested loops iterate 500k * avg_performers_per_scene * avg_tags_per_performer times
- O(n*m*k) complexity where n=scenes, m=performers per scene, k=tags per performer

### Git History Context

No prior optimization attempts found for this specific pattern.

### Recommended Fix

1. Pre-compute `scene_count_via_performers` during sync, store in database
2. Or use SQL aggregation instead of in-memory computation
3. Cache the computation per-session or with TTL

---

## Issue #7: Similar Scenes - Full Table Scan

**File**: [server/controllers/library/scenes.ts:1274-1408](../../server/controllers/library/scenes.ts#L1274)

### Problem

```typescript
// Line 1292 - Loads lightweight but STILL ALL scenes
const allScoringData = await stashEntityService.getScenesForScoring();

// Then filters and scores ALL 500k scenes to find similar ones
for (const scene of scoringData) {
  let score = 0;
  // Score calculation for each scene...
}
```

### Impact at Scale

- `getScenesForScoring` is optimized (uses single SQL GROUP_CONCAT query)
- But still returns 500k rows that must be iterated
- The scoring loop runs 500k times per request

### Git History Context

```
eb4b1f4 refactor: findSimilarScenes uses two-phase query architecture
4f5c347 feat: add getScenesForScoring for lightweight scoring queries
```

Previous optimization: Split into lightweight scoring phase + full fetch for results.
This was a significant improvement, but still O(n) for scoring.

### Recommended Fix

1. **Candidate pre-filtering**: Query only scenes that share at least one performer/tag/studio with current scene
2. **Inverted index**: Maintain performer→scenes, tag→scenes mappings for O(1) candidate lookup
3. **SQL-based scoring**: Move scoring logic to database

---

## Issue #8: Recommended Scenes - Full Table Scan + Multiple Queries

**File**: [server/controllers/library/scenes.ts:1418-1619+](../../server/controllers/library/scenes.ts#L1418)

### Problem

```typescript
// Line 1432-1448 - 7 parallel queries, then full scene iteration
const [
  performerRatings,
  studioRatings,
  tagRatings,
  sceneRatings,
  watchHistory,
  allScoringData,  // <-- ALL 500k scenes
  excludedIds,
] = await Promise.all([...]);

// Line 1559 - Score ALL 500k scenes
for (const data of scoringData) {
  const baseScore = scoreScoringDataByPreferences(data, prefs);
  // ...
}
```

### Impact at Scale

- Same O(n) scoring issue as Similar Scenes
- Plus additional overhead from building preference sets

### Git History Context

```
cab5dc8 refactor: getRecommendedScenes uses two-phase query architecture
```

Same optimization pattern as Similar Scenes - lightweight first phase.

### Recommended Fix

Same as Similar Scenes - use inverted indexes or SQL-based candidate filtering.

---

## Issue #9: Performers/Studios/Galleries - Load All Then Filter Pattern

**Files**:
- [performers.ts:140-267](../../server/controllers/library/performers.ts#L140)
- [studios.ts:66-199](../../server/controllers/library/studios.ts#L66)
- [galleries.ts:257-396](../../server/controllers/library/galleries.ts#L257)

### Problem

All these endpoints follow the same anti-pattern:

```typescript
// Step 1: Get ALL entities from database
let performers = await stashEntityService.getAllPerformers();

// Step 2: Apply exclusions (filter in memory)
performers = await entityExclusionHelper.filterExcluded(...);

// Step 3: Merge with user data (N queries for small sets, full load for large)
performers = await mergePerformersWithUserData(performers, userId);

// Step 4: Apply search (filter in memory)
// Step 5: Apply filters (filter in memory)
// Step 6: Sort (sort in memory)
// Step 7: Paginate (slice in memory)
```

### Impact at Scale

- Loads entire entity table into memory before filtering
- Memory usage = count * entity_size for EVERY request
- 50k performers * 1KB = 50MB per request
- 100k galleries * 1KB = 100MB per request

### Git History Context

No query builder exists for performers/studios/tags/galleries/groups like `SceneQueryBuilder` and `ImageQueryBuilder`.

### Recommended Fix

Create SQL-based query builders for other entity types:
- `PerformerQueryBuilder`
- `StudioQueryBuilder`
- `TagQueryBuilder`
- `GalleryQueryBuilder`
- `GroupQueryBuilder`

These should push filtering, sorting, and pagination to the database.

---

## Issue #10: Entity Exclusion Helper - Uncached Queries

**File**: [server/services/EntityExclusionHelper.ts:20-45](../../server/services/EntityExclusionHelper.ts#L20)

### Problem

```typescript
async filterExcluded<T>(...) {
  // Queries database on EVERY call
  const excludedRecords = await prisma.userExcludedEntity.findMany({
    where: { userId, entityType },
    select: { entityId: true },
  });
  // ...
}
```

### Impact

- Called multiple times per request (once per entity type loaded)
- No caching of exclusion sets
- For users with many exclusions, returns large result sets repeatedly

### Recommended Fix

1. Cache exclusion sets per user/type with short TTL (30s-60s)
2. Or compute once at request start and pass through

---

## Issue #11: Merge User Data - Partial Optimization

**File**: [server/controllers/library/scenes.ts:73-190](../../server/controllers/library/scenes.ts#L73)

### Current State

```typescript
// Already optimized for scenes:
const useTargetedQuery = sceneIds.length < 100;
// Uses IN clause for small sets, full load for large sets
```

### Problem in Other Entities

Performer/Studio/Tag merge functions don't have this optimization:

```typescript
// tags.ts - Always loads ALL user ratings
const [ratings, tagStats] = await Promise.all([
  prisma.tagRating.findMany({ where: { userId } }),  // ALL ratings
  userStatsService.getTagStats(userId),
]);
```

### Recommended Fix

Apply the same small-set optimization pattern to other merge functions.

---

## SQLite/Prisma Constraints

When implementing fixes, consider these constraints:

### What Works Well

1. **Raw SQL with `$queryRawUnsafe`**: Full SQL flexibility (used by QueryBuilders)
2. **`GROUP_CONCAT` for aggregation**: Used successfully in `getScenesForScoring`
3. **Chunked operations**: Already implemented for large exclusion sets (commit 322f6e3)
4. **Bulk raw SQL updates**: Used for SceneTagInheritance (commit 134114e, reverted complexity in 1061abc)

### What Doesn't Work

1. **Prisma `createMany` with upsert**: Not supported, must use transactions
2. **Large `IN` clauses**: SQLite has variable limits (~999 params), must chunk
3. **Parameterized bulk updates**: Too slow (commit 1061abc notes 1 min/batch vs instant)

### Patterns to Use

1. **Temp tables**: Not native to Prisma, but possible with raw SQL
2. **CASE statements**: For bulk conditional updates (proven in SceneTagInheritance)
3. **Chunked transactions**: For bulk inserts/updates
4. **Raw SQL aggregation**: For counts and scoring

---

## Existing Optimizations to Preserve

From git history, these optimizations should not be regressed:

| Commit | Optimization | Must Preserve |
|--------|--------------|---------------|
| b595870 | EntityImageCountService uses SQL aggregation | Yes |
| b595870 | mergeScenesWithUserData small-set optimization | Yes |
| 322f6e3 | Chunked NOT IN clauses for large exclusion sets | Yes |
| 134114e / 1061abc | Raw SQL CASE for bulk tag inheritance | Yes |
| eb4b1f4 / cab5dc8 | Two-phase query for similar/recommended | Yes |
| 4f5c347 | getScenesForScoring lightweight query | Yes |

---

## Summary: Browsing Slowness Root Causes

For a 20k scene / 7k performer / 50k image library, likely slow paths:

1. **Tag listing**: Loads all scenes + performers to compute performer tag counts
2. **Similar/Recommended scenes**: Scores ALL scenes on every request
3. **Performer/Studio/Gallery listing**: Loads all entities before filtering
4. **Entity exclusions**: Uncached, queried multiple times per request
5. **SearchableSelect dropdowns**: Loads all entities for initial population

---

## Next Steps

To investigate with live logs:

1. Add timing instrumentation to unmarked endpoints
2. Run app and browse various pages
3. Check Docker logs for slow operations
4. Profile specific slow paths with detailed breakdowns
