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

**Current flow (slow):**
```
Controller (e.g., scenes.ts)
    ↓
1. userRestrictionService.getExcludedSceneIds(userId)  ← 6-10 DB queries per request
    ↓
2. sceneQueryBuilder.execute({ excludedSceneIds, ... })  ← passes exclusions as Set
    ↓
3. SceneQueryBuilder uses NOT IN (excludedIds) in SQL  ← parameter limits, chunking needed
```

**Target scale:** Users with 100TB+ collections containing millions of scenes and images.

**Goal:** Pre-compute excluded entity IDs per user, stored in a database table. Queries become simple JOINs with proper pagination and counts at the database level.

**New flow (fast):**
```
Controller (e.g., scenes.ts)
    ↓
1. sceneQueryBuilder.execute({ userId, ... })  ← no pre-computation needed
    ↓
2. SceneQueryBuilder adds LEFT JOIN UserExcludedEntity + WHERE e.id IS NULL
```

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
| `UserExcludedEntity` | Stores (userId, entityType, entityId, reason) for every excluded item |
| `UserEntityStats` | Stores pre-computed visible counts per entity type per user |

**Exclusion reasons tracked:**
- `restricted` — Admin set a restriction rule matching this entity
- `hidden` — User explicitly hid this entity
- `cascade` — Excluded due to a related entity (e.g., scene excluded because its performer is hidden)
- `empty` — Organizational entity with no visible content

**Design simplification:** We store one row per excluded entity without tracking the source of cascades (`sourceType`/`sourceId`). This simplifies the schema and queries. The tradeoff is that unhide operations trigger a targeted recompute rather than a simple DELETE, but unhide is rare and recompute is fast.

**Recomputation triggers:**
- Stash sync completes → `recomputeAllUsers()`
- Admin changes user's restrictions → `recomputeForUser(userId)`
- User hides entity → `addHiddenEntity()` (synchronous, incremental)
- User unhides entity → Remove from `UserHiddenEntity`, queue `recomputeForUser()` (async)

---

## Schema Design

```prisma
// Pre-computed exclusions (refreshed on sync/restriction changes)
model UserExcludedEntity {
  id         Int      @id @default(autoincrement())
  userId     Int
  entityType String   // 'scene', 'performer', 'studio', 'tag', 'group', 'gallery', 'image'
  entityId   String   // Stash entity ID

  reason     String   // 'restricted', 'hidden', 'cascade', 'empty'
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

## Cascade Rules

When an entity is hidden or restricted, related entities are cascade-excluded:

| When this is hidden/restricted... | These are cascade-excluded... |
|-----------------------------------|-------------------------------|
| Performer | Scenes with that performer |
| Studio | Scenes from that studio |
| Tag | Scenes with that tag (direct OR inherited via `inheritedTagIds`), Performers with that tag, Studios with that tag, Groups with that tag |
| Group | Scenes in that group |
| Gallery | Scenes linked to that gallery, Images in that gallery |
| Scene | (no cascade — scenes are leaf content) |
| Image | (no cascade — images are leaf content) |

**Empty entity cascades** (organizational entities with no remaining visible content):

| Entity type | Empty when... |
|-------------|---------------|
| Gallery | Has 0 visible images |
| Group | Has 0 visible scenes AND no sub-groups with content (tree traversal) |
| Studio | Has 0 visible scenes AND 0 visible images AND no child studios with content (tree traversal) |
| Performer | Has 0 visible scenes AND 0 visible images |
| Tag | Not attached to any visible scene/performer/studio/group/gallery/image (DAG traversal) |

**Empty exclusions computed at sync time only** — not during hide/unhide operations. This keeps incremental operations fast. Users won't notice if an empty performer briefly appears until next sync.

---

## New Services

### File: `server/services/ExclusionComputationService.ts`

Responsible for computing and maintaining exclusions.

```typescript
class ExclusionComputationService {
  // Full recompute for a user (initial setup, restriction change, after sync)
  async recomputeForUser(userId: number): Promise<void>

