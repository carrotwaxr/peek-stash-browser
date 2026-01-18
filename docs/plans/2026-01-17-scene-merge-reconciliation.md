# Scene Merge Reconciliation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically transfer user activity data (watch history, ratings, O counts) when scenes are merged in Stash, and provide an admin tool to reconcile orphaned data from past merges.

**Architecture:** PHASH-based merge detection during sync cleanup, with a MergeReconciliationService handling data transfer logic. Admin UI under Server Settings for manual recovery of orphaned scenes.

**Tech Stack:** Prisma (SQLite), Express routes, React (JSX), Vitest for testing

---

## Task 1: Schema Changes - Add PHASH Fields to StashScene

**Files:**
- Modify: `server/prisma/schema.prisma:462-537` (StashScene model)

**Step 1: Add phash fields to StashScene model**

In `server/prisma/schema.prisma`, add these fields after line 514 (after `inheritedTagIds`):

```prisma
  // === Fingerprint data (for merge detection) ===
  phash   String? // Primary perceptual hash (from first file)
  phashes String? // JSON array of all phashes if scene has multiple files
```

**Step 2: Add index for phash lookups**

After line 535, add:

```prisma
  @@index([phash])
```

**Step 3: Verify schema is valid**

Run: `cd server && npx prisma validate`
Expected: "The schema is valid."

**Step 4: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat(schema): add phash fields to StashScene for merge detection"
```

---

## Task 2: Schema Changes - Add MergeRecord Table

**Files:**
- Modify: `server/prisma/schema.prisma` (add new model)
- Modify: `server/prisma/schema.prisma:10-65` (add relation to User model)

**Step 1: Add MergeRecord model**

At the end of `server/prisma/schema.prisma` (before the closing of the file), add:

```prisma
// ============================================================================
// Merge Reconciliation
// ============================================================================

model MergeRecord {
  id              String   @id @default(uuid())
  sourceSceneId   String // The scene that was merged away (soft-deleted)
  targetSceneId   String // The scene it was merged into (survivor)
  matchedByPhash  String? // The phash that linked them (null if manual)

  // User data that was transferred
  userId Int
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Transfer details
  playCountTransferred    Int     @default(0)
  playDurationTransferred Float   @default(0)
  oCountTransferred       Int     @default(0)
  ratingTransferred       Int?
  favoriteTransferred     Boolean @default(false)

  // Audit
  reconciledAt DateTime @default(now())
  reconciledBy Int? // Admin user ID (null if automatic)
  automatic    Boolean  @default(true) // true = sync-time, false = manual

  createdAt DateTime @default(now())

  @@index([sourceSceneId])
  @@index([targetSceneId])
  @@index([userId])
}
```

**Step 2: Add relation to User model**

In the User model (around line 50), add after `imageViewHistory ImageViewHistory[]`:

```prisma
  // Merge reconciliation audit records
  mergeRecords MergeRecord[]
```

**Step 3: Verify schema is valid**

Run: `cd server && npx prisma validate`
Expected: "The schema is valid."

**Step 4: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat(schema): add MergeRecord table for reconciliation audit"
```

---

## Task 3: Create Database Migration

**Files:**
- Create: `server/prisma/migrations/YYYYMMDDHHMMSS_scene_merge_reconciliation/migration.sql` (auto-generated)

**Step 1: Generate migration**

Run: `cd server && npx prisma migrate dev --name scene_merge_reconciliation`

Expected: Migration created successfully with:
- ALTER TABLE StashScene ADD phash, phashes columns
- CREATE TABLE MergeRecord
- CREATE INDEX statements

**Step 2: Verify migration applied**

Run: `cd server && npx prisma migrate status`
Expected: All migrations applied

**Step 3: Generate Prisma client**

Run: `cd server && npx prisma generate`
Expected: Prisma Client generated

**Step 4: Commit migration**

```bash
git add server/prisma/migrations/
git commit -m "chore(db): add migration for scene merge reconciliation"
```

---

## Task 4: Update GraphQL Query to Fetch Fingerprints

**Files:**
- Modify: `server/graphql/operations/findScenesCompact.graphql:60-74`

**Step 1: Add fingerprints to files fragment**

In `server/graphql/operations/findScenesCompact.graphql`, modify the `files` block (around line 60-74) to add fingerprints:

```graphql
      files {
        audio_codec
        basename
        bit_rate
        created_at
        duration
        format
        frame_rate
        height
        path
        size
        updated_at
        video_codec
        width
        fingerprints {
          type
          value
        }
      }
```

**Step 2: Regenerate GraphQL types**

Run: `cd server && npm run stash:codegen`
Expected: Types generated successfully

**Step 3: Verify types include fingerprints**

Run: `grep -n "fingerprints" server/graphql/generated/graphql.ts | head -5`
Expected: Should show fingerprints in the generated types

**Step 4: Commit**

```bash
git add server/graphql/operations/findScenesCompact.graphql server/graphql/generated/graphql.ts
git commit -m "feat(graphql): add fingerprints to scene sync query"
```

---

## Task 5: Update StashSyncService to Store PHASHes

**Files:**
- Modify: `server/services/StashSyncService.ts` (syncScenes method)

**Step 1: Find the scene data extraction logic**

Search for where scene data is mapped to Prisma format. Look for the `syncScenes` method and find where file data is extracted.

