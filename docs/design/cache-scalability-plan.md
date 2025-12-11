# SQLite Entity Cache Implementation Plan

**Issue**: #135, #160 - Cache fails on large libraries (24k-104k scenes)
**Design Docs**: [cache-scalability-brainstorm.md](./cache-scalability-brainstorm.md), [sqlite-cache-schema.md](./sqlite-cache-schema.md)
**Branch**: `feature/cache-scalability-investigation`

---

## Overview

Replace the in-memory `StashCacheManager` with a SQLite-backed entity cache that:
- Syncs Stash entities to local database using paginated fetches
- Queries via Prisma instead of in-memory Maps
- Supports incremental sync via `updated_at` timestamps
- Scales to 100k+ scenes without memory issues

---

## Phase 1: Database Schema

### Task 1.1: Add Cached Entity Tables to Prisma Schema

**File**: `server/prisma/schema.prisma`

Add the following models after existing models:

```prisma
// ============================================================================
// CACHED STASH ENTITIES
// These tables store synced data from Stash for scalable querying
// ============================================================================

model CachedScene {
  id              String    @id                    // Stash scene ID
  stashInstanceId String?                          // Which Stash server

  // Indexed fields for filtering/sorting
  title           String?
  code            String?
  date            String?                          // YYYY-MM-DD
  studioId        String?
  rating100       Int?
  duration        Int?                             // seconds (from file)
  organized       Boolean   @default(false)

  // Full entity data as JSON (performers, tags, files, paths, streams, etc.)
  data            String                           // JSON blob

  // Sync metadata
  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?                        // Soft delete

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

model CachedPerformer {
  id              String    @id
  stashInstanceId String?

  name            String
  disambiguation  String?
  gender          String?
  birthdate       String?
  favorite        Boolean   @default(false)
  rating100       Int?
  sceneCount      Int       @default(0)
  imageCount      Int       @default(0)
  galleryCount    Int       @default(0)

  data            String

  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  scenes          ScenePerformer[]
  images          ImagePerformer[]

  @@index([name])
  @@index([gender])
  @@index([favorite])
  @@index([rating100])
  @@index([sceneCount])
  @@index([stashUpdatedAt])
  @@index([deletedAt])
}

model CachedStudio {
  id              String    @id
  stashInstanceId String?

  name            String
  parentId        String?
  favorite        Boolean   @default(false)
  rating100       Int?
  sceneCount      Int       @default(0)
  imageCount      Int       @default(0)
  galleryCount    Int       @default(0)

  data            String

  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  @@index([name])
  @@index([parentId])
  @@index([favorite])
  @@index([rating100])
  @@index([sceneCount])
  @@index([stashUpdatedAt])
  @@index([deletedAt])
}

model CachedTag {
  id              String    @id
  stashInstanceId String?

  name            String
  favorite        Boolean   @default(false)
  sceneCount      Int       @default(0)
  imageCount      Int       @default(0)

  data            String

  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  scenes          SceneTag[]
  images          ImageTag[]

  @@index([name])
  @@index([favorite])
  @@index([sceneCount])
  @@index([stashUpdatedAt])
  @@index([deletedAt])
}

model CachedGroup {
  id              String    @id
  stashInstanceId String?

  name            String
  date            String?
  studioId        String?
  rating100       Int?
  duration        Int?
  sceneCount      Int       @default(0)

  data            String

  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  scenes          SceneGroup[]

  @@index([name])
  @@index([date])
  @@index([studioId])
  @@index([rating100])
  @@index([sceneCount])
  @@index([stashUpdatedAt])
  @@index([deletedAt])
}

model CachedGallery {
  id              String    @id
  stashInstanceId String?

  title           String?
  date            String?
  studioId        String?
  rating100       Int?
  imageCount      Int       @default(0)

  data            String

  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  scenes          SceneGallery[]
  images          ImageGallery[]

  @@index([title])
  @@index([date])
  @@index([studioId])
  @@index([rating100])
  @@index([imageCount])
  @@index([stashUpdatedAt])
  @@index([deletedAt])
}

model CachedImage {
  id              String    @id
  stashInstanceId String?

  title           String?
  date            String?
  studioId        String?
  rating100       Int?
  oCounter        Int       @default(0)
  organized       Boolean   @default(false)
  width           Int?
  height          Int?
  fileSize        Int?

  data            String

  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  performers      ImagePerformer[]
  tags            ImageTag[]
  galleries       ImageGallery[]

  @@index([studioId])
  @@index([date])
  @@index([rating100])
  @@index([stashUpdatedAt])
  @@index([deletedAt])
}

// Junction tables for efficient many-to-many queries

model ScenePerformer {
  sceneId         String
  performerId     String
  scene           CachedScene     @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  performer       CachedPerformer @relation(fields: [performerId], references: [id], onDelete: Cascade)

  @@id([sceneId, performerId])
  @@index([performerId])
}

model SceneTag {
  sceneId         String
  tagId           String
  scene           CachedScene     @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  tag             CachedTag       @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([sceneId, tagId])
  @@index([tagId])
}

model SceneGroup {
  sceneId         String
  groupId         String
  sceneIndex      Int?
  scene           CachedScene     @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  group           CachedGroup     @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@id([sceneId, groupId])
  @@index([groupId])
}

model SceneGallery {
  sceneId         String
  galleryId       String
  scene           CachedScene     @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  gallery         CachedGallery   @relation(fields: [galleryId], references: [id], onDelete: Cascade)

  @@id([sceneId, galleryId])
  @@index([galleryId])
}

model ImagePerformer {
  imageId         String
  performerId     String
  image           CachedImage     @relation(fields: [imageId], references: [id], onDelete: Cascade)
  performer       CachedPerformer @relation(fields: [performerId], references: [id], onDelete: Cascade)

  @@id([imageId, performerId])
  @@index([performerId])
}

model ImageTag {
  imageId         String
  tagId           String
  image           CachedImage     @relation(fields: [imageId], references: [id], onDelete: Cascade)
  tag             CachedTag       @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([imageId, tagId])
  @@index([tagId])
}

model ImageGallery {
  imageId         String
  galleryId       String
  image           CachedImage     @relation(fields: [imageId], references: [id], onDelete: Cascade)
  gallery         CachedGallery   @relation(fields: [galleryId], references: [id], onDelete: Cascade)

  @@id([imageId, galleryId])
  @@index([galleryId])
}

// Sync state tracking per entity type
model SyncState {
  id                    Int       @id @default(autoincrement())
  stashInstanceId       String?
  entityType            String                     // 'scene', 'performer', etc.

  lastFullSync          DateTime?
  lastIncrementalSync   DateTime?
  lastSyncCount         Int       @default(0)
  lastSyncDurationMs    Int?
  lastError             String?
  totalEntities         Int       @default(0)

  @@unique([stashInstanceId, entityType])
}

// Sync settings (admin configurable)
model SyncSettings {
  id                    Int       @id @default(1)  // Singleton
  syncIntervalMinutes   Int       @default(60)     // Default 60 min (current behavior)
  enableScanSubscription Boolean  @default(true)   // Subscribe to scanCompleteSubscribe
  enablePluginWebhook   Boolean   @default(false)  // Accept webhook from Stash plugin

  updatedAt             DateTime  @updatedAt
}
```

