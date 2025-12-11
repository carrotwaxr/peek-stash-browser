# SQLite Entity Cache Schema Design

**Related**: [cache-scalability-brainstorm.md](./cache-scalability-brainstorm.md)
**Date**: 2025-12-08

## Design Goals

1. **Scalability**: Support 100k+ scenes without memory issues
2. **Query Performance**: Fast filtering, sorting, pagination via SQL indexes
3. **Minimal Storage**: Store only what Peek needs for filtering/display
4. **Relationships**: Maintain scene↔performer, scene↔tag, etc. for filtering
5. **Sync Tracking**: Track what's synced, detect deletions, enable incremental updates

## Schema Design Decisions

### Decision 1: Normalized vs Denormalized

**Option A: Fully Normalized** (separate tables with junction tables)
```
CachedScene, CachedPerformer, ScenePerformer (junction), etc.
```
- Pros: Clean relationships, no data duplication
- Cons: Complex JOINs for every query, harder to paginate

**Option B: Denormalized with JSON** (store relationships as JSON)
```
CachedScene { performerIds: "[1,2,3]", tagIds: "[4,5,6]" }
```
- Pros: Simple queries, fast reads
- Cons: Can't filter by "scenes with performer X" efficiently

**Option C: Hybrid** (normalized + JSON for full data)
```
CachedScene { studioId, performerIds JSON, tagIds JSON, fullData JSON }
+ Junction tables for efficient filtering
```
- Pros: Best of both - efficient filtering AND full data access
- Cons: More storage, need to keep junction tables in sync

**Decision**: **Option C (Hybrid)** - We need both efficient filtering AND full entity data.

### Decision 2: What to Index

For scene filtering, we need to support:
- Filter by studio, performers, tags, groups
- Sort by date, rating, title, created_at, play_count, random
- Text search on title
- Date range queries

Indexes needed:
- `studioId` - Filter by studio
- `date` - Sort/filter by scene date
- `createdAt` - Sort by when added to Stash
- `rating100` - Sort by rating
- `title` - Text search (use SQLite FTS5 for full-text search)
- Junction table indexes for performer/tag/group filtering

### Decision 3: Soft Delete Strategy

When an entity is deleted from Stash:
1. Mark `deletedAt` timestamp in Peek
2. Don't show in browse results
3. Keep for 30 days (allows Peek data recovery if re-added)
4. Periodic cleanup job removes old deleted entities

## Proposed Schema

### Core Entity Tables

