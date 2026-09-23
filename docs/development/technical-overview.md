# Peek Technical Overview

This document covers Peek's architecture, content filtering system, and implementation details. For entity relationships and the data model, see [Entity Relationships](../reference/entity-relationships.md).

---

## Stash Communication Patterns

Peek communicates with Stash in several ways. Understanding these patterns is important for performance and consistency.

### Expected Patterns

| Pattern | Purpose | Examples |
|---------|---------|----------|
| **Sync** | Fetch entities to cache locally | `StashSyncService` fetching scenes, performers, etc. |
| **Write-back** | Sync user data to Stash | Ratings, favorites, watch history, O-counter |
| **Media proxy** | Stream video/captions through Peek | `video.ts` proxying HLS streams |
| **Metadata edit** | User edits entity metadata | Scene/performer/studio/tag updates |

### Known Issues: Direct Stash Queries

These locations query Stash directly for UI display, bypassing the cache. This causes bugs and performance issues.

| Location | Issue | Impact | Fix |
|----------|-------|--------|-----|
| `playlist.ts:76,165` | Fetches scene data from Stash for playlist display | Shows Stash's O-counter/favorite instead of user's Peek values | Query from `StashScene` cache |
| `watchHistory.ts:61` | Fetches scene duration from Stash on every 10-second ping | Unnecessary network calls during playback | Store duration in cache (available in `files[0].duration`) |

**Principle:** All UI data should come from Peek's cache. Stash should only be queried for sync operations and media streaming.

---

## Content Visibility System

Peek has two mechanisms for hiding content from users. Both cascade (hiding a Tag hides all content with that Tag), but they differ in who controls them and whether they can be undone.

### Restricted Content (Admin-Controlled)

**Purpose:** Admins restrict content that specific users should never see (e.g., age-inappropriate content, legal restrictions).

**Storage:** `UserContentRestriction` table

| Column | Type | Description |
|--------|------|-------------|
| `userId` | Int | Target user |
| `entityType` | String | `'groups'`, `'tags'`, `'studios'`, `'galleries'` |
| `mode` | String | `'INCLUDE'` (Show only) or `'EXCLUDE'` (Always hide) |
| `entityIds` | String | JSON array of `"id:instanceId"` references |
| `restrictEmpty` | Boolean | Also hide content with no item of this type |

Unique per `(userId, entityType, mode)`: a type can have a Show-only and an Always-hide row at once. `restrictEmpty` is one setting per type (the compute ORs the rows); the API defaults it to `true` for INCLUDE and `false` for EXCLUDE when a client omits it. An empty `entityIds` list is rejected.

**Key behaviors:**
- Only admins can set restrictions (via Server Settings), and only on non-admin accounts: `restrictionsApplyTo(role)` in `server/services/exclusionPolicy.ts` is the one place that says who they apply to
- Users cannot see, modify or bypass their restrictions
- Rows stored on an admin account stay inert and apply again if the account is demoted; any role change recomputes the user

**Resolution:** every listed reference is looked up on the user's allowed instances before anything else (a bare id resolves to one reference per instance where the entity exists). Tags expand through `StashTag.parentIds` and studios through `StashStudio.parentId` to every descendant on the same instance with one recursive CTE; parents are not covered. The closure is what every later rule sees, for both lists and for hides.

**Cascading (EXCLUDE closures and hides):**

| Source | Targets |
|--------|---------|
| Performer | Scenes (`ScenePerformer`), galleries (`GalleryPerformer`), images (`ImagePerformer`) |
| Studio | Scenes, galleries, images (`studioId` columns) |
| Tag | Scenes (`SceneTag` and `inheritedTagIds`), performers, studios, groups, galleries, images, clips (`ClipTag` and `primaryTagId`) |
| Group | Scenes (`SceneGroup`) |
| Gallery | Scenes (`SceneGallery`), images (`ImageGallery`) |

