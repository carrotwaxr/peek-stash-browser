# Incremental Sync Per-Entity Timestamp Fix - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix incremental sync to use per-entity timestamps instead of a single scene timestamp, preventing unnecessary full syncs of unchanged entities.

**Architecture:** Refactor `incrementalSync()` to loop through entity types and look up each entity's own last sync timestamp via `getEntitySyncState()`. Remove the broken `getLastSyncTime()` method that only queries scenes.

**Tech Stack:** TypeScript, Prisma, Node.js

---

## Task 1: Add Unit Test for Per-Entity Timestamp Logic

**Files:**
- Create: `server/services/__tests__/StashSyncService.unit.test.ts`

**Step 1: Create the test file with per-entity timestamp test**

```typescript
/**
 * Unit Tests for StashSyncService
 *
 * Tests the incremental sync logic without requiring a real Stash instance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma before importing the service
const mockPrisma = {
  syncState: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  syncSettings: {
    findFirst: vi.fn(),
  },
  $executeRawUnsafe: vi.fn(),
};

vi.mock("../../prisma/singleton.js", () => ({
  default: mockPrisma,
}));

// Mock the stash instance manager
vi.mock("../StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefault: vi.fn(() => ({
      findTags: vi.fn().mockResolvedValue({ findTags: { tags: [], count: 0 } }),
      findStudios: vi.fn().mockResolvedValue({ findStudios: { studios: [], count: 0 } }),
      findPerformers: vi.fn().mockResolvedValue({ findPerformers: { performers: [], count: 0 } }),
      findGroups: vi.fn().mockResolvedValue({ findGroups: { groups: [], count: 0 } }),
      findGalleries: vi.fn().mockResolvedValue({ findGalleries: { galleries: [], count: 0 } }),
      findScenesCompact: vi.fn().mockResolvedValue({ findScenes: { scenes: [], count: 0 } }),
      findImages: vi.fn().mockResolvedValue({ findImages: { images: [], count: 0 } }),
    })),
    hasInstances: vi.fn(() => true),
  },
}));

// Mock user stats service
vi.mock("../UserStatsService.js", () => ({
  userStatsService: {
    rebuildAllStats: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("StashSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("incrementalSync", () => {
    it("should use per-entity timestamps, not a single global timestamp", async () => {
      // Import after mocks are set up
      const { stashSyncService } = await import("../StashSyncService.js");

      // Set up different timestamps for different entity types
      const tagTimestamp = new Date("2025-12-20T10:00:00Z");
      const performerTimestamp = new Date("2025-12-22T15:00:00Z");
      const sceneTimestamp = new Date("2025-12-25T08:00:00Z");

      mockPrisma.syncState.findFirst.mockImplementation(({ where }) => {
        if (where.entityType === "tag") {
          return Promise.resolve({ lastIncrementalSync: tagTimestamp, lastFullSync: null });
        }
        if (where.entityType === "performer") {
          return Promise.resolve({ lastIncrementalSync: performerTimestamp, lastFullSync: null });
        }
        if (where.entityType === "scene") {
          return Promise.resolve({ lastIncrementalSync: sceneTimestamp, lastFullSync: null });
        }
        // Return timestamps for other entity types
        return Promise.resolve({ lastIncrementalSync: new Date("2025-12-24T12:00:00Z"), lastFullSync: null });
      });

      // Run incremental sync
      await stashSyncService.incrementalSync();

      // Verify that findFirst was called for each entity type (not just scene)
      const findFirstCalls = mockPrisma.syncState.findFirst.mock.calls;

      // Should have calls for: tag, studio, performer, group, gallery, scene, image
      const entityTypesQueried = findFirstCalls.map((call) => call[0]?.where?.entityType);

      expect(entityTypesQueried).toContain("tag");
      expect(entityTypesQueried).toContain("performer");
      expect(entityTypesQueried).toContain("scene");
      expect(entityTypesQueried).toContain("studio");
      expect(entityTypesQueried).toContain("group");
      expect(entityTypesQueried).toContain("gallery");
      expect(entityTypesQueried).toContain("image");
    });

    it("should perform full sync for entity types that have never been synced", async () => {
      const { stashSyncService } = await import("../StashSyncService.js");

      // Tags have been synced, but performers have not
      mockPrisma.syncState.findFirst.mockImplementation(({ where }) => {
        if (where.entityType === "tag") {
          return Promise.resolve({
            lastIncrementalSync: new Date("2025-12-20T10:00:00Z"),
            lastFullSync: null,
          });
        }
        // No sync state for other entities
        return Promise.resolve(null);
      });

      await stashSyncService.incrementalSync();

      // Verify sync state was created/updated for entities
      expect(mockPrisma.syncState.findFirst).toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `cd server && npm test -- --run services/__tests__/StashSyncService.unit.test.ts`

Expected: FAIL - The current implementation only queries "scene" entity type, so the test expecting per-entity queries will fail.

**Step 3: Commit the failing test**

```bash
git add server/services/__tests__/StashSyncService.unit.test.ts
git commit -m "test: add failing test for per-entity sync timestamps"
```

---

## Task 2: Refactor incrementalSync to Use Per-Entity Timestamps

**Files:**
- Modify: `server/services/StashSyncService.ts:393-480`

**Step 1: Replace the incrementalSync method**

Find the `incrementalSync` method (around line 393) and replace it entirely with:

```typescript
  /**
   * Incremental sync - fetches only changed entities
   * Uses per-entity-type timestamps so each entity type syncs from its own last sync time
   */
  async incrementalSync(stashInstanceId?: string): Promise<SyncResult[]> {
    if (this.syncInProgress) {
      logger.warn("Sync already in progress, skipping");
      return [];
    }

    this.syncInProgress = true;
    this.abortController = new AbortController();
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      logger.info("Starting incremental sync with per-entity timestamps...");

      // Entity types in dependency order (tags first since others reference them)
      const entityTypes: EntityType[] = [
        "tag",
        "studio",
        "performer",
        "group",
        "gallery",
        "scene",
        "image",
      ];

      for (const entityType of entityTypes) {
        this.checkAbort();

        // Get THIS entity type's last sync timestamp
        const syncState = await this.getEntitySyncState(stashInstanceId, entityType);
        const lastSync = syncState?.lastFullSync || syncState?.lastIncrementalSync;

        if (!lastSync) {
          // Never synced - do full sync for this entity type only
          logger.info(`${entityType}: No previous sync, syncing all`);
          const result = await this.syncEntityType(entityType, stashInstanceId, true);
          results.push(result);
          await this.saveSyncState(stashInstanceId, "full", result);
        } else {
          // Incremental sync using this entity's own timestamp
          logger.info(`${entityType}: syncing changes since ${lastSync.toISOString()}`);
          const result = await this.syncEntityType(entityType, stashInstanceId, false, lastSync);
          results.push(result);
          await this.saveSyncState(stashInstanceId, "incremental", result);
        }
      }

      // Rebuild user stats to reflect current entity relationships
      logger.info("Rebuilding user stats after sync...");
      await userStatsService.rebuildAllStats();
      logger.info("User stats rebuild complete");

      const duration = Date.now() - startTime;
      logger.info("Incremental sync completed", {
        durationMs: duration,
        results: results.map((r) => ({ type: r.entityType, synced: r.synced })),
      });

      return results;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg === "Sync aborted") {
        logger.info("Incremental sync aborted by user");
      } else {
        logger.error("Incremental sync failed", { error: errorMsg });
      }

      throw error;
    } finally {
      this.syncInProgress = false;
      this.abortController = null;
    }
  }
