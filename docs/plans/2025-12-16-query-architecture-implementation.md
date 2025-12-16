# Query Architecture Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate all scene queries to use SceneQueryBuilder so every scene object has consistent relations (performers, tags, studio, groups, galleries).

**Architecture:** Two-phase query for scoring operations (lightweight IDs for scoring, then SceneQueryBuilder for final results). All other paths use SceneQueryBuilder directly.

**Tech Stack:** TypeScript, Prisma, SQLite, Vitest

---

## Task 1: Add SceneScoringData Type

**Files:**
- Modify: `server/types/entities.ts`

**Step 1: Add the type definition**

Add after the existing type exports (around line 200):

```typescript
/**
 * Lightweight scene data for scoring operations
 * Contains only IDs needed for similarity/recommendation scoring
 */
export interface SceneScoringData {
  id: string;
  studioId: string | null;
  performerIds: string[];
  tagIds: string[];
  oCounter: number;
  date: string | null;
}
```

**Step 2: Export from index**

Modify `server/types/index.ts` to add export:

```typescript
export type {
  NormalizedScene,
  NormalizedPerformer,
  NormalizedStudio,
  NormalizedTag,
  NormalizedGallery,
  NormalizedGroup,
  SceneScoringData,  // Add this line
} from "./entities.js";
```

**Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/types/entities.ts server/types/index.ts
git commit -m "feat: add SceneScoringData type for lightweight scoring queries"
```

---

## Task 2: Add getScenesForScoring Method

**Files:**
- Modify: `server/services/StashEntityService.ts`

**Step 1: Write the failing test**

Create `server/services/__tests__/StashEntityService.scoring.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { StashEntityService } from "../StashEntityService.js";
import prisma from "../../prisma/singleton.js";

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $queryRawUnsafe: vi.fn(),
  },
}));

describe("StashEntityService.getScenesForScoring", () => {
  let service: StashEntityService;

  beforeEach(() => {
    service = new StashEntityService();
    vi.clearAllMocks();
  });

  it("should return lightweight scoring data for all scenes", async () => {
    const mockRows = [
      {
        id: "scene-1",
        studioId: "studio-1",
        oCounter: 5,
        date: "2024-01-15",
        performerIds: "perf-1,perf-2",
        tagIds: "tag-1,tag-2,tag-3",
      },
      {
        id: "scene-2",
        studioId: null,
        oCounter: 0,
        date: null,
        performerIds: "",
        tagIds: "tag-1",
      },
    ];

    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue(mockRows);

    const result = await service.getScenesForScoring();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "scene-1",
      studioId: "studio-1",
      performerIds: ["perf-1", "perf-2"],
      tagIds: ["tag-1", "tag-2", "tag-3"],
      oCounter: 5,
      date: "2024-01-15",
    });
    expect(result[1]).toEqual({
      id: "scene-2",
      studioId: null,
      performerIds: [],
      tagIds: ["tag-1"],
      oCounter: 0,
      date: null,
    });
  });

  it("should return empty array when no scenes exist", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([]);

    const result = await service.getScenesForScoring();

    expect(result).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --run services/__tests__/StashEntityService.scoring.test.ts`
Expected: FAIL with "getScenesForScoring is not a function"

**Step 3: Implement the method**

Add to `server/services/StashEntityService.ts` after line 161 (after `getAllScenes`):

```typescript
  /**
   * Get lightweight scene data for scoring operations
   * Returns only IDs needed for similarity/recommendation calculations
   * Much more efficient than loading full scene objects
   */
  async getScenesForScoring(): Promise<SceneScoringData[]> {
    const startTime = Date.now();

    // Single query that aggregates performer and tag IDs
    const sql = `
      SELECT
        s.id,
        s.studioId,
        s.oCounter,
        s.date,
        COALESCE(GROUP_CONCAT(DISTINCT sp.performerId), '') as performerIds,
        COALESCE(GROUP_CONCAT(DISTINCT st.tagId), '') as tagIds
      FROM StashScene s
      LEFT JOIN ScenePerformer sp ON s.id = sp.sceneId
      LEFT JOIN SceneTag st ON s.id = st.sceneId
      WHERE s.deletedAt IS NULL
      GROUP BY s.id
    `;

    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      studioId: string | null;
      oCounter: number;
      date: string | null;
      performerIds: string;
      tagIds: string;
    }>>(sql);

    const result: SceneScoringData[] = rows.map(row => ({
      id: row.id,
      studioId: row.studioId,
      performerIds: row.performerIds ? row.performerIds.split(',').filter(Boolean) : [],
      tagIds: row.tagIds ? row.tagIds.split(',').filter(Boolean) : [],
      oCounter: row.oCounter || 0,
      date: row.date,
    }));

    logger.info(`getScenesForScoring: ${Date.now() - startTime}ms, count=${result.length}`);

    return result;
  }
