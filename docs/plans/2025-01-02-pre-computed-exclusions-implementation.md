# Pre-Computed Exclusions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace runtime exclusion filtering with pre-computed database JOINs for scalable content filtering.

**Architecture:** Pre-compute excluded entity IDs per user into a `UserExcludedEntity` table. Query builders use LEFT JOIN + WHERE NULL to filter instead of loading exclusions into memory. Computation triggered on sync, restriction change, and hide/unhide operations.

**Tech Stack:** TypeScript, Prisma, SQLite, Vitest

**Design Document:** [Pre-Computed Exclusions Design](./2025-01-02-pre-computed-exclusions-design.md)

---

## Task 1: Add Database Schema

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add UserExcludedEntity model**

Add after the `UserHiddenEntity` model (around line 375):

```prisma
// Pre-computed exclusions (refreshed on sync/restriction changes)
// This is a derived/cached table - can be rebuilt anytime from UserContentRestriction + UserHiddenEntity
model UserExcludedEntity {
  id         Int      @id @default(autoincrement())
  userId     Int
  entityType String   // 'scene', 'performer', 'studio', 'tag', 'group', 'gallery', 'image'
  entityId   String   // Stash entity ID

  reason     String   // 'restricted', 'hidden', 'cascade', 'empty'
  computedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, entityType, entityId])
  @@index([userId, entityType])
  @@index([entityType, entityId])
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

**Step 2: Add relations to User model**

Find the User model (around line 10) and add these relations after `hiddenEntities`:

```prisma
  // Pre-computed exclusions cache
  excludedEntities UserExcludedEntity[]
  entityStats      UserEntityStats[]
```

**Step 3: Generate Prisma client and run migration**

Run:
```bash
cd server && npx prisma migrate dev --name add_exclusion_tables
```

Expected: Migration created and applied successfully.

**Step 4: Verify schema**

Run:
```bash
cd server && npx prisma db push --dry-run
```

Expected: "Your database is in sync"

**Step 5: Commit**

```bash
git add server/prisma/
git commit -m "feat: add UserExcludedEntity and UserEntityStats tables"
```

---

## Task 2: Create ExclusionComputationService - Core Structure

**Files:**
- Create: `server/services/ExclusionComputationService.ts`
- Create: `server/services/__tests__/ExclusionComputationService.test.ts`

**Step 1: Write failing test for basic structure**

Create `server/services/__tests__/ExclusionComputationService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing service
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $transaction: vi.fn(),
    userExcludedEntity: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    userEntityStats: {
      upsert: vi.fn(),
    },
    userContentRestriction: {
      findMany: vi.fn(),
    },
    userHiddenEntity: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

import { exclusionComputationService } from "../ExclusionComputationService.js";