Run: `grep -n "filePath\|files\?\[0\]" server/services/StashSyncService.ts | head -10`

**Step 2: Add phash extraction helper function**

Near the top of `StashSyncService.ts` (after the imports, around line 60), add:

```typescript
/**
 * Extract PHASH fingerprints from scene files.
 * Returns primary phash and array of all phashes.
 */
function extractPhashes(files: Array<{ fingerprints?: Array<{ type: string; value: string }> }> | undefined): {
  phash: string | null;
  phashes: string | null;
} {
  if (!files || files.length === 0) {
    return { phash: null, phashes: null };
  }

  const allPhashes: string[] = [];
  for (const file of files) {
    if (file.fingerprints) {
      for (const fp of file.fingerprints) {
        if (fp.type === "phash" && fp.value) {
          allPhashes.push(fp.value);
        }
      }
    }
  }

  if (allPhashes.length === 0) {
    return { phash: null, phashes: null };
  }

  return {
    phash: allPhashes[0],
    phashes: allPhashes.length > 1 ? JSON.stringify(allPhashes) : null,
  };
}
```

**Step 3: Add phash fields to scene upsert data**

Find where the scene data object is built for Prisma (search for `filePath:` or the scene upsert/create call). Add the phash extraction:

```typescript
// Extract phashes from files
const { phash, phashes } = extractPhashes(scene.files);

// Add to the data object being upserted:
phash,
phashes,
```

**Step 4: Verify build succeeds**

Run: `cd server && npm run build`
Expected: Build succeeds without errors

**Step 5: Commit**

```bash
git add server/services/StashSyncService.ts
git commit -m "feat(sync): extract and store phash fingerprints during scene sync"
```

---

## Task 6: Create MergeReconciliationService - Core Structure

**Files:**
- Create: `server/services/MergeReconciliationService.ts`

**Step 1: Create the service file with basic structure**

Create `server/services/MergeReconciliationService.ts`:

```typescript
/**
 * MergeReconciliationService
 *
 * Handles detection of merged scenes and transfer of user activity data
 * from orphaned scenes to their merge targets.
 */
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

export interface OrphanedSceneInfo {
  id: string;
  title: string | null;
  phash: string | null;
  deletedAt: Date;
  userActivityCount: number;
  totalPlayCount: number;
  hasRatings: boolean;
  hasFavorites: boolean;
}

export interface PhashMatch {
  sceneId: string;
  title: string | null;
  similarity: "exact" | "similar";
  recommended: boolean;
}

export interface ReconcileResult {
  sourceSceneId: string;
  targetSceneId: string;
  usersReconciled: number;
  mergeRecordsCreated: number;
}

class MergeReconciliationService {
  /**
   * Find all soft-deleted scenes that have orphaned user activity data.
   */
  async findOrphanedScenesWithActivity(): Promise<OrphanedSceneInfo[]> {
    // Find deleted scenes that have WatchHistory or SceneRating records
    const orphans = await prisma.$queryRaw<
      Array<{
        id: string;
        title: string | null;
        phash: string | null;
        deletedAt: Date;
        watchHistoryCount: number;
        totalPlayCount: number;
        ratingCount: number;
        favoriteCount: number;
      }>
    >`
      SELECT
        s.id,
        s.title,
        s.phash,
        s.deletedAt,
        COALESCE(wh.watchHistoryCount, 0) as watchHistoryCount,
        COALESCE(wh.totalPlayCount, 0) as totalPlayCount,
        COALESCE(r.ratingCount, 0) as ratingCount,
        COALESCE(r.favoriteCount, 0) as favoriteCount
      FROM StashScene s
      LEFT JOIN (
        SELECT sceneId, COUNT(*) as watchHistoryCount, SUM(playCount) as totalPlayCount
        FROM WatchHistory
        GROUP BY sceneId
      ) wh ON wh.sceneId = s.id
      LEFT JOIN (
        SELECT sceneId, COUNT(*) as ratingCount, SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END) as favoriteCount
        FROM SceneRating
        GROUP BY sceneId
      ) r ON r.sceneId = s.id
      WHERE s.deletedAt IS NOT NULL
        AND (wh.watchHistoryCount > 0 OR r.ratingCount > 0)
      ORDER BY s.deletedAt DESC
    `;

    return orphans.map((o) => ({
      id: o.id,
      title: o.title,
      phash: o.phash,
      deletedAt: o.deletedAt,
      userActivityCount: Number(o.watchHistoryCount) + Number(o.ratingCount),
      totalPlayCount: Number(o.totalPlayCount),
      hasRatings: Number(o.ratingCount) > 0,
      hasFavorites: Number(o.favoriteCount) > 0,
    }));
  }

  /**
   * Find potential phash matches for an orphaned scene.
   */
  async findPhashMatches(sceneId: string): Promise<PhashMatch[]> {
    const scene = await prisma.stashScene.findUnique({
      where: { id: sceneId },
      select: { phash: true, phashes: true },
    });

    if (!scene?.phash) {
      return [];
    }

    // Get all phashes for this scene
    const scenePhashes: string[] = [scene.phash];
    if (scene.phashes) {
      try {
        const parsed = JSON.parse(scene.phashes);
        if (Array.isArray(parsed)) {
          scenePhashes.push(...parsed.filter((p: string) => p !== scene.phash));
        }
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Find non-deleted scenes with matching phash
    const matches = await prisma.stashScene.findMany({
      where: {
        id: { not: sceneId },
        deletedAt: null,
        OR: [
          { phash: { in: scenePhashes } },
          // Also check if any of our phashes appear in their phashes array
          // This is a simple string contains check for SQLite
          ...scenePhashes.map((ph) => ({ phashes: { contains: ph } })),
        ],
      },
      select: {
        id: true,
        title: true,
        phash: true,
        stashUpdatedAt: true,
      },
      orderBy: { stashUpdatedAt: "desc" },
    });

    return matches.map((m, index) => ({
      sceneId: m.id,
      title: m.title,
      similarity: "exact" as const,
      recommended: index === 0, // Recommend the most recently updated
    }));
  }
}

export const mergeReconciliationService = new MergeReconciliationService();
```

