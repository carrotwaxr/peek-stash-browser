# JSON Blob Elimination Plan

**Date**: 2025-12-09
**Status**: Planning
**Branch**: `feature/cache-scalability-investigation`
**Related**: [sqlite-cache-schema.md](./sqlite-cache-schema.md), [cache-scalability-plan.md](./cache-scalability-plan.md)

---

## Problem Statement

The current SQLite cache implementation stores entity data in a JSON blob column (`data`), which causes severe performance issues:

1. **Sync Performance**: ~100 scenes/minute = 3.6 hours for 22k scenes
2. **JSON Serialization**: Every upsert requires `JSON.stringify()` of large objects
3. **Junction Tables**: 4 DELETE + 4 INSERT operations per scene (performers, tags, groups, galleries)
4. **Query Overhead**: Every read requires `JSON.parse()` to access data

The JSON blob approach was chosen for simplicity but doesn't scale. We need a proper normalized schema.

### Additional Problem: Sync State Logic

The current startup sync logic only checks for scene sync state:

```typescript
// SyncScheduler.ts - performStartupSync()
const syncState = await prisma.syncState.findFirst({
  where: { entityType: "scene" },
});

const hasCompletedSync = syncState?.lastFullSync || syncState?.lastIncrementalSync;

if (!hasCompletedSync) {
  // Full sync triggered even though Studios, Tags, Performers etc may be complete
  await stashSyncService.fullSync();
}
```

**Issues**:
1. Only checks scene sync state - ignores other entity types
2. If scene sync fails/never completes, full sync is triggered every restart
3. Already-synced entities (Studios, Tags, Performers) are re-synced unnecessarily
4. Full sync doesn't use per-entity incremental logic

**Required Fix**: Each entity type should independently check its own sync state and skip if nothing changed since last sync.

---

## Solution: Eliminate JSON Blob

Store all consumed fields as individual database columns. Transform URLs at **read time** instead of storing transformed values.

### Key Insight: URL Transformation

Currently, `transformScene()` converts Stash URLs to proxy URLs at sync time and stores them in the JSON blob. This is wasteful because:

1. URLs contain the Stash host which may change
2. We're storing redundant data (full nested objects)
3. Transformation is a simple prefix replacement that can happen at read time

**New approach**: Store only Stash entity IDs. Transform URLs when constructing the response.

---

## Phase 1: Schema Redesign

### CachedScene - Expanded Columns

Replace JSON blob with explicit columns for all consumed fields:

```prisma
model CachedScene {
  id              String    @id
  stashInstanceId String?

  // === Core fields (already indexed) ===
  title           String?
  code            String?
  date            String?                   // YYYY-MM-DD
  studioId        String?
  rating100       Int?
  duration        Int?                      // seconds (from primary file)
  organized       Boolean   @default(false)

  // === New fields from JSON blob ===
  details         String?                   // Scene description (used in search)

  // Primary file metadata
  filePath        String?                   // Primary file path
  fileBitRate     Int?                      // bits/second
  fileFrameRate   Float?                    // fps
  fileWidth       Int?                      // pixels
  fileHeight      Int?                      // pixels
  fileVideoCodec  String?                   // e.g., "h264", "hevc"
  fileAudioCodec  String?                   // e.g., "aac", "ac3"
  fileSize        BigInt?                   // bytes (can be > 4GB)

  // Stash paths (raw, transformed at read time)
  pathScreenshot  String?                   // Screenshot URL path
  pathPreview     String?                   // Preview video path
  pathSprite      String?                   // Sprite sheet path
  pathVtt         String?                   // VTT chapter path
  pathChaptersVtt String?                   // Chapters VTT path
  pathStream      String?                   // Primary stream path
  pathCaption     String?                   // Caption path

  // Scene streams (JSON array - small, rarely changes)
  streams         String?                   // JSON: [{url, mime_type, label}]

  // Sync metadata
  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  // Junction table relations
  performers      ScenePerformer[]
  tags            SceneTag[]
  groups          SceneGroup[]
  galleries       SceneGallery[]

  @@index([studioId])
  @@index([date])
  @@index([stashCreatedAt])
  @@index([stashUpdatedAt])
  @@index([rating100])
  @@index([duration])
  @@index([deletedAt])
}
```

