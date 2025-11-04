# Performance Optimization Implementation Plan

**Status**: 🟡 In Progress
**Created**: 2025-11-04
**Branch Pattern**: `perf/[item-name]`

---

## ✅ Completed

### Phase 0: Bug Fixes (DONE - Ready for Merge)
**Branch**: `bugfix/restriction-and-empty-filtering`

**What was fixed**:
- ✅ Fixed `filterPerformersForUser()` - Now returns unfiltered performers (no direct restrictions needed)
- ✅ Fixed `filterEmptyPerformers()` - Uses reverse indexes to check actual group/gallery membership
- ✅ Fixed `filterEmptyStudios()` - Properly checks visible galleries (not just gallery_count)
- ✅ Fixed cascading bug in all controllers - User restrictions applied BEFORE empty filtering
- ✅ Deleted obsolete `EMPTY_ENTITY_FILTERING.md`

**Files modified**:
- `server/services/EmptyEntityFilterService.ts`
- `server/services/UserRestrictionService.ts`
- `server/controllers/library/performers.ts`
- `server/controllers/library/studios.ts`
- `server/controllers/library/tags.ts`

---

## 🔄 Pending Optimizations (In Order)

### Priority 1: Cache Per-User Stats ⏳
**Branch**: `perf/cache-user-stats`
**Estimated Impact**: 90-95% reduction in performer/studio/tag request time
**Complexity**: High (new tables, migration, update logic)

**Current Problem**:
- `calculatePerformerStats()`, `calculateStudioStats()`, `calculateTagStats()` run on EVERY request
- Cost: O(all_scenes × avg_performers_per_scene) = ~60k operations per request
- Example: 20k scenes × 3 performers = 60k calculations

**Solution**:
1. Create new Prisma schema tables:
   - `UserPerformerStats` (userId, performerId, o_counter, play_count, last_played_at, last_o_at)
   - `UserStudioStats` (userId, studioId, o_counter, play_count)
   - `UserTagStats` (userId, tagId, o_counter, play_count)

2. Add indexes:
   ```prisma
   @@unique([userId, performerId])
   @@index([userId])
   @@index([performerId])
   ```

3. Create migration:
   - Run `npx prisma migrate dev --name add_user_stats_tables`
   - Add seed script to populate from existing watch history

4. Create `UserStatsService`:
   - `updateStatsForScene(userId, sceneId)` - Called when watch history updates
   - `getPerformerStats(userId)` - Fast lookup from DB
   - `getStudioStats(userId)` - Fast lookup from DB
   - `getTagStats(userId)` - Fast lookup from DB
   - `rebuildAllStats(userId)` - Admin tool for regeneration

5. Update controllers:
   - Replace `calculatePerformerStats()` with `userStatsService.getPerformerStats()`
   - Replace `calculateStudioStats()` with `userStatsService.getStudioStats()`
   - Replace `calculateTagStats()` with `userStatsService.getTagStats()`

6. Hook into watch history updates:
   - In `controllers/watchHistory.ts`, call `updateStatsForScene()` after save

**Expected Result**:
- Before: O(60k operations) per request
- After: O(40 DB lookups) per request
- 90-95% faster response times

**Testing Checklist**:
- [ ] Migration runs successfully
- [ ] Seed script populates existing data correctly
- [ ] Stats update correctly when watch history changes
- [ ] Performer/Studio/Tag pages load with correct stats
- [ ] Performance improvement verified (compare before/after)
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes

---

### Priority 2: Cache Filtered Entity Lists Per User ⏳
**Branch**: `perf/cache-filtered-entities`
**Estimated Impact**: 95%+ cache hit rate, near-instant subsequent requests
**Complexity**: Medium (in-memory cache + invalidation)

**Current Problem**:
- Every request filters ALL entities with user restrictions + empty entity filtering
- Cost: 4 async DB queries + 8.5k entity filtering operations (tags endpoint)
- No caching - recalculates from scratch every time

**Solution**:
1. Create `FilteredEntityCacheService`:
   ```typescript
   class FilteredEntityCacheService {
     private cache = new Map<string, CachedEntities>();

     async getFilteredEntities(userId: number, entityType: string): Promise<Entity[]>;
     invalidateUser(userId: number): void;
     invalidateAll(): void; // Called on Stash cache update
     getCacheStats(): { hits: number, misses: number, size: number };
   }
   ```