  // Recompute for all users (after sync)
  async recomputeAllUsers(): Promise<void>

  // Incremental: user hid an entity (synchronous)
  async addHiddenEntity(userId: number, entityType: string, entityId: string): Promise<void>

  // Incremental: user unhid an entity (queues async recompute)
  async removeHiddenEntity(userId: number, entityType: string, entityId: string): Promise<void>

  // Internal phases
  private async computeDirectExclusions(tx: PrismaTransaction, userId: number): Promise<void>
  private async computeCascadeExclusions(tx: PrismaTransaction, userId: number): Promise<void>
  private async computeEmptyExclusions(tx: PrismaTransaction, userId: number): Promise<void>
  private async updateEntityStats(tx: PrismaTransaction, userId: number): Promise<void>
}
```

**Full recompute algorithm:**

The entire recompute runs in a transaction. If any phase fails, the transaction rolls back and the user keeps their previous exclusions — they never see unrestricted content due to a partial failure.

```typescript
async recomputeForUser(userId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Phase 1: Clear existing exclusions
    await tx.userExcludedEntity.deleteMany({ where: { userId } });

    // Phase 2: Direct exclusions (restrictions + hidden)
    await this.computeDirectExclusions(tx, userId);

    // Phase 3: Cascade exclusions
    await this.computeCascadeExclusions(tx, userId);

    // Phase 4: Empty entity exclusions (sync-time only)
    await this.computeEmptyExclusions(tx, userId);

    // Phase 5: Update stats
    await this.updateEntityStats(tx, userId);
  });
}
```

**Computation order in Phase 3 (cascades):**

1. For each hidden/restricted performer → exclude their scenes
2. For each hidden/restricted studio → exclude their scenes
3. For each hidden/restricted tag → exclude scenes (using `inheritedTagIds`), performers, studios, groups
4. For each hidden/restricted group → exclude their scenes
5. For each hidden/restricted gallery → exclude linked scenes, images in gallery

### File: `server/services/ExclusionQueryBuilder.ts`

Provides JOIN clause utilities for filtered queries.

```typescript
class ExclusionQueryBuilder {
  /**
   * Build the exclusion JOIN clause for raw SQL
   */
  buildExclusionJoin(
    entityType: string,
    tableAlias: string
  ): { sql: string } {
    return {
      sql: `LEFT JOIN UserExcludedEntity e_${tableAlias}
            ON e_${tableAlias}.userId = ?
            AND e_${tableAlias}.entityType = '${entityType}'
            AND e_${tableAlias}.entityId = ${tableAlias}.id`,
    };
  }

  /**
   * Build the WHERE clause for exclusion filtering
   */
  buildExclusionWhere(tableAlias: string): string {
    return `e_${tableAlias}.id IS NULL`;
  }
}
```

This utility is used by `SceneQueryBuilder` and similar query builders for other entity types.

---

## Query Architecture Changes

### SceneQueryBuilder Updates

**Interface change:**

```typescript
// Before
interface SceneQueryOptions {
  userId: number;
  excludedSceneIds?: Set<string>;  // Remove this
  // ...
}

// After
interface SceneQueryOptions {
  userId: number;
  applyExclusions?: boolean;  // Default true, false for admin override
  // ...
}
```

**FROM clause change:**

```sql
-- Before
FROM StashScene s
LEFT JOIN SceneRating r ON s.id = r.sceneId AND r.userId = ?
LEFT JOIN WatchHistory w ON s.id = w.sceneId AND w.userId = ?

-- After
FROM StashScene s
LEFT JOIN SceneRating r ON s.id = r.sceneId AND r.userId = ?
LEFT JOIN WatchHistory w ON s.id = w.sceneId AND w.userId = ?
LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = s.id
```

**WHERE clause addition:**

```sql
WHERE s.deletedAt IS NULL
  AND e.id IS NULL  -- Not in exclusion table
  -- ... other filters
