# 500k+ Scene Scalability Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical scalability issues blocking users with 500k+ scene libraries

**Architecture:** Paginated fetching + bulk database operations for sync; database queries replacing dead in-memory cache; search-only mode for client dropdowns

**Tech Stack:** TypeScript, Prisma with SQLite, React

**Reference:** [scalability-audit-500k-scenes.md](../design/scalability-audit-500k-scenes.md)

---

## Phase 1: Critical Fixes (Blocks 500k Users)

### Task 1: Fix INCLUDE Mode Restrictions Bug

**Files:**
- Modify: `server/services/ExclusionComputationService.ts:796-810`
- Test: `server/integration/api/content-restrictions-include-mode.integration.test.ts` (new)

**Step 1: Write the failing integration test**

Create `server/integration/api/content-restrictions-include-mode.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TestClient } from "../helpers/TestClient.js";
import { setupIntegrationTest, cleanupIntegrationTest } from "../helpers/setup.js";
import prisma from "../../prisma/singleton.js";

describe("Content Restrictions - INCLUDE Mode", () => {
  let adminClient: TestClient;
  let testUserId: number;
  let tag1Id: string;
  let tag2Id: string;
  let tag3Id: string;

  beforeAll(async () => {
    await setupIntegrationTest();
    adminClient = new TestClient({ role: "ADMIN" });

    // Create test user
    const userResponse = await adminClient.post<{ user: { id: number } }>("/api/admin/users", {
      username: "include-test-user",
      password: "test123",
      role: "USER",
    });
    testUserId = userResponse.data.user.id;

    // Get some existing tag IDs from the test database
    const tags = await prisma.stashTag.findMany({ take: 3, select: { id: true } });
    expect(tags.length).toBeGreaterThanOrEqual(3);
    tag1Id = tags[0].id;
    tag2Id = tags[1].id;
    tag3Id = tags[2].id;
  });

  afterAll(async () => {
    await cleanupIntegrationTest();
  });

  it("INCLUDE mode restriction should exclude tags NOT in the allowed list", async () => {
    // Set INCLUDE restriction: only allow tag1 and tag2
    await adminClient.put(`/api/user/${testUserId}/restrictions`, {
      restrictions: [
        {
          entityType: "tags",
          mode: "INCLUDE",
          entityIds: [tag1Id, tag2Id],
          restrictEmpty: false,
        },
      ],
    });

    // Trigger exclusion recomputation
    await adminClient.post(`/api/admin/users/${testUserId}/recompute-exclusions`);

    // Check that tag3 IS excluded (it's not in the INCLUDE list)
    const exclusions = await prisma.userExcludedEntity.findMany({
      where: { userId: testUserId, entityType: "tag" },
    });

    const excludedTagIds = exclusions.map((e) => e.entityId);

    // tag3 should be excluded
    expect(excludedTagIds).toContain(tag3Id);

    // tag1 and tag2 should NOT be excluded
    expect(excludedTagIds).not.toContain(tag1Id);
    expect(excludedTagIds).not.toContain(tag2Id);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npm test -- content-restrictions-include-mode`
Expected: FAIL - tag3Id not in excludedTagIds (because getAllEntityIds returns [])

**Step 3: Fix getAllEntityIds to query database**

Modify `server/services/ExclusionComputationService.ts`:

```typescript
// Replace the synchronous getAllEntityIds method (around line 796) with:

/**
 * Get all entity IDs for a given entity type from the database.
 * Used for INCLUDE mode inversion.
 */
private async getAllEntityIds(entityType: string): Promise<string[]> {
  switch (entityType) {
    case "tags": {
      const tags = await prisma.stashTag.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return tags.map((t) => t.id);
    }
    case "studios": {
      const studios = await prisma.stashStudio.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return studios.map((s) => s.id);
    }
    case "groups": {
      const groups = await prisma.stashGroup.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return groups.map((g) => g.id);
    }
    case "galleries": {
      const galleries = await prisma.stashGallery.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return galleries.map((g) => g.id);
    }
    default:
      logger.warn("Unknown entity type for getAllEntityIds", { entityType });
      return [];
  }
}
```

**Step 4: Update caller to await the async method**

In the same file, find where `getAllEntityIds` is called (around line 225) and update:

```typescript
// Before:
const allEntityIds = this.getAllEntityIds(restriction.entityType);

// After:
const allEntityIds = await this.getAllEntityIds(restriction.entityType);
```

**Step 5: Run test to verify it passes**

Run: `cd server && npm test -- content-restrictions-include-mode`
Expected: PASS

**Step 6: Run full test suite to catch regressions**

Run: `cd server && npm test`
Expected: All tests pass

**Step 7: Commit**

```bash
git add server/services/ExclusionComputationService.ts server/integration/api/content-restrictions-include-mode.integration.test.ts
git commit -m "fix: INCLUDE mode restrictions now correctly filter entities

Previously getAllEntityIds() called StashCacheManager which was never
initialized, returning empty arrays. Now queries database directly."
```

---

### Task 2: Delete Dead StashCacheManager Code