### CachedPerformer - Expanded Columns

```prisma
model CachedPerformer {
  id              String    @id
  stashInstanceId String?

  // === Core fields ===
  name            String
  disambiguation  String?
  gender          String?
  birthdate       String?
  favorite        Boolean   @default(false)
  rating100       Int?
  sceneCount      Int       @default(0)
  imageCount      Int       @default(0)
  galleryCount    Int       @default(0)

  // === New fields from JSON blob ===
  aliasList       String?                   // JSON array of aliases
  imagePath       String?                   // Raw image URL path
  details         String?                   // Biography

  // Additional performer metadata
  country         String?
  ethnicity       String?
  hairColor       String?
  eyeColor        String?
  height          Int?                      // cm
  weight          Int?                      // kg
  measurements    String?                   // e.g., "34D-24-34"
  tattoos         String?
  piercings       String?
  careerLength    String?
  deathDate       String?
  url             String?                   // Homepage

  // Sync metadata
  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  // Relations
  scenes          ScenePerformer[]
  images          ImagePerformer[]
  tags            PerformerTag[]            // NEW: performers can have tags

  @@index([name])
  @@index([gender])
  @@index([favorite])
  @@index([rating100])
  @@index([sceneCount])
  @@index([stashUpdatedAt])
  @@index([deletedAt])
}
```

### CachedStudio - Expanded Columns

```prisma
model CachedStudio {
  id              String    @id
  stashInstanceId String?

  // === Core fields ===
  name            String
  parentId        String?
  favorite        Boolean   @default(false)
  rating100       Int?
  sceneCount      Int       @default(0)
  imageCount      Int       @default(0)
  galleryCount    Int       @default(0)

  // === New fields ===
  details         String?                   // Studio description
  imagePath       String?                   // Raw logo URL path
  url             String?                   // Studio website

  // Sync metadata
  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  // Relations
  tags            StudioTag[]               // NEW: studios can have tags

  @@index([name])
  @@index([parentId])
  @@index([favorite])
  @@index([rating100])
  @@index([sceneCount])
  @@index([stashUpdatedAt])
  @@index([deletedAt])
}
```

### CachedTag - Expanded Columns

```prisma
model CachedTag {
  id              String    @id
  stashInstanceId String?

  // === Core fields ===
  name            String
  favorite        Boolean   @default(false)
  sceneCount      Int       @default(0)
  imageCount      Int       @default(0)

  // === New fields ===
  description     String?                   // Tag description
  imagePath       String?                   // Tag image URL path
  parentId        String?                   // Parent tag for hierarchy

  // Sync metadata
  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  // Relations
  scenes          SceneTag[]
  images          ImageTag[]
  performers      PerformerTag[]
  studios         StudioTag[]

  @@index([name])
  @@index([favorite])
  @@index([sceneCount])
  @@index([parentId])
  @@index([stashUpdatedAt])
  @@index([deletedAt])
}
```

### New Junction Tables

```prisma
// Performer tags (for tag filtering that includes performer tags)
model PerformerTag {
  performerId     String
  tagId           String
  performer       CachedPerformer @relation(fields: [performerId], references: [id], onDelete: Cascade)
  tag             CachedTag       @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([performerId, tagId])
  @@index([tagId])
}

// Studio tags
model StudioTag {
  studioId        String
  tagId           String
  studio          CachedStudio    @relation(fields: [studioId], references: [id], onDelete: Cascade)
  tag             CachedTag       @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([studioId, tagId])
  @@index([tagId])
}
```

---

## Phase 2: Sync Optimization

### Strategy 1: Batch Upserts with Raw SQL

