# Peek Technical Overview

This document serves as a reference for entity types, relationships, and content filtering architecture in Peek. It's designed to be consulted when working on features that interact with the data model.

---

## Entity Types

Peek mirrors Stash's entity model, caching entities locally in SQLite. This enables:
- **Performant queries** — No network round-trips to Stash for library browsing
- **Per-user features** — Content restrictions, hidden items, ratings, favorites, watch history
- **Offline resilience** — Library remains accessible if Stash is temporarily unavailable

| Entity | Stash Source | Peek Cache Table | Notes |
|--------|--------------|------------------|-------|
| Scene | ✓ | `StashScene` | Primary content type |
| Performer | ✓ | `StashPerformer` | |
| Studio | ✓ | `StashStudio` | Has parent/child hierarchy |
| Tag | ✓ | `StashTag` | Has parent/child DAG |
| Group | ✓ | `StashGroup` | Has parent/child hierarchy (containing_groups/sub_groups) |
| Gallery | ✓ | `StashGallery` | Contains Images |
| Image | ✓ | `StashImage` | |
| Playlist | Peek-only | `Playlist` | User-created scene collections |
| SceneMarker | ✓ | Not cached | Clips from Scenes (future feature) |

---

## Entity Relationships

### Scene Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Studio | Many-to-One | — | `StashScene.studioId` |
| Performer | Many-to-Many | `ScenePerformer` | |
| Tag | Many-to-Many | `SceneTag` | |
| Group | Many-to-Many | `SceneGroup` | Includes `sceneIndex` for ordering |
| Gallery | Many-to-Many | `SceneGallery` | |