Cascades are first order only (a performer excluded through a tag does not cascade further). Clips get real `UserExcludedEntity` rows with `entityType = 'clip'`; the clip query builder joins both `'clip'` rows and the parent scene's rows.

**INCLUDE (Show only):** every entity of the type not in the closure gets a `restricted` row (inversion), and inverted rows are not cascade sources. Content the type links to (scenes, galleries, images) is hidden when it has no item of the type in the closure, unless it has no item at all and `restrictEmpty` is off. Performers, studios, groups and tags are never hidden for lacking an included item; they disappear only through the empty phase. With only an EXCLUDE row, `restrictEmpty` hides content with no item of the type.

### Hidden Content (User-Controlled)

**Purpose:** Users hide content they personally don't want to see. They can undo this at any time.

**Storage:** `UserHiddenEntity` table

| Column | Type | Description |
|--------|------|-------------|
| `userId` | Int | User who hid the entity |
| `entityType` | String | Any entity type |
| `entityId` | String | Stash entity ID |
| `instanceId` | String | Stash instance (`""` means every instance) |
| `hiddenAt` | DateTime | When it was hidden |

**Key behaviors:**
- Users control their own hidden items
- Users can view and unhide items via Settings
- Supports all entity types: Scene, Performer, Studio, Tag, Group, Gallery, Image
- Hides apply to everyone, admins included: no read path checks the role, every list, by-id, download and media check consults `UserExcludedEntity` for every user

**Cascading:** a hide resolves like a listed id (tags and studios expand to their descendants) and cascades along the table above. The stored row keeps its instance as stored; the descendants and the per-instance copies of a `""` hide get their own `hidden` rows, and the Hidden Items page still lists the one stored row. Unhiding the stored row removes the whole set at the next recompute.

### Processing Order

`ExclusionComputationService.recomputeForUser` runs raw SQL end to end on a dedicated single-connection Prisma client, one recompute at a time, inside a deferred `BEGIN` that reads one snapshot and takes no write lock (TEMP tables hold the closures and exclusion sets, so every membership test is an indexed lookup). It then swaps the rows in one short write transaction:

1. **Resolve** the lists and hides on the allowed instances (recursive CTE for tags and studios)
2. **Direct rows**: EXCLUDE closures (`restricted`), INCLUDE inversion (`restricted`), hides (`hidden`)
3. **Cascades** from the EXCLUDE closures and hides only
4. **Content rules**: INCLUDE admission and `restrictEmpty` for scenes, galleries and images
5. **Empty phase**, per instance: galleries with no visible image; performers, studios and groups with no visible content; tags attached to no visible scene, performer, studio, group, gallery or image and with no live child tag on the same instance. Skipped for admins

Every restriction-derived row carries a real `stashInstanceId`. When an entity qualifies twice, the first reason in that order is the one stored. Types AND together: content is hidden if any EXCLUDE or hide rule hits it, any INCLUDE rule does not admit it, or it is empty under `restrictEmpty`.

---

## Current Architecture Issues

### Problem: In-Memory Filtering Doesn't Scale

The current implementation loads all entities into memory then filters:

```
1. Load ALL scenes from cache
2. Filter in JavaScript (UserRestrictionService)
3. Filter empty entities (EmptyEntityFilterService)
4. Paginate
```

This works for small collections but becomes problematic with:
- 10k+ scenes
- Multiple concurrent users
- Complex restriction rules

### Problem: Redundant Computation

Every request recomputes:
- Which entities are hidden for this user
- Which scenes match restriction rules
- Which organizational entities are now empty

`FilteredEntityCacheService` helps but is invalidated frequently.

### Problem: Pagination Breaks

To paginate correctly, we need to know the total count of visible items. Currently:
1. Load ALL items
2. Filter ALL items
3. Get count
4. Return page slice

This defeats the purpose of pagination for large collections.

---

## Proposed Architecture: Pre-Computed Exclusions