**Verification**: Run `npx prisma validate` to ensure schema is valid.

---

### Task 1.2: Create Prisma Migration

**Commands**:
```bash
cd server
npx prisma migrate dev --name add_cached_entities
```

This creates the migration file and applies it to the development database.

**Verification**: Check that `server/prisma/migrations/*_add_cached_entities/migration.sql` exists.

---

### Task 1.3: Add FTS5 Full-Text Search via Raw SQL Migration

**File**: Create `server/prisma/migrations/YYYYMMDDHHMMSS_add_fts5_search/migration.sql` manually

```sql
-- Create FTS5 virtual tables for full-text search
-- Note: These are created via raw SQL because Prisma doesn't support virtual tables

CREATE VIRTUAL TABLE IF NOT EXISTS scene_fts USING fts5(
  id UNINDEXED,
  title,
  details,
  code
);

CREATE VIRTUAL TABLE IF NOT EXISTS performer_fts USING fts5(
  id UNINDEXED,
  name,
  aliases
);

CREATE VIRTUAL TABLE IF NOT EXISTS studio_fts USING fts5(
  id UNINDEXED,
  name
);

CREATE VIRTUAL TABLE IF NOT EXISTS tag_fts USING fts5(
  id UNINDEXED,
  name
);

-- Triggers to keep FTS in sync with main tables

CREATE TRIGGER IF NOT EXISTS scene_fts_insert AFTER INSERT ON CachedScene BEGIN
  INSERT INTO scene_fts(id, title, details, code)
  VALUES (new.id, new.title, json_extract(new.data, '$.details'), new.code);
END;

CREATE TRIGGER IF NOT EXISTS scene_fts_update AFTER UPDATE ON CachedScene BEGIN
  DELETE FROM scene_fts WHERE id = old.id;
  INSERT INTO scene_fts(id, title, details, code)
  VALUES (new.id, new.title, json_extract(new.data, '$.details'), new.code);
END;

CREATE TRIGGER IF NOT EXISTS scene_fts_delete AFTER DELETE ON CachedScene BEGIN
  DELETE FROM scene_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS performer_fts_insert AFTER INSERT ON CachedPerformer BEGIN
  INSERT INTO performer_fts(id, name, aliases)
  VALUES (new.id, new.name, json_extract(new.data, '$.aliases'));
END;

CREATE TRIGGER IF NOT EXISTS performer_fts_update AFTER UPDATE ON CachedPerformer BEGIN
  DELETE FROM performer_fts WHERE id = old.id;
  INSERT INTO performer_fts(id, name, aliases)
  VALUES (new.id, new.name, json_extract(new.data, '$.aliases'));
END;

CREATE TRIGGER IF NOT EXISTS performer_fts_delete AFTER DELETE ON CachedPerformer BEGIN
  DELETE FROM performer_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS studio_fts_insert AFTER INSERT ON CachedStudio BEGIN
  INSERT INTO studio_fts(id, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER IF NOT EXISTS studio_fts_update AFTER UPDATE ON CachedStudio BEGIN
  DELETE FROM studio_fts WHERE id = old.id;
  INSERT INTO studio_fts(id, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER IF NOT EXISTS studio_fts_delete AFTER DELETE ON CachedStudio BEGIN
  DELETE FROM studio_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS tag_fts_insert AFTER INSERT ON CachedTag BEGIN
  INSERT INTO tag_fts(id, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER IF NOT EXISTS tag_fts_update AFTER UPDATE ON CachedTag BEGIN
  DELETE FROM tag_fts WHERE id = old.id;
  INSERT INTO tag_fts(id, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER IF NOT EXISTS tag_fts_delete AFTER DELETE ON CachedTag BEGIN
  DELETE FROM tag_fts WHERE id = old.id;
END;
```