```

### Same Pattern for Other Entities

The `UserExcludedEntity` table is uniform — the JOIN pattern is identical for all entity types:

```sql
LEFT JOIN UserExcludedEntity e
  ON e.userId = ? AND e.entityType = '<type>' AND e.entityId = <table>.id
WHERE e.id IS NULL
```

---

## Incremental Updates

### Hide Operation (Synchronous)

When a user hides an entity, we add exclusions incrementally within a transaction:

```typescript
async addHiddenEntity(userId: number, entityType: string, entityId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. Add the direct exclusion
    await tx.userExcludedEntity.upsert({
      where: { userId_entityType_entityId: { userId, entityType, entityId } },
      create: { userId, entityType, entityId, reason: 'hidden' },
      update: { reason: 'hidden' },
    });

    // 2. Compute and add cascades for this entity
    await this.addCascadesForEntity(tx, userId, entityType, entityId);

    // 3. Update affected stats
    await this.updateEntityStats(tx, userId);
  });
}
```

This is fast — typically a few queries and INSERTs. User sees immediate feedback.

### Unhide Operation (Async)

Unhide is trickier — a scene might still be excluded by another hidden performer. We use a safe approach:

```typescript
async removeHiddenEntity(userId: number, entityType: string, entityId: string): Promise<void> {
  // 1. Remove the source of truth entry (immediate)
  await prisma.userHiddenEntity.delete({
    where: { userId_entityType_entityId: { userId, entityType, entityId } },
  });

  // 2. Queue async recompute
  setImmediate(() => {
    this.recomputeForUser(userId).catch(err => {
      logger.error('Failed to recompute exclusions after unhide', { userId, err });
    });
  });
}
```

The response returns immediately. There's a brief window where the user might see stale exclusions, but the next request after recompute completes will be correct.

---

## API Integration Pattern

**The problem:** Exclusion filtering must be applied consistently across ALL endpoints that return entities — including minimal endpoints for filter dropdowns.

**Approach: Centralize all entity queries through query builders that use exclusion JOINs**

No controller should directly query Prisma or cache for user-visible entities. Instead:

```typescript
// OLD (scattered, inconsistent)
const excludedIds = await userRestrictionService.getExcludedSceneIds(userId);
const result = await sceneQueryBuilder.execute({ excludedSceneIds, ... });

