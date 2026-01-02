# Pre-Computed Exclusions

**Branch:** `feature/pre-computed-exclusions`
**Status:** Design Complete
**Complexity:** High

---

## Problem Statement

Peek's content filtering (restrictions + hidden items) currently works by:
1. Loading ALL entities into memory
2. Filtering in JavaScript
3. Paginating the filtered results

This doesn't scale. Problems include:
- **Memory:** 1M+ scenes loaded into memory per request
- **CPU:** Filtering logic runs on every request, for every user
- **Pagination:** To get page 5 of 25 items, we load and filter ALL items first
- **Counts:** Total visible count requires processing entire dataset

**Target scale:** Users with 100TB+ collections containing millions of scenes and images.

**Goal:** Pre-compute excluded entity IDs per user, stored in a database table. Queries become simple JOINs with proper pagination and counts at the database level.

---

## Solution Overview

**Core concept:** Instead of filtering at query time, pre-compute and store which entities each user cannot see. Queries become:

```sql
SELECT s.* FROM StashScene s
LEFT JOIN UserExcludedEntity e
  ON e.userId = 5 AND e.entityType = 'scene' AND e.entityId = s.id
WHERE e.id IS NULL  -- Not excluded
ORDER BY s.stashCreatedAt DESC
LIMIT 25 OFFSET 100
```

**Two new tables:**

| Table | Purpose |
|-------|---------|
| `UserExcludedEntity` | Stores (userId, entityType, entityId) for every excluded item |
| `UserEntityStats` | Stores pre-computed visible counts per entity type per user |

**Exclusion reasons tracked:**
- `restricted` — Admin set a restriction rule matching this entity
- `hidden` — User explicitly hid this entity
- `cascade` — Excluded due to a related entity (e.g., scene excluded because its performer is hidden)
- `empty` — Organizational entity with no visible content

**Cascade tracking:** Store `sourceType` and `sourceId` so we know WHY something was excluded. This enables efficient incremental updates when unhiding.

**Recomputation triggers:**
- Stash sync completes (diff-based)
- Admin changes user's restrictions
- User hides/unhides an entity

---

## Schema Design

```prisma
// Pre-computed exclusions (refreshed on sync/restriction changes)
model UserExcludedEntity {
  id         Int      @id @default(autoincrement())
  userId     Int
  entityType String   // 'scene', 'performer', 'studio', 'tag', 'group', 'gallery', 'image'
  entityId   String   // Stash entity ID

  // Why is this excluded? (for debugging and unhide logic)
  reason     String   // 'restricted', 'hidden', 'cascade', 'empty'
  sourceType String?  // If cascade: which entity type caused it ('performer', 'tag', etc.)
  sourceId   String?  // If cascade: which entity ID caused it

  computedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, entityType, entityId])
  @@index([userId, entityType])      // Primary query index
  @@index([entityType, entityId])    // For cascade lookups
}

// Pre-computed visible counts (avoids expensive COUNT queries)
model UserEntityStats {
  id           Int      @id @default(autoincrement())
  userId       Int
  entityType   String   // 'scene', 'performer', 'studio', 'tag', 'group', 'gallery', 'image'
  visibleCount Int      // total - excluded
  updatedAt    DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, entityType])
}
```