**Verification**: Run `npx prisma migrate deploy` and verify FTS tables exist in database.

---

## Phase 2: Sync Service

### Task 2.1: Create StashSyncService

**File**: `server/services/StashSyncService.ts`

This service handles all sync operations between Stash and the local SQLite cache.

**Key responsibilities**:
1. **Full sync**: Paginated fetch of all entities (5000 per batch)
2. **Incremental sync**: Fetch only entities where `updated_at > lastSyncTime`
3. **Deletion detection**: Mark entities as deleted if not in Stash response
4. **Junction table management**: Keep scene↔performer, scene↔tag, etc. in sync
5. **Progress reporting**: Emit events for UI progress display

**Implementation outline**:

```typescript
// server/services/StashSyncService.ts

import { PrismaClient } from '@prisma/client';
import { stashInstanceManager } from './StashInstanceManager.js';
import { transformScene, transformPerformer, /* etc */ } from '../utils/pathMapping.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

interface SyncProgress {
  entityType: string;
  phase: 'fetching' | 'processing' | 'complete' | 'error';
  current: number;
  total: number;
  message?: string;
}

class StashSyncService extends EventEmitter {
  private prisma: PrismaClient;
  private syncInProgress = false;
  private readonly PAGE_SIZE = 5000;

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
  }

  /**
   * Full sync - fetches all entities from Stash
   * Used on first run or when incremental sync fails
   */
  async fullSync(stashInstanceId?: string): Promise<void> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    this.syncInProgress = true;
    const startTime = Date.now();

    try {
      // Sync each entity type in order (dependencies first)
      await this.syncStudios(stashInstanceId, true);
      await this.syncTags(stashInstanceId, true);
      await this.syncPerformers(stashInstanceId, true);
      await this.syncGroups(stashInstanceId, true);
      await this.syncGalleries(stashInstanceId, true);
      await this.syncScenes(stashInstanceId, true);
      await this.syncImages(stashInstanceId, true);

      // Update sync state
      await this.updateSyncState(stashInstanceId, 'full', Date.now() - startTime);

      logger.info('Full sync completed', { durationMs: Date.now() - startTime });
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Incremental sync - fetches only changed entities
   */
  async incrementalSync(stashInstanceId?: string): Promise<void> {
    if (this.syncInProgress) {
      logger.warn('Sync already in progress, skipping');
      return;
    }

    this.syncInProgress = true;
    const startTime = Date.now();

    try {
      const lastSync = await this.getLastSyncTime(stashInstanceId);

      if (!lastSync) {
        logger.info('No previous sync found, performing full sync');
        await this.fullSync(stashInstanceId);
        return;
      }

      // Sync each entity type (only changed)
      await this.syncStudios(stashInstanceId, false, lastSync);
      await this.syncTags(stashInstanceId, false, lastSync);
      await this.syncPerformers(stashInstanceId, false, lastSync);
      await this.syncGroups(stashInstanceId, false, lastSync);
      await this.syncGalleries(stashInstanceId, false, lastSync);
      await this.syncScenes(stashInstanceId, false, lastSync);
      await this.syncImages(stashInstanceId, false, lastSync);

      // Update sync state
      await this.updateSyncState(stashInstanceId, 'incremental', Date.now() - startTime);

      logger.info('Incremental sync completed', { durationMs: Date.now() - startTime });
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync scenes with pagination
   */
  private async syncScenes(
    stashInstanceId: string | undefined,
    isFullSync: boolean,
    lastSyncTime?: Date
  ): Promise<void> {
    const stash = stashInstanceManager.getDefault();
    let page = 1;
    let totalSynced = 0;

    this.emit('progress', {
      entityType: 'scene',
      phase: 'fetching',
      current: 0,
      total: 0,
    } as SyncProgress);

    while (true) {
      // Build filter for incremental sync
      const filter = lastSyncTime ? {
        updated_at: { modifier: 'GREATER_THAN', value: lastSyncTime.toISOString() }
      } : undefined;

      const result = await stash.findScenesCompact({
        filter: { page, per_page: this.PAGE_SIZE },
        scene_filter: filter,
      });

      const scenes = result.findScenes.scenes;
      const total = result.findScenes.count;

      if (scenes.length === 0) break;

      // Process batch
      await this.processScenessBatch(scenes, stashInstanceId);

      totalSynced += scenes.length;
      this.emit('progress', {
        entityType: 'scene',
        phase: 'processing',
        current: totalSynced,
        total,
      } as SyncProgress);

      if (totalSynced >= total) break;
      page++;
    }

    this.emit('progress', {
      entityType: 'scene',
      phase: 'complete',
      current: totalSynced,
      total: totalSynced,
    } as SyncProgress);
  }

  /**
   * Process a batch of scenes - upsert to database
   */
  private async processScenessBatch(scenes: any[], stashInstanceId?: string): Promise<void> {
    for (const scene of scenes) {
      const transformed = transformScene(scene);
      const duration = scene.files?.[0]?.duration || null;

      // Upsert scene
      await this.prisma.cachedScene.upsert({
        where: { id: scene.id },
        update: {
          title: scene.title,
          code: scene.code,
          date: scene.date,
          studioId: scene.studio?.id || null,
          rating100: scene.rating100,
          duration,
          organized: scene.organized || false,
          data: JSON.stringify(transformed),
          stashCreatedAt: scene.created_at ? new Date(scene.created_at) : null,
          stashUpdatedAt: scene.updated_at ? new Date(scene.updated_at) : null,
          syncedAt: new Date(),
          deletedAt: null, // Clear soft delete if re-synced
        },
        create: {
          id: scene.id,
          stashInstanceId,
          title: scene.title,
          code: scene.code,
          date: scene.date,
          studioId: scene.studio?.id || null,
          rating100: scene.rating100,
          duration,
          organized: scene.organized || false,
          data: JSON.stringify(transformed),
          stashCreatedAt: scene.created_at ? new Date(scene.created_at) : null,
          stashUpdatedAt: scene.updated_at ? new Date(scene.updated_at) : null,
        },
      });

      // Sync junction tables
      await this.syncScenePerformers(scene.id, scene.performers || []);
      await this.syncSceneTags(scene.id, scene.tags || []);
      await this.syncSceneGroups(scene.id, scene.groups || []);
      await this.syncSceneGalleries(scene.id, scene.galleries || []);
    }
  }

  // Similar methods for other entity types...
  // syncPerformers, syncStudios, syncTags, syncGroups, syncGalleries, syncImages

  /**
   * Sync scene↔performer junction table
   */
  private async syncScenePerformers(sceneId: string, performers: any[]): Promise<void> {
    // Delete existing relationships
    await this.prisma.scenePerformer.deleteMany({ where: { sceneId } });

    // Insert new relationships
    if (performers.length > 0) {
      await this.prisma.scenePerformer.createMany({
        data: performers.map(p => ({ sceneId, performerId: p.id })),
        skipDuplicates: true,
      });
    }
  }

  // Helper methods...
}

export const stashSyncService = new StashSyncService(prisma);
```