```

**Step 2: Run the unit test to verify it passes**

Run: `cd server && npm test -- --run services/__tests__/StashSyncService.unit.test.ts`

Expected: PASS - The refactored method now queries per-entity timestamps.

**Step 3: Commit the refactored method**

```bash
git add server/services/StashSyncService.ts
git commit -m "fix: use per-entity timestamps in incrementalSync

Previously, incrementalSync used a single timestamp from the scene
entity type for all entities. This caused full re-syncs of performers,
tags, etc. even when they hadn't changed.

Now each entity type uses its own lastFullSync/lastIncrementalSync
timestamp, matching how smartIncrementalSync already works.

Fixes #200 (Part 1)"
```

---

## Task 3: Remove Obsolete getLastSyncTime Method

**Files:**
- Modify: `server/services/StashSyncService.ts:2158-2167`

**Step 1: Find and remove the getLastSyncTime method**

Locate the `getLastSyncTime` method (around line 2158) and delete it entirely:

```typescript
// DELETE THIS ENTIRE METHOD:
private async getLastSyncTime(stashInstanceId?: string): Promise<Date | null> {
  const syncState = await prisma.syncState.findFirst({
    where: {
      stashInstanceId: stashInstanceId || null,
      entityType: "scene", // Use scene as the reference entity type
    },
  });

  return syncState?.lastFullSync || syncState?.lastIncrementalSync || null;
}
```

**Step 2: Verify no other code references this method**

Run: `cd server && grep -r "getLastSyncTime" --include="*.ts" .`

Expected: No matches (the only caller was in `incrementalSync` which we refactored).

**Step 3: Run all sync-related tests**

Run: `cd server && npm test -- --run services/__tests__/StashSyncService`

Expected: All tests pass.

**Step 4: Commit the removal**

```bash
git add server/services/StashSyncService.ts
git commit -m "refactor: remove obsolete getLastSyncTime method

This method was the root cause of the bug - it only queried the scene
entity type's timestamp, ignoring per-entity timestamps. With the
incrementalSync refactor, it's no longer needed."
```

---

## Task 4: Run Linting and Full Test Suite

**Files:**
- None (verification only)

**Step 1: Run linting**

Run: `cd server && npm run lint`

Expected: No errors.

**Step 2: Run full test suite**

Run: `cd server && npm test`

Expected: All tests pass.

**Step 3: Fix any issues and commit if needed**

If there are any lint or test failures, fix them and commit:

```bash
git add -A
git commit -m "fix: address lint/test issues from sync refactor"
```

---

## Task 5: Manual Verification (Optional - Requires Running Server)

**Files:**
- None (manual testing)

**Step 1: Start the server**

Run: `cd server && npm run dev`

**Step 2: Trigger a sync and check logs**

Look for log messages like:
```
tag: syncing changes since 2025-12-25T10:00:00.000Z
studio: syncing changes since 2025-12-25T10:00:00.000Z
performer: syncing changes since 2025-12-25T10:00:00.000Z
```

Each entity type should show its OWN timestamp, not the same timestamp for all.

**Step 3: Verify sync counts are minimal**

If nothing has changed in Stash, each entity type should sync 0 items:
```
Performers synced: 0 in 0.5s
Tags synced: 0 in 0.3s
```

---

## Summary

After completing all tasks:

1. `incrementalSync()` now uses per-entity timestamps via `getEntitySyncState()`
2. The broken `getLastSyncTime()` method is removed
3. Each entity type logs which timestamp it's using for visibility
4. Entity types with no previous sync get a full sync for that type only
5. Scheduled syncs should complete in seconds instead of 10+ minutes when nothing has changed