```

**Step 4: Add import for SceneScoringData**

Update the import at top of `StashEntityService.ts`:

```typescript
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
  SceneScoringData,  // Add this
} from "../types/index.js";
```

**Step 5: Run test to verify it passes**

Run: `cd server && npm test -- --run services/__tests__/StashEntityService.scoring.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add server/services/StashEntityService.ts server/services/__tests__/StashEntityService.scoring.test.ts
git commit -m "feat: add getScenesForScoring for lightweight scoring queries"
```

---

## Task 3: Add getScenesByIds to SceneQueryBuilder

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`

**Step 1: Write the failing test**

Add to `server/tests/services/SceneQueryBuilder.integration.test.ts`:

```typescript
  it("should fetch scenes by IDs with full relations", async () => {
    // First get some scene IDs
    const initial = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 3,
    });

    if (initial.scenes.length < 2) {
      console.log("Skipping getByIds test - not enough scenes");
      return;
    }

    const idsToFetch = initial.scenes.slice(0, 2).map(s => s.id);

    const result = await sceneQueryBuilder.getByIds({
      userId: 1,
      ids: idsToFetch,
    });

    expect(result.scenes).toHaveLength(2);
    expect(result.scenes.map(s => s.id).sort()).toEqual(idsToFetch.sort());

    // Verify relations are populated
    for (const scene of result.scenes) {
      expect(scene).toHaveProperty("performers");
      expect(scene).toHaveProperty("tags");
      expect(scene).toHaveProperty("groups");
      expect(scene).toHaveProperty("galleries");
      expect(Array.isArray(scene.performers)).toBe(true);
      expect(Array.isArray(scene.tags)).toBe(true);
    }
  });
```

**Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --run tests/services/SceneQueryBuilder.integration.test.ts`
Expected: FAIL with "getByIds is not a function"

**Step 3: Add the interface**

Add after `SceneQueryResult` interface (around line 34) in `SceneQueryBuilder.ts`:

```typescript
// Query by IDs options
export interface SceneByIdsOptions {
  userId: number;
  ids: string[];
}
```

**Step 4: Implement getByIds method**

Add before the closing brace of the class (around line 1760):

```typescript
  /**
   * Get scenes by IDs with full relations
   * Used after scoring to fetch the final paginated results
   */
  async getByIds(options: SceneByIdsOptions): Promise<SceneQueryResult> {
    const { userId, ids } = options;

    if (ids.length === 0) {
      return { scenes: [], total: 0 };
    }

    // Use execute with ID filter
    return this.execute({
      userId,
      filters: {
        ids: { value: ids, modifier: "INCLUDES" },
      },
      sort: "created_at", // Default sort, results will be reordered by caller if needed
      sortDirection: "DESC",
      page: 1,
      perPage: ids.length, // Get all requested IDs
    });
  }