**Verification**: Write unit tests for sync logic. Test with mock data.

---

### Task 2.2: Create Sync Scheduler

**File**: `server/services/SyncScheduler.ts`

Handles automatic sync triggers:
- Startup sync
- Polling interval (configurable, default 60 min)
- Stash scan completion (WebSocket subscription)
- Manual trigger

**Implementation outline**:

```typescript
// server/services/SyncScheduler.ts

import { stashSyncService } from './StashSyncService.js';
import { stashInstanceManager } from './StashInstanceManager.js';
import { logger } from '../utils/logger.js';
import prisma from '../prisma/singleton.js';

class SyncScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private wsConnection: WebSocket | null = null;

  async start(): Promise<void> {
    // Load settings
    const settings = await prisma.syncSettings.findFirst() || {
      syncIntervalMinutes: 60,
      enableScanSubscription: true,
    };

    // Start polling interval
    this.startPollingInterval(settings.syncIntervalMinutes);

    // Start WebSocket subscription for scan events
    if (settings.enableScanSubscription) {
      this.startScanSubscription();
    }

    // Perform initial sync
    await this.performStartupSync();
  }

  private startPollingInterval(intervalMinutes: number): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    const intervalMs = intervalMinutes * 60 * 1000;

    this.intervalId = setInterval(async () => {
      logger.info('Scheduled sync triggered');
      try {
        await stashSyncService.incrementalSync();
      } catch (error) {
        logger.error('Scheduled sync failed', { error });
      }
    }, intervalMs);

    logger.info(`Sync scheduler started (interval: ${intervalMinutes} min)`);
  }

  private startScanSubscription(): void {
    // Connect to Stash GraphQL WebSocket for scanCompleteSubscribe
    // Implementation depends on graphql-ws or similar library
    // When scan completes, trigger incrementalSync()
  }

  private async performStartupSync(): Promise<void> {
    const syncState = await prisma.syncState.findFirst({
      where: { entityType: 'scene' },
    });

    if (!syncState?.lastFullSync) {
      logger.info('No previous sync found, performing full sync on startup');
      await stashSyncService.fullSync();
    } else {
      logger.info('Performing incremental sync on startup');
      await stashSyncService.incrementalSync();
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }
}

export const syncScheduler = new SyncScheduler();
```