### Core Concept

Instead of filtering at query time, pre-compute and store excluded entity IDs per user. Queries become simple JOINs:

```sql
-- Get visible scenes for user 5, page 1
SELECT s.* FROM StashScene s
LEFT JOIN UserExcludedEntity e
  ON e.userId = 5
  AND e.entityType = 'scene'
  AND e.entityId = s.id
WHERE e.id IS NULL  -- Not in exclusion list
  AND s.deletedAt IS NULL
ORDER BY s.stashCreatedAt DESC
LIMIT 25 OFFSET 0
```

### Proposed Schema

```prisma
// Pre-computed exclusions (refreshed on sync/restriction changes)
model UserExcludedEntity {
  id         Int      @id @default(autoincrement())
  userId     Int
  entityType String   // 'scene', 'performer', 'studio', 'tag', 'group', 'gallery', 'image'
  entityId   String   // Stash entity ID

  // Why is this excluded? (for debugging, not query logic)
  reason     String   // 'restricted', 'hidden', 'cascade', 'empty'
  sourceType String?  // If cascade: which entity type caused it
  sourceId   String?  // If cascade: which entity ID caused it

  computedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, entityType, entityId])
  @@index([userId, entityType])      // Primary query index
  @@index([entityType, entityId])    // For cascade lookups ("what users exclude this?")
}

// Pre-computed visible counts per entity type (avoids expensive COUNT queries)
model UserEntityStats {
  id           Int      @id @default(autoincrement())
  userId       Int
  entityType   String   // 'scene', 'performer', etc.
  visibleCount Int      // total entities - excluded entities
  updatedAt    DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, entityType])
}
```

### Key Design Decisions

**1. Single table vs separate tables?**

Single `UserExcludedEntity` table is preferred:
- Simpler schema
- Single JOIN pattern for all queries
- `reason` column distinguishes restriction vs hidden
- `sourceType`/`sourceId` enable cascade debugging

**2. How are IDs unique?**

Stash entity IDs are integers per entity type, NOT globally unique. Scene #1 and Performer #1 can coexist.

The composite unique constraint `@@unique([userId, entityType, entityId])` handles this:
- User 5 + scene + "1" = one record
- User 5 + performer + "1" = different record

**3. Store exclusions vs inclusions?**

Store exclusions (what to hide):
- Most users see most content (exclusions are smaller set)
- Simpler query pattern (LEFT JOIN + WHERE NULL)
- Easier to reason about

**4. How to distinguish restricted vs hidden?**

The `reason` column:
- `'restricted'` — Admin set a restriction rule matching this entity
- `'hidden'` — User explicitly hid this entity
- `'cascade'` — Hidden due to a related entity being restricted/hidden
- `'empty'` — Organizational entity with no visible content

Users can query their hidden items for the unhide UI:
```sql
SELECT * FROM UserExcludedEntity
WHERE userId = ? AND reason = 'hidden'
```

**5. When to recompute?**

Recompute exclusions when:
- Stash sync completes (new/updated entities)
- Admin changes restrictions for a user
- User hides/unhides an entity
- Entity relationships change (rare, usually via Stash)

Recomputation is per-user and can be done incrementally for hide/unhide operations.

---

## Scalability Considerations

### Target Scale

Some Stash users have 100TB+ collections with millions of images and scenes. The exclusion system must handle:
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

### Incremental Update Strategy

**Hide entity (fast, ~10-100 inserts):**
1. Insert exclusion with `reason='hidden'`
2. Find cascading entities via junction tables
3. Insert cascade exclusions with `sourceType`/`sourceId`
4. Decrement `visibleCount` in `UserEntityStats`

**Unhide entity (medium, may need partial recompute):**
1. Delete exclusion where `reason='hidden'` AND entity matches
2. Delete cascade exclusions where `sourceId` matches
3. Re-check if any cascades should remain (other hidden entities may still exclude them)
4. Update `visibleCount` in `UserEntityStats`