Replace Prisma individual upserts with bulk raw SQL:

```typescript
private async processScenesBatchOptimized(
  scenes: Scene[],
  stashInstanceId: string | undefined
): Promise<void> {
  // Build batch INSERT...ON CONFLICT statement
  const values = scenes.map(scene => {
    const file = scene.files?.[0];
    const paths = scene.paths;

    return `(
      '${scene.id}',
      ${stashInstanceId ? `'${stashInstanceId}'` : 'NULL'},
      ${escape(scene.title)},
      ${escape(scene.code)},
      ${escape(scene.date)},
      ${scene.studio?.id ? `'${scene.studio.id}'` : 'NULL'},
      ${scene.rating100 ?? 'NULL'},
      ${file?.duration ? Math.round(file.duration) : 'NULL'},
      ${scene.organized ? 1 : 0},
      ${escape(scene.details)},
      ${escape(file?.path)},
      ${file?.bit_rate ?? 'NULL'},
      ${file?.frame_rate ?? 'NULL'},
      ${file?.width ?? 'NULL'},
      ${file?.height ?? 'NULL'},
      ${escape(file?.video_codec)},
      ${escape(file?.audio_codec)},
      ${file?.size ?? 'NULL'},
      ${escape(paths?.screenshot)},
      ${escape(paths?.preview)},
      ${escape(paths?.sprite)},
      ${escape(paths?.vtt)},
      ${escape(paths?.chapters_vtt)},
      ${escape(paths?.stream)},
      ${escape(paths?.caption)},
      ${escape(JSON.stringify(scene.sceneStreams || []))},
      ${scene.created_at ? `'${scene.created_at}'` : 'NULL'},
      ${scene.updated_at ? `'${scene.updated_at}'` : 'NULL'},
      datetime('now'),
      NULL
    )`;
  }).join(',\n');

  await prisma.$executeRawUnsafe(`
    INSERT INTO CachedScene (
      id, stashInstanceId, title, code, date, studioId, rating100, duration,
      organized, details, filePath, fileBitRate, fileFrameRate, fileWidth,
      fileHeight, fileVideoCodec, fileAudioCodec, fileSize, pathScreenshot,
      pathPreview, pathSprite, pathVtt, pathChaptersVtt, pathStream, pathCaption,
      streams, stashCreatedAt, stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      code = excluded.code,
      date = excluded.date,
      studioId = excluded.studioId,
      rating100 = excluded.rating100,
      duration = excluded.duration,
      organized = excluded.organized,
      details = excluded.details,
      filePath = excluded.filePath,
      fileBitRate = excluded.fileBitRate,
      fileFrameRate = excluded.fileFrameRate,
      fileWidth = excluded.fileWidth,
      fileHeight = excluded.fileHeight,
      fileVideoCodec = excluded.fileVideoCodec,
      fileAudioCodec = excluded.fileAudioCodec,
      fileSize = excluded.fileSize,
      pathScreenshot = excluded.pathScreenshot,
      pathPreview = excluded.pathPreview,
      pathSprite = excluded.pathSprite,
      pathVtt = excluded.pathVtt,
      pathChaptersVtt = excluded.pathChaptersVtt,
      pathStream = excluded.pathStream,
      pathCaption = excluded.pathCaption,
      streams = excluded.streams,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);
}
```

### Strategy 2: Batch Junction Table Operations

Instead of per-scene DELETE + INSERT, batch by page:

```typescript
private async syncSceneJunctionTablesOptimized(
  scenes: Scene[]
): Promise<void> {
  const sceneIds = scenes.map(s => s.id);

  // Single DELETE per junction table for entire batch
  await Promise.all([
    prisma.$executeRawUnsafe(
      `DELETE FROM ScenePerformer WHERE sceneId IN (${sceneIds.map(id => `'${id}'`).join(',')})`
    ),
    prisma.$executeRawUnsafe(
      `DELETE FROM SceneTag WHERE sceneId IN (${sceneIds.map(id => `'${id}'`).join(',')})`
    ),
    prisma.$executeRawUnsafe(
      `DELETE FROM SceneGroup WHERE sceneId IN (${sceneIds.map(id => `'${id}'`).join(',')})`
    ),
    prisma.$executeRawUnsafe(
      `DELETE FROM SceneGallery WHERE sceneId IN (${sceneIds.map(id => `'${id}'`).join(',')})`
    ),
  ]);

  // Collect all junction records
  const performerRecords: string[] = [];
  const tagRecords: string[] = [];
  const groupRecords: string[] = [];
  const galleryRecords: string[] = [];

  for (const scene of scenes) {
    for (const p of scene.performers || []) {
      performerRecords.push(`('${scene.id}', '${p.id}')`);
    }
    for (const t of scene.tags || []) {
      tagRecords.push(`('${scene.id}', '${t.id}')`);
    }
    for (const g of scene.groups || []) {
      const index = g.scene_index ?? 'NULL';
      groupRecords.push(`('${scene.id}', '${g.id}', ${index})`);
    }
    for (const g of scene.galleries || []) {
      galleryRecords.push(`('${scene.id}', '${g.id}')`);
    }
  }

  // Single INSERT per junction table
  const inserts = [];

  if (performerRecords.length > 0) {
    inserts.push(prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO ScenePerformer (sceneId, performerId) VALUES ${performerRecords.join(',')}`
    ));
  }
  if (tagRecords.length > 0) {
    inserts.push(prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO SceneTag (sceneId, tagId) VALUES ${tagRecords.join(',')}`
    ));
  }
  if (groupRecords.length > 0) {
    inserts.push(prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO SceneGroup (sceneId, groupId, sceneIndex) VALUES ${groupRecords.join(',')}`
    ));
  }
  if (galleryRecords.length > 0) {
    inserts.push(prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO SceneGallery (sceneId, galleryId) VALUES ${galleryRecords.join(',')}`
    ));
  }

  await Promise.all(inserts);
}
```

### Expected Performance Improvement

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Scene upsert | 1 Prisma call/scene | 1 SQL/batch | 100x fewer calls |
| JSON.stringify | Every scene | None | Eliminated |
| Junction deletes | 4 calls/scene | 4 calls/batch | 100x fewer calls |
| Junction inserts | 4 calls/scene | 4 calls/batch | 100x fewer calls |
| **Total per batch** | ~500 DB calls | ~9 DB calls | **55x reduction** |

With 100 scenes per batch:
- Before: 500+ Prisma operations
- After: 9 raw SQL operations

**Projected sync time for 22k scenes: ~4-6 minutes instead of 3.6 hours**

---

## Phase 2.5: Fix Sync State Logic (PRIORITY)

This should be implemented **before** the JSON blob elimination to prevent unnecessary re-syncing.

### Problem

Current `performStartupSync()` only checks scene sync state:
- If scenes never completed, ALL entity types are re-synced from scratch
- Studios, Tags, Performers that already synced are re-fetched needlessly

### Solution: Smart Per-Entity Sync

Each entity type should:
1. Check its own SyncState record
2. Query Stash for count of entities updated since last sync
3. Skip if nothing changed (count = 0)
4. Only fetch changed entities if count > 0

### Implementation

```typescript
// SyncScheduler.ts
private async performStartupSync(): Promise<void> {
  // Check sync state for ALL entity types, not just scenes
  const syncStates = await prisma.syncState.findMany();
  const syncStateMap = new Map(syncStates.map(s => [s.entityType, s]));

  // If ANY entity type has a completed sync, use incremental for all
  const hasAnySync = syncStates.some(s => s.lastFullSync || s.lastIncrementalSync);

  if (!hasAnySync) {
    logger.info("No previous sync found for any entity, performing full sync");
    await stashSyncService.fullSync();
    return;
  }

  // Smart incremental sync - checks each entity independently
  logger.info("Performing smart incremental sync on startup");
  await stashSyncService.smartIncrementalSync();
}