---

### Task 2.3: Add Webhook Endpoint for Optional Stash Plugin

**File**: `server/routes/sync.ts`

```typescript
// POST /api/sync/notify - Webhook from Stash plugin
router.post('/notify', requireAdmin, async (req, res) => {
  const { entity, id, action } = req.body;

  // Validate request
  if (!entity || !id || !action) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Queue single entity sync
  await stashSyncService.syncSingleEntity(entity, id, action);

  res.json({ ok: true });
});

// POST /api/sync/trigger - Manual sync trigger
router.post('/trigger', requireAdmin, async (req, res) => {
  const { type = 'incremental' } = req.body;

  if (type === 'full') {
    await stashSyncService.fullSync();
  } else {
    await stashSyncService.incrementalSync();
  }

  res.json({ ok: true });
});

// GET /api/sync/status - Get sync status
router.get('/status', requireAuth, async (req, res) => {
  const states = await prisma.syncState.findMany();
  const settings = await prisma.syncSettings.findFirst();

  res.json({ states, settings });
});
```

---

## Phase 3: Query Service

### Task 3.1: Create CachedEntityQueryService

**File**: `server/services/CachedEntityQueryService.ts`

This service replaces direct `stashCacheManager` calls with Prisma queries.

**Key methods**:

```typescript
class CachedEntityQueryService {
  /**
   * Get all scenes with filtering, sorting, pagination
   */
  async getScenes(options: {
    userId: number;
    filters?: SceneFilters;
    sort?: string;
    direction?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }): Promise<{ scenes: NormalizedScene[]; total: number }> {
    // Build Prisma where clause from filters
    // Apply user restrictions (hidden entities, content restrictions)
    // Execute query with pagination
    // Parse JSON data field
    // Merge with user ratings/watch history
    // Return results
  }

  /**
   * Get single scene by ID
   */
  async getScene(id: string, userId: number): Promise<NormalizedScene | null> {
    const cached = await prisma.cachedScene.findFirst({
      where: { id, deletedAt: null },
    });

    if (!cached) return null;

    const data = JSON.parse(cached.data);
    // Merge with user data
    return this.mergeSceneWithUserData(data, userId);
  }

  /**
   * Full-text search across scenes
   */
  async searchScenes(query: string, userId: number, limit = 50): Promise<NormalizedScene[]> {
    // Use FTS5 for search
    const results = await prisma.$queryRaw`
      SELECT s.id, s.data
      FROM scene_fts
      INNER JOIN CachedScene s ON scene_fts.id = s.id
      WHERE scene_fts MATCH ${query}
        AND s.deletedAt IS NULL
      ORDER BY rank
      LIMIT ${limit}
    `;

    // Filter by user restrictions
    // Merge with user data
    return results;
  }

  // Similar methods for performers, studios, tags, groups, galleries, images
}

export const cachedEntityQueryService = new CachedEntityQueryService();
```