```prisma
// Cached scene from Stash
// Contains indexed fields for filtering + JSON blob for full data
model CachedScene {
  id            String    @id                    // Stash scene ID
  stashInstanceId String?                        // Which Stash server (for multi-instance)

  // === Indexed fields for filtering/sorting ===
  title         String?
  date          String?                          // YYYY-MM-DD format
  studioId      String?
  rating100     Int?
  duration      Int?                             // seconds
  organized     Boolean   @default(false)
  oCounter      Int       @default(0)
  playCount     Int       @default(0)

  // === Full entity data (JSON) ===
  // Contains: performers, tags, files, paths, streams, etc.
  // Transformed with proxy URLs at sync time
  data          String                           // JSON blob

  // === Sync metadata ===
  stashCreatedAt  DateTime?                      // created_at from Stash
  stashUpdatedAt  DateTime?                      // updated_at from Stash
  syncedAt        DateTime  @default(now())      // When Peek last synced this entity
  deletedAt       DateTime?                      // Soft delete timestamp

  // Relationships (for efficient filtering)
  performers    ScenePerformer[]
  tags          SceneTag[]
  groups        SceneGroup[]
  galleries     SceneGallery[]

  @@index([studioId])
  @@index([date])
  @@index([stashCreatedAt])
  @@index([rating100])
  @@index([duration])
  @@index([deletedAt])
  @@index([stashUpdatedAt])                      // For incremental sync
}

model CachedPerformer {
  id            String    @id                    // Stash performer ID
  stashInstanceId String?

  // === Indexed fields ===
  name          String
  gender        String?
  favorite      Boolean   @default(false)
  rating100     Int?
  sceneCount    Int       @default(0)
  imageCount    Int       @default(0)
  galleryCount  Int       @default(0)

  // === Full entity data ===
  data          String                           // JSON blob

  // === Sync metadata ===
  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  scenes        ScenePerformer[]

  @@index([name])
  @@index([gender])
  @@index([favorite])
  @@index([rating100])
  @@index([sceneCount])
  @@index([deletedAt])
  @@index([stashUpdatedAt])
}

model CachedStudio {
  id            String    @id                    // Stash studio ID
  stashInstanceId String?

  // === Indexed fields ===
  name          String
  parentId      String?                          // Parent studio ID
  favorite      Boolean   @default(false)
  rating100     Int?
  sceneCount    Int       @default(0)
  imageCount    Int       @default(0)
  galleryCount  Int       @default(0)

  // === Full entity data ===
  data          String                           // JSON blob

  // === Sync metadata ===
  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  scenes        CachedScene[]                    // Direct relation (not junction)

  @@index([name])
  @@index([parentId])
  @@index([favorite])
  @@index([rating100])
  @@index([sceneCount])
  @@index([deletedAt])
  @@index([stashUpdatedAt])
}

model CachedTag {
  id            String    @id                    // Stash tag ID
  stashInstanceId String?

  // === Indexed fields ===
  name          String
  favorite      Boolean   @default(false)
  sceneCount    Int       @default(0)

  // === Full entity data ===
  data          String                           // JSON blob

  // === Sync metadata ===
  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  scenes        SceneTag[]

  @@index([name])
  @@index([favorite])
  @@index([sceneCount])
  @@index([deletedAt])
  @@index([stashUpdatedAt])
}

model CachedGroup {
  id            String    @id                    // Stash group ID
  stashInstanceId String?

  // === Indexed fields ===
  name          String
  date          String?
  studioId      String?
  rating100     Int?
  duration      Int?
  sceneCount    Int       @default(0)

  // === Full entity data ===
  data          String                           // JSON blob

  // === Sync metadata ===
  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  scenes        SceneGroup[]

  @@index([name])
  @@index([date])
  @@index([studioId])
  @@index([rating100])
  @@index([sceneCount])
  @@index([deletedAt])
  @@index([stashUpdatedAt])
}

model CachedGallery {
  id            String    @id                    // Stash gallery ID
  stashInstanceId String?

  // === Indexed fields ===
  title         String?
  date          String?
  studioId      String?
  rating100     Int?
  imageCount    Int       @default(0)

  // === Full entity data ===
  data          String                           // JSON blob

  // === Sync metadata ===
  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  scenes        SceneGallery[]

  @@index([title])
  @@index([date])
  @@index([studioId])
  @@index([rating100])
  @@index([imageCount])
  @@index([deletedAt])
  @@index([stashUpdatedAt])
}
```

### Junction Tables (for efficient many-to-many filtering)

```prisma
model ScenePerformer {
  sceneId       String
  performerId   String

  scene         CachedScene     @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  performer     CachedPerformer @relation(fields: [performerId], references: [id], onDelete: Cascade)

  @@id([sceneId, performerId])
  @@index([performerId])                         // For "scenes with performer X" queries
}

model SceneTag {
  sceneId       String
  tagId         String

  scene         CachedScene     @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  tag           CachedTag       @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([sceneId, tagId])
  @@index([tagId])                               // For "scenes with tag X" queries
}

model SceneGroup {
  sceneId       String
  groupId       String
  sceneIndex    Int?                             // Position in group

  scene         CachedScene     @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  group         CachedGroup     @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@id([sceneId, groupId])
  @@index([groupId])
}

model SceneGallery {
  sceneId       String
  galleryId     String

  scene         CachedScene     @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  gallery       CachedGallery   @relation(fields: [galleryId], references: [id], onDelete: Cascade)

  @@id([sceneId, galleryId])
  @@index([galleryId])
}
```