**Step 2: Verify build succeeds**

Run: `cd server && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add server/services/MergeReconciliationService.ts
git commit -m "feat(service): add MergeReconciliationService with orphan detection"
```

---

## Task 7: Add Transfer Logic to MergeReconciliationService

**Files:**
- Modify: `server/services/MergeReconciliationService.ts`

**Step 1: Add helper functions for merging data**

Add these helper functions before the class definition:

```typescript
/**
 * Merge two JSON arrays (for oHistory and playHistory).
 * Deduplicates by stringified value and sorts.
 */
function mergeJsonArrays(arr1: unknown, arr2: unknown): string {
  const list1 = parseJsonArray(arr1);
  const list2 = parseJsonArray(arr2);
  const merged = [...list1, ...list2];
  // Deduplicate by stringified value
  const seen = new Set<string>();
  const deduped = merged.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Sort by timestamp/startTime if present
  deduped.sort((a, b) => {
    const aTime = typeof a === "string" ? a : (a as Record<string, unknown>).startTime || (a as Record<string, unknown>).time || "";
    const bTime = typeof b === "string" ? b : (b as Record<string, unknown>).startTime || (b as Record<string, unknown>).time || "";
    return String(aTime).localeCompare(String(bTime));
  });
  return JSON.stringify(deduped);
}

function parseJsonArray(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function laterDate(d1: Date | null, d2: Date | null): Date | null {
  if (!d1) return d2;
  if (!d2) return d1;
  return d1 > d2 ? d1 : d2;
}
```

**Step 2: Add transferUserData method to the class**

Add this method to `MergeReconciliationService`:

```typescript
  /**
   * Transfer user activity data from source scene to target scene.
   * Creates a MergeRecord for audit.
   */
  async transferUserData(
    sourceSceneId: string,
    targetSceneId: string,
    userId: number,
    matchedByPhash: string | null,
    reconciledBy: number | null
  ): Promise<{ success: boolean; mergeRecordId?: string }> {
    const sourceHistory = await prisma.watchHistory.findUnique({
      where: { userId_sceneId: { userId, sceneId: sourceSceneId } },
    });

    const sourceRating = await prisma.sceneRating.findUnique({
      where: { userId_sceneId: { userId, sceneId: sourceSceneId } },
    });

    if (!sourceHistory && !sourceRating) {
      return { success: false }; // Nothing to transfer
    }

    // Transfer WatchHistory
    if (sourceHistory) {
      const targetHistory = await prisma.watchHistory.findUnique({
        where: { userId_sceneId: { userId, sceneId: targetSceneId } },
      });

      if (targetHistory) {
        // Merge with existing
        await prisma.watchHistory.update({
          where: { userId_sceneId: { userId, sceneId: targetSceneId } },
          data: {
            playCount: targetHistory.playCount + sourceHistory.playCount,
            playDuration: targetHistory.playDuration + sourceHistory.playDuration,
            oCount: targetHistory.oCount + sourceHistory.oCount,
            oHistory: mergeJsonArrays(targetHistory.oHistory, sourceHistory.oHistory),
            playHistory: mergeJsonArrays(targetHistory.playHistory, sourceHistory.playHistory),
            lastPlayedAt: laterDate(targetHistory.lastPlayedAt, sourceHistory.lastPlayedAt),
            // resumeTime: keep target's (survivor wins)
          },
        });
      } else {
        // Create new record for target
        await prisma.watchHistory.create({
          data: {
            userId,
            sceneId: targetSceneId,
            playCount: sourceHistory.playCount,
            playDuration: sourceHistory.playDuration,
            resumeTime: sourceHistory.resumeTime,
            lastPlayedAt: sourceHistory.lastPlayedAt,
            oCount: sourceHistory.oCount,
            oHistory: sourceHistory.oHistory,
            playHistory: sourceHistory.playHistory,
          },
        });
      }
    }

    // Transfer SceneRating
    if (sourceRating) {
      const targetRating = await prisma.sceneRating.findUnique({
        where: { userId_sceneId: { userId, sceneId: targetSceneId } },
      });

      if (targetRating) {
        // Merge: survivor wins for rating, OR for favorite
        await prisma.sceneRating.update({
          where: { userId_sceneId: { userId, sceneId: targetSceneId } },
          data: {
            rating: targetRating.rating ?? sourceRating.rating,
            favorite: targetRating.favorite || sourceRating.favorite,
          },
        });
      } else {
        // Create new record for target
        await prisma.sceneRating.create({
          data: {
            userId,
            sceneId: targetSceneId,
            rating: sourceRating.rating,
            favorite: sourceRating.favorite,
          },
        });
      }
    }

    // Create audit record
    const mergeRecord = await prisma.mergeRecord.create({
      data: {
        sourceSceneId,
        targetSceneId,
        matchedByPhash,
        userId,
        playCountTransferred: sourceHistory?.playCount ?? 0,
        playDurationTransferred: sourceHistory?.playDuration ?? 0,
        oCountTransferred: sourceHistory?.oCount ?? 0,
        ratingTransferred: sourceRating?.rating,
        favoriteTransferred: sourceRating?.favorite ?? false,
        reconciledBy,
        automatic: reconciledBy === null,
      },
    });

    logger.info(`Transferred user data from scene ${sourceSceneId} to ${targetSceneId} for user ${userId}`);

    return { success: true, mergeRecordId: mergeRecord.id };
  }
```

