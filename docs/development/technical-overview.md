# Peek Technical Overview

This document covers Peek's architecture, content filtering system, and implementation details. For entity relationships and the data model, see [Entity Relationships](../reference/entity-relationships.md).

---

## Stash Communication Patterns

Peek communicates with Stash in several ways. Understanding these patterns is important for performance and consistency.

### Patterns

| Pattern | Purpose | Examples |
|---------|---------|----------|
| **Sync** | Fetch entities to cache locally | `StashSyncService` fetching scenes, performers, etc. |
| **Sync to Stash** | Write a user's own data back, when an admin has switched it on for that user | Ratings, favorites (`controllers/ratings.ts`), plays, watch time, resume points and O counts (`controllers/watchHistory.ts`, `controllers/imageViewHistory.ts`); see [Sync to Stash](../user-guide/user-management.md#sync-to-stash-export) |
| **Media proxy** | Stream video, captions and images through Peek | `video.ts` and the `/api/proxy/*` routes |

Peek never edits Stash metadata: Sync to Stash is the only write, and it sends only the user's own ratings, favorites and play data. Users never receive Stash's address or API key.

**Principle:** All UI data comes from Peek's cache. Stash is queried to sync, to proxy media and, for a user with Sync to Stash on, to write that user's data. Rating, favorite, O-count and play fields in responses are the requesting user's, never Stash's.

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
| Tag | Scenes (`SceneTag` and `SceneInheritedTag`), performers, studios, groups, galleries, images, clips (`ClipTag` and `primaryTagId`) |
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

`ExclusionComputationService.recomputeForUser` runs raw SQL end to end on a dedicated single-connection Prisma client (`prisma/computeClient.ts`), one recompute at a time, inside a deferred `BEGIN` that reads one snapshot and takes no write lock (TEMP tables hold the closures and exclusion sets, so every membership test is an indexed lookup). It computes the rows in these steps:

1. **Resolve** the lists and hides on the user's instance scope, the enabled instances narrowed by their selection, including one still on its first sync so that its rows exist before it shows (recursive CTE for tags and studios)
2. **Direct rows**: EXCLUDE closures (`restricted`), INCLUDE inversion (`restricted`), hides (`hidden`)
3. **Cascades** from the EXCLUDE closures and hides only
4. **Content rules**: INCLUDE admission and `restrictEmpty` for scenes, galleries and images
5. **Empty phase**, per instance: galleries with no visible image; performers, studios and groups with no visible content; tags attached to no visible scene, performer, studio, group, gallery or image and with no live child tag on the same instance. Skipped for admins

Every restriction-derived row carries a real `stashInstanceId`. When an entity qualifies twice, the first reason in that order is the one stored. Types AND together: content is hidden if any EXCLUDE or hide rule hits it, any INCLUDE rule does not admit it, or it is empty under `restrictEmpty`.

The rows are then written, taking the database's write lock once:

- **Fill**: the deduplicated rows go into the TEMP table `_peek_result` on the same connection, still without the lock.
- **Swap**: one short `BEGIN IMMEDIATE` on that connection, as one unit of the writer queue (`exclusions.swap`, see [Database writes](#database-writes)), deletes the user's rows and copies `_peek_result` in with one `INSERT OR IGNORE ... SELECT`. The delete keeps the `pending` rows a sync wrote after the snapshot began, so those holds survive. For a user with 180,000 rows the swap holds the lock about 0.7 s, where the old single transaction (delete, insert, stats) held it 3.3 s.

The Library counts on the stats page are not stored: `UserStatsAggregationService.getLibraryStats` counts each type per request from what the user can see (live entities on their allowed instances with no exclusion row for them, the same anti-join the lists use), so a recompute, a hide or an unhide shows in them at once.

Hiding an entity (`addHiddenEntity`) computes its rows the same way and merges them in (`INSERT OR IGNORE`), never overwriting a row already there.

---

## Why Queries Moved to SQL

The first implementation filtered in memory. Every list now filters, sorts and pages in SQL through the query builders (see [Query Builders](#query-builders)); the in-memory pipeline and its `USE_SQL_QUERY_BUILDER` switch were removed in 3.4. The problems it had are kept here for context.

### Problem: In-Memory Filtering Doesn't Scale

The in-memory pipeline loaded all entities into memory then filtered:

```
1. Load ALL scenes from cache
2. Filter in JavaScript (UserRestrictionService)
3. Filter empty entities (EmptyEntityFilterService)
4. Paginate
```

This worked for small collections but became a problem with:
- 10k+ scenes
- Multiple concurrent users
- Complex restriction rules

### Problem: Redundant Computation

Every request recomputed:
- Which entities are hidden for this user
- Which scenes match restriction rules
- Which organizational entities are now empty

`FilteredEntityCacheService` helped but was invalidated frequently.

### Problem: Pagination Breaks

To paginate correctly, a list needs the total count of visible items. The in-memory pipeline:
1. Load ALL items
2. Filter ALL items
3. Get count
4. Return page slice

This defeated the purpose of pagination for large collections.

---

## Pre-Computed Exclusions

### Core Concept

Instead of filtering at query time, Peek computes and stores each user's excluded entities. Every list, count and by-id lookup is an anti-join against that table:

```sql
-- Visible scenes for user 5, page 1 (the shape; the real statement is built by EntityQueryBuilder)
SELECT s.* FROM StashScene s
LEFT JOIN UserExcludedEntity e
  ON e.userId = 5
  AND e.entityType = 'scene'
  AND e.entityId = s.id
  AND (e.instanceId = '' OR e.instanceId = s.stashInstanceId)
WHERE e.id IS NULL  -- Not in exclusion list
  AND s.deletedAt IS NULL
ORDER BY s.stashCreatedAt DESC
LIMIT 25 OFFSET 0
```

### Schema

```prisma
model UserExcludedEntity {
  id         Int      @id @default(autoincrement())
  userId     Int
  entityType String   // 'scene', 'performer', 'studio', 'tag', 'group', 'gallery', 'image', 'clip'
  entityId   String   // Stash entity ID
  instanceId String   @default("") // Stash instance ID for multi-instance scoping

  reason     String   // 'restricted', 'hidden', 'cascade', 'empty' (and 'pending' while a sync waits)
  computedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, entityType, entityId, instanceId])
  @@index([userId, entityType])
  @@index([entityType, entityId])
  @@index([userId, entityType, reason])
}
```

`UserExcludedContentCount` holds, per user and card entity, how many of its linked items the user cannot see, so a card's count equals its tab's total (the swap rewrites it with the rows). Visible counts per type are not stored: they are counted per request (see [Processing Order](#processing-order)). A `UserEntityStats` table once held them; 3.4 dropped it.

### Key Design Decisions

**1. One table.** A single `UserExcludedEntity` table gives one anti-join for every query. The `reason` column says why a row exists, for the Hidden Items page and for debugging, never for query logic.

**2. How are IDs unique?** Stash entity IDs are integers per entity type, and two Stash servers can reuse the same ID. The unique key `(userId, entityType, entityId, instanceId)` holds one row per user, type, ID and server. A row with `instanceId = ''` covers that ID on every server.

**3. Store exclusions, not inclusions.** Most users see most content, so exclusions are the smaller set, and the join is a plain "no row" test.

**4. How to distinguish restricted and hidden?** The `reason` column, in the precedence order of [Processing Order](#processing-order):
- `'restricted'`: an admin's restriction hits this entity
- `'hidden'`: the user hid this entity (or a descendant or per-server copy of what they hid)
- `'cascade'`: hidden because a related entity is restricted or hidden
- `'empty'`: an organizational entity with no visible content
- `'pending'`: held out by a sync until that user's recompute decides (see below)

The Hidden Items page lists the stored `UserHiddenEntity` rows, and a `'hidden'` row marks an entity the user would see had they hidden nothing.

**5. When to recompute.**

| Event | Scope | Action |
|-------|-------|--------|
| Full sync | All users | `recomputeAllUsers` |
| Incremental or smart sync | Users whose instance scope holds a changed instance, plus users with `pending` rows | `recomputeUsersForInstances` |
| Admin changes a user's restrictions | One user | `saveRestrictions`: computes from the proposed rows and writes both tables in one swap |
| A user's role or instance selection changes, an instance is enabled, disabled or deleted | The users it touches | `recomputeForUser` or `recomputeUsers` |
| User hides an entity | One user | `addHiddenEntities`: computes the rows and merges them in, never overwriting a row already there |
| User unhides an entity | One user | `recomputeForUser`: the unhide can release cascades that other hides do not cover |
| Admin, manual | One user or all | `POST /api/exclusions/recompute/:userId`, `POST /api/exclusions/recompute-all`, `GET /api/exclusions/stats` |

Recomputes of one user coalesce: a request that arrives while one runs waits for a queued recompute that reads the newest state.

**Pending holds.** While a sync writes a batch, it adds a `pending` row for each changed entity of the batch, and for the content a changed tag, studio, group, gallery or tag set reaches, for every user who has restrictions or hidden items (`holdForRecompute`). It writes them in the batch's own transaction. The row excludes like any other until the user's recompute swaps it out, so a changed entity never shows to a user it may be restricted for in the seconds between the write and the recompute.

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
- Index lookup: O(log n), about 20 comparisons for 1M rows
- The join is efficient because all join columns are indexed
- SQLite's page cache keeps hot indexes in memory

**Potential bottlenecks:**

| Concern | Mitigation |
|---------|------------|
| Recompute time | One user at a time on the compute client; TEMP tables hold the sets, and the write is one short swap (see [Processing Order](#processing-order)) |
| COUNT queries | Count per request in SQL with the exclusion anti-join (`getLibraryStats`); nothing stored to keep current |
| Index memory | ~250MB for 5M rows is acceptable for modern servers |
| Many hides at once | A merge of more than 200,000 rows is written in several `exclusions.hide` units, so none holds the write lock past 1 s |

### Future Optimization: Table Splitting

If performance issues arise at 10M+ exclusion rows, consider splitting:
- `UserExcludedScene` and `UserExcludedImage`, the highest volume
- `UserExcludedEntity` for performers, studios, tags, groups, galleries and clips (lower volume)

Start with the single table; split only if actual performance issues occur.

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

#### Query Builders

Each entity type has a dedicated query builder that handles filtering, sorting, pagination, and exclusion JOINs. They extend one base, `services/query/EntityQueryBuilder.ts`, which builds the list and count statements from an entity spec (table, per-user joins, columns, tiebreak) and owns what every list shares: the `deletedAt` filter, the exclusion join with the instance, the allowed-instances filter (an empty list matches nothing), the `ids` filter as (id, instance) pairs, the random sort with its seed bound, and the joined `COUNT(*)`. The clause helpers in `utils/sqlClauses.ts` (`refClause`, `idClause`, `viaSceneClause`, `instanceClause`, `randomOrder`, `combine`) match every ref as an (id, instance) pair, inline up to `PAIR_INLINE_LIMIT` refs and through a materialized set above it; the same module holds the exclusion join and the per-field number, date, text and favorite clauses. Every builder is on the base.

**The request and its clauses.** A list request carries the page's flat `<entity>_filter` and, beside it, a `where` tree: the user's rows as a root of rows and groups, each group "all" or "any", one level deep, up to 20 rows and 5 groups (`shared/types/filters/tree.ts`, `server/utils/whereTree.ts`). A row names one field of the list's contract in `shared/types/filters`, and its criterion is parsed by that field's own schema, so the filter and the tree reach the builder as the same parsed criteria, refs as (id, instance) pairs. Each builder declares one function per field (`fieldClauses`) and a `searchClause`; the base builds one clause per field the filter carries, in the table's order, then the tree's clauses, then the search: `<base> AND <filter> AND <where> AND <search>`. The base conditions (the exclusion join, the allowed instances, `deletedAt`) are never inside the tree, so an "any" group can never OR with them. In an "any" group, rows on one field that each read "has any of" merge into one clause over all their values; in an "all" group a field may repeat, and each row is its own clause. A ref criterion's `excludes` become a clause of their own (EXCLUDES, to the same depth). Every CTE a clause adds is named from its row (`w<n>_<field>` in the tree), so two never collide.

**Hierarchy and inheritance.** `hierarchicalRefClause` expands a tag or studio filter to its descendants to the criterion's depth (the whole subtree for `-1`), per instance, and for scenes matches both the scene's own tag rows (`SceneTag`) and its inherited ones (`SceneInheritedTag`); INCLUDES_ALL is one clause per picked tag, each with that tag's own descendants. The favorite filters (`tag_favorite`, `studio_favorite`, `performer_favorite`) resolve the viewer's favorites, minus what the viewer's exclusions hide, and run through the same clauses with every sub-tag or sub-studio. See [Query behavior](../reference/entity-relationships.md#scene-tag-inheritance) for what a user sees.

**Dates.** Stash's created and updated times are stored as epoch milliseconds, as Prisma stores a date, and so is the viewer's last played time. A date filter on one of them (`buildInstantFilter`) reads a `YYYY-MM-DD` value as that day in the viewer's time zone (`X-Peek-Time-Zone`, "UTC" without one). Dates Stash holds as a day (a scene's date, a birthdate) are stored as `YYYY-MM-DD` text and compared as plain days.

A clip lists only while its scene does: the clip builder joins the scene, and the viewer's exclusions apply to the clip and to its scene.

| Query Builder | Entity |
|---------------|--------|
| `SceneQueryBuilder.ts` | Scenes |
| `PerformerQueryBuilder.ts` | Performers |
| `StudioQueryBuilder.ts` | Studios |
| `TagQueryBuilder.ts` | Tags |
| `GroupQueryBuilder.ts` | Groups |
| `GalleryQueryBuilder.ts` | Galleries |
| `ImageQueryBuilder.ts` | Images |
| `ClipQueryBuilder.ts` | Clips (scene markers) |

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
// The parsed request (utils/listRequest.ts) goes straight to the builder:
// filtering, sorting, pagination and the count run in SQL
const result = await sceneQueryBuilder.execute({
  userId,
  allowedInstanceIds,
  request, // ParsedListRequest<"scene">: filter, where tree, search, sort, page
  timeZone, // the viewer's zone, for date filters on instants
});

// Returns { items: Scene[], total: number | null }
// Already filtered by user exclusions, already paginated; total is null
// when the request says count: false (a page change)
```

This replaces the old pattern of loading all entities into memory and filtering in JavaScript.

### Scene list indexes

`StashScene` has a `(deletedAt, X)` index for each sort the scene list reads in index order, so the first page of a 200,000-scene library comes back without sorting every scene:

| Sort | Column | Index |
|------|--------|-------|
| Created at | `stashCreatedAt` | `StashScene_browse_idx` (`deletedAt`, `stashCreatedAt` DESC) |
| Updated at | `stashUpdatedAt` | `StashScene_browse_updated_idx` |
| Date | `date` | `StashScene_browse_date_idx` |
| Duration | `duration` | `StashScene_browse_duration_idx` |
| Title | `titleSort` | `StashScene_browse_titleSort_idx` (`deletedAt`, `titleSort`, `id`) |
| Performer count | `performerCount` | `StashScene_browse_performerCount_idx` |
| Tag count | `tagCount` | `StashScene_browse_tagCount_idx` |

Sync stores `titleSort`, `performerCount` and `tagCount`: each scene page writes them after the page's performer and tag links, in the same transaction (`refreshSceneDerivedColumns` in `StashSyncService.ts`). `titleSort` is the title the card shows (the title, else the file name without its extension), lower-cased for ASCII letters; the two counts are the scene's `ScenePerformer` and `SceneTag` rows, and the performer and tag count filters read them too. On a 207,000-scene copy the first page by title takes 1 ms instead of 0.5 s, and by performer or tag count 1 ms instead of 0.6 to 0.7 s. The per-user sorts (rating, plays, O count) and the random order still sort the filtered rows: about 0.4 s by rating at that size.

`server/scripts/db-bench/` builds such a copy from a Peek database and times each list query with its plan: see its README.

### Database writes

SQLite lets one connection write at a time. Peek orders its own writers in Node, in the writer queue `server/utils/dbWrite.ts`:

- Every transaction, every statement that writes many rows, and every single-row write on a user's path (ratings, favorites, O counts, plays, image views, hides, stats, playlists, restrictions) runs as one unit: `dbWrite(label, fn)`, `dbWriteTransaction(label, fn)` or `dbWriteBatch(label, [...])`. Units run one at a time, in arrival order. Lint rejects `prisma.$transaction` anywhere else.
- No unit holds the write lock longer than 1 s on a 200,000-scene library. Longer work is split: a sync writes each page of 500 in its own unit (about 0.1 s for scenes), a recompute swaps one user's rows at a time, and cleanups, purges and gallery inheritance write 500 to 5,000 rows a unit. So a user's rating waits behind at most one such unit. A unit that holds the lock longer logs `Database write held the lock` with its label.
- Reads never queue: under WAL a read does not wait for a writer.
- The single-row writes off those paths (settings, setup, auth and the like) stay outside the queue: SQLite makes each wait for the lock up to 5 s, which the 1 s bound keeps safe.

Why not let SQLite's busy timeout order the writers: Prisma's SQLite driver waits for the lock on the query engine's worker threads, one per CPU, and a handful of waiting writers leave the lock holder no thread to finish on, so they all time out together (32 of 40 simultaneous hides failed on a 16-CPU machine; through the queue all 40 succeed). The full rule, with nesting and retries, is in `.claude/rules/server-sql.md`, "Writes".

---

*Document Version: 3.4*
*Last Updated: 2026-10-03*