---

### Task 3.2: Create Query Builders for Complex Filters

**File**: `server/utils/queryBuilders.ts`

Helper functions to build Prisma `where` clauses from UI filter objects:

```typescript
/**
 * Build Prisma where clause for scene filters
 */
export function buildSceneWhereClause(
  filters: PeekSceneFilter,
  userId: number,
  hiddenEntityIds: { scenes: string[]; performers: string[]; studios: string[]; tags: string[] }
): Prisma.CachedSceneWhereInput {
  const where: Prisma.CachedSceneWhereInput = {
    deletedAt: null,
    id: { notIn: hiddenEntityIds.scenes },
  };

  // Studio filter
  if (filters.studioIds?.length) {
    where.studioId = { in: filters.studioIds };
  }

  // Hidden studios
  if (hiddenEntityIds.studios.length) {
    where.studioId = {
      ...where.studioId,
      notIn: hiddenEntityIds.studios,
    };
  }

  // Date range
  if (filters.dateFrom || filters.dateTo) {
    where.date = {};
    if (filters.dateFrom) where.date.gte = filters.dateFrom;
    if (filters.dateTo) where.date.lte = filters.dateTo;
  }

  // Rating filter
  if (filters.minRating !== undefined) {
    where.rating100 = { gte: filters.minRating };
  }

  // Performer filter (requires subquery)
  if (filters.performerIds?.length) {
    where.performers = {
      some: { performerId: { in: filters.performerIds } },
    };
  }

  // Tag filter
  if (filters.tagIds?.length) {
    where.tags = {
      some: { tagId: { in: filters.tagIds } },
    };
  }

  // Exclude hidden performers (cascade)
  if (hiddenEntityIds.performers.length) {
    where.performers = {
      ...where.performers,
      none: { performerId: { in: hiddenEntityIds.performers } },
    };
  }

  return where;
}
```

---

## Phase 4: Controller Migration

### Task 4.1: Update Scene Controllers

**Files to modify**:
- `server/controllers/library/scenes.ts`
- `server/controllers/carousel.ts`

Replace `stashCacheManager.getAllScenes()` with `cachedEntityQueryService.getScenes()`.

**Before**:
```typescript
const allScenes = stashCacheManager.getAllScenes();
let filtered = allScenes.filter(/* ... */);
filtered.sort(/* ... */);
const paginated = filtered.slice(offset, offset + limit);
```

**After**:
```typescript
const { scenes, total } = await cachedEntityQueryService.getScenes({
  userId,
  filters,
  sort,
  direction,
  limit,
  offset,
});
```

---

### Task 4.2: Update Performer Controllers

**File**: `server/controllers/library/performers.ts`

Same pattern as scenes. Replace in-memory filtering with database queries.

---

### Task 4.3: Update Studio Controllers

**File**: `server/controllers/library/studios.ts`

---

### Task 4.4: Update Tag Controllers