// StashSyncService.ts
async smartIncrementalSync(stashInstanceId?: string): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  // Each entity type checks independently
  for (const entityType of ['studio', 'tag', 'performer', 'group', 'gallery', 'scene', 'image']) {
    const syncState = await this.getSyncState(stashInstanceId, entityType);
    const lastSync = syncState?.lastFullSync || syncState?.lastIncrementalSync;

    if (!lastSync) {
      // Never synced this entity type - do full sync for just this type
      logger.info(`No sync state for ${entityType}, performing full sync`);
      const result = await this.syncEntityType(entityType, stashInstanceId, true);
      results.push(result);
    } else {
      // Check if anything changed since last sync
      const changeCount = await this.getChangeCount(entityType, lastSync);

      if (changeCount === 0) {
        logger.info(`${entityType}: No changes since ${lastSync.toISOString()}, skipping`);
        results.push({
          entityType,
          synced: 0,
          deleted: 0,
          durationMs: 0,
        });
      } else {
        logger.info(`${entityType}: ${changeCount} changes since ${lastSync.toISOString()}`);
        const result = await this.syncEntityType(entityType, stashInstanceId, false, lastSync);
        results.push(result);
      }
    }
  }

  return results;
}

private async getChangeCount(entityType: string, since: Date): Promise<number> {
  const stash = stashInstanceManager.getDefault();
  const filter = {
    updated_at: { modifier: "GREATER_THAN", value: since.toISOString() }
  };

  switch (entityType) {
    case 'scene':
      const sceneResult = await stash.findScenesCompact({
        filter: { page: 1, per_page: 0 }, // Only get count, no data
        scene_filter: filter,
      });
      return sceneResult.findScenes.count;

    case 'performer':
      const performerResult = await stash.findPerformersCompact({
        filter: { page: 1, per_page: 0 },
        performer_filter: filter,
      });
      return performerResult.findPerformers.count;

    // Similar for other entity types...
  }
}
```

### Benefits

1. **Restart resilience**: If scene sync fails, other entities don't re-sync
2. **Fast startup**: Entities with no changes skip API calls entirely
3. **Incremental always**: Even "full sync" uses per-entity incremental when possible
4. **Progress visibility**: Each entity type reports its own status

### Test Scenario

After implementing:
1. Run full sync to completion (or partial - doesn't matter)
2. Restart server
3. Expected: "Studios: No changes since X, skipping" for already-synced types
4. Only entities that never completed or have changes get synced

---

## Phase 3: Query Layer Updates

### CachedEntityQueryService Changes

Replace JSON parsing with direct column access and URL transformation:

```typescript
class CachedEntityQueryService {
  private transformSceneUrls(scene: CachedScene): NormalizedScene {
    const baseUrl = this.getStashProxyBaseUrl();

    return {
      id: scene.id,
      title: scene.title,
      code: scene.code,
      date: scene.date,
      details: scene.details,
      rating100: scene.rating100,
      organized: scene.organized,

      // File metadata
      files: scene.filePath ? [{
        path: scene.filePath,
        duration: scene.duration,
        bit_rate: scene.fileBitRate,
        frame_rate: scene.fileFrameRate,
        width: scene.fileWidth,
        height: scene.fileHeight,
        video_codec: scene.fileVideoCodec,
        audio_codec: scene.fileAudioCodec,
        size: scene.fileSize,
      }] : [],

      // Transformed URLs
      paths: {
        screenshot: this.transformUrl(scene.pathScreenshot),
        preview: this.transformUrl(scene.pathPreview),
        sprite: this.transformUrl(scene.pathSprite),
        vtt: this.transformUrl(scene.pathVtt),
        chapters_vtt: this.transformUrl(scene.pathChaptersVtt),
        stream: this.transformUrl(scene.pathStream),
        caption: this.transformUrl(scene.pathCaption),
      },

      // Parse streams JSON (small, rarely changes)
      sceneStreams: scene.streams
        ? JSON.parse(scene.streams).map(s => ({
            ...s,
            url: this.transformUrl(s.url),
          }))
        : [],

      // Nested entities loaded separately
      studio: null,      // Loaded via JOIN or separate query
      performers: [],    // Loaded via junction table
      tags: [],          // Loaded via junction table
      groups: [],        // Loaded via junction table
      galleries: [],     // Loaded via junction table

      // Timestamps
      created_at: scene.stashCreatedAt?.toISOString(),
      updated_at: scene.stashUpdatedAt?.toISOString(),
    };
  }