// NEW (centralized)
const result = await sceneQueryBuilder.execute({ userId, ... });
// Exclusion JOIN is built-in
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
| GET /api/carousel/* | `carousel.ts` | Carousel queries |

**Why this works for all exclusion types:**

- **Restricted items** → `ExclusionComputationService` processes admin restrictions, adds entries with `reason='restricted'` or `reason='cascade'`
- **Hidden items** → Computation processes user hidden entities, adds entries with `reason='hidden'` or `reason='cascade'`
- **Empty items** → Computation identifies organizational entities with no visible content, adds entries with `reason='empty'`

All three end up in the same `UserExcludedEntity` table. Query builders apply the same JOIN regardless of reason. The `reason` column is for debugging and the unhide UI.

**Enforcement:**
1. Delete `userRestrictionService.getExcludedSceneIds()` after migration
2. Delete `userRestrictionService.filter*ForUser()` methods after migration
3. Delete `emptyEntityFilterService` methods after migration
4. Compile errors force all callers to use new pattern

---

## Migration Strategy

**Phase 1: Add tables (non-breaking)**
- Add `UserExcludedEntity` and `UserEntityStats` tables via Prisma migration
- No changes to existing query logic yet

**Phase 2: Implement computation service**
- Build `ExclusionComputationService` with full recompute logic
- Add admin endpoint to trigger recomputation manually
- Test that exclusions are computed correctly

**Phase 3: Implement query builder utility**
- Build `ExclusionQueryBuilder` with JOIN clause helpers
- Update `SceneQueryBuilder` to use exclusion JOIN instead of `excludedSceneIds` parameter
- Test scene queries work correctly

**Phase 4: Wire up triggers**
- After Stash sync → call `recomputeAllUsers()`
- After restriction change → call `recomputeForUser()`
- After hide → call `addHiddenEntity()`
- After unhide → call `removeHiddenEntity()`

**Phase 5: Update remaining entity queries**
- Add exclusion JOINs to performer, studio, tag, group, gallery, image queries
- Update all endpoints in audit list

**Phase 6: Cleanup**
- Remove old in-memory filtering code
- Remove `getExcludedSceneIds()` and `filter*ForUser()` methods
- Remove `EmptyEntityFilterService`
- Remove `FilteredEntityCacheService`

**Rollback plan:** Keep old code paths available behind feature flag during migration. If issues arise, disable new code path instantly.

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
| Full recomputation time | Use transactions for atomicity; recompute is seconds not minutes |
| COUNT queries | Pre-compute visible counts in `UserEntityStats` table |
| Index memory | ~250MB for 5M rows is acceptable for modern servers |
| Failure during recompute | Transaction rollback preserves previous exclusions |

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
   - Hide a tag → verify scenes/performers/studios/groups with that tag are excluded
   - Hide a group → verify scenes in group are excluded
   - Hide a gallery → verify linked scenes and images are excluded

2. **Incremental updates:**
   - Hide entity → verify exclusions added correctly
   - Unhide entity → verify recompute removes exclusions
   - Unhide entity that's still excluded by another source → verify it stays excluded

3. **Transaction safety:**
   - Simulate failure mid-recompute → verify previous exclusions preserved
   - Verify user never sees unrestricted content due to partial failure

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
   - Verify each endpoint in audit list uses exclusion JOINs
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
- `server/services/ExclusionQueryBuilder.ts` — JOIN clause utilities for filtered queries

### Modified Files
- `server/prisma/schema.prisma` — Add `UserExcludedEntity` and `UserEntityStats` tables
- `server/services/SceneQueryBuilder.ts` — Use exclusion JOIN instead of `excludedSceneIds`
- `server/controllers/library/scenes.ts` — Remove `getExcludedSceneIds()` calls
- `server/controllers/library/performers.ts` — Add exclusion JOIN to queries
- `server/controllers/library/studios.ts` — Add exclusion JOIN to queries
- `server/controllers/library/tags.ts` — Add exclusion JOIN to queries
- `server/controllers/library/groups.ts` — Add exclusion JOIN to queries
- `server/controllers/library/galleries.ts` — Add exclusion JOIN to queries
- `server/controllers/library/images.ts` — Add exclusion JOIN to queries
- `server/controllers/recommendations.ts` — Remove `getExcludedSceneIds()` calls
- `server/controllers/search.ts` — Add exclusion JOINs
- `server/controllers/playlist.ts` — Add exclusion JOINs
- `server/controllers/carousel.ts` — Remove `getExcludedSceneIds()` calls
- `server/services/StashSyncService.ts` — Trigger `recomputeAllUsers()` after sync
- `server/controllers/user.ts` — Use `addHiddenEntity()`/`removeHiddenEntity()`
- `server/controllers/admin.ts` — Trigger `recomputeForUser()` on restriction change

### Deleted Files (after migration complete)
- `server/services/UserRestrictionService.ts` — Replaced by `ExclusionComputationService` + query JOINs
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
- [Fix Direct Stash Queries](2025-01-02-fix-direct-stash-queries-design.md) — Prerequisite fix (completed)
- [Image Gallery Inheritance](2025-01-02-image-gallery-inheritance-design.md) — Similar denormalization pattern (completed)
- [Scene Tag Inheritance](2025-01-02-scene-tag-inheritance-design.md) — Similar denormalization pattern (completed)