**File**: `server/controllers/library/tags.ts`

---

### Task 4.5: Update Group Controllers

**File**: `server/controllers/library/groups.ts`

---

### Task 4.6: Update Gallery Controllers

**File**: `server/controllers/library/galleries.ts`

---

### Task 4.7: Update Image Controllers

**File**: `server/controllers/library/images.ts`

---

### Task 4.8: Update Stats Controller

**File**: `server/controllers/stats.ts`

Aggregations like "top performers" use SQL GROUP BY instead of in-memory loops.

---

### Task 4.9: Update User Services

**Files**:
- `server/services/UserHiddenEntityService.ts`
- `server/services/UserStatsService.ts`

These now query SQLite instead of in-memory cache.

---

### Task 4.10: Update Auth Middleware

**File**: `server/middleware/auth.ts`

Replace `requireCacheReady()` with sync status check:

```typescript
export const requireSyncComplete = async (req, res, next) => {
  const syncState = await prisma.syncState.findFirst({
    where: { entityType: 'scene' },
  });

  if (!syncState?.lastFullSync && !syncState?.lastIncrementalSync) {
    return res.status(503).json({
      error: 'Initial sync in progress',
      message: 'Please wait for sync to complete',
    });
  }

  next();
};
```

---

## Phase 5: Cleanup

### Task 5.1: Remove StashCacheManager

**Delete file**: `server/services/StashCacheManager.ts`

**Remove imports** from all 17 files that currently import it.

---

### Task 5.2: Remove FilteredEntityCacheService

**Delete file**: `server/services/FilteredEntityCacheService.ts`

SQLite queries with user filtering replace this entirely.

---

### Task 5.3: Update Cache Initializer

**File**: `server/initializers/cache.ts`

Replace with sync initialization:

```typescript
export const initializeSync = async () => {
  logger.info('Starting sync scheduler...');
  await syncScheduler.start();
  logger.info('Sync scheduler started');
};
```

---

### Task 5.4: Update Server Entry Point

**File**: `server/index.ts`

Replace cache initialization with sync initialization.

---

## Phase 6: Testing & Validation

### Task 6.1: Create Synthetic Test Data Generator

**File**: `server/scripts/generateTestData.ts`

Generate 100k+ fake scenes for testing scalability.

---

### Task 6.2: Write Integration Tests

- Test full sync with large dataset
- Test incremental sync
- Test query performance
- Test FTS search
- Test user restrictions

---

### Task 6.3: Performance Benchmarks

Compare:
- Memory usage (before vs after)
- Startup time
- Query response times
- Sync duration for various library sizes

---

## Phase 7: UI Updates

### Task 7.1: Add Sync Status to Server Settings

Show:
- Last sync time per entity type
- Total entities synced
- Sync progress (when running)
- Error messages

---

### Task 7.2: Add Sync Interval Setting

Allow admin to configure polling interval (5-120 minutes).

---

### Task 7.3: Add Manual Sync Buttons

- "Incremental Sync" - sync changes only
- "Full Sync" - re-sync everything

---

## Verification Checklist

After implementation, verify:

- [ ] Fresh install works (full sync on first run)
- [ ] Existing install migrates cleanly
- [ ] 100k scene library loads without errors
- [ ] Memory usage stays under 200MB
- [ ] Scene browsing responds in <100ms
- [ ] Search works with FTS5
- [ ] User restrictions apply correctly
- [ ] Stats/aggregations work
- [ ] Incremental sync detects changes
- [ ] Soft delete works (removed scenes hidden but recoverable)
- [ ] All 17 dependent files updated
- [ ] No references to old StashCacheManager

---

## Rollback Plan

If issues arise:
1. Keep old StashCacheManager code on a branch
2. Add feature flag to switch between old/new
3. Can revert by setting flag and redeploying

---

## Estimated Scope

| Phase | Tasks | Complexity |
|-------|-------|------------|
| Phase 1: Schema | 3 | Medium |
| Phase 2: Sync Service | 3 | High |
| Phase 3: Query Service | 2 | Medium |
| Phase 4: Controller Migration | 10 | Medium (repetitive) |
| Phase 5: Cleanup | 4 | Low |
| Phase 6: Testing | 3 | Medium |
| Phase 7: UI | 3 | Low |
| **Total** | **28 tasks** | |

This is a significant refactor but follows a clear progression: schema → sync → query → migrate → cleanup → test → UI.