  private transformUrl(path: string | null): string | null {
    if (!path) return null;
    // Replace Stash host with proxy prefix
    return `/api/proxy/stash${path}`;
  }
}
```

### Loading Nested Entities

For detail views that need performers/tags, use efficient batch loading:

```typescript
async getSceneWithRelations(id: string): Promise<NormalizedScene | null> {
  const scene = await prisma.cachedScene.findFirst({
    where: { id, deletedAt: null },
    include: {
      performers: {
        include: { performer: true }
      },
      tags: {
        include: { tag: true }
      },
      groups: {
        include: { group: true }
      },
      galleries: {
        include: { gallery: true }
      },
    },
  });

  if (!scene) return null;

  const transformed = this.transformSceneUrls(scene);

  // Add nested entities
  transformed.performers = scene.performers.map(sp =>
    this.transformPerformerUrls(sp.performer)
  );
  transformed.tags = scene.tags.map(st =>
    this.transformTagUrls(st.tag)
  );
  transformed.groups = scene.groups.map(sg => ({
    ...this.transformGroupUrls(sg.group),
    scene_index: sg.sceneIndex,
  }));
  transformed.studio = scene.studioId
    ? await this.getStudio(scene.studioId)
    : null;

  return transformed;
}
```

---

## Phase 4: Migration Path

### Step 1: Add New Columns (Non-Breaking)

Add new columns to existing schema without removing `data` column yet.

### Step 2: Dual-Write During Sync

Update sync to write both JSON blob AND individual columns. This allows rollback.

### Step 3: Update Query Service

Switch CachedEntityQueryService to read from columns instead of JSON.

### Step 4: Remove JSON Blob

After validation, remove `data` column from schema.

### Step 5: Optimize Sync

Remove JSON.stringify, implement batch operations.

---

## Testing Plan

1. **Sync Performance Test**: Time full sync with 22k scenes
   - Target: < 10 minutes (vs current 3.6 hours)

2. **Query Performance Test**: Measure browse page response time
   - Target: < 100ms for paginated results

3. **Memory Test**: Monitor memory during sync
   - Target: < 500MB peak usage

4. **Data Integrity Test**: Compare output before/after migration
   - All scenes should have same field values

---

## Rollback Plan

If issues arise:
1. Re-enable JSON blob writing
2. Switch query service back to JSON parsing
3. Performance will degrade but functionality preserved

---

## Files to Modify

### Schema
- `server/prisma/schema.prisma` - Add new columns

### Sync Service
- `server/services/StashSyncService.ts` - Batch operations, remove JSON

### Query Service
- `server/services/CachedEntityQueryService.ts` - Direct column access

### Transformation
- `server/utils/pathMapping.ts` - Move URL transformation to query time

### Types
- `server/types/index.ts` - Update NormalizedScene type if needed

---

## Summary

**Root Cause**: JSON blob storage creates O(n) serialization overhead and prevents SQL query optimization.

**Solution**:
1. Store all fields as individual columns
2. Transform URLs at read time (not sync time)
3. Use batch SQL operations for sync
4. Reduce DB operations from ~500/batch to ~9/batch

**Expected Result**: Sync time reduced from 3.6 hours to ~5 minutes for 22k scenes.