**ID uniqueness:** Stash IDs are per-entity-type (Scene #1 and Performer #1 can coexist). The composite unique constraint `@@unique([userId, entityType, entityId])` handles this.

**Index strategy:**
- `[userId, entityType]` — Primary query pattern: "get all excluded scenes for user 5"
- `[entityType, entityId]` — Cascade lookups: "which users have this performer excluded?"

---

## New Services

### File: `server/services/ExclusionComputationService.ts`

Responsible for computing and maintaining exclusions.

```typescript
class ExclusionComputationService {
  // Full recompute for a user (initial setup, restriction change)
  async recomputeForUser(userId: number): Promise<void>

  // Incremental: user hid an entity
  async addHiddenEntity(userId: number, entityType: string, entityId: string): Promise<void>

  // Incremental: user unhid an entity
  async removeHiddenEntity(userId: number, entityType: string, entityId: string): Promise<void>

  // Diff-based: after Stash sync, update affected exclusions
  async updateAfterSync(changedEntityIds: Map<string, string[]>): Promise<void>

  // Recalculate visible counts for a user
  async updateEntityStats(userId: number): Promise<void>
}
```

**Cascade computation logic:**

When computing exclusions for a user:
1. Start with directly hidden/restricted entities
2. For each hidden performer → find all their scenes → mark as cascade
3. For each hidden studio → find all their scenes → mark as cascade
4. For each hidden tag → find all scenes/performers/studios with that tag → mark as cascade
5. For each hidden group → find all scenes in group → mark as cascade
6. For each hidden gallery → find all scenes linked, all images in gallery → mark as cascade
7. Compute empty entities (organizational entities with no remaining visible content)

### File: `server/services/ExclusionQueryService.ts`

Provides query builders with exclusion JOINs.

```typescript
class ExclusionQueryService {
  // Get visible scenes with pagination
  async findScenes(userId: number, options: {
    filters?: SceneFilters,
    sort?: SortOption,
    offset?: number,
    limit?: number,
    minimal?: boolean  // For dropdowns: only return id/name
  }): Promise<{ scenes: NormalizedScene[], total: number }>

  // Similar methods for other entity types
  async findPerformers(userId: number, options: {...}): Promise<{...}>
  async findStudios(userId: number, options: {...}): Promise<{...}>
  async findTags(userId: number, options: {...}): Promise<{...}>
  async findGroups(userId: number, options: {...}): Promise<{...}>
  async findGalleries(userId: number, options: {...}): Promise<{...}>
  async findImages(userId: number, options: {...}): Promise<{...}>
}
```

---

## API Integration Pattern

**The problem:** Exclusion filtering must be applied consistently across ALL endpoints that return entities — including minimal endpoints for filter dropdowns.

**Approach: Centralize all entity queries through `ExclusionQueryService`**

No controller should directly query Prisma or cache for user-visible entities. Instead:

```typescript
// OLD (scattered, inconsistent)
let tags = await stashEntityService.getAllTags();
tags = await userRestrictionService.filterTagsForUser(tags, userId);

// NEW (centralized)
const { tags, total } = await exclusionQueryService.findTags(userId, { filters, sort, limit, offset });
```

**Full endpoint audit:**

| Endpoint | File | Purpose |
|----------|------|---------|
| **Library (full)** | | |
| GET /api/library/scenes | `library/scenes.ts` | Scene grid |
| GET /api/library/performers | `library/performers.ts` | Performer grid |
| GET /api/library/studios | `library/studios.ts` | Studio grid |
| GET /api/library/tags | `library/tags.ts` | Tag grid |
| GET /api/library/groups | `library/groups.ts` | Group grid |
| GET /api/library/galleries | `library/galleries.ts` | Gallery grid |
| GET /api/library/images | `library/images.ts` | Image grid |
| **Library (minimal for dropdowns)** | | |
| POST /api/library/performers/minimal | `library/performers.ts` | Performer filter dropdown |
| POST /api/library/studios/minimal | `library/studios.ts` | Studio filter dropdown |
| POST /api/library/tags/minimal | `library/tags.ts` | Tag filter dropdown |
| POST /api/library/groups/minimal | `library/groups.ts` | Group filter dropdown |
| POST /api/library/galleries/minimal | `library/galleries.ts` | Gallery filter dropdown |
| **Other** | | |
| GET /api/recommendations | `recommendations.ts` | Home recommendations |
| GET /api/search | `search.ts` | Global search |
| GET /api/playlists/:id | `playlist.ts` | Playlist items |
| GET /api/home/carousels | `home.ts` | Home page carousels |

**Why this works for all exclusion types:**

- **Restricted items** → `ExclusionComputationService` processes admin restrictions, adds entries with `reason='restricted'` or `reason='cascade'`
- **Hidden items** → Computation processes user hidden entities, adds entries with `reason='hidden'` or `reason='cascade'`
- **Empty items** → Computation identifies organizational entities with no visible content, adds entries with `reason='empty'`

All three end up in the same `UserExcludedEntity` table. `ExclusionQueryService` applies the same JOIN regardless of reason. The `reason` column is only for debugging and the unhide UI.

**Enforcement:**
1. Delete `stashEntityService.getAll*()` methods after migration
2. Delete `userRestrictionService.filter*ForUser()` methods after migration
3. Compile errors force all callers to use new service

---

## Migration Strategy

**Phase 1: Add tables (non-breaking)**
- Add `UserExcludedEntity` and `UserEntityStats` tables via Prisma migration
- No changes to existing query logic yet

**Phase 2: Implement computation service**
- Build `ExclusionComputationService` with full recompute logic
- Add admin endpoint to trigger recomputation manually
- Test that exclusions are computed correctly

**Phase 3: Implement query service**
- Build `ExclusionQueryService` with JOIN-based queries
- Add feature flag to switch between old and new query paths
- Run both in parallel to validate results match

**Phase 4: Wire up triggers**
- After Stash sync → call `updateAfterSync()`
- After restriction change → call `recomputeForUser()`
- After hide/unhide → call incremental methods

**Phase 5: Switch over**
- Enable new query path by default
- Monitor for issues
- Remove old in-memory filtering code

**Rollback plan:** Feature flag allows instant rollback to old query path if issues arise.

**Existing tables preserved:**
- `UserContentRestriction` — remains source of truth for admin restrictions
- `UserHiddenEntity` — remains source of truth for user hidden items
- `UserExcludedEntity` is a computed/derived table, can be rebuilt anytime

---

## Scalability Considerations

### Target Scale

- 1M+ scenes per instance
- 1M+ images per instance
- Multiple users with different restrictions
- Worst case: 50% of content excluded per user

### Exclusion Table Size Estimates

| Scenario | Exclusion Records | Table Size |
|----------|-------------------|------------|
| 1M scenes, 10% excluded, 1 user | ~100k rows | ~10MB |
| 1M scenes, 50% excluded, 5 users | ~2.5M rows | ~250MB |
| 2M entities, 30% excluded, 10 users | ~6M rows | ~600MB |

### Performance Characteristics

**Query performance (with proper indexes):**
- Index lookup: O(log n) — ~20 comparisons for 1M rows
- JOIN is efficient because all join columns are indexed
- SQLite page cache keeps hot indexes in memory

**Potential bottlenecks:**

| Concern | Mitigation |
|---------|------------|
| Full recomputation time | Never do full recompute except initial setup; use incremental updates |
| COUNT queries | Pre-compute visible counts in `UserEntityStats` table |
| Index memory | ~250MB for 5M rows is acceptable for modern servers |
| Cascade complexity | Track `sourceType`/`sourceId` to enable targeted updates |

### Future Optimization: Table Splitting

If performance issues arise at 10M+ exclusion rows, consider splitting:
- `UserExcludedScene` — highest volume
- `UserExcludedImage` — highest volume
- `UserExcludedEntity` — for performers, studios, tags, groups, galleries (lower volume)

Start with single table; split only if actual performance issues occur.

---

## Testing & Acceptance Criteria

### Unit Tests

1. **Cascade computation:**
   - Hide a performer → verify all their scenes are excluded with `reason='cascade'`
   - Hide a tag → verify scenes/performers/studios with that tag are excluded
   - Hide a group → verify scenes in group are excluded
   - Hide a gallery → verify linked scenes and images are excluded

2. **Incremental updates:**
   - Hide entity → verify exclusions added correctly
   - Unhide entity → verify exclusions removed
   - Unhide entity that's still excluded by another source → verify it stays excluded

3. **Multi-source cascade:**
   - Scene has two hidden performers → verify removing one doesn't unhide scene
   - Scene has hidden performer AND hidden tag → both sources tracked

### Integration Tests

1. **Query correctness:**
   - Compare old in-memory filtering results with new JOIN-based results
   - Run on dataset with complex restriction rules
   - Verify counts match

2. **Pagination:**
   - Get page 1, page 2, page 3 → verify no duplicates, no gaps
   - Verify total count is accurate

3. **Performance:**
   - Benchmark with 100k+ scenes
   - Verify query time is under 100ms for paginated results
   - Verify recomputation time is acceptable

4. **All endpoints covered:**
   - Verify each endpoint in audit list uses `ExclusionQueryService`
   - Verify filter dropdowns show only visible entities
   - Verify hidden performer doesn't appear in performer dropdown

### Manual Testing

1. Fresh user → verify initial exclusion computation works
2. Admin changes restrictions → verify recomputation triggers
3. User hides/unhides → verify incremental update works
4. Stash sync with new content → verify new items checked against rules
5. Filter dropdown → verify restricted/hidden/empty entities don't appear

---

## Files Changed

### New Files
- `server/services/ExclusionComputationService.ts` — Computes and maintains exclusions
- `server/services/ExclusionQueryService.ts` — Query builders with exclusion JOINs

### Modified Files
- `server/prisma/schema.prisma` — Add `UserExcludedEntity` and `UserEntityStats` tables
- `server/controllers/library/scenes.ts` — Use `ExclusionQueryService`
- `server/controllers/library/performers.ts` — Use `ExclusionQueryService`
- `server/controllers/library/studios.ts` — Use `ExclusionQueryService`
- `server/controllers/library/tags.ts` — Use `ExclusionQueryService`
- `server/controllers/library/groups.ts` — Use `ExclusionQueryService`
- `server/controllers/library/galleries.ts` — Use `ExclusionQueryService`
- `server/controllers/library/images.ts` — Use `ExclusionQueryService`
- `server/controllers/recommendations.ts` — Use `ExclusionQueryService`
- `server/controllers/search.ts` — Use `ExclusionQueryService`
- `server/controllers/playlist.ts` — Use `ExclusionQueryService`
- `server/controllers/home.ts` — Use `ExclusionQueryService`
- `server/services/StashSyncService.ts` — Trigger exclusion update after sync
- `server/controllers/user.ts` — Trigger exclusion update on hide/unhide
- `server/controllers/admin.ts` — Trigger exclusion update on restriction change

### Deleted Files (after migration complete)
- `server/services/UserRestrictionService.ts` — Replaced by `ExclusionQueryService`
- `server/services/EmptyEntityFilterService.ts` — Replaced by `ExclusionComputationService`
- `server/services/FilteredEntityCacheService.ts` — No longer needed

---

## Admin Endpoints

New endpoints for monitoring and manual control:

```
POST /api/admin/recompute-exclusions/:userId  — Recompute for one user
POST /api/admin/recompute-exclusions/all      — Recompute for all users
GET  /api/admin/exclusion-stats               — View exclusion table size, per-user counts
```

---

## Related Documentation

- [Technical Overview](../development/technical-overview.md) — Full architecture documentation
- [Fix Direct Stash Queries](2025-01-02-fix-direct-stash-queries-design.md) — Prerequisite fix
- [Image Gallery Inheritance](2025-01-02-image-gallery-inheritance-design.md) — Similar denormalization pattern
- [Scene Tag Inheritance](2025-01-02-scene-tag-inheritance-design.md) — Similar denormalization pattern