```

**Step 5: Run test to verify it passes**

Run: `cd server && npm test -- --run tests/services/SceneQueryBuilder.integration.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add server/services/SceneQueryBuilder.ts server/tests/services/SceneQueryBuilder.integration.test.ts
git commit -m "feat: add getByIds method to SceneQueryBuilder"
```

---

## Task 4: Refactor findSimilarScenes to Use New Architecture

**Files:**
- Modify: `server/controllers/library/scenes.ts`

**Step 1: Add imports**

At top of `scenes.ts`, add:

```typescript
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
```

And update the stashEntityService import to include SceneScoringData type.

**Step 2: Refactor findSimilarScenes**

Replace the `findSimilarScenes` function (lines 1219-1374) with:

```typescript
/**
 * Find similar scenes based on weighted scoring
 * Performers: 3 points each
 * Tags: 1 point each
 * Studio: 1 point
 *
 * Uses two-phase query:
 * 1. Lightweight scoring query to score all scenes
 * 2. SceneQueryBuilder to fetch final results with relations
 */
export const findSimilarScenes = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = 12;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Get excluded scene IDs for this user
    const excludedIds = await userRestrictionService.getExcludedSceneIds(userId, true);

    // Phase 1: Get lightweight scoring data
    const allScoringData = await stashEntityService.getScenesForScoring();

    // Filter out excluded scenes and current scene
    const scoringData = allScoringData.filter(
      s => s.id !== id && !excludedIds.has(s.id)
    );

    // Find the current scene's data
    const currentScene = allScoringData.find(s => s.id === id);
    if (!currentScene) {
      return res.status(404).json({ error: "Scene not found" });
    }

    // Check if current scene has any metadata
    const hasMetadata =
      currentScene.performerIds.length > 0 ||
      currentScene.studioId ||
      currentScene.tagIds.length > 0;

    if (!hasMetadata) {
      return res.json({
        scenes: [],
        count: 0,
        page,
        perPage,
      });
    }

    // Build sets for fast lookup
    const currentPerformerIds = new Set(currentScene.performerIds);
    const currentTagIds = new Set(currentScene.tagIds);
    const currentStudioId = currentScene.studioId;

    // Score all scenes
    interface ScoredScene {
      id: string;
      score: number;
      date: string | null;
    }

    const scoredScenes: ScoredScene[] = [];

    for (const scene of scoringData) {
      let score = 0;

      // Score for matching performers (3 points each)
      for (const performerId of scene.performerIds) {
        if (currentPerformerIds.has(performerId)) {
          score += 3;
        }
      }

      // Score for matching studio (1 point)
      if (currentStudioId && scene.studioId === currentStudioId) {
        score += 1;
      }

      // Score for matching tags (1 point each)
      for (const tagId of scene.tagIds) {
        if (currentTagIds.has(tagId)) {
          score += 1;
        }
      }

      if (score > 0) {
        scoredScenes.push({ id: scene.id, score, date: scene.date });
      }
    }

    // Sort by score descending, then by date descending
    scoredScenes.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    // Paginate
    const startIndex = (page - 1) * perPage;
    const paginatedIds = scoredScenes
      .slice(startIndex, startIndex + perPage)
      .map(s => s.id);

    if (paginatedIds.length === 0) {
      return res.json({
        scenes: [],
        count: scoredScenes.length,
        page,
        perPage,
      });
    }

    // Phase 2: Fetch full scene data via SceneQueryBuilder
    const { scenes } = await sceneQueryBuilder.getByIds({
      userId,
      ids: paginatedIds,
    });

    // Preserve score order (getByIds may return in different order)
    const sceneMap = new Map(scenes.map(s => [s.id, s]));
    const orderedScenes = paginatedIds
      .map(id => sceneMap.get(id))
      .filter((s): s is NormalizedScene => s !== undefined);

    res.json({
      scenes: orderedScenes,
      count: scoredScenes.length,
      page,
      perPage,
    });
  } catch (error) {
    logger.error("Error finding similar scenes:", { error: error as Error });
    res.status(500).json({ error: "Failed to find similar scenes" });
  }
};
```

**Step 3: Run the application and test manually**

Run: `cd server && npm run dev`
Test: Open a scene detail page and verify Similar Scenes shows performer/tag counts

**Step 4: Commit**

```bash
git add server/controllers/library/scenes.ts
git commit -m "refactor: findSimilarScenes uses two-phase query architecture"
```

---

## Task 5: Add getExcludedSceneIds to UserRestrictionService

**Files:**
- Modify: `server/services/UserRestrictionService.ts`

**Step 1: Check if method exists**

Search for existing `getExcludedSceneIds` method. If it doesn't exist:

**Step 2: Add the method**

```typescript
  /**
   * Get set of scene IDs that should be excluded for a user
   * @param userId - User ID
   * @param hiddenOnly - If true, only return hidden entities (not content restrictions)
   */
  async getExcludedSceneIds(userId: number, hiddenOnly: boolean = false): Promise<Set<string>> {
    const scenes = await stashEntityService.getAllScenes();
    const filtered = await this.filterScenesForUser(scenes, userId, hiddenOnly);

    const allIds = new Set(scenes.map(s => s.id));
    const visibleIds = new Set(filtered.map(s => s.id));

    const excludedIds = new Set<string>();
    for (const id of allIds) {
      if (!visibleIds.has(id)) {
        excludedIds.add(id);
      }
    }

    return excludedIds;
  }