**Step 3: Add reconcileScene method**

Add this method to reconcile all users for a scene:

```typescript
  /**
   * Reconcile all user data for a source scene to a target scene.
   */
  async reconcileScene(
    sourceSceneId: string,
    targetSceneId: string,
    matchedByPhash: string | null,
    reconciledBy: number | null
  ): Promise<ReconcileResult> {
    // Find all users with activity on the source scene
    const usersWithHistory = await prisma.watchHistory.findMany({
      where: { sceneId: sourceSceneId },
      select: { userId: true },
    });

    const usersWithRatings = await prisma.sceneRating.findMany({
      where: { sceneId: sourceSceneId },
      select: { userId: true },
    });

    // Combine and deduplicate user IDs
    const userIds = [...new Set([
      ...usersWithHistory.map((h) => h.userId),
      ...usersWithRatings.map((r) => r.userId),
    ])];

    let mergeRecordsCreated = 0;

    for (const userId of userIds) {
      const result = await this.transferUserData(
        sourceSceneId,
        targetSceneId,
        userId,
        matchedByPhash,
        reconciledBy
      );
      if (result.success) {
        mergeRecordsCreated++;
      }
    }

    logger.info(`Reconciled ${mergeRecordsCreated} users from scene ${sourceSceneId} to ${targetSceneId}`);

    return {
      sourceSceneId,
      targetSceneId,
      usersReconciled: userIds.length,
      mergeRecordsCreated,
    };
  }

  /**
   * Discard orphaned user data for a scene (delete WatchHistory and SceneRating).
   */
  async discardOrphanedData(sceneId: string): Promise<{ watchHistoryDeleted: number; ratingsDeleted: number }> {
    const watchHistoryResult = await prisma.watchHistory.deleteMany({
      where: { sceneId },
    });

    const ratingsResult = await prisma.sceneRating.deleteMany({
      where: { sceneId },
    });

    logger.info(`Discarded orphaned data for scene ${sceneId}: ${watchHistoryResult.count} watch history, ${ratingsResult.count} ratings`);

    return {
      watchHistoryDeleted: watchHistoryResult.count,
      ratingsDeleted: ratingsResult.count,
    };
  }
```

**Step 4: Verify build succeeds**

Run: `cd server && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add server/services/MergeReconciliationService.ts
git commit -m "feat(service): add transfer and reconcile logic to MergeReconciliationService"
```

---

## Task 8: Write Unit Tests for MergeReconciliationService

**Files:**
- Create: `server/tests/services/MergeReconciliationService.test.ts`

**Step 1: Create test file with mocks**

Create `server/tests/services/MergeReconciliationService.test.ts`:

```typescript
/**
 * Unit Tests for MergeReconciliationService
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $queryRaw: vi.fn(),
    stashScene: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    watchHistory: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    sceneRating: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    mergeRecord: {
      create: vi.fn(),
    },
  },
}));

import prisma from "../../prisma/singleton.js";
import { mergeReconciliationService } from "../../services/MergeReconciliationService.js";

describe("MergeReconciliationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findOrphanedScenesWithActivity", () => {
    it("should return orphaned scenes with user activity", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          id: "scene-1",
          title: "Test Scene",
          phash: "abc123",
          deletedAt: new Date("2025-01-10"),
          watchHistoryCount: 2,
          totalPlayCount: 5,
          ratingCount: 1,
          favoriteCount: 1,
        },
      ]);

      const result = await mergeReconciliationService.findOrphanedScenesWithActivity();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("scene-1");
      expect(result[0].userActivityCount).toBe(3);
      expect(result[0].hasRatings).toBe(true);
      expect(result[0].hasFavorites).toBe(true);
    });
  });

  describe("findPhashMatches", () => {
    it("should find scenes with matching phash", async () => {
      vi.mocked(prisma.stashScene.findUnique).mockResolvedValue({
        phash: "abc123",
        phashes: null,
      } as never);

      vi.mocked(prisma.stashScene.findMany).mockResolvedValue([
        { id: "scene-2", title: "Match Scene", phash: "abc123", stashUpdatedAt: new Date() },
      ] as never);

      const result = await mergeReconciliationService.findPhashMatches("scene-1");

      expect(result).toHaveLength(1);
      expect(result[0].sceneId).toBe("scene-2");
      expect(result[0].similarity).toBe("exact");
      expect(result[0].recommended).toBe(true);
    });

    it("should return empty array if scene has no phash", async () => {
      vi.mocked(prisma.stashScene.findUnique).mockResolvedValue({
        phash: null,
        phashes: null,
      } as never);

      const result = await mergeReconciliationService.findPhashMatches("scene-1");

      expect(result).toHaveLength(0);
    });
  });

  describe("transferUserData", () => {
    it("should transfer watch history to target without existing data", async () => {
      vi.mocked(prisma.watchHistory.findUnique)
        .mockResolvedValueOnce({
          userId: 1,
          sceneId: "source",
          playCount: 5,
          playDuration: 1000,
          oCount: 2,
          oHistory: "[]",
          playHistory: "[]",
          resumeTime: 100,
          lastPlayedAt: new Date(),
        } as never)
        .mockResolvedValueOnce(null); // No target history

      vi.mocked(prisma.sceneRating.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.watchHistory.create).mockResolvedValue({} as never);
      vi.mocked(prisma.mergeRecord.create).mockResolvedValue({ id: "mr-1" } as never);

      const result = await mergeReconciliationService.transferUserData(
        "source",
        "target",
        1,
        "abc123",
        null
      );

      expect(result.success).toBe(true);
      expect(prisma.watchHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sceneId: "target",
            playCount: 5,
          }),
        })
      );
    });

    it("should merge watch history with existing target data", async () => {
      vi.mocked(prisma.watchHistory.findUnique)
        .mockResolvedValueOnce({
          userId: 1,
          sceneId: "source",
          playCount: 5,
          playDuration: 1000,
          oCount: 2,
          oHistory: '["2025-01-01"]',
          playHistory: "[]",
          resumeTime: 100,
          lastPlayedAt: new Date("2025-01-01"),
        } as never)
        .mockResolvedValueOnce({
          userId: 1,
          sceneId: "target",
          playCount: 3,
          playDuration: 500,
          oCount: 1,
          oHistory: '["2025-01-02"]',
          playHistory: "[]",
          resumeTime: 200,
          lastPlayedAt: new Date("2025-01-02"),
        } as never);

      vi.mocked(prisma.sceneRating.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.watchHistory.update).mockResolvedValue({} as never);
      vi.mocked(prisma.mergeRecord.create).mockResolvedValue({ id: "mr-1" } as never);

      const result = await mergeReconciliationService.transferUserData(
        "source",
        "target",
        1,
        "abc123",
        null
      );

      expect(result.success).toBe(true);
      expect(prisma.watchHistory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            playCount: 8, // 5 + 3
            playDuration: 1500, // 1000 + 500
            oCount: 3, // 2 + 1
          }),
        })
      );
    });

    it("should use OR logic for favorites", async () => {
      vi.mocked(prisma.watchHistory.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.sceneRating.findUnique)
        .mockResolvedValueOnce({
          userId: 1,
          sceneId: "source",
          rating: 80,
          favorite: true,
        } as never)
        .mockResolvedValueOnce({
          userId: 1,
          sceneId: "target",
          rating: 90,
          favorite: false,
        } as never);

      vi.mocked(prisma.sceneRating.update).mockResolvedValue({} as never);
      vi.mocked(prisma.mergeRecord.create).mockResolvedValue({ id: "mr-1" } as never);

      await mergeReconciliationService.transferUserData("source", "target", 1, null, null);

      expect(prisma.sceneRating.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rating: 90, // Survivor wins
            favorite: true, // OR logic
          }),
        })
      );
    });
  });

  describe("discardOrphanedData", () => {
    it("should delete watch history and ratings", async () => {
      vi.mocked(prisma.watchHistory.deleteMany).mockResolvedValue({ count: 3 });
      vi.mocked(prisma.sceneRating.deleteMany).mockResolvedValue({ count: 2 });

      const result = await mergeReconciliationService.discardOrphanedData("scene-1");

      expect(result.watchHistoryDeleted).toBe(3);
      expect(result.ratingsDeleted).toBe(2);
    });
  });
});
```

**Step 2: Run tests**

Run: `cd server && npm test -- --run tests/services/MergeReconciliationService.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add server/tests/services/MergeReconciliationService.test.ts
git commit -m "test: add unit tests for MergeReconciliationService"
```

---

## Task 9: Integrate Merge Detection into Sync Cleanup

**Files:**
- Modify: `server/services/StashSyncService.ts:1070-1237` (cleanupDeletedEntities method)

**Step 1: Import MergeReconciliationService**

At the top of `StashSyncService.ts`, add:

```typescript
import { mergeReconciliationService } from "./MergeReconciliationService.js";
```

**Step 2: Add merge detection before soft-delete**

Modify the `cleanupDeletedEntities` method. In the scene case (around line 1175-1180), replace the simple `updateMany` with merge detection logic:

```typescript
        case "scene": {
          // Before soft-deleting, check for merges and reconcile user data
          const scenesToDelete = await prisma.stashScene.findMany({
            where: { deletedAt: null, stashInstanceId: stashInstanceId ?? null, id: { notIn: stashIds } },
            select: { id: true, phash: true },
          });

          for (const scene of scenesToDelete) {
            if (scene.phash) {
              // Try to find a merge target
              const matches = await mergeReconciliationService.findPhashMatches(scene.id);
              if (matches.length > 0) {
                const target = matches[0]; // Use the recommended match
                logger.info(`Detected merge: scene ${scene.id} -> ${target.sceneId}`);
                await mergeReconciliationService.reconcileScene(
                  scene.id,
                  target.sceneId,
                  scene.phash,
                  null // automatic
                );
              }
            }
          }

          // Now soft-delete all the scenes
          deletedCount = (await prisma.stashScene.updateMany({
            where: { deletedAt: null, stashInstanceId: stashInstanceId ?? null, id: { notIn: stashIds } },
            data: { deletedAt: now },
          })).count;
          break;
        }
```