**Stash sync (diff-based):**
1. Compare new entity list with cached list
2. For new entities: check if any restriction rules apply
3. For deleted entities: remove from exclusion table
4. For modified entities: recompute if relationships changed

### Future Optimization: Table Splitting

If performance issues arise at 10M+ exclusion rows, consider splitting:
- `UserExcludedScene` — highest volume
- `UserExcludedImage` — highest volume
- `UserExcludedEntity` — for performers, studios, tags, groups, galleries (lower volume)

Start with single table; split only if actual performance issues occur.

---

## Update Triggers

Pre-computed exclusions need updating when:

| Event | Scope | Action |
|-------|-------|--------|
| Stash sync (full) | All users | Diff-based recompute |
| Stash sync (incremental) | All users | Recompute affected entities only |
| Admin changes restriction | One user | Recompute that user |
| User hides entity | One user | Incremental add |
| User unhides entity | One user | Incremental remove + cascade check |

---

## Migration Strategy

1. Keep existing `UserContentRestriction` and `UserHiddenEntity` tables as source of truth
2. Add new `UserExcludedEntity` and `UserEntityStats` tables
3. Implement `ExclusionComputationService` with incremental update logic
4. Add trigger points for recomputation (sync complete, restriction change, hide/unhide)
5. Migrate query patterns to use exclusion JOINs
6. Add admin endpoints for manual recomputation
7. Remove in-memory filtering code once stable

### API Changes

Minimal external API changes needed. Internal query implementation changes.

New admin endpoints:
```
POST /api/admin/recompute-exclusions/:userId
POST /api/admin/recompute-exclusions/all
GET  /api/admin/exclusion-stats
```

---

## Implementation Notes

### Service Architecture

The backend uses SQL-based query builders with pre-computed exclusions for efficient filtering at scale.

#### Core Services

| Service | Purpose |
|---------|---------|
| `StashEntityService.ts` | Database queries for Stash entities (replaces in-memory cache) |
| `StashSyncService.ts` | Syncs data from Stash GraphQL API to local database |
| `UserHiddenEntityService.ts` | CRUD for user-hidden entities |
| `ExclusionComputationService.ts` | Computes and maintains `UserExcludedEntity` table |
| `EntityExclusionHelper.ts` | Helper functions for exclusion logic |

#### Query Builders

Each entity type has a dedicated query builder that handles filtering, sorting, pagination, and exclusion JOINs:

| Query Builder | Entity |
|---------------|--------|
| `SceneQueryBuilder.ts` | Scenes |
| `PerformerQueryBuilder.ts` | Performers |
| `StudioQueryBuilder.ts` | Studios |
| `TagQueryBuilder.ts` | Tags |
| `GroupQueryBuilder.ts` | Groups |
| `GalleryQueryBuilder.ts` | Galleries |
| `ImageQueryBuilder.ts` | Images |

#### Other Services

| Service | Purpose |
|---------|---------|
| `RecommendationScoringService.ts` | Personalized scene recommendations |
| `UserStatsService.ts` | User activity statistics |
| `UserStatsAggregationService.ts` | Aggregated stats computation |
| `SceneTagInheritanceService.ts` | Computes inherited tags for scenes |
| `ImageGalleryInheritanceService.ts` | Propagates gallery metadata to images |

### Query Pattern

Library controllers use query builders for efficient SQL-based filtering:

```typescript
// Query with exclusion JOIN — filtering, pagination, and count in one query
const result = await sceneQueryBuilder
  .forUser(userId)
  .withFilters(filters)
  .withSort(sort)
  .paginate(offset, limit)
  .execute();

// Returns { items: Scene[], total: number }
// Already filtered by user exclusions, already paginated
```

This replaces the old pattern of loading all entities into memory and filtering in JavaScript.

---

*Document Version: 3.2*
*Last Updated: 2026-01-17*
