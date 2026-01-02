# Scene Tag Inheritance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Denormalize inherited tags at sync time, storing them on the Scene for efficient filtering and display.

**Architecture:** Add `inheritedTagIds` field to StashScene schema, create SceneTagInheritanceService to compute inherited tags from performers, studio, and groups at sync time. Update client to use server-provided inherited tags instead of computing at render time.

**Tech Stack:** Prisma/SQLite, TypeScript, React

---

## Task 1: Add inheritedTagIds Field to Schema

**Files:**
- Modify: `server/prisma/schema.prisma` (StashScene model, lines 423-495)

**Step 1: Add the field to StashScene model**

Add after line 471 (`syncedAt` field):

```prisma
  inheritedTagIds String? // JSON array of tag IDs from performers, studio, groups
```

**Step 2: Generate migration**

Run: `cd server && npx prisma migrate dev --name add-scene-inherited-tag-ids`
Expected: Migration created successfully

**Step 3: Verify schema**

Run: `cd server && npx prisma generate`
Expected: Prisma Client generated successfully

**Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add inheritedTagIds field to StashScene schema"
```

---

## Task 2: Create SceneTagInheritanceService

**Files:**
- Create: `server/services/SceneTagInheritanceService.ts`
- Create: `server/services/__tests__/SceneTagInheritanceService.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneTagInheritanceService } from "../SceneTagInheritanceService.js";