**Step 3: Verify build succeeds**

Run: `cd server && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add server/services/StashSyncService.ts
git commit -m "feat(sync): detect merges and reconcile user data during cleanup"
```

---

## Task 10: Create Admin API Routes

**Files:**
- Create: `server/routes/mergeReconciliation.ts`
- Modify: `server/initializers/api.ts` (register routes)

**Step 1: Create the routes file**

Create `server/routes/mergeReconciliation.ts`:

```typescript
/**
 * Merge Reconciliation Routes (Admin Only)
 *
 * Handles admin endpoints for managing orphaned scene data:
 * - GET /api/admin/orphaned-scenes - List orphaned scenes with user activity
 * - GET /api/admin/orphaned-scenes/:id/matches - Get phash matches for an orphan
 * - POST /api/admin/orphaned-scenes/:id/reconcile - Transfer data to target scene
 * - POST /api/admin/orphaned-scenes/:id/discard - Delete orphaned user data
 * - POST /api/admin/reconcile-all - Auto-reconcile all with exact phash matches
 */
import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { mergeReconciliationService } from "../services/MergeReconciliationService.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/orphaned-scenes
 * List all orphaned scenes with user activity
 */
router.get(
  "/orphaned-scenes",
  authenticated(async (req, res) => {
    try {
      const orphans = await mergeReconciliationService.findOrphanedScenesWithActivity();
      res.json({
        scenes: orphans,
        totalCount: orphans.length,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch orphaned scenes",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * GET /api/admin/orphaned-scenes/:id/matches
 * Get potential phash matches for an orphaned scene
 */
router.get(
  "/orphaned-scenes/:id/matches",
  authenticated(async (req, res) => {
    try {
      const { id } = req.params;
      const matches = await mergeReconciliationService.findPhashMatches(id);
      res.json({ matches });
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch matches",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * POST /api/admin/orphaned-scenes/:id/reconcile
 * Transfer user data from orphan to target scene
 */
router.post(
  "/orphaned-scenes/:id/reconcile",
  authenticated(async (req, res) => {
    try {
      const { id } = req.params;
      const { targetSceneId } = req.body;

      if (!targetSceneId) {
        return res.status(400).json({ error: "targetSceneId is required" });
      }

      const result = await mergeReconciliationService.reconcileScene(
        id,
        targetSceneId,
        null, // Will be looked up if available
        req.user!.id // Admin who initiated
      );

      res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to reconcile scene",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * POST /api/admin/orphaned-scenes/:id/discard
 * Delete orphaned user data for a scene
 */
router.post(
  "/orphaned-scenes/:id/discard",
  authenticated(async (req, res) => {
    try {
      const { id } = req.params;
      const result = await mergeReconciliationService.discardOrphanedData(id);

      res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to discard orphaned data",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * POST /api/admin/reconcile-all
 * Auto-reconcile all orphans with exact phash matches
 */
router.post(
  "/reconcile-all",
  authenticated(async (req, res) => {
    try {
      const orphans = await mergeReconciliationService.findOrphanedScenesWithActivity();
      let reconciled = 0;
      let skipped = 0;

      for (const orphan of orphans) {
        if (!orphan.phash) {
          skipped++;
          continue;
        }

        const matches = await mergeReconciliationService.findPhashMatches(orphan.id);
        const exactMatch = matches.find((m) => m.similarity === "exact");

        if (exactMatch) {
          await mergeReconciliationService.reconcileScene(
            orphan.id,
            exactMatch.sceneId,
            orphan.phash,
            req.user!.id
          );
          reconciled++;
        } else {
          skipped++;
        }
      }

      res.json({
        ok: true,
        reconciled,
        skipped,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to reconcile all",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

export default router;
```

**Step 2: Register routes in api.ts**

In `server/initializers/api.ts`, add the import (around line 30):

```typescript
import mergeReconciliationRoutes from "../routes/mergeReconciliation.js";
```

And register the routes (around line 116, after exclusionsRoutes):

```typescript
  // Merge reconciliation routes (admin only)
  app.use("/api/admin", mergeReconciliationRoutes);
```

**Step 3: Verify build succeeds**

Run: `cd server && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add server/routes/mergeReconciliation.ts server/initializers/api.ts
git commit -m "feat(api): add admin routes for merge reconciliation"
```

---

## Task 11: Create Admin UI Component - MergeRecoveryTab

**Files:**
- Create: `client/src/components/settings/tabs/MergeRecoveryTab.jsx`

**Step 1: Create the component**

Create `client/src/components/settings/tabs/MergeRecoveryTab.jsx`:

```jsx
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { showError, showSuccess } from "../../../utils/toast.jsx";
import { Button } from "../../ui/index.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const MergeRecoveryTab = () => {
  const [orphans, setOrphans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [expandedOrphan, setExpandedOrphan] = useState(null);
  const [matches, setMatches] = useState({});
  const [manualTargetId, setManualTargetId] = useState({});

  const fetchOrphans = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get("/admin/orphaned-scenes");
      setOrphans(response.data.scenes);
    } catch (error) {
      showError("Failed to load orphaned scenes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrphans();
  }, [fetchOrphans]);

  const fetchMatches = async (sceneId) => {
    if (matches[sceneId]) return;
    try {
      const response = await api.get(`/admin/orphaned-scenes/${sceneId}/matches`);
      setMatches((prev) => ({ ...prev, [sceneId]: response.data.matches }));
    } catch (error) {
      showError("Failed to load matches");
    }
  };

  const handleExpand = (sceneId) => {
    if (expandedOrphan === sceneId) {
      setExpandedOrphan(null);
    } else {
      setExpandedOrphan(sceneId);
      fetchMatches(sceneId);
    }
  };

  const handleReconcile = async (sourceId, targetId) => {
    try {
      setProcessing(sourceId);
      await api.post(`/admin/orphaned-scenes/${sourceId}/reconcile`, { targetSceneId: targetId });
      showSuccess("Activity transferred successfully");
      fetchOrphans();
    } catch (error) {
      showError("Failed to reconcile scene");
    } finally {
      setProcessing(null);
    }
  };

  const handleDiscard = async (sceneId) => {
    if (!confirm("Are you sure you want to discard this orphaned data? This cannot be undone.")) {
      return;
    }
    try {
      setProcessing(sceneId);
      await api.post(`/admin/orphaned-scenes/${sceneId}/discard`);
      showSuccess("Orphaned data discarded");
      fetchOrphans();
    } catch (error) {
      showError("Failed to discard data");
    } finally {
      setProcessing(null);
    }
  };

  const handleReconcileAll = async () => {
    if (!confirm("This will auto-reconcile all orphans with exact PHASH matches. Continue?")) {
      return;
    }
    try {
      setProcessing("all");
      const response = await api.post("/admin/reconcile-all");
      showSuccess(`Reconciled ${response.data.reconciled} scenes, skipped ${response.data.skipped}`);
      fetchOrphans();
    } catch (error) {
      showError("Failed to reconcile all");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return <div className="p-6">Loading orphaned scenes...</div>;
  }

  return (
    <div className="space-y-6">
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Merge Recovery
            </h3>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Recover user activity from scenes that were merged in Stash
            </p>
          </div>
          <Button
            onClick={handleReconcileAll}
            disabled={processing === "all" || orphans.length === 0}
            variant="primary"
          >
            {processing === "all" ? "Processing..." : "Auto-Reconcile All"}
          </Button>
        </div>

        {orphans.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)" }}>No orphaned scenes with user activity found.</p>
        ) : (
          <div className="space-y-4">
            <p style={{ color: "var(--color-text-secondary)" }}>
              Found {orphans.length} orphaned scene{orphans.length !== 1 ? "s" : ""} with user activity
            </p>

            {orphans.map((orphan) => (
              <div
                key={orphan.id}
                className="p-4 rounded-lg border"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  borderColor: "var(--color-border)",
                }}
              >
                <div
                  className="flex justify-between items-start cursor-pointer"
                  onClick={() => handleExpand(orphan.id)}
                >
                  <div>
                    <h4 className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {orphan.title || orphan.id}
                    </h4>
                    <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      Deleted: {new Date(orphan.deletedAt).toLocaleDateString()}
                      {orphan.phash ? ` | PHASH: ${orphan.phash.substring(0, 12)}...` : " | No PHASH"}
                    </p>
                    <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      Activity: {orphan.totalPlayCount} plays
                      {orphan.hasRatings && " | Has ratings"}
                      {orphan.hasFavorites && " | Favorited"}
                    </p>
                  </div>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    {expandedOrphan === orphan.id ? "▼" : "▶"}
                  </span>
                </div>

                {expandedOrphan === orphan.id && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--color-border)" }}>
                    <p className="text-sm mb-2" style={{ color: "var(--color-text-primary)" }}>
                      Potential matches:
                    </p>

                    {!matches[orphan.id] ? (
                      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                        Loading matches...
                      </p>
                    ) : matches[orphan.id].length === 0 ? (
                      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                        No PHASH matches found
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {matches[orphan.id].map((match) => (
                          <div
                            key={match.sceneId}
                            className="flex justify-between items-center p-2 rounded"
                            style={{ backgroundColor: "var(--color-bg-secondary)" }}
                          >
                            <div>
                              <span style={{ color: "var(--color-text-primary)" }}>
                                {match.title || match.sceneId}
                              </span>
                              <span
                                className="ml-2 text-sm"
                                style={{ color: "var(--color-text-secondary)" }}
                              >
                                ({match.similarity} match)
                                {match.recommended && " ★ Recommended"}
                              </span>
                            </div>
                            <Button
                              onClick={() => handleReconcile(orphan.id, match.sceneId)}
                              disabled={processing === orphan.id}
                              size="sm"
                            >
                              Transfer
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Manual scene ID"
                        value={manualTargetId[orphan.id] || ""}
                        onChange={(e) =>
                          setManualTargetId((prev) => ({ ...prev, [orphan.id]: e.target.value }))
                        }
                        className="flex-1 p-2 rounded border"
                        style={{
                          backgroundColor: "var(--color-bg-primary)",
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-primary)",
                        }}
                      />
                      <Button
                        onClick={() => handleReconcile(orphan.id, manualTargetId[orphan.id])}
                        disabled={!manualTargetId[orphan.id] || processing === orphan.id}
                        size="sm"
                      >
                        Transfer
                      </Button>
                    </div>

                    <div className="mt-4">
                      <Button
                        onClick={() => handleDiscard(orphan.id)}
                        disabled={processing === orphan.id}
                        variant="danger"
                        size="sm"
                      >
                        Discard Activity
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MergeRecoveryTab;
```