### Sync Metadata Table

```prisma
// Tracks sync state per entity type
model SyncState {
  id              Int       @id @default(autoincrement())
  stashInstanceId String?
  entityType      String                         // 'scene', 'performer', etc.

  lastFullSync    DateTime?                      // Last complete sync
  lastIncrementalSync DateTime?                  // Last incremental sync
  lastSyncCount   Int       @default(0)          // Entities synced in last run
  lastSyncDuration Int?                          // Milliseconds
  lastError       String?                        // Error message if last sync failed

  @@unique([stashInstanceId, entityType])
}
```

## Query Patterns

### Pattern 1: Paginated Scene Browse

```sql
-- Get page 2 of scenes (50 per page), sorted by date DESC
-- With user restrictions applied (exclude hidden, apply tag restrictions)

SELECT s.id, s.data
FROM CachedScene s
WHERE s.deletedAt IS NULL
  AND s.id NOT IN (SELECT entityId FROM UserHiddenEntity WHERE userId = ? AND entityType = 'scene')
  AND s.studioId NOT IN (SELECT entityId FROM UserHiddenEntity WHERE userId = ? AND entityType = 'studio')
  -- User restriction: only scenes with tag "Favorite"
  AND EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.tagId IN (?))
ORDER BY s.date DESC
LIMIT 50 OFFSET 50;
```

### Pattern 2: Filter by Performer

```sql
-- Get all scenes featuring performer "123"
SELECT s.id, s.data
FROM CachedScene s
INNER JOIN ScenePerformer sp ON sp.sceneId = s.id
WHERE sp.performerId = '123'
  AND s.deletedAt IS NULL
ORDER BY s.date DESC;
```

### Pattern 3: Aggregation (Top Performers by Play Count)

```sql
-- Top 10 performers by user's play count
SELECT p.id, p.name, SUM(ups.playCount) as totalPlays
FROM CachedPerformer p
INNER JOIN UserPerformerStats ups ON ups.performerId = p.id
WHERE ups.userId = ?
  AND p.deletedAt IS NULL
GROUP BY p.id
ORDER BY totalPlays DESC
LIMIT 10;
```

## Storage Estimates

| Entity | Count | JSON Size | Indexed Fields | Total |
|--------|-------|-----------|----------------|-------|
| Scene | 100,000 | ~2KB | ~200B | ~220MB |
| Performer | 10,000 | ~500B | ~100B | ~6MB |
| Studio | 1,000 | ~300B | ~50B | ~350KB |
| Tag | 10,000 | ~200B | ~50B | ~2.5MB |
| Group | 5,000 | ~400B | ~100B | ~2.5MB |
| Gallery | 20,000 | ~400B | ~100B | ~10MB |
| **Total** | | | | **~240MB** |

Junction tables add ~10-20% overhead for relationships.

**Total estimated storage for 100k scene library: ~300MB**

## Migration Strategy

### Phase 1: Add Schema (Non-Breaking)
1. Add new Cached* tables via Prisma migration
2. Keep existing StashCacheManager working
3. Add new StashSyncService that populates SQLite

### Phase 2: Parallel Operation
1. Both in-memory cache and SQLite populated
2. Add feature flag to switch query source
3. Test performance and correctness

### Phase 3: Switch to SQLite
1. Update all 18+ dependent files to use SQLite queries
2. Remove in-memory cache
3. Delete StashCacheManager

### Phase 4: Cleanup
1. Remove FilteredEntityCacheService (SQLite replaces it)
2. Clean up old code paths
3. Performance tuning

## Resolved Questions

1. **Full-text search**: ✅ Use SQLite FTS5 for title/name search (see FTS5 section below)
2. **Performer tags**: TBD - defer until needed
3. **Image caching**: ✅ Yes, cache Images as separate entity (see CachedImage below)
4. **Multi-instance**: TBD - current design supports it via stashInstanceId

## FTS5 Full-Text Search