2. Cache key structure:
   - Key: `user:${userId}:${entityType}:v${stashCacheVersion}`
   - Value: Filtered entity array + timestamp
   - TTL: Until Stash cache invalidation

3. Integration points:
   - All entity controllers call cache service first
   - Cache miss: Compute (current logic) + store result
   - Cache hit: Return immediately
   - Invalidate on Stash cache update

4. Memory management:
   - LRU eviction if cache exceeds 100MB
   - Per-user limits (max 10MB per user)
   - Cache stats endpoint for monitoring

**Expected Result**:
- First request: Same cost (cache miss)
- Subsequent requests: <1ms (in-memory lookup)
- Cache hit rate: 95%+ (users browse multiple pages)

**Testing Checklist**:
- [ ] Cache correctly stores and retrieves filtered entities
- [ ] Cache invalidates on Stash cache update
- [ ] Memory usage stays within bounds
- [ ] Cache stats are accurate
- [ ] Performance improvement verified
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes

---

### Priority 3: Lazy Load Tags ⏳
**Branch**: `perf/lazy-load-tags`
**Estimated Impact**: 30-40% faster tag requests, other endpoints unaffected
**Complexity**: Low (conditional logic)

**Current Problem**:
- Tags filtering depends on ALL entity types (most expensive)
- Filters even when tags aren't displayed

**Solution**:
1. Update tag endpoints to skip unnecessary entity filtering:
   - When fetching tags, only filter tags (not other entities first)
   - Build minimal visibility sets on-demand

2. Add `skipExpensiveFiltering` flag:
   ```typescript
   // In findTags controller
   const skipExpensiveFiltering = filter?.per_page === -1; // Minimal endpoint

   if (skipExpensiveFiltering) {
     // Only apply user tag restrictions, skip empty entity filtering
     tags = await userRestrictionService.filterTagsForUser(tags, userId);
   } else {
     // Full filtering with visibility sets
     // ... current logic
   }
   ```

**Expected Result**:
- Tags requests: 30-40% faster
- Minimal endpoints: 50%+ faster
- Other requests: Unaffected

**Testing Checklist**:
- [ ] Tags page still shows correct filtered results
- [ ] Minimal endpoints are faster
- [ ] No entities incorrectly shown/hidden
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes

---

### Priority 4: Pagination-Aware Filtering ⏳
**Branch**: `perf/pagination-aware-filtering`
**Estimated Impact**: 99% reduction in scene processing (20k → 40 scenes)
**Complexity**: Medium (refactor filter ordering)

**Current Problem**:
- Filters ALL scenes, merges ALL user data, then paginates
- Example: Process 20k scenes to show 40

**Solution**:
1. Reorder scene filtering pipeline:
   ```typescript
   // OLD ORDER:
   scenes = getAllScenes();              // 20k scenes
   scenes = mergeUserData(scenes);       // Process 20k
   scenes = applyFilters(scenes);        // Filter 20k
   scenes = filterRestrictions(scenes);  // Filter 20k
   scenes = sort(scenes);                // Sort 20k
   scenes = paginate(scenes);            // Return 40

   // NEW ORDER:
   scenes = getAllScenes();              // 20k scenes
   scenes = applyQuickFilters(scenes);   // IDs, favorites (cheap) - down to 2k
   scenes = filterRestrictions(scenes);  // Filter 2k (needs full list for restrictions)
   scenes = sort(scenes);                // Sort 2k
   scenes = paginate(scenes);            // Down to 40
   scenes = mergeUserData(scenes);       // Process only 40!
   ```

2. Split filters into quick/expensive:
   - Quick: IDs, favorites, date ranges, basic counts (no nested data)
   - Expensive: Performer search, tag search, studio search (needs nested data)

3. Update `mergeScenesWithUserData()`:
   - Accept pagination info
   - Only fetch/process data for visible scenes

**Expected Result**:
- Before: Process 20k scenes
- After: Process 40 scenes (per page)
- 99% reduction in processing