describe("SceneTagInheritanceService", () => {
  // Clean up test data
  beforeEach(async () => {
    await prisma.sceneTag.deleteMany({});
    await prisma.scenePerformer.deleteMany({});
    await prisma.sceneGroup.deleteMany({});
    await prisma.performerTag.deleteMany({});
    await prisma.studioTag.deleteMany({});
    await prisma.groupTag.deleteMany({});
    await prisma.stashScene.deleteMany({});
    await prisma.stashPerformer.deleteMany({});
    await prisma.stashStudio.deleteMany({});
    await prisma.stashGroup.deleteMany({});
    await prisma.stashTag.deleteMany({});
  });

  afterEach(async () => {
    await prisma.sceneTag.deleteMany({});
    await prisma.scenePerformer.deleteMany({});
    await prisma.sceneGroup.deleteMany({});
    await prisma.performerTag.deleteMany({});
    await prisma.studioTag.deleteMany({});
    await prisma.groupTag.deleteMany({});
    await prisma.stashScene.deleteMany({});
    await prisma.stashPerformer.deleteMany({});
    await prisma.stashStudio.deleteMany({});
    await prisma.stashGroup.deleteMany({});
    await prisma.stashTag.deleteMany({});
  });

  describe("computeInheritedTags", () => {
    it("should inherit tags from performer", async () => {
      // Create tag
      await prisma.stashTag.create({
        data: { id: "tag-1", name: "Performer Tag" },
      });

      // Create performer with tag
      await prisma.stashPerformer.create({
        data: { id: "performer-1", name: "Test Performer" },
      });
      await prisma.performerTag.create({
        data: { performerId: "performer-1", tagId: "tag-1" },
      });

      // Create scene with performer
      await prisma.stashScene.create({
        data: { id: "scene-1", title: "Test Scene" },
      });
      await prisma.scenePerformer.create({
        data: { sceneId: "scene-1", performerId: "performer-1" },
      });

      // Apply inheritance
      await sceneTagInheritanceService.computeInheritedTags();

      // Verify scene inherited tag
      const scene = await prisma.stashScene.findUnique({
        where: { id: "scene-1" },
      });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toContain("tag-1");
    });

    it("should inherit tags from studio", async () => {
      // Create tag
      await prisma.stashTag.create({
        data: { id: "tag-1", name: "Studio Tag" },
      });

      // Create studio with tag
      await prisma.stashStudio.create({
        data: { id: "studio-1", name: "Test Studio" },
      });
      await prisma.studioTag.create({
        data: { studioId: "studio-1", tagId: "tag-1" },
      });

      // Create scene with studio
      await prisma.stashScene.create({
        data: { id: "scene-1", title: "Test Scene", studioId: "studio-1" },
      });

      // Apply inheritance
      await sceneTagInheritanceService.computeInheritedTags();

      // Verify scene inherited tag
      const scene = await prisma.stashScene.findUnique({
        where: { id: "scene-1" },
      });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toContain("tag-1");
    });

    it("should inherit tags from group", async () => {
      // Create tag
      await prisma.stashTag.create({
        data: { id: "tag-1", name: "Group Tag" },
      });

      // Create group with tag
      await prisma.stashGroup.create({
        data: { id: "group-1", name: "Test Group" },
      });
      await prisma.groupTag.create({
        data: { groupId: "group-1", tagId: "tag-1" },
      });

      // Create scene in group
      await prisma.stashScene.create({
        data: { id: "scene-1", title: "Test Scene" },
      });
      await prisma.sceneGroup.create({
        data: { sceneId: "scene-1", groupId: "group-1" },
      });

      // Apply inheritance
      await sceneTagInheritanceService.computeInheritedTags();

      // Verify scene inherited tag
      const scene = await prisma.stashScene.findUnique({
        where: { id: "scene-1" },
      });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toContain("tag-1");
    });

    it("should NOT include direct scene tags in inheritedTagIds", async () => {
      // Create tag
      await prisma.stashTag.create({
        data: { id: "tag-1", name: "Direct Tag" },
      });

      // Create scene with direct tag
      await prisma.stashScene.create({
        data: { id: "scene-1", title: "Test Scene" },
      });
      await prisma.sceneTag.create({
        data: { sceneId: "scene-1", tagId: "tag-1" },
      });

      // Apply inheritance
      await sceneTagInheritanceService.computeInheritedTags();

      // Verify direct tag is NOT in inheritedTagIds
      const scene = await prisma.stashScene.findUnique({
        where: { id: "scene-1" },
      });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).not.toContain("tag-1");
    });

    it("should deduplicate tags from multiple sources", async () => {
      // Create tag
      await prisma.stashTag.create({
        data: { id: "tag-1", name: "Shared Tag" },
      });

      // Create performer with tag
      await prisma.stashPerformer.create({
        data: { id: "performer-1", name: "Test Performer" },
      });
      await prisma.performerTag.create({
        data: { performerId: "performer-1", tagId: "tag-1" },
      });

      // Create studio with same tag
      await prisma.stashStudio.create({
        data: { id: "studio-1", name: "Test Studio" },
      });
      await prisma.studioTag.create({
        data: { studioId: "studio-1", tagId: "tag-1" },
      });

      // Create scene with both performer and studio
      await prisma.stashScene.create({
        data: { id: "scene-1", title: "Test Scene", studioId: "studio-1" },
      });
      await prisma.scenePerformer.create({
        data: { sceneId: "scene-1", performerId: "performer-1" },
      });

      // Apply inheritance
      await sceneTagInheritanceService.computeInheritedTags();

      // Verify tag appears only once
      const scene = await prisma.stashScene.findUnique({
        where: { id: "scene-1" },
      });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      const tagCount = inheritedTagIds.filter((id: string) => id === "tag-1").length;
      expect(tagCount).toBe(1);
    });

    it("should handle scene with no related entities", async () => {
      // Create scene with nothing
      await prisma.stashScene.create({
        data: { id: "scene-1", title: "Standalone Scene" },
      });

      // Apply inheritance (should not fail)
      await sceneTagInheritanceService.computeInheritedTags();

      // Verify empty inherited tags
      const scene = await prisma.stashScene.findUnique({
        where: { id: "scene-1" },
      });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toEqual([]);
    });

    it("should collect tags from multiple performers", async () => {
      // Create tags
      await prisma.stashTag.createMany({
        data: [
          { id: "tag-1", name: "Performer 1 Tag" },
          { id: "tag-2", name: "Performer 2 Tag" },
        ],
      });

      // Create two performers with different tags
      await prisma.stashPerformer.createMany({
        data: [
          { id: "performer-1", name: "Performer 1" },
          { id: "performer-2", name: "Performer 2" },
        ],
      });
      await prisma.performerTag.create({
        data: { performerId: "performer-1", tagId: "tag-1" },
      });
      await prisma.performerTag.create({
        data: { performerId: "performer-2", tagId: "tag-2" },
      });

      // Create scene with both performers
      await prisma.stashScene.create({
        data: { id: "scene-1", title: "Test Scene" },
      });
      await prisma.scenePerformer.createMany({
        data: [
          { sceneId: "scene-1", performerId: "performer-1" },
          { sceneId: "scene-1", performerId: "performer-2" },
        ],
      });

      // Apply inheritance
      await sceneTagInheritanceService.computeInheritedTags();

      // Verify scene inherited both tags
      const scene = await prisma.stashScene.findUnique({
        where: { id: "scene-1" },
      });
      const inheritedTagIds = JSON.parse(scene?.inheritedTagIds || "[]");
      expect(inheritedTagIds).toContain("tag-1");
      expect(inheritedTagIds).toContain("tag-2");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --run SceneTagInheritanceService`
Expected: FAIL - module not found

**Step 3: Write the service**

```typescript
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

/**
 * SceneTagInheritanceService
 *
 * Computes inherited tags for scenes from related entities.
 * Called after sync completes to denormalize tag data for efficient filtering.
 *
 * Inheritance sources:
 * - Performer tags (from performers in the scene)
 * - Studio tags (from the scene's studio)
 * - Group tags (from groups the scene belongs to)
 *
 * Rules:
 * - Direct scene tags are NOT included in inheritedTagIds (they're already in SceneTag)
 * - Tags are deduplicated across all sources
 * - Stored as JSON array for efficient querying
 */
class SceneTagInheritanceService {
  /**
   * Compute and store inherited tags for all scenes.
   * Uses SQL for efficient bulk operations.
   */
  async computeInheritedTags(): Promise<void> {
    const startTime = Date.now();
    logger.info("Computing inherited tags for scenes...");

    try {
      // Get all scenes that need processing
      const scenes = await prisma.stashScene.findMany({
        where: { deletedAt: null },
        select: { id: true, studioId: true },
      });

      // Process in batches for memory efficiency
      const BATCH_SIZE = 500;
      let processedCount = 0;

      for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
        const batch = scenes.slice(i, i + BATCH_SIZE);
        await this.processBatch(batch);
        processedCount += batch.length;

        if (processedCount % 1000 === 0) {
          logger.info(`Processed ${processedCount}/${scenes.length} scenes`);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Scene tag inheritance computed in ${duration}ms for ${scenes.length} scenes`);
    } catch (error) {
      logger.error("Failed to compute scene tag inheritance", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Process a batch of scenes
   */
  private async processBatch(
    scenes: { id: string; studioId: string | null }[]
  ): Promise<void> {
    const sceneIds = scenes.map((s) => s.id);

    // Get direct tags for all scenes in batch
    const directTags = await prisma.sceneTag.findMany({
      where: { sceneId: { in: sceneIds } },
      select: { sceneId: true, tagId: true },
    });
    const directTagsByScene = new Map<string, Set<string>>();
    for (const dt of directTags) {
      if (!directTagsByScene.has(dt.sceneId)) {
        directTagsByScene.set(dt.sceneId, new Set());
      }
      directTagsByScene.get(dt.sceneId)!.add(dt.tagId);
    }

    // Get performer tags for all scenes in batch
    const scenePerformers = await prisma.scenePerformer.findMany({
      where: { sceneId: { in: sceneIds } },
      select: { sceneId: true, performerId: true },
    });
    const performerIds = [...new Set(scenePerformers.map((sp) => sp.performerId))];
    const performerTags = await prisma.performerTag.findMany({
      where: { performerId: { in: performerIds } },
      select: { performerId: true, tagId: true },
    });
    const tagsByPerformer = new Map<string, string[]>();
    for (const pt of performerTags) {
      if (!tagsByPerformer.has(pt.performerId)) {
        tagsByPerformer.set(pt.performerId, []);
      }
      tagsByPerformer.get(pt.performerId)!.push(pt.tagId);
    }

    // Get studio tags
    const studioIds = [...new Set(scenes.filter((s) => s.studioId).map((s) => s.studioId!))] ;
    const studioTags = await prisma.studioTag.findMany({
      where: { studioId: { in: studioIds } },
      select: { studioId: true, tagId: true },
    });
    const tagsByStudio = new Map<string, string[]>();
    for (const st of studioTags) {
      if (!tagsByStudio.has(st.studioId)) {
        tagsByStudio.set(st.studioId, []);
      }
      tagsByStudio.get(st.studioId)!.push(st.tagId);
    }

    // Get group tags for all scenes in batch
    const sceneGroups = await prisma.sceneGroup.findMany({
      where: { sceneId: { in: sceneIds } },
      select: { sceneId: true, groupId: true },
    });
    const groupIds = [...new Set(sceneGroups.map((sg) => sg.groupId))];
    const groupTags = await prisma.groupTag.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, tagId: true },
    });
    const tagsByGroup = new Map<string, string[]>();
    for (const gt of groupTags) {
      if (!tagsByGroup.has(gt.groupId)) {
        tagsByGroup.set(gt.groupId, []);
      }
      tagsByGroup.get(gt.groupId)!.push(gt.tagId);
    }

    // Build scene -> performer mapping
    const performersByScene = new Map<string, string[]>();
    for (const sp of scenePerformers) {
      if (!performersByScene.has(sp.sceneId)) {
        performersByScene.set(sp.sceneId, []);
      }
      performersByScene.get(sp.sceneId)!.push(sp.performerId);
    }

    // Build scene -> group mapping
    const groupsByScene = new Map<string, string[]>();
    for (const sg of sceneGroups) {
      if (!groupsByScene.has(sg.sceneId)) {
        groupsByScene.set(sg.sceneId, []);
      }
      groupsByScene.get(sg.sceneId)!.push(sg.groupId);
    }

    // Compute inherited tags for each scene
    const updates: { id: string; inheritedTagIds: string }[] = [];

    for (const scene of scenes) {
      const inheritedTags = new Set<string>();
      const directTagsForScene = directTagsByScene.get(scene.id) || new Set();

      // Collect performer tags
      const performers = performersByScene.get(scene.id) || [];
      for (const performerId of performers) {
        const tags = tagsByPerformer.get(performerId) || [];
        for (const tagId of tags) {
          if (!directTagsForScene.has(tagId)) {
            inheritedTags.add(tagId);
          }
        }
      }

      // Collect studio tags
      if (scene.studioId) {
        const tags = tagsByStudio.get(scene.studioId) || [];
        for (const tagId of tags) {
          if (!directTagsForScene.has(tagId)) {
            inheritedTags.add(tagId);
          }
        }
      }

      // Collect group tags
      const groups = groupsByScene.get(scene.id) || [];
      for (const groupId of groups) {
        const tags = tagsByGroup.get(groupId) || [];
        for (const tagId of tags) {
          if (!directTagsForScene.has(tagId)) {
            inheritedTags.add(tagId);
          }
        }
      }

      updates.push({
        id: scene.id,
        inheritedTagIds: JSON.stringify(Array.from(inheritedTags)),
      });
    }

    // Batch update using raw SQL for efficiency
    // SQLite doesn't support UPDATE ... FROM with VALUES, so we use CASE WHEN
    if (updates.length > 0) {
      // Split into smaller batches for the SQL update
      const SQL_BATCH_SIZE = 100;
      for (let i = 0; i < updates.length; i += SQL_BATCH_SIZE) {
        const sqlBatch = updates.slice(i, i + SQL_BATCH_SIZE);
        const ids = sqlBatch.map((u) => u.id);

        // Use individual updates - more compatible with SQLite
        await Promise.all(
          sqlBatch.map((u) =>
            prisma.stashScene.update({
              where: { id: u.id },
              data: { inheritedTagIds: u.inheritedTagIds },
            })
          )
        );
      }
    }
  }
}

export const sceneTagInheritanceService = new SceneTagInheritanceService();
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npm test -- --run SceneTagInheritanceService`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add server/services/SceneTagInheritanceService.ts server/services/__tests__/SceneTagInheritanceService.test.ts
git commit -m "feat: add SceneTagInheritanceService for denormalizing inherited tags"
```

---

## Task 3: Integrate with StashSyncService

**Files:**
- Modify: `server/services/StashSyncService.ts`

**Step 1: Add import at top of file**

Add after other service imports (around line 20):

```typescript
import { sceneTagInheritanceService } from "./SceneTagInheritanceService.js";
```

**Step 2: Add call after full sync (after line 222)**

Find the section where `imageGalleryInheritanceService.applyGalleryInheritance()` is called in `syncFromStash()` method. Add scene tag inheritance right before it:

```typescript
      // Compute inherited tags for scenes (must happen after scenes, performers, studios, groups are synced)
      logger.info("Computing inherited tags for scenes...");
      await sceneTagInheritanceService.computeInheritedTags();
      logger.info("Scene tag inheritance complete");
```

**Step 3: Add call after incremental sync (around line 547)**

Find the section in `incrementalSync()` after gallery inheritance. Add scene tag inheritance when scenes were synced:

```typescript
      // Compute inherited tags for scenes if scenes were updated
      const sceneResult = results.find((r) => r.entityType === "scene");
      if (sceneResult && sceneResult.synced > 0) {
        logger.info("Computing inherited tags for scenes after incremental sync...");
        await sceneTagInheritanceService.computeInheritedTags();
        logger.info("Scene tag inheritance complete");
      }
```

**Step 4: Run full test suite**

Run: `cd server && npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add server/services/StashSyncService.ts
git commit -m "feat: integrate SceneTagInheritanceService with sync pipeline"
```

---

## Task 4: Update UserRestrictionService to Use inheritedTagIds

**Files:**
- Modify: `server/services/UserRestrictionService.ts` (lines 837-876)

**Step 1: Simplify getSceneEntityIds for tags case**

Replace the current "tags" case (lines 848-876) with:

```typescript
      case "tags": {
        // Direct scene tags
        const directTagIds = (scene.tags || []).map((t: EntityWithId) => String(t.id));

        // Inherited tags (pre-computed at sync time)
        const inheritedTagIds = (scene as any).inheritedTagIds || [];

        // Combine and deduplicate
        return [...new Set([...directTagIds, ...inheritedTagIds])];
      }
```

**Step 2: Run tests**

Run: `cd server && npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add server/services/UserRestrictionService.ts
git commit -m "refactor: simplify UserRestrictionService to use pre-computed inheritedTagIds"
```

---

## Task 5: Update StashEntityService to Include inheritedTagIds

**Files:**
- Modify: `server/services/StashEntityService.ts`

**Step 1: Update transformScene method (around line 1414)**

Add inheritedTagIds parsing after the existing fields:

```typescript
      // Inherited tag IDs (pre-computed at sync time)
      inheritedTagIds: scene.inheritedTagIds ? JSON.parse(scene.inheritedTagIds) : [],
```

**Step 2: Update transformSceneForBrowse method (around line 1478)**

Add the same inheritedTagIds parsing:

```typescript
      // Inherited tag IDs (pre-computed at sync time)
      inheritedTagIds: scene.inheritedTagIds ? JSON.parse(scene.inheritedTagIds) : [],
```

**Step 3: Update NormalizedScene type if needed**

Check `server/types/stash.ts` for NormalizedScene type. Add inheritedTagIds field if not present:

```typescript
inheritedTagIds?: string[];
```

**Step 4: Run tests**

Run: `cd server && npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add server/services/StashEntityService.ts server/types/stash.ts
git commit -m "feat: include inheritedTagIds in scene transforms"
```

---

## Task 6: Update Client Components

**Files:**
- Modify: `client/src/components/ui/SceneCard.jsx` (lines 82-100)
- Modify: `client/src/components/scene/SceneMetadata.jsx` (lines 7-37)

**Step 1: Update SceneCard.jsx**

Replace the `getAllTags` function and its usage (lines 82-100) with:

```javascript
    // Combine direct tags with server-computed inherited tags
    const allTags = useMemo(() => {
      const tagMap = new Map();
      // Direct scene tags
      if (scene.tags) {
        scene.tags.forEach((tag) => tagMap.set(tag.id, tag));
      }
      // Inherited tags (pre-computed on server)
      if (scene.inheritedTags) {
        scene.inheritedTags.forEach((tag) => tagMap.set(tag.id, tag));
      }
      return Array.from(tagMap.values());
    }, [scene.tags, scene.inheritedTags]);
```

Note: Add `useMemo` to imports if not already present.

**Step 2: Update SceneMetadata.jsx**

Replace `mergeAllTags` function (lines 7-30) and its usage with:

```javascript
/**
 * Combine direct tags with inherited tags from server
 */
const getAllTags = (scene) => {
  const tagMap = new Map();
  // Direct scene tags
  if (scene.tags) {
    scene.tags.forEach((tag) => tagMap.set(tag.id, tag));
  }
  // Inherited tags (pre-computed on server)
  if (scene.inheritedTags) {
    scene.inheritedTags.forEach((tag) => tagMap.set(tag.id, tag));
  }
  return Array.from(tagMap.values());
};
```

Update the component to use this:

```javascript
  const allTags = getAllTags(scene);
```

**Step 3: Run client lint**

Run: `cd client && npm run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add client/src/components/ui/SceneCard.jsx client/src/components/scene/SceneMetadata.jsx
git commit -m "refactor: use server-provided inheritedTags instead of client-side computation"
```

---

## Task 7: Add inheritedTags Hydration to API Response

**Files:**
- Modify: `server/services/StashEntityService.ts`

**Step 1: Update transformSceneWithRelations to hydrate inheritedTags**

In `transformSceneWithRelations` method (around line 1555), after parsing inheritedTagIds, add hydration:

```typescript
    // Hydrate inherited tags with full tag objects
    if (scene.inheritedTagIds) {
      const inheritedTagIds = JSON.parse(scene.inheritedTagIds);
      if (inheritedTagIds.length > 0) {
        // Look up tags in the tags array we already have, or query if needed
        base.inheritedTags = inheritedTagIds.map((tagId: string) => {
          // Find in existing tags or create minimal stub
          const existingTag = base.tags?.find((t: any) => t.id === tagId);
          return existingTag || { id: tagId, name: "Unknown" };
        });
      }
    }
```

**Step 2: Add inheritedTags to NormalizedScene type**

Update `server/types/stash.ts`:

```typescript
inheritedTags?: { id: string; name: string }[];
```

**Step 3: Run tests**

Run: `cd server && npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add server/services/StashEntityService.ts server/types/stash.ts
git commit -m "feat: hydrate inheritedTags with full tag objects in API response"
```

---

## Task 8: Run Full Test Suite and Verify

**Step 1: Run server tests**

Run: `cd server && npm test`
Expected: All tests pass

**Step 2: Run client lint**

Run: `cd client && npm run lint`
Expected: No errors

**Step 3: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit any remaining fixes**

If any fixes were needed, commit them.

---

## Task 9: Create Pull Request

**Step 1: Push branch**

```bash
git push -u origin feature/scene-tag-inheritance
```

**Step 2: Create PR**

```bash
gh pr create --title "feat: denormalize scene inherited tags at sync time" --body "$(cat <<'EOF'
## Summary
- Adds `inheritedTagIds` field to StashScene schema to store tags inherited from performers, studio, and groups
- Creates SceneTagInheritanceService to compute inherited tags at sync time
- Simplifies UserRestrictionService to use pre-computed inherited tags
- Updates client components to use server-provided inheritedTags instead of client-side computation
- **Fixes group tag inheritance** which was previously missing

## Changes
- Schema migration adding `inheritedTagIds` to StashScene
- New `SceneTagInheritanceService` with comprehensive tests
- Integration with sync pipeline (full and incremental)
- Updated `StashEntityService` transforms to include inheritedTagIds
- Refactored `UserRestrictionService.getSceneEntityIds()` to use pre-computed tags
- Updated `SceneCard.jsx` and `SceneMetadata.jsx` to use server-provided tags

## Test Plan
- [x] Unit tests for SceneTagInheritanceService
- [ ] Manual test: Scene with no direct tags shows inherited tags from performer
- [ ] Manual test: Scene with no direct tags shows inherited tags from studio
- [ ] Manual test: Scene with no direct tags shows inherited tags from group (NEW!)
- [ ] Manual test: Tags inherited from multiple sources are deduplicated
- [ ] Manual test: Direct tags are NOT duplicated in inheritedTagIds
- [ ] Manual test: Restriction filtering works with inherited tags
EOF
)"
```

**Step 3: Return PR URL**
