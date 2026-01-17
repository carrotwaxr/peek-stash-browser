# Scalability Phase 2 Implementation Plan

> **For Claude:** Discuss each task with user before implementation. Update audit doc after each completion.

**Goal:** Continue scalability improvements from Phase 1, focusing on remaining performance bottlenecks

**Branch:** `feature/scalability-phase-2`

---

## Task Order

| # | Task | Effort | Value | Status |
|---|------|--------|-------|--------|
| 1 | Entity Exclusion Helper - Request-scoped caching | Low | Low | Pending |
| 2 | StashSyncService Cleanup - Paginated fetching | Low | Medium | Pending |
| 3 | Tags Endpoint - Pre-compute counts during sync | Medium | High | Pending |
| 4 | Similar/Recommended Scenes - SQL candidate filtering | Medium | High | Pending |
| 5 | Performance Logging - All affected operations | Medium | High | Pending |
| 6 | Entity Query Builders | High | High | **DEFERRED to Phase 3** |

---

## Task 1: Entity Exclusion Helper - Request-Scoped Caching

**File:** `server/services/EntityExclusionHelper.ts`

**Problem:** `filterExcluded()` queries database on EVERY call, multiple times per request.

**Solution:** Request-scoped cache - compute exclusion sets once per request, pass through context.

**Approach:**
1. Add optional `excludedIds?: Set<string>` parameter to `filterExcluded()`
2. Create helper to fetch all exclusion types at request start
3. Pass pre-fetched sets to avoid redundant queries

**Memory Impact:** Zero persistent memory - lives only for request duration.

**Tests:** Unit test for caching behavior.

---

## Task 2: StashSyncService Cleanup - Paginated Fetching

**File:** `server/services/StashSyncService.ts:1071-1150`

**Problem:** `cleanupDeletedEntities` fetches ALL IDs with `per_page: -1`.

**Solution:** Paginated fetching (same pattern as Phase 1).

```typescript
const PAGE_SIZE = 5000; // IDs are small
let allStashIds: string[] = [];
let page = 1;
while (true) {
  const result = await stash.findSceneIDs({ filter: { per_page: PAGE_SIZE, page } });
  allStashIds.push(...result.findScenes.scenes.map(s => s.id));
  if (allStashIds.length >= result.findScenes.count) break;
  page++;
}
```

**Memory Impact:** ~10MB for 500k IDs (strings only) - acceptable.

**Tests:** Integration test for cleanup with pagination.

---

## Task 3: Tags Endpoint - Pre-compute Counts During Sync

**Files:**
- `prisma/schema.prisma` - Add column
- `server/services/StashSyncService.ts` - Compute during sync
- `server/controllers/library/tags.ts` - Use pre-computed value

**Problem:** `enhanceTagsWithPerformerScenes()` loads ALL scenes + ALL performers on EVERY tag list request.

**Solution:** Pre-compute `sceneCountViaPerformers` during sync, store in database.

**Schema Change:**
```prisma
model StashTag {
  // ... existing fields
  sceneCountViaPerformers Int @default(0)
}
```

**Sync Computation (SQL):**
```sql
UPDATE StashTag SET sceneCountViaPerformers = (
  SELECT COUNT(DISTINCT st.sceneId)
  FROM SceneTag st
  JOIN StashScene s ON s.id = st.sceneId AND s.deletedAt IS NULL
  JOIN ScenePerformer sp ON sp.sceneId = s.id
  JOIN PerformerTag pt ON pt.performerId = sp.performerId
  WHERE pt.tagId = StashTag.id
)
```

**Memory Impact:** Zero at read time - value stored in DB.

**Tests:**
- Unit test for sync computation
- Integration test for tag endpoint using pre-computed value

---

## Task 4: Similar/Recommended Scenes - SQL Candidate Filtering

**Files:**
- `server/controllers/library/scenes.ts:1274-1408` (Similar)
- `server/controllers/library/scenes.ts:1418-1619` (Recommended)
- `client/src/pages/SceneDetail.jsx` (or similar) - Frontend pagination

**Problem:** Scores ALL scenes in memory using `getScenesForScoring()`.

**Solution:** SQL-based candidate pre-filtering + proper pagination.

### Backend Changes