**Files:**
- Delete: `server/services/StashCacheManager.ts`
- Modify: `server/services/ExclusionComputationService.ts` (remove import)
- Modify: `server/services/__tests__/ExclusionComputationService.test.ts` (remove mock)

**Step 1: Remove import from ExclusionComputationService**

In `server/services/ExclusionComputationService.ts`, delete line 19:

```typescript
// DELETE THIS LINE:
import { stashCacheManager } from "./StashCacheManager.js";
```

**Step 2: Remove mock from unit test**

In `server/services/__tests__/ExclusionComputationService.test.ts`, delete lines 78-86:

```typescript
// DELETE THIS BLOCK:
// Mock StashCacheManager for INCLUDE mode inversion
vi.mock("../StashCacheManager.js", () => ({
  stashCacheManager: {
    getAllTags: vi.fn(() => []),
    getAllStudios: vi.fn(() => []),
    getAllGroups: vi.fn(() => []),
    getAllGalleries: vi.fn(() => []),
  },
}));
```

**Step 3: Delete StashCacheManager.ts**

Run: `rm server/services/StashCacheManager.ts`

**Step 4: Run tests to verify nothing breaks**

Run: `cd server && npm test`
Expected: All tests pass

**Step 5: Run linting**

Run: `cd server && npm run lint`
Expected: No errors

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete dead StashCacheManager code (~600 lines)

StashCacheManager.initialize() was never called, so all Maps were
always empty. The only consumer was ExclusionComputationService
which now queries the database directly."
```

---

### Task 3: Refactor Sync from Stash - Paginated Fetching

**Files:**
- Modify: `server/controllers/user.ts:987-1419`
- Test: Run manually with Docker logs

**Step 1: Add helper constants and types at top of syncFromStash**

Find the `syncFromStash` function and add after the stats initialization:

```typescript
// Pagination settings - match StashSyncService.PAGE_SIZE
const PAGE_SIZE = 1000;

// Helper to fetch paginated results
async function fetchPaginated<T>(
  fetchFn: (page: number) => Promise<{ items: T[]; count: number }>,
  filter: (item: T) => boolean = () => true
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  let totalCount = 0;

  while (true) {
    const { items, count } = await fetchFn(page);
    totalCount = count;

    const filtered = items.filter(filter);
    results.push(...filtered);

    if (results.length >= totalCount || items.length === 0) break;
    page++;
  }

  return results;
}
```

**Step 2: Replace scene fetching with paginated version**

Replace the scene fetching block (lines ~1002-1022):

```typescript
// Before:
const scenesData = await stash.findScenes({
  filter: { per_page: -1 },
  scene_filter: Object.keys(sceneFilter).length > 0 ? sceneFilter : undefined,
});
const scenes = scenesData.findScenes.scenes;

// After:
const scenes = await fetchPaginated(
  async (page) => {
    const result = await stash.findScenes({
      filter: { page, per_page: PAGE_SIZE },
      scene_filter: Object.keys(sceneFilter).length > 0 ? sceneFilter : undefined,
    });
    return { items: result.findScenes.scenes, count: result.findScenes.count };
  }
);
```

**Step 3: Apply same pattern to performers, studios, tags, galleries, groups**

Apply the same `fetchPaginated` pattern to each entity type's fetch block.

**Step 4: Test locally**

Run: Start Docker container, trigger "Sync from Stash" in UI, check logs for paginated fetches

**Step 5: Commit**

```bash
git add server/controllers/user.ts
git commit -m "fix: syncFromStash uses paginated fetching

Prevents OOM crash on 500k+ scene libraries by fetching in
PAGE_SIZE batches instead of per_page: -1"
```

---

### Task 4: Refactor Sync from Stash - Bulk Upserts

**Files:**
- Modify: `server/controllers/user.ts` (continue from Task 3)

**Step 1: Replace N+1 scene rating upserts with bulk operation**

Replace the scene loop (lines ~1029-1115) with batched operations:

```typescript
// Process scenes in batches for bulk upsert
const BATCH_SIZE = 500;

