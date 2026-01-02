# Fix Direct Stash Queries

**Branch:** `bugfix/direct-stash-queries`
**Status:** Design Complete
**Complexity:** Low-Medium

---

## Problem Statement

Two locations in the codebase bypass Peek's cache and query Stash directly for UI data:

1. **`playlist.ts:76,165`** — Fetches full scene data from Stash to display playlist items
   - **Bug:** Shows Stash's global O-counter and favorite values instead of the user's personal Peek values
   - **Performance:** Unnecessary network round-trip on every playlist view

2. **`watchHistory.ts:61`** — Fetches scene duration from Stash on every 10-second playback ping
   - **Performance:** Adds latency to every ping during video playback
   - **Reliability:** Playback tracking fails if Stash is temporarily unreachable

Both issues violate the principle: **All UI data should come from Peek's cache.**

---

## Solution Overview

Both fixes follow the same pattern: replace Stash GraphQL queries with Prisma queries against cached `StashScene` data.

**Playlist Fix (`playlist.ts`):**
1. Query `StashScene` table by IDs instead of `stash.findScenes()`
2. Merge with user's `WatchHistory` and `SceneRating` data for personal O-counter/favorite
3. Apply user restrictions via `userRestrictionService.filterScenesForUser()` — restricted scenes are excluded from playlist display
4. Transform paths using existing `stashUrlProxy` utilities

**WatchHistory Fix (`watchHistory.ts`):**
1. Query `StashScene` table for `duration` field instead of `stash.findScenes()`
2. The `duration` column already exists in cache (schema line 433)
3. Fallback: if duration is null/0, continue without percentage calculation (don't fail the ping)

**Scope boundaries:**
- We are NOT changing how playlists are created/edited
- We are NOT changing the watch history tracking logic itself
- We are only changing WHERE the scene data comes from

---

## Implementation Details

### File: `server/controllers/playlist.ts`

Current flow (lines 76 and 165):
```typescript
const scenesResponse = await stash.findScenes({ scene_ids: sceneIds.map(id => parseInt(id)) });
```

New flow:
```typescript
// 1. Fetch scenes from cache
const scenes = await prisma.stashScene.findMany({
  where: { id: { in: sceneIds }, deletedAt: null },
  include: { performers: true, tags: true, groups: true, studio: true }
});

// 2. Apply user restrictions (filter out hidden/restricted scenes)
const visibleScenes = await userRestrictionService.filterScenesForUser(scenes, userId);

// 3. Merge with user's personal data (WatchHistory + SceneRating)
const scenesWithUserData = await mergeScenesWithUserData(visibleScenes, userId);

// 4. Transform paths for proxy URLs
const transformedScenes = scenesWithUserData.map(s => transformScene(s));
```

### File: `server/controllers/watchHistory.ts`

Current flow (line 61):
```typescript
const sceneData = await stash.findScenes({ ids: [sceneId] });
sceneDuration = sceneData.findScenes.scenes[0]?.files?.[0]?.duration || 0;
```

New flow:
```typescript
const scene = await prisma.stashScene.findUnique({
  where: { id: sceneId },
  select: { duration: true }
});
const sceneDuration = scene?.duration || 0;
```

---

## Testing & Acceptance Criteria

### Manual Testing

1. **Playlist display:**
   - Create a playlist with several scenes
   - Verify scenes display with correct screenshots, titles, durations
   - Rate a scene and mark as favorite in Peek
   - Verify playlist shows YOUR rating/favorite, not Stash's global values
   - Increment O-counter on a scene, verify playlist reflects YOUR count

2. **Restricted content in playlists:**
   - Add a scene to a playlist
   - Have admin restrict that scene (via tag/studio/group restriction)
   - Verify the scene no longer appears in the playlist
   - Unhide/unrestrict, verify it reappears

3. **Watch history duration:**
   - Play a video, let it ping for 30+ seconds
   - Check server logs — no Stash GraphQL calls for duration
   - Verify play percentage calculations still work correctly

4. **Edge cases:**
   - Playlist with scene that was deleted from Stash (should be excluded gracefully)
   - Scene with null/0 duration (ping should continue without failing)

No new automated tests required — these are simple query pattern changes covered by existing integration tests.

---

## Files Changed

- `server/controllers/playlist.ts` — Replace Stash queries with Prisma + restriction filtering
- `server/controllers/watchHistory.ts` — Replace Stash query with Prisma lookup

---

## Related Documentation

- [Technical Overview](../development/technical-overview.md) — Documents this as a known issue under "Stash Communication Patterns"