```

**Step 3: Commit**

```bash
git add server/services/UserRestrictionService.ts
git commit -m "feat: add getExcludedSceneIds helper method"
```

---

## Task 6: Refactor getRecommendedScenes

**Files:**
- Modify: `server/controllers/library/scenes.ts`

**Step 1: Refactor the function**

Replace `getRecommendedScenes` (around line 1380) with similar two-phase pattern:

```typescript
/**
 * Get recommended scenes based on user preferences and watch history
 * Uses favorites, ratings (80+), watch status, and engagement quality
 *
 * Two-phase query:
 * 1. Lightweight scoring data for all scenes
 * 2. SceneQueryBuilder for final paginated results
 */
export const getRecommendedScenes = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 24;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Fetch user ratings and watch history
    const [performerRatings, studioRatings, tagRatings, sceneRatings, watchHistory] =
      await Promise.all([
        prisma.performerRating.findMany({ where: { userId } }),
        prisma.studioRating.findMany({ where: { userId } }),
        prisma.tagRating.findMany({ where: { userId } }),
        prisma.sceneRating.findMany({ where: { userId } }),
        prisma.watchHistory.findMany({ where: { userId } }),
      ]);

    // Build preference sets
    const favoritePerformers = new Set(
      performerRatings.filter(r => r.favorite).map(r => r.performerId)
    );
    const highlyRatedPerformers = new Set(
      performerRatings.filter(r => r.rating && r.rating >= 80).map(r => r.performerId)
    );
    const favoriteStudios = new Set(
      studioRatings.filter(r => r.favorite).map(r => r.studioId)
    );
    const highlyRatedStudios = new Set(
      studioRatings.filter(r => r.rating && r.rating >= 80).map(r => r.studioId)
    );
    const favoriteTags = new Set(
      tagRatings.filter(r => r.favorite).map(r => r.tagId)
    );
    const highlyRatedTags = new Set(
      tagRatings.filter(r => r.rating && r.rating >= 80).map(r => r.tagId)
    );

    // Build watch history map
    const watchMap = new Map(
      watchHistory.map(wh => [
        wh.sceneId,
        {
          playCount: wh.playCount || 0,
          lastPlayedAt: wh.lastPlayedAt,
        },
      ])
    );

    // Get excluded scene IDs
    const excludedIds = await userRestrictionService.getExcludedSceneIds(userId, true);

    // Phase 1: Get lightweight scoring data
    const allScoringData = await stashEntityService.getScenesForScoring();
    const scoringData = allScoringData.filter(s => !excludedIds.has(s.id));

    // Count criteria for feedback
    const criteriaCounts = {
      favoritePerformers: favoritePerformers.size,
      highlyRatedPerformers: highlyRatedPerformers.size,
      favoriteStudios: favoriteStudios.size,
      highlyRatedStudios: highlyRatedStudios.size,
      favoriteTags: favoriteTags.size,
      highlyRatedTags: highlyRatedTags.size,
    };

    // Score all scenes
    interface ScoredScene {
      id: string;
      score: number;
    }

    const scoredScenes: ScoredScene[] = [];
    const now = new Date();

    for (const scene of scoringData) {
      let baseScore = 0;

      // Score performers
      for (const performerId of scene.performerIds) {
        if (favoritePerformers.has(performerId)) {
          baseScore += 50;
        } else if (highlyRatedPerformers.has(performerId)) {
          baseScore += 30;
        }
      }

      // Score studio
      if (scene.studioId) {
        if (favoriteStudios.has(scene.studioId)) {
          baseScore += 25;
        } else if (highlyRatedStudios.has(scene.studioId)) {
          baseScore += 15;
        }
      }

      // Score tags
      for (const tagId of scene.tagIds) {
        if (favoriteTags.has(tagId)) {
          baseScore += 10;
        } else if (highlyRatedTags.has(tagId)) {
          baseScore += 5;
        }
      }

      if (baseScore === 0) continue;

      // Watch status modifier
      let adjustedScore = baseScore;
      const watchData = watchMap.get(scene.id);
      if (!watchData || watchData.playCount === 0) {
        adjustedScore += 30; // Never watched bonus
      } else if (watchData.lastPlayedAt) {
        const daysSinceWatched =
          (now.getTime() - watchData.lastPlayedAt.getTime()) / (24 * 60 * 60 * 1000);
        if (daysSinceWatched > 14) {
          adjustedScore += 20;
        } else if (daysSinceWatched >= 1) {
          adjustedScore -= 10;
        } else {
          adjustedScore -= 30; // Very recently watched penalty
        }
      }

      // Engagement multiplier
      const engagementMultiplier = 1.0 + Math.min(scene.oCounter, 10) * 0.03;
      const finalScore = adjustedScore * engagementMultiplier;

      if (finalScore > 0) {
        scoredScenes.push({ id: scene.id, score: finalScore });
      }
    }

    // Sort by score descending
    scoredScenes.sort((a, b) => b.score - a.score);

    // Cap at 500 and paginate
    const cappedScenes = scoredScenes.slice(0, 500);
    const startIndex = (page - 1) * perPage;
    const paginatedIds = cappedScenes
      .slice(startIndex, startIndex + perPage)
      .map(s => s.id);

    if (paginatedIds.length === 0) {
      return res.json({
        scenes: [],
        count: cappedScenes.length,
        page,
        perPage,
        criteria: criteriaCounts,
      });
    }

    // Phase 2: Fetch full scene data
    const { scenes } = await sceneQueryBuilder.getByIds({
      userId,
      ids: paginatedIds,
    });

    // Preserve score order
    const sceneMap = new Map(scenes.map(s => [s.id, s]));
    const orderedScenes = paginatedIds
      .map(id => sceneMap.get(id))
      .filter((s): s is NormalizedScene => s !== undefined);

    res.json({
      scenes: orderedScenes,
      count: cappedScenes.length,
      page,
      perPage,
      criteria: criteriaCounts,
    });
  } catch (error) {
    logger.error("Error getting recommended scenes:", { error: error as Error });
    res.status(500).json({ error: "Failed to get recommendations" });
  }
};
```

**Step 2: Test manually**

Run: `cd server && npm run dev`
Test: Check homepage Recommended section shows performer/tag counts

**Step 3: Commit**

```bash
git add server/controllers/library/scenes.ts
git commit -m "refactor: getRecommendedScenes uses two-phase query architecture"
```

---

## Task 7: Refactor Standard Carousels

**Files:**
- Modify: `server/controllers/carousel.ts`

**Step 1: Find executeCarouselQuery function**

Locate the `executeCarouselQuery` function that uses `getAllScenes()`.

**Step 2: Refactor to use SceneQueryBuilder**

Replace the `getAllScenes()` path with SceneQueryBuilder. The function should:
1. Build filters from carousel query
2. Call `sceneQueryBuilder.execute()`
3. Return scenes with full relations

**Step 3: Test manually**

Run: `cd server && npm run dev`
Test: Homepage carousels show performer/tag counts

**Step 4: Commit**

```bash
git add server/controllers/carousel.ts
git commit -m "refactor: standard carousels use SceneQueryBuilder"
```

---

## Task 8: Remove Deprecated Methods

**Files:**
- Modify: `server/services/StashEntityService.ts`

**Step 1: Mark methods as deprecated**

Add JSDoc `@deprecated` tags to:
- `getAllScenes()`
- `getAllScenesWithTags()`
- `getAllScenesWithPerformers()`
- `getAllScenesWithPerformersAndTags()`
- `getScenesPaginated()`
- `getScenesByIdsWithRelations()`

**Step 2: Update remaining callers**

Search for any remaining usages and update them to use SceneQueryBuilder or `getScenesForScoring()`.

**Step 3: Run full test suite**

Run: `cd server && npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: deprecate old scene query methods, update remaining callers"
```

---

## Task 9: Update Entity Visibility Filtering

**Files:**
- Modify: `server/controllers/library/performers.ts`
- Modify: `server/controllers/library/tags.ts`
- Modify: `server/controllers/library/studios.ts`

**Step 1: Create getVisibleSceneIdsByEntity method**

Add to `StashEntityService.ts`:

```typescript
  /**
   * Get scene IDs visible to a user, grouped by entity type
   * Used for empty entity filtering without loading full scenes
   */
  async getVisibleSceneIdsByPerformer(userId: number): Promise<Map<string, Set<string>>> {
    const excludedIds = await userRestrictionService.getExcludedSceneIds(userId, false);

    const junctions = await prisma.scenePerformer.findMany({
      where: {
        scene: { deletedAt: null },
        sceneId: { notIn: Array.from(excludedIds) },
      },
      select: { sceneId: true, performerId: true },
    });

    const result = new Map<string, Set<string>>();
    for (const j of junctions) {
      const set = result.get(j.performerId) || new Set();
      set.add(j.sceneId);
      result.set(j.performerId, set);
    }

    return result;
  }