### Performer Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Scene | Many-to-Many | `ScenePerformer` | Inverse of Scene→Performer |
| Tag | Many-to-Many | `PerformerTag` | |
| Image | Many-to-Many | `ImagePerformer` | |
| Gallery | Many-to-Many | `GalleryPerformer` | |
| Group | — | — | Computed by Stash (performers appearing in group's scenes) |

### Studio Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Scene | One-to-Many | — | Inverse of Scene→Studio |
| Tag | Many-to-Many | `StudioTag` | |
| Image | One-to-Many | — | `StashImage.studioId` |
| Gallery | One-to-Many | — | `StashGallery.studioId` |
| Parent Studio | Many-to-One | — | `StashStudio.parentId` |
| Child Studios | One-to-Many | — | Inverse of parentId |
| Group | — | — | Computed by Stash (groups with this studio) |

### Tag Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Scene | Many-to-Many | `SceneTag` | Inverse of Scene→Tag |
| Performer | Many-to-Many | `PerformerTag` | Inverse of Performer→Tag |
| Studio | Many-to-Many | `StudioTag` | Inverse of Studio→Tag |
| Group | Many-to-Many | `GroupTag` | Inverse of Group→Tag |
| Gallery | Many-to-Many | `GalleryTag` | Inverse of Gallery→Tag |
| Image | Many-to-Many | `ImageTag` | Inverse of Image→Tag |
| Parent Tags | Many-to-Many | — | `StashTag.parentIds` (JSON array) |
| Child Tags | Many-to-Many | — | Inverse, resolved at runtime |

**Note:** Tag hierarchies form a DAG (directed acyclic graph), not a tree. Tags can have multiple parents.

### Group Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Scene | Many-to-Many | `SceneGroup` | Includes `sceneIndex` for ordering |
| Tag | Many-to-Many | `GroupTag` | |
| Studio | Many-to-One | — | `StashGroup.studioId` |
| Containing Groups | Many-to-Many | — | Via Stash `containing_groups` |
| Sub Groups | Many-to-Many | — | Via Stash `sub_groups` |

### Gallery Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Scene | Many-to-Many | `SceneGallery` | Inverse of Scene→Gallery |
| Performer | Many-to-Many | `GalleryPerformer` | |
| Tag | Many-to-Many | `GalleryTag` | |
| Studio | Many-to-One | — | `StashGallery.studioId` |
| Image | One-to-Many | `ImageGallery` | |

### Image Relationships

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Gallery | Many-to-Many | `ImageGallery` | |
| Performer | Many-to-Many | `ImagePerformer` | |
| Tag | Many-to-Many | `ImageTag` | |
| Studio | Many-to-One | — | `StashImage.studioId` |

### Playlist Relationships (Peek-only)

| Related Entity | Cardinality | Junction Table | Notes |
|----------------|-------------|----------------|-------|
| Scene | Many-to-Many | `PlaylistItem` | Includes `position` for ordering |
| User | Many-to-One | — | `Playlist.userId` |

---

## Pseudo-Relationships (Inheritance)

Some relationships are "inherited" for display/search/filtering purposes.

### Scene Tag Inheritance

When filtering Scenes (e.g., for content restrictions), Tags are collected from multiple sources:

| Source | Description |
|--------|-------------|
| Direct Scene Tags | Explicitly assigned to the scene |
| Performer Tags | Tags on any Performer in the scene |
| Studio Tags | Tags on the scene's Studio |
| Group Tags | Tags on any Group the scene belongs to |

**Implementation:** `UserRestrictionService.getSceneEntityIds()` collects tags from all sources.

**Rationale:** If a Tag represents content that should be restricted (e.g., "explicit"), that restriction should apply whether the tag is on the scene directly, on a performer in the scene, on the studio, or on a thematic group/series.

### Image Gallery Inheritance

Images can inherit metadata from their parent Gallery during sync. This denormalization enables simpler queries and consistent filtering.

| Field | Inheritance Behavior |
|-------|---------------------|
| Performers | Inherit from Gallery if Image has none |
| Tags | Inherit from Gallery if Image has none |
| Studio | Inherit from Gallery if Image has none |
| Date | Inherit from Gallery if Image has none |
| Photographer | Inherit from Gallery if Image has none |
| Details | Inherit from Gallery if Image has none |

**Note:** Image `title` is NOT inherited — each image keeps its own name.

**Status:** Not yet implemented. Currently Images only have their directly-assigned metadata.

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

### Service Files (Current)

| Service | Purpose |
|---------|---------|
| `UserRestrictionService.ts` | Applies INCLUDE/EXCLUDE rules, hidden entity cascade |
| `UserHiddenEntityService.ts` | CRUD for user hidden entities |
| `EmptyEntityFilterService.ts` | Removes empty organizational entities |
| `FilteredEntityCacheService.ts` | Per-user in-memory cache of filtered results |
| `StashCacheManager.ts` | Server-wide entity cache from Stash |

### Service Files (Proposed)

| Service | Purpose |
|---------|---------|
| `ExclusionComputationService.ts` | Computes and maintains `UserExcludedEntity` table |
| `ExclusionQueryService.ts` | Provides query builders with exclusion JOINs |

### Controller Patterns (Current)

Library controllers follow this pattern:
```typescript
// 1. Get all entities from cache
let scenes = stashCacheManager.getAllScenes();

// 2. Apply user restrictions (if not admin)
if (user.role !== 'ADMIN') {
  scenes = await userRestrictionService.filterScenesForUser(scenes, userId);
}

// 3. Apply empty filtering (if not admin)
if (user.role !== 'ADMIN') {
  scenes = emptyEntityFilterService.filterEmptyScenes(scenes, ...);
}

// 4. Apply search/filter/sort
scenes = applyFilters(scenes, filters);

// 5. Paginate
const page = scenes.slice(offset, offset + limit);
```

### Future Pattern (With Pre-Computed Exclusions)

```typescript
// 1. Query with exclusion JOIN — filtering, pagination, and count in one query
const { scenes, total } = await exclusionQueryService.findScenes(userId, {
  filters,
  sort,
  offset,
  limit,
});

// Already filtered, already paginated, already counted
```

---

## Appendix: Stash GraphQL Schema Reference

Key entity types from Stash for reference:

- **Scene**: `id`, `title`, `date`, `studio`, `performers[]`, `tags[]`, `groups[]`, `galleries[]`, `files[]` (contains `duration`)
- **Performer**: `id`, `name`, `tags[]`, `scene_count`, `image_count`, `gallery_count`, `group_count`
- **Studio**: `id`, `name`, `parent_studio`, `child_studios[]`, `tags[]`, `groups[]`
- **Tag**: `id`, `name`, `parents[]`, `children[]`, various `*_count` fields
- **Group**: `id`, `name`, `studio`, `tags[]`, `containing_groups[]`, `sub_groups[]`, `scenes[]`
- **Gallery**: `id`, `title`, `date`, `studio`, `performers[]`, `tags[]`, `scenes[]`, `image_count`, `photographer`, `details`
- **Image**: `id`, `title`, `date`, `studio`, `performers[]`, `tags[]`, `galleries[]`, `photographer`, `details`
- **SceneMarker**: `id`, `scene`, `primary_tag`, `tags[]`, `seconds`, `end_seconds`

---

*Document Version: 3.0*
*Last Updated: 2025-01-02*
