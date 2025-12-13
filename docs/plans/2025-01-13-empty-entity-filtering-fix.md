# Empty Entity Filtering Bug Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the bug where non-admin users see drastically reduced entity counts (Performers: 180/7000+, Studios: 941/1101) due to missing relationship data in empty entity filtering.

**Architecture:** Add new scene query methods that include performer/tag junction data, update `filterEmptyStudios` with parent/child traversal and gallery lookup, update `filterEmptyTags` to accept performer data for tag lookup.

**Tech Stack:** TypeScript, Prisma ORM, Express controllers

---

## Task 1: Add getAllScenesWithPerformers Method

**Files:**
- Modify: `server/services/StashEntityService.ts:185` (after getAllScenesWithTags)
- Test: `server/services/__tests__/StashEntityService.test.ts` (if exists, otherwise manual verification)

**Step 1: Add the new method**

In `server/services/StashEntityService.ts`, add after `getAllScenesWithTags()` method (around line 185):

```typescript
  /**
   * Get all scenes with performers relation included
   * Used for empty entity filtering which needs to know which performers appear in visible scenes
   */
  async getAllScenesWithPerformers(): Promise<NormalizedScene[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.stashScene.findMany({
      where: { deletedAt: null },
      select: {
        ...this.BROWSE_SELECT,
        performers: {
          select: { performerId: true },
        },
      },
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => {
      const scene = this.transformSceneForBrowse(c);
      scene.performers = (c.performers?.map((p: { performerId: string }) => ({ id: p.performerId })) || []) as typeof scene.performers;
      return scene;
    });
    const transformTime = Date.now() - transformStart;

    logger.info(`getAllScenesWithPerformers: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }
```

**Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/StashEntityService.ts
git commit -m "feat: add getAllScenesWithPerformers method for empty entity filtering"
```

---

## Task 2: Add getAllScenesWithPerformersAndTags Method

**Files:**
- Modify: `server/services/StashEntityService.ts` (after the method added in Task 1)

**Step 1: Add the new method**

In `server/services/StashEntityService.ts`, add after `getAllScenesWithPerformers()`:

```typescript
  /**
   * Get all scenes with both performers and tags relations included
   * Used for tags filtering which needs both performer IDs and tag IDs
   */
  async getAllScenesWithPerformersAndTags(): Promise<NormalizedScene[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.stashScene.findMany({
      where: { deletedAt: null },
      select: {
        ...this.BROWSE_SELECT,
        performers: {
          select: { performerId: true },
        },
        tags: {
          select: { tagId: true },
        },
      },
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => {
      const scene = this.transformSceneForBrowse(c);
      scene.performers = (c.performers?.map((p: { performerId: string }) => ({ id: p.performerId })) || []) as typeof scene.performers;
      scene.tags = (c.tags?.map((t: { tagId: string }) => ({ id: t.tagId })) || []) as typeof scene.tags;
      return scene;
    });
    const transformTime = Date.now() - transformStart;

    logger.info(`getAllScenesWithPerformersAndTags: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }
```

**Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/StashEntityService.ts
git commit -m "feat: add getAllScenesWithPerformersAndTags method for tags filtering"
```

---

## Task 3: Update filterEmptyStudios with Parent/Child Traversal

**Files:**
- Modify: `server/services/EmptyEntityFilterService.ts:269-332` (replace filterEmptyStudios method)

**Step 1: Replace the filterEmptyStudios method**

Find `filterEmptyStudios` method (starts around line 269) and replace entirely with:

```typescript
  /**
   * Filter studios with no content
   * Hide if ALL of:
   * - Not in any visible scene
   * - No visible groups
   * - No images
   * - No visible galleries
   * - No child studios with content
   */
  filterEmptyStudios<T extends FilterableStudio>(
    studios: T[],
    visibleGroups: FilterableGroup[],
    visibleGalleries: FilterableGallery[],
    visibleScenes?: Array<{ id: string; studio?: { id: string } | null }>
  ): T[] {
    // Build set of studios in visible scenes
    const studiosInVisibleScenes = new Set<string>();
    if (visibleScenes) {
      for (const scene of visibleScenes) {
        if (scene.studio) {
          studiosInVisibleScenes.add(scene.studio.id);
        }
      }
    }

    // Build sets of visible group and gallery IDs for fast lookup
    const visibleGroupIds = new Set(visibleGroups.map((g) => g.id));
    const visibleGalleryIds = new Set(visibleGalleries.map((g) => g.id));

    // Build set of studios that have visible galleries
    const studiosWithVisibleGalleries = new Set<string>();
    for (const gallery of visibleGalleries) {
      const studioId = (gallery as { studio?: { id: string } }).studio?.id;
      if (studioId) {
        studiosWithVisibleGalleries.add(studioId);
      }
    }

    // Build parent -> children map for recursive check
    const studioMap = new Map(studios.map((s) => [s.id, s]));
    const childrenMap = new Map<string, string[]>();
    for (const studio of studios) {
      const parentId = (studio as { parent_studio?: { id: string } }).parent_studio?.id;
      if (parentId) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)!.push(studio.id);
      }
    }

    // Track which studios have content
    const hasContent = new Map<string, boolean>();

    const checkHasContent = (studioId: string, visited = new Set<string>()): boolean => {
      if (visited.has(studioId)) return false;
      visited.add(studioId);

      if (hasContent.has(studioId)) {
        return hasContent.get(studioId)!;
      }

      const studio = studioMap.get(studioId);
      if (!studio) return false;

      // Check if studio appears in visible scenes
      if (visibleScenes && studiosInVisibleScenes.has(studio.id)) {
        hasContent.set(studioId, true);
        return true;
      }

      // Fallback to scene_count if visibleScenes not provided
      if (!visibleScenes && studio.scene_count && studio.scene_count > 0) {
        hasContent.set(studioId, true);
        return true;
      }

      // Has images? Keep
      if (studio.image_count && studio.image_count > 0) {
        hasContent.set(studioId, true);
        return true;
      }

      // Has visible galleries? Keep
      if (studiosWithVisibleGalleries.has(studio.id)) {
        hasContent.set(studioId, true);
        return true;
      }

      // Has visible groups? Keep
      if (studio.groups && Array.isArray(studio.groups)) {
        if (studio.groups.some((g) => visibleGroupIds.has(g.id))) {
          hasContent.set(studioId, true);
          return true;
        }
      }

      // Check if any child studio has content
      const children = childrenMap.get(studioId) || [];
      for (const childId of children) {
        if (checkHasContent(childId, visited)) {
          hasContent.set(studioId, true);
          return true;
        }
      }

      hasContent.set(studioId, false);
      return false;
    };

    // Check all studios
    for (const studio of studios) {
      checkHasContent(studio.id);
    }

    const filtered = studios.filter((studio) => hasContent.get(studio.id) === true);

    logger.debug("Filtered empty studios", {
      original: studios.length,
      filtered: filtered.length,
      removed: studios.length - filtered.length,
    });

    return filtered;
  }
```

**Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/EmptyEntityFilterService.ts
git commit -m "fix: add parent/child traversal and gallery lookup to filterEmptyStudios"
```

---

## Task 4: Update filterEmptyTags to Accept allPerformers Parameter

**Files:**
- Modify: `server/services/EmptyEntityFilterService.ts:342-515` (update filterEmptyTags method)

**Step 1: Update the method signature and add performer lookup**

Find `filterEmptyTags` method (starts around line 342). Update the signature and the performer tag lookup logic:

Change the method signature from:
```typescript
  filterEmptyTags<T extends FilterableTag>(
    tags: T[],
    visibleEntities: VisibleEntitySets,
    visibleScenes?: Array<{
      id: string;
      tags?: Array<{ id: string }>;
      performers?: Array<{ id: string; tags?: Array<{ id: string }> }>;
      studio?: { id: string; tags?: Array<{ id: string }> } | null;
    }>
  ): T[] {
```

To:
```typescript
  filterEmptyTags<T extends FilterableTag>(
    tags: T[],
    visibleEntities: VisibleEntitySets,
    visibleScenes?: Array<{
      id: string;
      tags?: Array<{ id: string }>;
      performers?: Array<{ id: string }>;
      studio?: { id: string } | null;
    }>,
    allPerformers?: Array<{ id: string; tags?: Array<{ id: string }> }>
  ): T[] {
```

Then, inside the method, after line `const tagsOnVisibleEntities = new Set<string>();` add:

```typescript
    // Build performer ID -> tags lookup from allPerformers
    const performerTagsMap = new Map<string, string[]>();
    if (allPerformers) {
      for (const performer of allPerformers) {
        if (performer.tags) {
          performerTagsMap.set(performer.id, performer.tags.map(t => t.id));
        }
      }
    }
```

Then update the performer tags section (around lines 375-384) from:
```typescript
        // Tags on performers in visible scenes
        if (scene.performers) {
          for (const performer of scene.performers) {
            if (performer.tags) {
              for (const tag of performer.tags) {
                tagsOnVisibleEntities.add(tag.id);
              }
            }
          }
        }
```

To:
```typescript
        // Tags on performers in visible scenes (lookup from allPerformers)
        if (scene.performers && allPerformers) {
          for (const performer of scene.performers) {
            const performerTags = performerTagsMap.get(performer.id);
            if (performerTags) {
              for (const tagId of performerTags) {
                tagsOnVisibleEntities.add(tagId);
              }
            }
          }
        }
```

Also update the studio tags section (around lines 386-391) from:
```typescript
        // Tags on studio in visible scenes
        if (scene.studio?.tags) {
          for (const tag of scene.studio.tags) {
            tagsOnVisibleEntities.add(tag.id);
          }
        }
```

To:
```typescript
        // Note: Studio tags are not loaded via scenes - they're on the studio entities
        // This would require passing allStudios, but studio tags are a rare use case
        // Skip for now - can be added later if needed
```

**Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/EmptyEntityFilterService.ts
git commit -m "fix: update filterEmptyTags to accept allPerformers for tag lookup"
```

---

## Task 5: Update performers.ts to Use getAllScenesWithPerformers

**Files:**
- Modify: `server/controllers/library/performers.ts:122` (findPerformers)
- Modify: `server/controllers/library/performers.ts:605` (findPerformersMinimal)

**Step 1: Update findPerformers (line 122)**

Find line 122:
```typescript
        let visibleScenes = await stashEntityService.getAllScenes();
```

Change to:
```typescript
        let visibleScenes = await stashEntityService.getAllScenesWithPerformers();
```

**Step 2: Update findPerformersMinimal (line 605)**

Find line 605:
```typescript
        let visibleScenes = await stashEntityService.getAllScenes();
```

Change to:
```typescript
        let visibleScenes = await stashEntityService.getAllScenesWithPerformers();
```

**Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/controllers/library/performers.ts
git commit -m "fix: use getAllScenesWithPerformers for performer filtering"
```

---

## Task 6: Update tags.ts to Use getAllScenesWithPerformersAndTags

**Files:**
- Modify: `server/controllers/library/tags.ts:180` (findTags)
- Modify: `server/controllers/library/tags.ts:234-238` (filterEmptyTags call in findTags)
- Modify: `server/controllers/library/tags.ts:763` (findTagsMinimal)
- Modify: `server/controllers/library/tags.ts:815-819` (filterEmptyTags call in findTagsMinimal)

**Step 1: Update findTags scene fetching (line 180)**

Find line 180:
```typescript
        let visibleScenes = await stashEntityService.getAllScenesWithTags();
```

Change to:
```typescript
        let visibleScenes = await stashEntityService.getAllScenesWithPerformersAndTags();
```

**Step 2: Update filterEmptyTags call in findTags (around line 234-238)**

Find:
```typescript
        filteredTags = emptyEntityFilterService.filterEmptyTags(
          filteredTags,
          visibilitySet,
          visibleScenes // ← NEW: Pass visible scenes
        );
```

Change to:
```typescript
        filteredTags = emptyEntityFilterService.filterEmptyTags(
          filteredTags,
          visibilitySet,
          visibleScenes,
          allPerformers // Pass performers for tag lookup
        );
```

**Step 3: Update findTagsMinimal scene fetching (line 763)**

Find line 763:
```typescript
        let visibleScenes = await stashEntityService.getAllScenesWithTags();
```

Change to:
```typescript
        let visibleScenes = await stashEntityService.getAllScenesWithPerformersAndTags();
```

**Step 4: Update filterEmptyTags call in findTagsMinimal (around line 815-819)**

Find:
```typescript
        filteredTags = emptyEntityFilterService.filterEmptyTags(
          filteredTags,
          visibilitySet,
          visibleScenes
        );
```

Change to:
```typescript
        filteredTags = emptyEntityFilterService.filterEmptyTags(
          filteredTags,
          visibilitySet,
          visibleScenes,
          allPerformers // Pass performers for tag lookup
        );
```

**Step 5: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add server/controllers/library/tags.ts
git commit -m "fix: use getAllScenesWithPerformersAndTags and pass allPerformers to tag filtering"
```

---

## Task 7: Run Tests and Verify

**Files:**
- Test: All existing tests

**Step 1: Run the test suite**

Run: `cd server && npm test`
Expected: All tests pass

**Step 2: Fix any failing tests**

If any tests fail due to the new method signatures, update them accordingly.

**Step 3: Commit any test fixes**

```bash
git add -A
git commit -m "test: fix tests for empty entity filtering changes"
```

---

## Task 8: Manual Verification

**Step 1: Start the server**

Run: `npm run dev` (or however the dev server starts)

**Step 2: Log in as non-admin user**

**Step 3: Verify counts**

- Navigate to Performers page - should show 7,000+ (not 180)
- Navigate to Studios page - should show 1,101 (not 941)
- Navigate to Tags page - verify count looks correct
- Check that parent studios with only child content are visible
- Check that studios with only galleries are visible

**Step 4: Log in as admin and verify counts still match**

**Step 5: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "fix: empty entity filtering - complete fix for performer/studio/tag counts"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add getAllScenesWithPerformers | StashEntityService.ts |
| 2 | Add getAllScenesWithPerformersAndTags | StashEntityService.ts |
| 3 | Update filterEmptyStudios with parent/child | EmptyEntityFilterService.ts |
| 4 | Update filterEmptyTags to accept allPerformers | EmptyEntityFilterService.ts |
| 5 | Update performers.ts call sites | performers.ts |
| 6 | Update tags.ts call sites | tags.ts |
| 7 | Run tests | - |
| 8 | Manual verification | - |