**Step 2: Verify no syntax errors**

Run: `cd client && npm run lint -- src/components/settings/tabs/MergeRecoveryTab.jsx`
Expected: No errors (or only warnings)

**Step 3: Commit**

```bash
git add client/src/components/settings/tabs/MergeRecoveryTab.jsx
git commit -m "feat(ui): add MergeRecoveryTab component for admin reconciliation"
```

---

## Task 12: Register MergeRecoveryTab in Settings Page

**Files:**
- Modify: `client/src/components/pages/SettingsPage.jsx`

**Step 1: Import the new tab**

At the top of `SettingsPage.jsx`, add the import (around line 15):

```jsx
import MergeRecoveryTab from "../settings/tabs/MergeRecoveryTab.jsx";
```

**Step 2: Add tab to SERVER_TABS array**

Modify the `SERVER_TABS` array (around line 27-30) to add the new tab:

```jsx
const SERVER_TABS = [
  { id: "server-config", label: "Server Configuration" },
  { id: "user-management", label: "User Management" },
  { id: "merge-recovery", label: "Merge Recovery" },
];
```

**Step 3: Add tab rendering**

In the server section rendering (around line 115-119), add:

```jsx
          {activeSection === "server" && (
            <>
              {activeTab === "server-config" && <ServerConfigTab />}
              {activeTab === "user-management" && <UserManagementTab />}
              {activeTab === "merge-recovery" && <MergeRecoveryTab />}
            </>
          )}
```

**Step 4: Verify no syntax errors**

Run: `cd client && npm run lint -- src/components/pages/SettingsPage.jsx`
Expected: No errors (or only warnings)

**Step 5: Commit**

```bash
git add client/src/components/pages/SettingsPage.jsx
git commit -m "feat(ui): add Merge Recovery tab to Server Settings"
```

---

## Task 13: Integration Test - Full Workflow

**Files:**
- Create: `server/integration/api/mergeReconciliation.integration.test.ts`

**Step 1: Create integration test**

Create `server/integration/api/mergeReconciliation.integration.test.ts`:

```typescript
/**
 * Integration Tests for Merge Reconciliation API
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { setupAPI } from "../../initializers/api.js";
import prisma from "../../prisma/singleton.js";

const app = setupAPI();

describe("Merge Reconciliation API", () => {
  let adminToken: string;
  let testSceneId: string;
  let targetSceneId: string;

  beforeAll(async () => {
    // Create admin user and get token
    // (This would use your existing test setup patterns)
  });

  afterAll(async () => {
    // Cleanup test data
  });

  describe("GET /api/admin/orphaned-scenes", () => {
    it("should return 401 for unauthenticated requests", async () => {
      const response = await request(app).get("/api/admin/orphaned-scenes");
      expect(response.status).toBe(401);
    });

    it("should return orphaned scenes for admin", async () => {
      const response = await request(app)
        .get("/api/admin/orphaned-scenes")
        .set("Cookie", `token=${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("scenes");
      expect(response.body).toHaveProperty("totalCount");
    });
  });

  describe("POST /api/admin/orphaned-scenes/:id/reconcile", () => {
    it("should require targetSceneId", async () => {
      const response = await request(app)
        .post(`/api/admin/orphaned-scenes/${testSceneId}/reconcile`)
        .set("Cookie", `token=${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("targetSceneId is required");
    });
  });
});
```

**Step 2: Run integration tests**

Run: `cd server && npm test -- --run integration/api/mergeReconciliation.integration.test.ts`
Expected: Tests pass (or skip if test DB not configured)

**Step 3: Commit**

```bash
git add server/integration/api/mergeReconciliation.integration.test.ts
git commit -m "test: add integration tests for merge reconciliation API"
```

---

## Task 14: Final Build and Test

**Step 1: Run full server build**

Run: `cd server && npm run build`
Expected: Build succeeds

**Step 2: Run all server tests**

Run: `cd server && npm test`
Expected: All tests pass

**Step 3: Run client build**

Run: `cd client && npm run build`
Expected: Build succeeds

**Step 4: Commit any remaining changes**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore: final cleanup for merge reconciliation feature"
```

---

## Summary

This implementation plan covers:

1. **Tasks 1-3**: Database schema changes (phash fields, MergeRecord table, migration)
2. **Tasks 4-5**: Sync changes (GraphQL query update, phash storage during sync)
3. **Tasks 6-8**: MergeReconciliationService (core logic with tests)
4. **Task 9**: Sync-time detection integration
5. **Tasks 10-12**: Admin API and UI (routes, MergeRecoveryTab component)
6. **Tasks 13-14**: Integration tests and final verification

Total commits: ~14 focused commits following TDD principles.