describe("ExclusionComputationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recomputeForUser", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.recomputeForUser).toBe("function");
    });
  });

  describe("recomputeAllUsers", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.recomputeAllUsers).toBe("function");
    });
  });

  describe("addHiddenEntity", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.addHiddenEntity).toBe("function");
    });
  });

  describe("removeHiddenEntity", () => {
    it("should be a callable method", () => {
      expect(typeof exclusionComputationService.removeHiddenEntity).toBe("function");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd server && npm test -- services/__tests__/ExclusionComputationService.test.ts
```

Expected: FAIL - Cannot find module '../ExclusionComputationService.js'

**Step 3: Create minimal service skeleton**

Create `server/services/ExclusionComputationService.ts`:

```typescript
/**
 * ExclusionComputationService
 *
 * Computes and maintains the UserExcludedEntity table which stores
 * pre-computed exclusions for each user. This enables efficient
 * JOIN-based filtering instead of loading exclusions into memory.
 *
 * Exclusion sources:
 * - UserContentRestriction (admin restrictions) -> reason='restricted'
 * - UserHiddenEntity (user hidden items) -> reason='hidden'
 * - Cascades from hidden entities -> reason='cascade'
 * - Empty organizational entities -> reason='empty'
 */

import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

class ExclusionComputationService {
  /**
   * Full recompute for a user.
   * Runs in a transaction - if any phase fails, previous exclusions are preserved.
   */
  async recomputeForUser(userId: number): Promise<void> {
    logger.info("ExclusionComputationService.recomputeForUser starting", { userId });
    // Implementation in next task
  }

  /**
   * Recompute exclusions for all users.
   * Called after Stash sync completes.
   */
  async recomputeAllUsers(): Promise<void> {
    logger.info("ExclusionComputationService.recomputeAllUsers starting");
    // Implementation in next task
  }

  /**
   * Incremental update when user hides an entity.
   * Synchronous - user waits for completion.
   */
  async addHiddenEntity(
    userId: number,
    entityType: string,
    entityId: string
  ): Promise<void> {
    logger.info("ExclusionComputationService.addHiddenEntity", {
      userId,
      entityType,
      entityId,
    });
    // Implementation in later task
  }

  /**
   * Handle user unhiding an entity.
   * Queues async recompute since cascades need recalculation.
   */
  async removeHiddenEntity(
    userId: number,
    entityType: string,
    entityId: string
  ): Promise<void> {
    logger.info("ExclusionComputationService.removeHiddenEntity", {
      userId,
      entityType,
      entityId,
    });
    // Implementation in later task
  }
}

export const exclusionComputationService = new ExclusionComputationService();
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd server && npm test -- services/__tests__/ExclusionComputationService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add server/services/ExclusionComputationService.ts server/services/__tests__/ExclusionComputationService.test.ts
git commit -m "feat: add ExclusionComputationService skeleton"
```

---

## Task 3: Implement Direct Exclusions (Restrictions + Hidden)

**Files:**
- Modify: `server/services/ExclusionComputationService.ts`
- Modify: `server/services/__tests__/ExclusionComputationService.test.ts`

**Step 1: Write failing test for direct exclusions**

Add to `ExclusionComputationService.test.ts`:

```typescript
import prisma from "../../prisma/singleton.js";

const mockPrisma = prisma as any;

describe("computeDirectExclusions", () => {
  it("should process UserContentRestriction EXCLUDE mode", async () => {
    // Setup: user has restriction excluding specific tags
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([
      {
        userId: 1,
        entityType: "tags",
        mode: "EXCLUDE",
        entityIds: JSON.stringify(["tag1", "tag2"]),
      },
    ]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    // Mock transaction to execute callback
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    // Verify createMany was called with the excluded tags
    expect(mockPrisma.userExcludedEntity.createMany).toHaveBeenCalled();
    const createCall = mockPrisma.userExcludedEntity.createMany.mock.calls[0][0];
    expect(createCall.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 1,
          entityType: "tag",
          entityId: "tag1",
          reason: "restricted",
        }),
        expect.objectContaining({
          userId: 1,
          entityType: "tag",
          entityId: "tag2",
          reason: "restricted",
        }),
      ])
    );
  });

  it("should process UserHiddenEntity records", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "perf1" },
      { userId: 1, entityType: "scene", entityId: "scene1" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    expect(mockPrisma.userExcludedEntity.createMany).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd server && npm test -- services/__tests__/ExclusionComputationService.test.ts
```

Expected: FAIL - createMany not called or called with wrong data

**Step 3: Implement direct exclusions**

Update `server/services/ExclusionComputationService.ts`:

```typescript
/**
 * ExclusionComputationService
 *
 * Computes and maintains the UserExcludedEntity table which stores
 * pre-computed exclusions for each user. This enables efficient
 * JOIN-based filtering instead of loading exclusions into memory.
 *
 * Exclusion sources:
 * - UserContentRestriction (admin restrictions) -> reason='restricted'
 * - UserHiddenEntity (user hidden items) -> reason='hidden'
 * - Cascades from hidden entities -> reason='cascade'
 * - Empty organizational entities -> reason='empty'
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

// Type for Prisma transaction client
type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

// Entity type mapping from restriction entityType to exclusion entityType
const RESTRICTION_ENTITY_MAP: Record<string, string> = {
  tags: "tag",
  studios: "studio",
  groups: "group",
  galleries: "gallery",
  performers: "performer",
};

class ExclusionComputationService {
  /**
   * Full recompute for a user.
   * Runs in a transaction - if any phase fails, previous exclusions are preserved.
   */
  async recomputeForUser(userId: number): Promise<void> {
    const startTime = Date.now();
    logger.info("ExclusionComputationService.recomputeForUser starting", { userId });

    await prisma.$transaction(async (tx) => {
      // Phase 1: Clear existing exclusions
      await tx.userExcludedEntity.deleteMany({ where: { userId } });

      // Phase 2: Compute direct exclusions (restrictions + hidden)
      await this.computeDirectExclusions(tx, userId);

      // Phase 3: Compute cascade exclusions (to be implemented)
      // await this.computeCascadeExclusions(tx, userId);

      // Phase 4: Compute empty exclusions (to be implemented)
      // await this.computeEmptyExclusions(tx, userId);

      // Phase 5: Update stats (to be implemented)
      // await this.updateEntityStats(tx, userId);
    });

    logger.info("ExclusionComputationService.recomputeForUser complete", {
      userId,
      durationMs: Date.now() - startTime,
    });
  }

  /**
   * Recompute exclusions for all users.
   * Called after Stash sync completes.
   */
  async recomputeAllUsers(): Promise<void> {
    const startTime = Date.now();
    logger.info("ExclusionComputationService.recomputeAllUsers starting");

    const users = await prisma.user.findMany({ select: { id: true } });

    for (const user of users) {
      await this.recomputeForUser(user.id);
    }

    logger.info("ExclusionComputationService.recomputeAllUsers complete", {
      userCount: users.length,
      durationMs: Date.now() - startTime,
    });
  }

  /**
   * Incremental update when user hides an entity.
   * Synchronous - user waits for completion.
   */
  async addHiddenEntity(
    userId: number,
    entityType: string,
    entityId: string
  ): Promise<void> {
    logger.info("ExclusionComputationService.addHiddenEntity", {
      userId,
      entityType,
      entityId,
    });
    // Implementation in later task
  }

  /**
   * Handle user unhiding an entity.
   * Queues async recompute since cascades need recalculation.
   */
  async removeHiddenEntity(
    userId: number,
    entityType: string,
    entityId: string
  ): Promise<void> {
    logger.info("ExclusionComputationService.removeHiddenEntity", {
      userId,
      entityType,
      entityId,
    });
    // Implementation in later task
  }

  /**
   * Phase 2: Compute direct exclusions from restrictions and hidden entities.
   */
  private async computeDirectExclusions(
    tx: TransactionClient,
    userId: number
  ): Promise<void> {
    const exclusions: Array<{
      userId: number;
      entityType: string;
      entityId: string;
      reason: string;
    }> = [];

    // Process UserContentRestriction rules
    const restrictions = await tx.userContentRestriction.findMany({
      where: { userId },
    });

    for (const restriction of restrictions) {
      const entityType = RESTRICTION_ENTITY_MAP[restriction.entityType];
      if (!entityType) {
        logger.warn("Unknown restriction entityType", {
          entityType: restriction.entityType,
        });
        continue;
      }

      const entityIds: string[] = JSON.parse(restriction.entityIds || "[]");

      if (restriction.mode === "EXCLUDE") {
        // Direct exclusion: these entities are excluded
        for (const entityId of entityIds) {
          exclusions.push({
            userId,
            entityType,
            entityId,
            reason: "restricted",
          });
        }
      } else if (restriction.mode === "INCLUDE") {
        // Invert: exclude everything NOT in this list
        // This requires fetching all entity IDs of this type
        const allIds = await this.getAllEntityIds(tx, entityType);
        const includedSet = new Set(entityIds);
        for (const entityId of allIds) {
          if (!includedSet.has(entityId)) {
            exclusions.push({
              userId,
              entityType,
              entityId,
              reason: "restricted",
            });
          }
        }
      }
    }

    // Process UserHiddenEntity records
    const hiddenEntities = await tx.userHiddenEntity.findMany({
      where: { userId },
    });

    for (const hidden of hiddenEntities) {
      exclusions.push({
        userId,
        entityType: hidden.entityType,
        entityId: hidden.entityId,
        reason: "hidden",
      });
    }

    // Batch insert all exclusions
    if (exclusions.length > 0) {
      await tx.userExcludedEntity.createMany({
        data: exclusions,
        skipDuplicates: true,
      });
    }

    logger.debug("computeDirectExclusions complete", {
      userId,
      restrictionCount: restrictions.length,
      hiddenCount: hiddenEntities.length,
      exclusionCount: exclusions.length,
    });
  }

  /**
   * Get all entity IDs of a given type (for INCLUDE mode inversion).
   */
  private async getAllEntityIds(
    tx: TransactionClient,
    entityType: string
  ): Promise<string[]> {
    switch (entityType) {
      case "scene":
        return (
          await tx.stashScene.findMany({
            where: { deletedAt: null },
            select: { id: true },
          })
        ).map((e) => e.id);
      case "performer":
        return (
          await tx.stashPerformer.findMany({
            where: { deletedAt: null },
            select: { id: true },
          })
        ).map((e) => e.id);
      case "studio":
        return (
          await tx.stashStudio.findMany({
            where: { deletedAt: null },
            select: { id: true },
          })
        ).map((e) => e.id);
      case "tag":
        return (
          await tx.stashTag.findMany({
            where: { deletedAt: null },
            select: { id: true },
          })
        ).map((e) => e.id);
      case "group":
        return (
          await tx.stashGroup.findMany({
            where: { deletedAt: null },
            select: { id: true },
          })
        ).map((e) => e.id);
      case "gallery":
        return (
          await tx.stashGallery.findMany({
            where: { deletedAt: null },
            select: { id: true },
          })
        ).map((e) => e.id);
      case "image":
        return (
          await tx.stashImage.findMany({
            where: { deletedAt: null },
            select: { id: true },
          })
        ).map((e) => e.id);
      default:
        logger.warn("Unknown entity type in getAllEntityIds", { entityType });
        return [];
    }
  }
}

export const exclusionComputationService = new ExclusionComputationService();
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd server && npm test -- services/__tests__/ExclusionComputationService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add server/services/ExclusionComputationService.ts server/services/__tests__/ExclusionComputationService.test.ts
git commit -m "feat: implement direct exclusions computation"
```

---

## Task 4: Implement Cascade Exclusions

**Files:**
- Modify: `server/services/ExclusionComputationService.ts`
- Modify: `server/services/__tests__/ExclusionComputationService.test.ts`

**Step 1: Write failing test for cascade exclusions**

Add to the test file:

```typescript
describe("computeCascadeExclusions", () => {
  it("should cascade performer exclusion to their scenes", async () => {
    // Setup: performer1 is excluded
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "perf1" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "performer", entityId: "perf1", reason: "hidden" },
    ]);
    mockPrisma.scenePerformer.findMany.mockResolvedValue([
      { sceneId: "scene1", performerId: "perf1" },
      { sceneId: "scene2", performerId: "perf1" },
    ]);
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 3 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    // Verify scenes were cascade-excluded
    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene1",
          reason: "cascade",
        }),
        expect.objectContaining({
          entityType: "scene",
          entityId: "scene2",
          reason: "cascade",
        }),
      ])
    );
  });

  it("should cascade tag exclusion to scenes with that tag (direct and inherited)", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "tag", entityId: "tag1" },
    ]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.findMany.mockResolvedValue([
      { userId: 1, entityType: "tag", entityId: "tag1", reason: "hidden" },
    ]);
    // Direct tag association
    mockPrisma.sceneTag.findMany.mockResolvedValue([
      { sceneId: "scene1", tagId: "tag1" },
    ]);
    // Inherited tags - raw query mock
    mockPrisma.$queryRaw = vi.fn().mockResolvedValue([{ id: "scene2" }]);
    mockPrisma.performerTag.findMany.mockResolvedValue([]);
    mockPrisma.studioTag.findMany.mockResolvedValue([]);
    mockPrisma.groupTag.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 3 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "scene", entityId: "scene1" }),
        expect.objectContaining({ entityType: "scene", entityId: "scene2" }),
      ])
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd server && npm test -- services/__tests__/ExclusionComputationService.test.ts
```

Expected: FAIL

**Step 3: Implement cascade exclusions**

Add to `ExclusionComputationService.ts` after `computeDirectExclusions`:

```typescript
  /**
   * Phase 3: Compute cascade exclusions from hidden/restricted entities.
   */
  private async computeCascadeExclusions(
    tx: TransactionClient,
    userId: number
  ): Promise<void> {
    // Get all directly excluded entities
    const directExclusions = await tx.userExcludedEntity.findMany({
      where: {
        userId,
        reason: { in: ["restricted", "hidden"] },
      },
    });

    // Group by entity type
    const byType = new Map<string, string[]>();
    for (const exc of directExclusions) {
      const list = byType.get(exc.entityType) || [];
      list.push(exc.entityId);
      byType.set(exc.entityType, list);
    }

    const cascadeExclusions: Array<{
      userId: number;
      entityType: string;
      entityId: string;
      reason: string;
    }> = [];

    // Cascade: excluded performers → their scenes
    const excludedPerformers = byType.get("performer") || [];
    if (excludedPerformers.length > 0) {
      const scenePerformers = await tx.scenePerformer.findMany({
        where: { performerId: { in: excludedPerformers } },
        select: { sceneId: true },
      });
      for (const sp of scenePerformers) {
        cascadeExclusions.push({
          userId,
          entityType: "scene",
          entityId: sp.sceneId,
          reason: "cascade",
        });
      }
    }

    // Cascade: excluded studios → their scenes
    const excludedStudios = byType.get("studio") || [];
    if (excludedStudios.length > 0) {
      const scenes = await tx.stashScene.findMany({
        where: { studioId: { in: excludedStudios }, deletedAt: null },
        select: { id: true },
      });
      for (const s of scenes) {
        cascadeExclusions.push({
          userId,
          entityType: "scene",
          entityId: s.id,
          reason: "cascade",
        });
      }
    }

    // Cascade: excluded tags → scenes (direct + inherited), performers, studios, groups
    const excludedTags = byType.get("tag") || [];
    if (excludedTags.length > 0) {
      // Scenes with direct tag
      const directTagScenes = await tx.sceneTag.findMany({
        where: { tagId: { in: excludedTags } },
        select: { sceneId: true },
      });
      for (const st of directTagScenes) {
        cascadeExclusions.push({
          userId,
          entityType: "scene",
          entityId: st.sceneId,
          reason: "cascade",
        });
      }

      // Scenes with inherited tag (using raw SQL for JSON search)
      // Build a query that finds scenes where inheritedTagIds contains any of the excluded tags
      for (const tagId of excludedTags) {
        const inheritedScenes = await (tx as any).$queryRaw`
          SELECT id FROM StashScene
          WHERE deletedAt IS NULL
          AND EXISTS (
            SELECT 1 FROM json_each(inheritedTagIds)
            WHERE json_each.value = ${tagId}
          )
        `;
        for (const s of inheritedScenes as { id: string }[]) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: s.id,
            reason: "cascade",
          });
        }
      }

      // Performers with excluded tag
      const taggedPerformers = await tx.performerTag.findMany({
        where: { tagId: { in: excludedTags } },
        select: { performerId: true },
      });
      for (const pt of taggedPerformers) {
        cascadeExclusions.push({
          userId,
          entityType: "performer",
          entityId: pt.performerId,
          reason: "cascade",
        });
      }

      // Studios with excluded tag
      const taggedStudios = await tx.studioTag.findMany({
        where: { tagId: { in: excludedTags } },
        select: { studioId: true },
      });
      for (const st of taggedStudios) {
        cascadeExclusions.push({
          userId,
          entityType: "studio",
          entityId: st.studioId,
          reason: "cascade",
        });
      }

      // Groups with excluded tag
      const taggedGroups = await tx.groupTag.findMany({
        where: { tagId: { in: excludedTags } },
        select: { groupId: true },
      });
      for (const gt of taggedGroups) {
        cascadeExclusions.push({
          userId,
          entityType: "group",
          entityId: gt.groupId,
          reason: "cascade",
        });
      }
    }

    // Cascade: excluded groups → their scenes
    const excludedGroups = byType.get("group") || [];
    if (excludedGroups.length > 0) {
      const sceneGroups = await tx.sceneGroup.findMany({
        where: { groupId: { in: excludedGroups } },
        select: { sceneId: true },
      });
      for (const sg of sceneGroups) {
        cascadeExclusions.push({
          userId,
          entityType: "scene",
          entityId: sg.sceneId,
          reason: "cascade",
        });
      }
    }

    // Cascade: excluded galleries → linked scenes, images in gallery
    const excludedGalleries = byType.get("gallery") || [];
    if (excludedGalleries.length > 0) {
      const sceneGalleries = await tx.sceneGallery.findMany({
        where: { galleryId: { in: excludedGalleries } },
        select: { sceneId: true },
      });
      for (const sg of sceneGalleries) {
        cascadeExclusions.push({
          userId,
          entityType: "scene",
          entityId: sg.sceneId,
          reason: "cascade",
        });
      }

      const galleryImages = await tx.imageGallery.findMany({
        where: { galleryId: { in: excludedGalleries } },
        select: { imageId: true },
      });
      for (const gi of galleryImages) {
        cascadeExclusions.push({
          userId,
          entityType: "image",
          entityId: gi.imageId,
          reason: "cascade",
        });
      }
    }

    // Batch insert cascade exclusions
    if (cascadeExclusions.length > 0) {
      await tx.userExcludedEntity.createMany({
        data: cascadeExclusions,
        skipDuplicates: true,
      });
    }

    logger.debug("computeCascadeExclusions complete", {
      userId,
      cascadeCount: cascadeExclusions.length,
    });
  }
