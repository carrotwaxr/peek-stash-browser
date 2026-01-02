# Scene Tag Inheritance

**Branch:** `feature/scene-tag-inheritance`
**Status:** Design Complete
**Complexity:** Medium

---

## Problem Statement

Scenes display and filter by "inherited" tags from related entities. Currently:
- **Direct Scene Tags** — works
- **Performer Tags** — works (tags on performers in the scene)
- **Studio Tags** — works (tags on the scene's studio)
- **Group Tags** — **MISSING** (tags on groups the scene belongs to)

Additionally, this inheritance is computed at **render time** on the client, causing:
1. Duplicated logic in multiple components (`SceneCard.jsx`, `SceneMetadata.jsx`)
2. Inefficient re-computation on every render
3. Inconsistency between UI display and server-side restriction filtering

**Goal:** Denormalize inherited tags at sync time, storing them directly on the Scene. This matches the pattern proposed for Image Gallery Inheritance.

---

## Solution Overview

**Approach:** Store inherited tags on the Scene at sync time, similar to Image Gallery Inheritance.

**New field on `StashScene`:**
```prisma
inheritedTagIds String? // JSON array of tag IDs inherited from performers, studio, groups
```

**Why a separate field instead of adding to SceneTag junction?**
- Keeps direct tags distinct from inherited (important for editing in Stash)
- Easy to recompute on sync without touching user's direct assignments
- Client can merge for display: `[...scene.tags, ...inheritedTags]`

**Inheritance sources (collected at sync):**

| Source | When |
|--------|------|
| Performer Tags | For each performer in scene, collect their tags |
| Studio Tags | If scene has a studio, collect its tags |
| Group Tags | For each group the scene belongs to, collect their tags |

**Deduplication:** Store as a Set of tag IDs, converted to JSON array. Tags already directly on the scene are excluded from `inheritedTagIds` to avoid duplicates.

**Client changes:**
- Remove runtime tag merging logic from `SceneCard.jsx` and `SceneMetadata.jsx`
- Scene response includes both `tags` (direct) and `inheritedTags` (denormalized)
- Components display combined list

**Server changes:**
- `UserRestrictionService.getSceneEntityIds()` — simplify to use `inheritedTagIds` instead of runtime collection
- Restriction filtering becomes a simple array check

---

## Implementation Details

### Schema Change

```prisma
model StashScene {
  // ... existing fields ...

  // Inherited tags (denormalized at sync time)
  // JSON array of tag IDs from performers, studio, and groups
  inheritedTagIds String? // e.g., '["1","5","12"]'
}
```

### File: `server/services/StashSyncService.ts`

After syncing scenes with their relationships, compute inherited tags:

```typescript
async function computeInheritedTags(sceneId: string): Promise<string[]> {
  const tagIds = new Set<string>();

  // Get scene's direct tag IDs (to exclude from inherited)
  const directTags = await prisma.sceneTag.findMany({
    where: { sceneId },
    select: { tagId: true }
  });
  const directTagIds = new Set(directTags.map(t => t.tagId));

  // Collect performer tags
  const scenePerformers = await prisma.scenePerformer.findMany({
    where: { sceneId },
    select: { performerId: true }
  });
  for (const sp of scenePerformers) {
    const performerTags = await prisma.performerTag.findMany({
      where: { performerId: sp.performerId },
      select: { tagId: true }
    });
    performerTags.forEach(pt => {
      if (!directTagIds.has(pt.tagId)) tagIds.add(pt.tagId);
    });
  }

  // Collect studio tags
  const scene = await prisma.stashScene.findUnique({
    where: { id: sceneId },
    select: { studioId: true }
  });
  if (scene?.studioId) {
    const studioTags = await prisma.studioTag.findMany({
      where: { studioId: scene.studioId },
      select: { tagId: true }
    });
    studioTags.forEach(st => {
      if (!directTagIds.has(st.tagId)) tagIds.add(st.tagId);
    });
  }

  // Collect group tags
  const sceneGroups = await prisma.sceneGroup.findMany({
    where: { sceneId },
    select: { groupId: true }
  });
  for (const sg of sceneGroups) {
    const groupTags = await prisma.groupTag.findMany({
      where: { groupId: sg.groupId },
      select: { tagId: true }
    });
    groupTags.forEach(gt => {
      if (!directTagIds.has(gt.tagId)) tagIds.add(gt.tagId);
    });
  }

  return Array.from(tagIds);
}
```

### File: `server/services/StashEntityService.ts`

Update `transformScene` to include inherited tags:

```typescript
private transformScene(scene: any): NormalizedScene {
  // ... existing transform ...

  // Parse inherited tag IDs and hydrate with tag data
  const inheritedTagIds = scene.inheritedTagIds
    ? JSON.parse(scene.inheritedTagIds)
    : [];

  return {
    ...base,
    inheritedTagIds, // Raw IDs for filtering
    // inheritedTags will be hydrated in controller if needed for display
  };
}
```

### File: `server/services/UserRestrictionService.ts`

Simplify `getSceneEntityIds()`:

```typescript
// Before: complex runtime collection from nested objects
// After: simple array concat
case "tags": {
  const directTagIds = (scene.tags || []).map(t => String(t.id));
  const inheritedTagIds = scene.inheritedTagIds || [];
  return [...new Set([...directTagIds, ...inheritedTagIds])];
}
```

### Client Changes

Remove `getAllTags()` / `mergeAllTags()` functions from:
- `client/src/components/ui/SceneCard.jsx` (lines 82-98)
- `client/src/components/scene/SceneMetadata.jsx` (lines 7-30)

Replace with:
```javascript
const allTags = [...(scene.tags || []), ...(scene.inheritedTags || [])];
```

---

## Testing & Acceptance Criteria

### Manual Testing

1. **Basic inheritance display:**
   - Create a Scene with no direct tags
   - Add it to a Performer with tags, a Studio with tags, and a Group with tags
   - Run sync
   - Verify Scene cards show all inherited tags
   - Verify Scene detail page shows all inherited tags

2. **Deduplication:**
   - Create a Scene with tag "Action" directly assigned
   - Add a Performer to the scene who also has tag "Action"
   - Run sync
   - Verify "Action" appears only once (not duplicated)

3. **Group tags now work:**
   - Create a Group with tag "Series A"
   - Add scenes to the Group (scenes have no direct tags)
   - Run sync
   - Verify scenes display "Series A" tag

4. **Restriction filtering:**
   - Restrict tag "Explicit" for a user
   - Create a Group with tag "Explicit"
   - Add scenes to the Group
   - Verify those scenes are hidden for the restricted user
   - Verify same works for Performer tags and Studio tags

5. **Tag filtering in library:**
   - Filter scenes by a tag that only exists on a Performer (not directly on scenes)
   - Verify scenes with that performer appear in results

6. **Re-sync behavior:**
   - Change a Performer's tags in Stash
   - Run sync
   - Verify scenes with that performer update their inherited tags

### Edge Cases

- Scene with no performers, no studio, no groups (inheritedTagIds = [])
- Scene removed from a group (inherited tags from that group should disappear on next sync)
- Performer removed from scene (inherited tags from that performer should disappear)

---

## Files Changed

- `server/prisma/schema.prisma` — Add `inheritedTagIds` field to `StashScene`
- `server/services/StashSyncService.ts` — Add `computeInheritedTags()`, call after scene sync
- `server/services/StashEntityService.ts` — Parse and include `inheritedTagIds` in transform
- `server/services/UserRestrictionService.ts` — Simplify `getSceneEntityIds()` for tags
- `client/src/components/ui/SceneCard.jsx` — Remove `getAllTags()`, use `inheritedTags` from response
- `client/src/components/scene/SceneMetadata.jsx` — Remove `mergeAllTags()`, use `inheritedTags` from response

---

## Related Documentation

- [Technical Overview](../development/technical-overview.md) — Documents Scene Tag Inheritance under "Pseudo-Relationships"
- [Image Gallery Inheritance](2025-01-02-image-gallery-inheritance-design.md) — Same pattern for Images