**Challenges**:
- User restrictions need full scene list (can't optimize this step)
- Sorting needs to happen before pagination
- Must preserve correct counts for pagination

**Testing Checklist**:
- [ ] Pagination counts are correct
- [ ] Filtered results are correct
- [ ] Sorting works correctly
- [ ] Search performance improved
- [ ] All filters still work
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes

---

### Priority 5: Database Indexes ⏳
**Branch**: `perf/add-db-indexes`
**Estimated Impact**: 20-40% faster DB queries
**Complexity**: Low (schema updates)

**Current Problem**:
- Missing indexes on frequently queried columns
- Full table scans for user-specific lookups

**Solution**:
1. Audit current indexes:
   ```bash
   cd server
   npx prisma migrate dev --create-only --name audit_indexes
   # Check generated SQL for existing indexes
   ```

2. Add missing indexes to `schema.prisma`:
   ```prisma
   model WatchHistory {
     // ... existing fields

     @@index([userId])
     @@index([sceneId])
     @@unique([userId, sceneId])
   }

   model SceneRating {
     @@index([userId])
     @@index([sceneId])
   }

   model PerformerRating {
     @@index([userId])
     @@index([performerId])
   }

   model StudioRating {
     @@index([userId])
     @@index([studioId])
   }

   model TagRating {
     @@index([userId])
     @@index([tagId])
   }

   model UserContentRestriction {
     @@index([userId])
     @@index([entityType])
   }
   ```

3. Create migration:
   ```bash
   npx prisma migrate dev --name add_query_indexes
   ```

4. Verify indexes in SQLite:
   ```bash
   sqlite3 data/peek-db.db ".indexes"
   ```

**Expected Result**:
- 20-40% faster DB queries
- Reduced CPU usage
- Better performance at scale

**Testing Checklist**:
- [ ] Migration runs successfully
- [ ] Indexes created correctly
- [ ] Query performance improved (use EXPLAIN QUERY PLAN)
- [ ] No breaking changes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes

---

## 🎯 Success Metrics

Track these metrics before/after each optimization:

1. **Response Times** (measured via browser dev tools):
   - `/api/library/scenes` - Current: ~500-2000ms → Target: <100ms
   - `/api/library/performers` - Current: ~300-1000ms → Target: <50ms
   - `/api/library/studios` - Current: ~200-800ms → Target: <50ms
   - `/api/library/tags` - Current: ~1000-3000ms → Target: <200ms

2. **Cache Hit Rates** (Priority 2):
   - Target: 95%+ hit rate after warm-up
   - Monitor via cache stats endpoint

3. **Memory Usage**:
   - Baseline: ~100-200MB
   - With caching: Target <500MB (for 10-50 concurrent users)
   - Monitor via Docker stats

4. **Database Query Count**:
   - Per scene request: Current ~5 queries → Target: 2-3 queries
   - Per performer request: Current ~5 queries → Target: 1-2 queries

---

## 📋 Workflow for Each Priority

1. **Start**:
   ```bash
   cd peek-stash-browser
   git checkout master
   git pull origin master
   git checkout -b perf/[item-name]
   ```

2. **Develop**:
   - Implement changes
   - Test locally

3. **Quality Checks**:
   ```bash
   cd server
   npx tsc --noEmit        # Must pass with 0 errors
   npm run lint            # Must pass with 0 warnings
   ```

4. **Commit & Push**:
   ```bash
   git add -A
   git commit -m "perf: [description]

   [Details about what was optimized and expected impact]

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>"

   git push origin perf/[item-name]
   ```

5. **Wait for Review & Merge**:
   - User reviews PR
   - User merges to master
   - Repeat for next priority

6. **Final Step** (after all priorities complete):
   - Delete this file: `PERFORMANCE_OPTIMIZATION_PLAN.md`
   - Celebrate! 🎉

---

## 📊 Overall Expected Impact

After implementing all 5 priorities:

| Endpoint | Before | After | Improvement |
|----------|--------|-------|-------------|
| Scenes (first request) | 2000ms | 100ms | **20x faster** |
| Scenes (cached) | 2000ms | 10ms | **200x faster** |
| Performers (first) | 1000ms | 50ms | **20x faster** |
| Performers (cached) | 1000ms | 5ms | **200x faster** |
| Studios (first) | 800ms | 40ms | **20x faster** |
| Studios (cached) | 800ms | 5ms | **160x faster** |
| Tags (first) | 3000ms | 200ms | **15x faster** |
| Tags (cached) | 3000ms | 10ms | **300x faster** |

**Total Estimated Dev Time**: 3-5 days (spread across multiple sessions)

---

**Last Updated**: 2025-11-04
**This file will be deleted once all optimizations are complete**