```

Also update `recomputeForUser` to call this method:

```typescript
  async recomputeForUser(userId: number): Promise<void> {
    const startTime = Date.now();
    logger.info("ExclusionComputationService.recomputeForUser starting", { userId });

    await prisma.$transaction(async (tx) => {
      // Phase 1: Clear existing exclusions
      await tx.userExcludedEntity.deleteMany({ where: { userId } });

      // Phase 2: Compute direct exclusions (restrictions + hidden)
      await this.computeDirectExclusions(tx, userId);

      // Phase 3: Compute cascade exclusions
      await this.computeCascadeExclusions(tx, userId);

      // Phase 4: Compute empty exclusions (to be implemented)
      // await this.computeEmptyExclusions(tx, userId);

      // Phase 5: Update stats (to be implemented)
      // await this.updateEntityStats(tx, userId);
    });

    logger.info("ExclusionComputationService.recomputeForUser complete", {
      userId,
      durationMs: Date.now() - startTime,
    });
  }
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd server && npm test -- services/__tests__/ExclusionComputationService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add server/services/ExclusionComputationService.ts server/services/__tests__/ExclusionComputationService.test.ts
git commit -m "feat: implement cascade exclusions computation"
```

---

## Task 5: Implement Empty Entity Exclusions

**Files:**
- Modify: `server/services/ExclusionComputationService.ts`
- Modify: `server/services/__tests__/ExclusionComputationService.test.ts`

**Step 1: Write failing test for empty exclusions**

Add to test file:

```typescript
describe("computeEmptyExclusions", () => {
  it("should exclude galleries with no visible images", async () => {
    mockPrisma.userContentRestriction.findMany.mockResolvedValue([]);
    mockPrisma.userHiddenEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.userExcludedEntity.findMany.mockResolvedValue([]);

    // Mock raw query for empty galleries
    mockPrisma.$queryRaw = vi.fn().mockResolvedValue([
      { id: "gallery1" },
      { id: "gallery2" },
    ]);

    mockPrisma.userExcludedEntity.createMany.mockResolvedValue({ count: 2 });

    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });

    await exclusionComputationService.recomputeForUser(1);

    const calls = mockPrisma.userExcludedEntity.createMany.mock.calls;
    const allData = calls.flatMap((c: any) => c[0].data || []);

    expect(allData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "gallery",
          reason: "empty",
        }),
      ])
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd server && npm test -- services/__tests__/ExclusionComputationService.test.ts
```

Expected: FAIL

**Step 3: Implement empty exclusions**

Add to `ExclusionComputationService.ts`:

```typescript
  /**
   * Phase 4: Compute empty entity exclusions.
   * Excludes organizational entities with no visible content.
   */
  private async computeEmptyExclusions(
    tx: TransactionClient,
    userId: number
  ): Promise<void> {
    const emptyExclusions: Array<{
      userId: number;
      entityType: string;
      entityId: string;
      reason: string;
    }> = [];

    // Empty galleries: galleries with 0 visible images
    const emptyGalleries = await (tx as any).$queryRaw`
      SELECT g.id FROM StashGallery g
      WHERE g.deletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM ImageGallery ig
        JOIN StashImage i ON ig.imageId = i.id
        LEFT JOIN UserExcludedEntity e ON e.userId = ${userId} AND e.entityType = 'image' AND e.entityId = i.id
        WHERE ig.galleryId = g.id AND i.deletedAt IS NULL AND e.id IS NULL
      )
    `;
    for (const g of emptyGalleries as { id: string }[]) {
      emptyExclusions.push({
        userId,
        entityType: "gallery",
        entityId: g.id,
        reason: "empty",
      });
    }

    // Empty performers: performers with 0 visible scenes AND 0 visible images
    const emptyPerformers = await (tx as any).$queryRaw`
      SELECT p.id FROM StashPerformer p
      WHERE p.deletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM ScenePerformer sp
        JOIN StashScene s ON sp.sceneId = s.id
        LEFT JOIN UserExcludedEntity e ON e.userId = ${userId} AND e.entityType = 'scene' AND e.entityId = s.id
        WHERE sp.performerId = p.id AND s.deletedAt IS NULL AND e.id IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM ImagePerformer ip
        JOIN StashImage i ON ip.imageId = i.id
        LEFT JOIN UserExcludedEntity e ON e.userId = ${userId} AND e.entityType = 'image' AND e.entityId = i.id
        WHERE ip.performerId = p.id AND i.deletedAt IS NULL AND e.id IS NULL
      )
    `;
    for (const p of emptyPerformers as { id: string }[]) {
      emptyExclusions.push({
        userId,
        entityType: "performer",
        entityId: p.id,
        reason: "empty",
      });
    }

    // Empty studios: studios with 0 visible scenes AND 0 visible images AND no visible child studios
    // Note: This requires recursive CTE for hierarchy, simplified version first
    const emptyStudios = await (tx as any).$queryRaw`
      SELECT st.id FROM StashStudio st
      WHERE st.deletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM StashScene s
        LEFT JOIN UserExcludedEntity e ON e.userId = ${userId} AND e.entityType = 'scene' AND e.entityId = s.id
        WHERE s.studioId = st.id AND s.deletedAt IS NULL AND e.id IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM ImageStudio ims
        JOIN StashImage i ON ims.imageId = i.id
        LEFT JOIN UserExcludedEntity e ON e.userId = ${userId} AND e.entityType = 'image' AND e.entityId = i.id
        WHERE ims.studioId = st.id AND i.deletedAt IS NULL AND e.id IS NULL
      )
    `;
    for (const s of emptyStudios as { id: string }[]) {
      emptyExclusions.push({
        userId,
        entityType: "studio",
        entityId: s.id,
        reason: "empty",
      });
    }

    // Empty groups: groups with 0 visible scenes
    const emptyGroups = await (tx as any).$queryRaw`
      SELECT g.id FROM StashGroup g
      WHERE g.deletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM SceneGroup sg
        JOIN StashScene s ON sg.sceneId = s.id
        LEFT JOIN UserExcludedEntity e ON e.userId = ${userId} AND e.entityType = 'scene' AND e.entityId = s.id
        WHERE sg.groupId = g.id AND s.deletedAt IS NULL AND e.id IS NULL
      )
    `;
    for (const g of emptyGroups as { id: string }[]) {
      emptyExclusions.push({
        userId,
        entityType: "group",
        entityId: g.id,
        reason: "empty",
      });
    }

    // Empty tags: tags not attached to any visible entity
    const emptyTags = await (tx as any).$queryRaw`
      SELECT t.id FROM StashTag t
      WHERE t.deletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM SceneTag st
        JOIN StashScene s ON st.sceneId = s.id
        LEFT JOIN UserExcludedEntity e ON e.userId = ${userId} AND e.entityType = 'scene' AND e.entityId = s.id
        WHERE st.tagId = t.id AND s.deletedAt IS NULL AND e.id IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM PerformerTag pt
        JOIN StashPerformer p ON pt.performerId = p.id
        LEFT JOIN UserExcludedEntity e ON e.userId = ${userId} AND e.entityType = 'performer' AND e.entityId = p.id
        WHERE pt.tagId = t.id AND p.deletedAt IS NULL AND e.id IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM StudioTag stt
        JOIN StashStudio st ON stt.studioId = st.id
        LEFT JOIN UserExcludedEntity e ON e.userId = ${userId} AND e.entityType = 'studio' AND e.entityId = st.id
        WHERE stt.tagId = t.id AND st.deletedAt IS NULL AND e.id IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM GroupTag gt
        JOIN StashGroup g ON gt.groupId = g.id
        LEFT JOIN UserExcludedEntity e ON e.userId = ${userId} AND e.entityType = 'group' AND e.entityId = g.id
        WHERE gt.tagId = t.id AND g.deletedAt IS NULL AND e.id IS NULL
      )
    `;
    for (const t of emptyTags as { id: string }[]) {
      emptyExclusions.push({
        userId,
        entityType: "tag",
        entityId: t.id,
        reason: "empty",
      });
    }

    // Batch insert empty exclusions
    if (emptyExclusions.length > 0) {
      await tx.userExcludedEntity.createMany({
        data: emptyExclusions,
        skipDuplicates: true,
      });
    }

    logger.debug("computeEmptyExclusions complete", {
      userId,
      emptyCount: emptyExclusions.length,
    });
  }