for (let i = 0; i < filteredScenes.length; i += BATCH_SIZE) {
  const batch = filteredScenes.slice(i, i + BATCH_SIZE);

  // Collect all existing records in one query
  const sceneIds = batch.map((s) => s.id);

  const [existingRatings, existingWatchHistory] = await Promise.all([
    syncOptions.scenes.rating
      ? prisma.sceneRating.findMany({
          where: { userId: targetUserId, sceneId: { in: sceneIds } },
        })
      : Promise.resolve([]),
    syncOptions.scenes.oCounter
      ? prisma.watchHistory.findMany({
          where: { userId: targetUserId, sceneId: { in: sceneIds } },
        })
      : Promise.resolve([]),
  ]);

  const existingRatingMap = new Map(existingRatings.map((r) => [r.sceneId, r]));
  const existingWatchMap = new Map(existingWatchHistory.map((w) => [w.sceneId, w]));

  // Build bulk operations
  const ratingUpserts: Parameters<typeof prisma.sceneRating.upsert>[0][] = [];
  const watchUpserts: Parameters<typeof prisma.watchHistory.upsert>[0][] = [];

  for (const scene of batch) {
    // Rating sync
    if (syncOptions.scenes.rating && scene.rating100 && scene.rating100 > 0) {
      const existing = existingRatingMap.get(scene.id);
      ratingUpserts.push({
        where: { userId_sceneId: { userId: targetUserId, sceneId: scene.id } },
        update: { rating: scene.rating100 },
        create: {
          userId: targetUserId,
          sceneId: scene.id,
          rating: scene.rating100,
          favorite: false,
        },
      });

      if (!existing) {
        stats.scenes.created++;
      } else if (existing.rating !== scene.rating100) {
        stats.scenes.updated++;
      }
    }

    // O-counter sync
    if (syncOptions.scenes.oCounter && scene.o_counter && scene.o_counter > 0) {
      const existing = existingWatchMap.get(scene.id);
      watchUpserts.push({
        where: { userId_sceneId: { userId: targetUserId, sceneId: scene.id } },
        update: { oCount: scene.o_counter },
        create: {
          userId: targetUserId,
          sceneId: scene.id,
          oCount: scene.o_counter,
          oHistory: [],
          playCount: 0,
          playDuration: 0,
          playHistory: [],
        },
      });

      if (!existing) {
        stats.scenes.created++;
      } else if (existing.oCount !== scene.o_counter) {
        stats.scenes.updated++;
      }
    }
  }

  // Execute upserts in transaction
  await prisma.$transaction([
    ...ratingUpserts.map((u) => prisma.sceneRating.upsert(u)),
    ...watchUpserts.map((u) => prisma.watchHistory.upsert(u)),
  ]);

  stats.scenes.checked += batch.length;
}
```

**Step 2: Apply same batch pattern to performers, studios, tags, galleries, groups**

Each entity type should follow the same pattern:
1. Process in BATCH_SIZE chunks
2. Fetch all existing records with `findMany` + `{ in: ids }`
3. Build Map for O(1) lookup
4. Execute upserts in `$transaction`

**Step 3: Test locally with timing**

Run: Docker container, trigger sync, compare timing with previous implementation

**Step 4: Commit**

```bash
git add server/controllers/user.ts
git commit -m "perf: syncFromStash uses bulk upserts

Replaces N+1 individual upserts with batched transactions.
For 500k scenes: ~2M ops -> ~1k transactions"
```

---

## Phase 2: Performance Improvements

### Task 5: Add Performance Logging to Unlisted Endpoints

**Files:**
- Modify: `server/controllers/library/performers.ts`
- Modify: `server/controllers/library/studios.ts`
- Modify: `server/controllers/library/tags.ts`
- Modify: `server/controllers/library/galleries.ts`
- Modify: `server/controllers/library/groups.ts`

**Step 1: Create timing helper**

Add to each file or create shared utility:

```typescript
// In each controller, wrap the main function body:
const startTime = Date.now();
// ... existing code ...
logger.info("findPerformers completed", {
  totalTime: `${Date.now() - startTime}ms`,
  totalCount: total,
  returnedCount: paginatedPerformers.length,
  page,
  perPage,
});
```

**Step 2: Test by browsing app and checking Docker logs**

**Step 3: Commit**

```bash
git add server/controllers/library/*.ts
git commit -m "feat: add performance logging to entity endpoints"
```

---

### Task 6: Fix SearchableSelect Client-Side Loading

**Files:**
- Modify: `client/src/components/ui/SearchableSelect.jsx:176`

**Step 1: Change default to search-only mode**

```javascript
// Before:
const filter = search
  ? { per_page: 50 }
  : { per_page: -1, sort: "name", direction: "ASC" };

// After:
const filter = {
  per_page: 50,
  sort: "name",
  direction: "ASC",
  ...(search ? { q: search } : {}),
};
```

**Step 2: Add placeholder text indicating search is required**

Update the input placeholder to say "Type to search..."

**Step 3: Test in UI**

Verify dropdowns no longer freeze on open

**Step 4: Commit**

```bash
git add client/src/components/ui/SearchableSelect.jsx
git commit -m "fix: SearchableSelect uses search-only mode

Prevents loading all entities on dropdown open. Users must
type to search instead."
```

---

## Phase 3: Future Optimizations (Not Blocking)

### Task 7: Pre-compute Tag Performer Scene Counts (Deferred)

**Issue:** Tags endpoint loads all scenes + performers to compute counts
**Status:** Requires schema change, defer to separate PR

### Task 8: SQL-based Similar/Recommended Scenes (Deferred)

**Issue:** Scores all scenes in memory
**Status:** Complex optimization, defer to separate PR

### Task 9: Entity Query Builders (Deferred)

**Issue:** Performers/Studios/etc load all then filter
**Status:** Large refactor, defer to separate PR

---

## Verification Checklist

Before merging:

- [ ] All tests pass: `cd server && npm test`
- [ ] Linting passes: `cd server && npm run lint`
- [ ] Client builds: `cd client && npm run build`
- [ ] Manual test: Sync from Stash with 20k+ scenes
- [ ] Manual test: INCLUDE mode restriction filters correctly
- [ ] Manual test: SearchableSelect dropdowns don't freeze
- [ ] Check Docker logs for new performance timing
