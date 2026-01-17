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
| `mode` | String | `'INCLUDE'` (whitelist) or `'EXCLUDE'` (blacklist) |
| `entityIds` | String | JSON array of entity IDs |
| `restrictEmpty` | Boolean | Also hide items with no entities of this type |

**Key behaviors:**
- Only admins can set restrictions (via Server Settings)
- Users cannot see or modify their restrictions
- Users cannot bypass restrictions
- Supports both whitelist (INCLUDE) and blacklist (EXCLUDE) modes
- Can restrict by: Tags, Groups, Studios, Galleries

**Cascading:**
- Tag restriction → Hides Scenes/Performers/Studios with that Tag (including inherited tags)
- Group restriction → Hides Scenes in that Group
- Studio restriction → Hides Scenes from that Studio
- Gallery restriction → Hides Scenes linked to that Gallery

### Hidden Content (User-Controlled)

**Purpose:** Users hide content they personally don't want to see. They can undo this at any time.

**Storage:** `UserHiddenEntity` table

| Column | Type | Description |
|--------|------|-------------|
| `userId` | Int | User who hid the entity |
| `entityType` | String | Any entity type |
| `entityId` | String | Stash entity ID |
| `hiddenAt` | DateTime | When it was hidden |

**Key behaviors:**
- Users control their own hidden items
- Users can view and unhide items via Settings
- Supports all entity types: Scene, Performer, Studio, Tag, Group, Gallery, Image
- Admins still see their own hidden items (they can hide content for personal preference)

**Cascading:**
- Hidden Performer → Hides Scenes with that Performer
- Hidden Studio → Hides Scenes from that Studio
- Hidden Tag → Hides Scenes/Performers/Studios with that Tag (including inherited)
- Hidden Group → Hides Scenes in that Group
- Hidden Gallery → Hides Scenes linked to that Gallery, Images in Gallery

### Processing Order

Content filtering happens in this order:
1. **INCLUDE restrictions** (intersection) — must match ALL includes
2. **EXCLUDE restrictions** (difference) — must not match ANY excludes
3. **Hidden entity filtering** (cascade)
4. **Empty entity filtering** — remove organizational entities with no visible content

### Empty Entity Filtering

After restrictions/hiding are applied, organizational entities with no remaining content are removed. Order matters due to dependencies:

1. **Galleries** — Keep if `image_count > 0`
2. **Groups** — Keep if has scenes OR has sub-groups with content (tree traversal)
3. **Studios** — Keep if appears in visible scenes OR has visible groups/galleries OR has child studios with content
4. **Performers** — Keep if appears in visible scenes OR has images OR in visible groups/galleries
5. **Tags** — Keep if attached to any visible entity OR has children with content (DAG traversal)

**Current limitation:** Empty filtering uses scene/image counts from Stash metadata, not restriction-aware counts. A workaround passes `visibleScenes` to the filter methods.

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