```

Update `recomputeForUser` to call this method:

```typescript
      // Phase 4: Compute empty exclusions
      await this.computeEmptyExclusions(tx, userId);
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd server && npm test -- services/__tests__/ExclusionComputationService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add server/services/ExclusionComputationService.ts server/services/__tests__/ExclusionComputationService.test.ts
git commit -m "feat: implement empty entity exclusions computation"
```

---

## Task 6: Implement Entity Stats Update

**Files:**
- Modify: `server/services/ExclusionComputationService.ts`

**Step 1: Implement stats update**

Add to `ExclusionComputationService.ts`:

```typescript
  /**
   * Phase 5: Update visible entity counts for the user.
   */
  private async updateEntityStats(
    tx: TransactionClient,
    userId: number
  ): Promise<void> {
    const entityTypes = ["scene", "performer", "studio", "tag", "group", "gallery", "image"];

    for (const entityType of entityTypes) {
      const total = await this.getEntityCount(tx, entityType);
      const excluded = await tx.userExcludedEntity.count({
        where: { userId, entityType },
      });

      await tx.userEntityStats.upsert({
        where: { userId_entityType: { userId, entityType } },
        create: { userId, entityType, visibleCount: total - excluded },
        update: { visibleCount: total - excluded },
      });
    }

    logger.debug("updateEntityStats complete", { userId });
  }

  /**
   * Get total count of entities of a given type.
   */
  private async getEntityCount(
    tx: TransactionClient,
    entityType: string
  ): Promise<number> {
    switch (entityType) {
      case "scene":
        return tx.stashScene.count({ where: { deletedAt: null } });
      case "performer":
        return tx.stashPerformer.count({ where: { deletedAt: null } });
      case "studio":
        return tx.stashStudio.count({ where: { deletedAt: null } });
      case "tag":
        return tx.stashTag.count({ where: { deletedAt: null } });
      case "group":
        return tx.stashGroup.count({ where: { deletedAt: null } });
      case "gallery":
        return tx.stashGallery.count({ where: { deletedAt: null } });
      case "image":
        return tx.stashImage.count({ where: { deletedAt: null } });
      default:
        return 0;
    }
  }