```

**Step 2: Update performers.ts visibility checks**

Replace `getAllScenesWithPerformers()` calls with the new method.

**Step 3: Test manually**

Test non-admin user can browse performers page correctly.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: entity visibility uses direct junction queries"
```

---

## Task 10: Final Cleanup and Testing

**Files:**
- All modified files

**Step 1: Run full test suite**

Run: `cd server && npm test`
Expected: All tests pass

**Step 2: Run linting**

Run: `cd server && npm run lint`
Expected: No errors

**Step 3: Manual verification checklist**

- [ ] Scene cards show correct performer counts (not 0)
- [ ] Scene cards show correct tag counts (not 0)
- [ ] Scene cards show correct group counts (not 0)
- [ ] Scene cards show correct gallery counts (not 0)
- [ ] Hovering indicators shows entity tooltip grids
- [ ] Studio name appears in card subtitles
- [ ] Similar Scenes section displays full card data
- [ ] Recommended sidebar shows studio names
- [ ] Homepage carousels show full card data
- [ ] Scenes browse works with filters
- [ ] Non-admin user filtering works correctly

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: query architecture consolidation complete"
```

---

## Summary

This plan consolidates all scene queries to use `SceneQueryBuilder`, ensuring consistent scene objects with populated relations. The key changes are:

1. **New `getScenesForScoring()`** - Lightweight query for scoring operations
2. **New `getByIds()` on SceneQueryBuilder** - Fetch specific scenes with relations
3. **Two-phase query pattern** - Score with lightweight data, fetch with full relations
4. **Deprecated old methods** - `getAllScenes*()` variants marked deprecated
5. **Direct junction queries** - For entity visibility filtering