**Candidate Selection Query:**
```sql
-- Get candidate scene IDs (scenes sharing performers, tags, or studio)
WITH candidates AS (
  -- Scenes sharing performers (highest weight)
  SELECT DISTINCT sp2.sceneId, 3 as weight
  FROM ScenePerformer sp1
  JOIN ScenePerformer sp2 ON sp2.performerId = sp1.performerId
  WHERE sp1.sceneId = :currentSceneId AND sp2.sceneId != :currentSceneId

  UNION ALL

  -- Scenes sharing tags
  SELECT DISTINCT st2.sceneId, 1 as weight
  FROM SceneTag st1
  JOIN SceneTag st2 ON st2.tagId = st1.tagId
  WHERE st1.sceneId = :currentSceneId AND st2.sceneId != :currentSceneId

  UNION ALL

  -- Scenes from same studio
  SELECT DISTINCT s2.id, 2 as weight
  FROM StashScene s1
  JOIN StashScene s2 ON s2.studioId = s1.studioId
  WHERE s1.id = :currentSceneId AND s2.id != :currentSceneId AND s1.studioId IS NOT NULL
)
SELECT sceneId, SUM(weight) as totalWeight
FROM candidates
GROUP BY sceneId
ORDER BY totalWeight DESC
LIMIT 500
```

**Key Design Decisions:**
1. **Smart sorting:** Candidates ordered by weighted overlap (performers > studio > tags)
2. **Maximum 500 results:** Both similar and recommended capped at 500
3. **Full pagination:** Standard page/perPage parameters, not "Load More"
4. **Apply exclusions:** Filter out excluded scenes from candidates

### Frontend Changes

**Current:** Uses "Load More" button pattern for similar scenes.

**Target:** Standard pagination using existing components:
- Reuse `Pagination` component from other list views
- Match pattern used by scene browse, performer browse, etc.
- Remove infinite scroll / load more pattern

**Files to update:**
- Scene detail page similar scenes section
- Any component using the old load-more pattern for similar/recommended

### API Changes

**Before:**
```typescript
GET /api/library/scenes/:id/similar?limit=20&offset=0
```

**After:**
```typescript
GET /api/library/scenes/:id/similar?page=1&per_page=20
// Returns: { scenes: [...], total: number, page: number, per_page: number }
```

**Memory Impact:** Only load ~500 candidate scenes instead of 500k.

**Tests:**
- Unit test for candidate selection query
- Unit test for scoring within candidates
- Integration test for pagination
- Frontend component tests for pagination UI

---

## Task 5: Performance Logging - All Affected Operations

**Goal:** Add comprehensive performance logging to enable scalability monitoring.

**Operations to Instrument:**

| Operation | File | Metrics to Log |
|-----------|------|----------------|
| Exclusion computation | `ExclusionComputationService.ts` | totalTime, userId, exclusionCount |
| Full sync | `StashSyncService.ts` | totalTime, entityCounts, pagesProcessed |
| Incremental sync | `StashSyncService.ts` | totalTime, changedEntities |
| Sync from Stash | `user.ts` | totalTime, entityCounts, batchesProcessed |
| Cleanup deleted entities | `StashSyncService.ts` | totalTime, deletedCounts |
| Similar scenes | `scenes.ts` | totalTime, candidateCount, resultCount |
| Recommended scenes | `scenes.ts` | totalTime, candidateCount, resultCount |
| Tag list (after fix) | `tags.ts` | totalTime, tagCount |

**Log Format:**
```typescript
logger.info("operationName completed", {
  totalTime: `${Date.now() - startTime}ms`,
  // operation-specific metrics
});
```

**Deliverable:** Checklist for manual testing + log parsing guide.

### Manual Testing Checklist

After implementation, perform these actions and capture Docker logs:

1. **Trigger full sync:** Settings > Sync > Force Full Sync
2. **Trigger incremental sync:** Wait for scheduled sync or trigger manually
3. **Run "Sync from Stash":** User Management > Sync from Stash
4. **Browse tags:** Navigate to Tags page, apply filters
5. **View similar scenes:** Open a scene, scroll to Similar Scenes
6. **View recommended scenes:** Go to Recommended page
7. **Change user restrictions:** Add/remove content restrictions

### Log Analysis

After testing, search Docker logs for:
```bash
docker logs peek-server 2>&1 | grep -E "(completed|totalTime)"
```

Expected output format:
```
[INFO] syncFromStash completed {"totalTime":"45000ms","scenes":{"checked":20000,"created":500}}
[INFO] findSimilarScenes completed {"totalTime":"150ms","candidateCount":1200,"resultCount":20}
[INFO] recomputeForUser completed {"totalTime":"800ms","userId":1,"exclusionCount":500}
```

---

## Phase 3: Deferred Items

### Entity Query Builders (High Value, High Effort)

**Problem:** Performers, studios, tags, galleries, groups all use "load all then filter" pattern.

**Solution:** SQL query builders like `SceneQueryBuilder`.

**Why Deferred:**
- Large refactor (5 entity types)
- Current performance acceptable for <100k entities
- Phase 2 items have higher impact-to-effort ratio

**Branch:** `feature/scalability-phase-3`

---

## Verification Checklist

Before merging Phase 2:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] TypeScript compiles
- [ ] Linting passes
- [ ] Schema migration tested
- [ ] Manual testing with performance log analysis
- [ ] Frontend pagination works correctly
- [ ] Audit doc updated with completion status