```

Update `recomputeForUser` to call this method:

```typescript
      // Phase 5: Update stats
      await this.updateEntityStats(tx, userId);
```

**Step 2: Run tests**

Run:
```bash
cd server && npm test -- services/__tests__/ExclusionComputationService.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add server/services/ExclusionComputationService.ts
git commit -m "feat: implement entity stats update"
```

---

## Task 7: Implement Incremental Hide/Unhide

**Files:**
- Modify: `server/services/ExclusionComputationService.ts`
- Modify: `server/services/__tests__/ExclusionComputationService.test.ts`

**Step 1: Implement addHiddenEntity**

```typescript
  /**
   * Incremental update when user hides an entity.
   * Synchronous - user waits for completion.
   */
  async addHiddenEntity(
    userId: number,
    entityType: string,
    entityId: string
  ): Promise<void> {
    const startTime = Date.now();
    logger.info("ExclusionComputationService.addHiddenEntity", {
      userId,
      entityType,
      entityId,
    });

    await prisma.$transaction(async (tx) => {
      // Add the direct exclusion
      await tx.userExcludedEntity.upsert({
        where: {
          userId_entityType_entityId: { userId, entityType, entityId },
        },
        create: { userId, entityType, entityId, reason: "hidden" },
        update: { reason: "hidden" },
      });

      // Compute cascades for this specific entity
      await this.addCascadesForEntity(tx, userId, entityType, entityId);
    });

    logger.info("ExclusionComputationService.addHiddenEntity complete", {
      userId,
      entityType,
      entityId,
      durationMs: Date.now() - startTime,
    });
  }

  /**
   * Compute and add cascade exclusions for a single hidden entity.
   */
  private async addCascadesForEntity(
    tx: TransactionClient,
    userId: number,
    entityType: string,
    entityId: string
  ): Promise<void> {
    const cascades: Array<{
      userId: number;
      entityType: string;
      entityId: string;
      reason: string;
    }> = [];

    switch (entityType) {
      case "performer": {
        const scenes = await tx.scenePerformer.findMany({
          where: { performerId: entityId },
          select: { sceneId: true },
        });
        for (const s of scenes) {
          cascades.push({
            userId,
            entityType: "scene",
            entityId: s.sceneId,
            reason: "cascade",
          });
        }
        break;
      }

      case "studio": {
        const scenes = await tx.stashScene.findMany({
          where: { studioId: entityId, deletedAt: null },
          select: { id: true },
        });
        for (const s of scenes) {
          cascades.push({
            userId,
            entityType: "scene",
            entityId: s.id,
            reason: "cascade",
          });
        }
        break;
      }

      case "tag": {
        // Scenes with direct tag
        const directScenes = await tx.sceneTag.findMany({
          where: { tagId: entityId },
          select: { sceneId: true },
        });
        for (const s of directScenes) {
          cascades.push({
            userId,
            entityType: "scene",
            entityId: s.sceneId,
            reason: "cascade",
          });
        }

        // Scenes with inherited tag
        const inheritedScenes = await (tx as any).$queryRaw`
          SELECT id FROM StashScene
          WHERE deletedAt IS NULL
          AND EXISTS (
            SELECT 1 FROM json_each(inheritedTagIds)
            WHERE json_each.value = ${entityId}
          )
        `;
        for (const s of inheritedScenes as { id: string }[]) {
          cascades.push({
            userId,
            entityType: "scene",
            entityId: s.id,
            reason: "cascade",
          });
        }

        // Performers, studios, groups with this tag
        const performers = await tx.performerTag.findMany({
          where: { tagId: entityId },
          select: { performerId: true },
        });
        for (const p of performers) {
          cascades.push({
            userId,
            entityType: "performer",
            entityId: p.performerId,
            reason: "cascade",
          });
        }

        const studios = await tx.studioTag.findMany({
          where: { tagId: entityId },
          select: { studioId: true },
        });
        for (const s of studios) {
          cascades.push({
            userId,
            entityType: "studio",
            entityId: s.studioId,
            reason: "cascade",
          });
        }

        const groups = await tx.groupTag.findMany({
          where: { tagId: entityId },
          select: { groupId: true },
        });
        for (const g of groups) {
          cascades.push({
            userId,
            entityType: "group",
            entityId: g.groupId,
            reason: "cascade",
          });
        }
        break;
      }

      case "group": {
        const scenes = await tx.sceneGroup.findMany({
          where: { groupId: entityId },
          select: { sceneId: true },
        });
        for (const s of scenes) {
          cascades.push({
            userId,
            entityType: "scene",
            entityId: s.sceneId,
            reason: "cascade",
          });
        }
        break;
      }

      case "gallery": {
        const scenes = await tx.sceneGallery.findMany({
          where: { galleryId: entityId },
          select: { sceneId: true },
        });
        for (const s of scenes) {
          cascades.push({
            userId,
            entityType: "scene",
            entityId: s.sceneId,
            reason: "cascade",
          });
        }

        const images = await tx.imageGallery.findMany({
          where: { galleryId: entityId },
          select: { imageId: true },
        });
        for (const i of images) {
          cascades.push({
            userId,
            entityType: "image",
            entityId: i.imageId,
            reason: "cascade",
          });
        }
        break;
      }
    }

    if (cascades.length > 0) {
      await tx.userExcludedEntity.createMany({
        data: cascades,
        skipDuplicates: true,
      });
    }
  }