SQLite FTS5 provides fast, sophisticated text search with:
- Word stemming (searching "running" matches "run")
- Relevance ranking
- Prefix matching ("test*" matches "testing")
- Boolean operators (AND, OR, NOT)

### FTS5 Virtual Tables

```sql
-- Create FTS5 virtual table for scene search
CREATE VIRTUAL TABLE scene_fts USING fts5(
  id,
  title,
  details,
  content='CachedScene',
  content_rowid='rowid'
);

-- Create FTS5 virtual table for performer search
CREATE VIRTUAL TABLE performer_fts USING fts5(
  id,
  name,
  aliases,
  content='CachedPerformer',
  content_rowid='rowid'
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER scene_fts_insert AFTER INSERT ON CachedScene BEGIN
  INSERT INTO scene_fts(rowid, id, title, details)
  VALUES (new.rowid, new.id, new.title, json_extract(new.data, '$.details'));
END;

CREATE TRIGGER scene_fts_delete AFTER DELETE ON CachedScene BEGIN
  INSERT INTO scene_fts(scene_fts, rowid, id, title, details)
  VALUES ('delete', old.rowid, old.id, old.title, json_extract(old.data, '$.details'));
END;

CREATE TRIGGER scene_fts_update AFTER UPDATE ON CachedScene BEGIN
  INSERT INTO scene_fts(scene_fts, rowid, id, title, details)
  VALUES ('delete', old.rowid, old.id, old.title, json_extract(old.data, '$.details'));
  INSERT INTO scene_fts(rowid, id, title, details)
  VALUES (new.rowid, new.id, new.title, json_extract(new.data, '$.details'));
END;
```

### FTS5 Query Example

```sql
-- Search for scenes matching "blonde teacher"
SELECT s.id, s.data, rank
FROM scene_fts
INNER JOIN CachedScene s ON scene_fts.id = s.id
WHERE scene_fts MATCH 'blonde teacher'
  AND s.deletedAt IS NULL
ORDER BY rank
LIMIT 50;
```

Note: Prisma doesn't support FTS5 virtual tables directly. We'll create these via raw SQL migrations.

## CachedImage Entity

```prisma
model CachedImage {
  id            String    @id                    // Stash image ID
  stashInstanceId String?

  // === Indexed fields ===
  title         String?
  date          String?
  studioId      String?
  rating100     Int?
  oCounter      Int       @default(0)
  organized     Boolean   @default(false)

  // File info (for display)
  width         Int?
  height        Int?
  fileSize      Int?                             // bytes

  // === Full entity data ===
  data          String                           // JSON blob

  // === Sync metadata ===
  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  // Relationships
  performers    ImagePerformer[]
  tags          ImageTag[]
  galleries     ImageGallery[]

  @@index([studioId])
  @@index([date])
  @@index([rating100])
  @@index([deletedAt])
  @@index([stashUpdatedAt])
}

model ImagePerformer {
  imageId       String
  performerId   String

  image         CachedImage     @relation(fields: [imageId], references: [id], onDelete: Cascade)
  performer     CachedPerformer @relation(fields: [performerId], references: [id], onDelete: Cascade)

  @@id([imageId, performerId])
  @@index([performerId])
}

model ImageTag {
  imageId       String
  tagId         String

  image         CachedImage     @relation(fields: [imageId], references: [id], onDelete: Cascade)
  tag           CachedTag       @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([imageId, tagId])
  @@index([tagId])
}

model ImageGallery {
  imageId       String
  galleryId     String

  image         CachedImage     @relation(fields: [imageId], references: [id], onDelete: Cascade)
  gallery       CachedGallery   @relation(fields: [galleryId], references: [id], onDelete: Cascade)

  @@id([imageId, galleryId])
  @@index([galleryId])
}
```

Note: CachedPerformer and CachedTag need updated to include the new Image relations.

## Next Steps

1. Review this schema with stakeholder
2. Create Prisma migration
3. Implement StashSyncService
4. Create SQL query builders for each access pattern
5. Update controllers one by one