```

**Step 2: Implement removeHiddenEntity**

```typescript
  /**
   * Handle user unhiding an entity.
   * Queues async recompute since cascades need recalculation.
   */
  async removeHiddenEntity(
    userId: number,
    entityType: string,
    entityId: string
  ): Promise<void> {
    logger.info("ExclusionComputationService.removeHiddenEntity", {
      userId,
      entityType,
      entityId,
    });

    // Queue async recompute - the unhide might affect cascade exclusions
    // that need to be recalculated based on remaining hidden entities
    setImmediate(() => {
      this.recomputeForUser(userId).catch((err) => {
        logger.error("Failed to recompute exclusions after unhide", {
          userId,
          entityType,
          entityId,
          error: err,
        });
      });
    });
  }
```

**Step 3: Run tests**

Run:
```bash
cd server && npm test -- services/__tests__/ExclusionComputationService.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add server/services/ExclusionComputationService.ts server/services/__tests__/ExclusionComputationService.test.ts
git commit -m "feat: implement incremental hide/unhide operations"
```

---

## Task 8: Update SceneQueryBuilder to Use Exclusion JOIN

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`
- Modify: `server/services/__tests__/SceneQueryBuilder.test.ts`

**Step 1: Update SceneQueryOptions interface**

In `SceneQueryBuilder.ts`, change the interface:

```typescript
// Query builder options
export interface SceneQueryOptions {
  userId: number;
  filters?: PeekSceneFilter;
  applyExclusions?: boolean;  // Default true, replaces excludedSceneIds
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  randomSeed?: number;
}
```

**Step 2: Update buildFromClause to include exclusion JOIN**

```typescript
  // Base FROM clause with user data JOINs and exclusion filter
  private buildFromClause(userId: number, applyExclusions: boolean = true): { sql: string; params: number[] } {
    const baseJoins = `
      FROM StashScene s
      LEFT JOIN SceneRating r ON s.id = r.sceneId AND r.userId = ?
      LEFT JOIN WatchHistory w ON s.id = w.sceneId AND w.userId = ?
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
      LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = s.id`,
        params: [userId, userId, userId],
      };
    }

    return {
      sql: baseJoins,
      params: [userId, userId],
    };
  }
```

**Step 3: Update buildBaseWhere to include exclusion filter**

```typescript
  // Base WHERE clause (always filter deleted, optionally filter excluded)
  private buildBaseWhere(applyExclusions: boolean = true): FilterClause {
    if (applyExclusions) {
      return {
        sql: "s.deletedAt IS NULL AND e.id IS NULL",
        params: [],
      };
    }
    return {
      sql: "s.deletedAt IS NULL",
      params: [],
    };
  }
```

**Step 4: Remove buildExclusionFilter method**

Delete the `buildExclusionFilter` method (lines 88-125) - it's no longer needed.

**Step 5: Update execute method**

Update the `execute` method to use `applyExclusions` instead of `excludedSceneIds`:

```typescript
  async execute(options: SceneQueryOptions): Promise<SceneQueryResult> {
    const startTime = Date.now();
    const { userId, page, perPage, applyExclusions = true, filters } = options;

    // Build FROM clause
    const fromClause = this.buildFromClause(userId, applyExclusions);

    // Build WHERE clauses
    const whereClauses: FilterClause[] = [this.buildBaseWhere(applyExclusions)];

    // Remove the exclusion filter call - it's now in the JOIN
    // const exclusionFilter = this.buildExclusionFilter(excludedSceneIds || new Set());
    // if (exclusionFilter.sql) {
    //   whereClauses.push(exclusionFilter);
    // }

    // ... rest of the method stays the same
```

**Step 6: Run tests**

Run:
```bash
cd server && npm test -- services/
```

Expected: PASS (some tests may need updates for new interface)

**Step 7: Commit**

```bash
git add server/services/SceneQueryBuilder.ts server/services/__tests__/
git commit -m "refactor: update SceneQueryBuilder to use exclusion JOIN"
```

---

## Task 9: Update Scene Controllers to Remove getExcludedSceneIds Calls

**Files:**
- Modify: `server/controllers/library/scenes.ts`
- Modify: `server/controllers/carousel.ts`

**Step 1: Update scenes.ts**

Find all calls to `userRestrictionService.getExcludedSceneIds` and remove them. Update `sceneQueryBuilder.execute` calls to remove `excludedSceneIds` parameter.

Before:
```typescript
const excludedIds = await userRestrictionService.getExcludedSceneIds(userId, true);
const result = await sceneQueryBuilder.execute({
  userId,
  excludedSceneIds: excludedIds,
  // ...
});
```

After:
```typescript
const result = await sceneQueryBuilder.execute({
  userId,
  // applyExclusions defaults to true
  // ...
});
```

**Step 2: Update carousel.ts**

Same pattern - remove `getExcludedSceneIds` calls and `excludedSceneIds` parameters.

**Step 3: Run tests and verify server starts**

Run:
```bash
cd server && npm run build && npm test
```

Expected: Build succeeds, tests pass

**Step 4: Commit**

```bash
git add server/controllers/
git commit -m "refactor: remove getExcludedSceneIds calls from scene controllers"
```

---

## Task 10: Wire Up Sync Trigger

**Files:**
- Modify: `server/services/StashSyncService.ts`

**Step 1: Import ExclusionComputationService**

Add at top of file:
```typescript
import { exclusionComputationService } from "./ExclusionComputationService.js";
```

**Step 2: Call recomputeAllUsers after sync completes**

Find the sync completion point (after all entity types are synced) and add:

```typescript
// After sync completes, recompute exclusions for all users
logger.info("Sync complete, recomputing user exclusions...");
await exclusionComputationService.recomputeAllUsers();
logger.info("User exclusions recomputed");
```

**Step 3: Run tests**

Run:
```bash
cd server && npm test
```

Expected: PASS

**Step 4: Commit**

```bash
git add server/services/StashSyncService.ts
git commit -m "feat: trigger exclusion recompute after Stash sync"
```

---

## Task 11: Wire Up Hide/Unhide Triggers

**Files:**
- Modify: `server/services/UserHiddenEntityService.ts`

**Step 1: Import ExclusionComputationService**

Add at top of file:
```typescript
import { exclusionComputationService } from "./ExclusionComputationService.js";
```

**Step 2: Update hide method**

After adding to `UserHiddenEntity` table, call:
```typescript
await exclusionComputationService.addHiddenEntity(userId, entityType, entityId);
```

**Step 3: Update unhide method**

After removing from `UserHiddenEntity` table, call:
```typescript
await exclusionComputationService.removeHiddenEntity(userId, entityType, entityId);
```

**Step 4: Run tests**

Run:
```bash
cd server && npm test
```

Expected: PASS

**Step 5: Commit**

```bash
git add server/services/UserHiddenEntityService.ts
git commit -m "feat: trigger exclusion updates on hide/unhide"
```

---

## Task 12: Wire Up Restriction Change Trigger

**Files:**
- Modify: `server/controllers/user.ts` (or wherever restrictions are updated)

**Step 1: Find restriction update endpoint**

Look for the endpoint that handles `PUT /api/user/restrictions` or similar.

**Step 2: Add recompute call after restriction change**

```typescript
import { exclusionComputationService } from "../services/ExclusionComputationService.js";

// After updating UserContentRestriction:
await exclusionComputationService.recomputeForUser(userId);
```

**Step 3: Run tests**

Run:
```bash
cd server && npm test
```

Expected: PASS

**Step 4: Commit**

```bash
git add server/controllers/
git commit -m "feat: trigger exclusion recompute on restriction change"
```

---

## Task 13: Add Admin Endpoints for Manual Recompute

**Files:**
- Create or modify: `server/controllers/admin.ts` or `server/routes/admin.ts`

**Step 1: Add recompute endpoints**

```typescript
import { exclusionComputationService } from "../services/ExclusionComputationService.js";

// POST /api/admin/recompute-exclusions/:userId
router.post("/recompute-exclusions/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  await exclusionComputationService.recomputeForUser(userId);
  res.json({ success: true, message: `Recomputed exclusions for user ${userId}` });
});

// POST /api/admin/recompute-exclusions/all
router.post("/recompute-exclusions/all", requireAdmin, async (req, res) => {
  await exclusionComputationService.recomputeAllUsers();
  res.json({ success: true, message: "Recomputed exclusions for all users" });
});

// GET /api/admin/exclusion-stats
router.get("/exclusion-stats", requireAdmin, async (req, res) => {
  const stats = await prisma.userExcludedEntity.groupBy({
    by: ["userId", "entityType"],
    _count: true,
  });
  res.json(stats);
});
```

**Step 2: Run tests**

Run:
```bash
cd server && npm test
```

Expected: PASS

**Step 3: Commit**

```bash
git add server/controllers/ server/routes/
git commit -m "feat: add admin endpoints for exclusion management"
```

---

## Task 14: Update Other Entity Controllers (Performers, Studios, Tags, Groups, Galleries, Images)

**Files:**
- Modify: `server/controllers/library/performers.ts`
- Modify: `server/controllers/library/studios.ts`
- Modify: `server/controllers/library/tags.ts`
- Modify: `server/controllers/library/groups.ts`
- Modify: `server/controllers/library/galleries.ts`
- Modify: `server/controllers/library/images.ts`

For each controller, add exclusion JOIN to queries. The pattern is:

```sql
LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = '<type>' AND e.entityId = <table>.id
WHERE ... AND e.id IS NULL
```

This is a large task - break into sub-tasks per controller.

**Commit after each controller is updated:**

```bash
git add server/controllers/library/<entity>.ts
git commit -m "refactor: add exclusion JOIN to <entity> queries"
```

---

## Task 15: Remove Old Filtering Services

**Files:**
- Delete: `server/services/UserRestrictionService.ts`
- Delete: `server/services/EmptyEntityFilterService.ts`
- Delete: `server/services/FilteredEntityCacheService.ts`

**Step 1: Search for imports**

Run:
```bash
cd server && grep -r "UserRestrictionService\|EmptyEntityFilterService\|FilteredEntityCacheService" --include="*.ts"
```

Update any remaining imports to use the new services.

**Step 2: Delete old files**

```bash
rm server/services/UserRestrictionService.ts
rm server/services/EmptyEntityFilterService.ts
rm server/services/FilteredEntityCacheService.ts
```

**Step 3: Run build and tests**

Run:
```bash
cd server && npm run build && npm test
```

Expected: Build succeeds, tests pass

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove deprecated filtering services"
```

---

## Task 16: Final Integration Test

**Step 1: Start the server**

```bash
cd server && npm run dev
```

**Step 2: Manual testing checklist**

1. Fresh user login → verify initial exclusion computation works
2. Admin changes restrictions → verify recomputation triggers
3. User hides entity → verify it disappears immediately
4. User unhides entity → verify it reappears after brief delay
5. Stash sync → verify new items are checked against rules
6. Filter dropdowns → verify hidden entities don't appear

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete pre-computed exclusions implementation"
```

---

## Summary

This implementation plan covers:

1. **Database schema** - New tables for exclusions and stats
2. **Computation service** - Full recompute algorithm with phases
3. **Cascade logic** - Performer→scene, tag→everything, etc.
4. **Empty entity detection** - Galleries, performers, studios, groups, tags
5. **Incremental updates** - Sync hide, async unhide
6. **Query changes** - JOIN-based filtering in SceneQueryBuilder
7. **Controller updates** - Remove old filtering calls
8. **Triggers** - Sync, hide/unhide, restriction changes
9. **Admin endpoints** - Manual recompute, stats
10. **Cleanup** - Remove deprecated services

---

Plan complete and saved to `docs/plans/2025-01-02-pre-computed-exclusions-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
