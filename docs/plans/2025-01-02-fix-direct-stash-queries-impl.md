# Fix Direct Stash Queries - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace direct Stash GraphQL queries with Prisma cache queries in playlist.ts and watchHistory.ts to fix user data display bugs and improve performance.

**Architecture:** Both fixes use the same pattern: query `StashScene` table via Prisma instead of Stash GraphQL, then apply existing user data merging and restriction filtering.

**Tech Stack:** Prisma, TypeScript, Express

---

## Task 1: Fix watchHistory.ts Duration Lookup

The simpler fix — replace one Stash query with a Prisma lookup.

**Files:**
- Modify: `server/controllers/watchHistory.ts:57-69`

**Step 1: Replace Stash query with Prisma lookup**

In `server/controllers/watchHistory.ts`, find lines 57-69:

```typescript
// Get scene duration from Stash
const stash = stashInstanceManager.getDefault();
let sceneDuration = 0;
try {
  const sceneData = await stash.findScenes({ ids: [sceneId] });
  sceneDuration = sceneData.findScenes.scenes[0]?.files?.[0]?.duration || 0;
} catch (error) {
  logger.error("Failed to fetch scene duration from Stash", {
    sceneId,
    error,
  });
  // Continue without duration - won't be able to calculate percentages
}
```

Replace with:

```typescript
// Get scene duration from cache
let sceneDuration = 0;
try {
  const scene = await prisma.stashScene.findUnique({
    where: { id: sceneId },
    select: { duration: true },
  });
  sceneDuration = scene?.duration || 0;
} catch (error) {
  logger.error("Failed to fetch scene duration from cache", {
    sceneId,
    error,
  });
  // Continue without duration - won't be able to calculate percentages
}
```

**Step 2: Remove unused import**

At the top of the file, find line 5:

```typescript
import { stashInstanceManager } from "../services/StashInstanceManager.js";
```

Remove this line since we no longer use `stashInstanceManager` in this file.

**Step 3: Verify the file compiles**

Run: `cd server && npx tsc --noEmit`

Expected: No errors related to watchHistory.ts

**Step 4: Test manually**

1. Start the server: `npm run dev`
2. Play a video in Peek
3. Watch server logs — should see "Watch history ping" logs without any Stash GraphQL errors
4. Check that play percentage calculations still work (resume position updates)

**Step 5: Commit**

```bash
git add server/controllers/watchHistory.ts
git commit -m "fix: use cached duration in watchHistory instead of Stash query

Replaces direct Stash GraphQL query with Prisma cache lookup for scene
duration. Eliminates network call on every 10-second playback ping.
"
```

---

## Task 2: Fix getPlaylist Scene Fetching

This is the main fix — replace Stash query with cache query and add restriction filtering.

**Files:**
- Modify: `server/controllers/playlist.ts:123-221` (getPlaylist function)

**Step 1: Add required imports**

At the top of `server/controllers/playlist.ts`, add these imports after the existing ones:

```typescript
import { stashEntityService } from "../services/StashEntityService.js";
import { userRestrictionService } from "../services/UserRestrictionService.js";
```

**Step 2: Replace getPlaylist implementation**

Replace the entire `getPlaylist` function (lines 123-221) with:

```typescript
/**
 * Get single playlist with items and scene details from cache
 */
export const getPlaylist = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const playlistId = parseInt(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(playlistId)) {
      return res.status(400).json({ error: "Invalid playlist ID" });
    }

    const playlist = await prisma.playlist.findFirst({
      where: {
        id: playlistId,
        userId, // Only allow accessing own playlists
      },
      include: {
        items: {
          orderBy: {
            position: "asc",
          },
        },
      },
    });

    if (!playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    // Fetch scene details from cache for all items
    if (playlist.items.length > 0) {
      const sceneIds = playlist.items.map((item) => item.sceneId);

      try {
        // 1. Fetch scenes from cache with relations
        const scenes = await stashEntityService.getScenesByIdsWithRelations(sceneIds);

        // 2. Apply user restrictions (filter out hidden/restricted scenes)
        const isAdmin = req.user?.role === "ADMIN";
        const visibleScenes = isAdmin
          ? scenes
          : await userRestrictionService.filterScenesForUser(scenes, userId);

        // 3. Reset user-specific fields to defaults before merging Peek user data
        const scenesWithDefaults = visibleScenes.map((s) => ({
          ...s,
          ...DEFAULT_SCENE_USER_FIELDS,
        }));

        // 4. Merge with user's personal data (WatchHistory + SceneRating)
        const { mergeScenesWithUserData } = await import("./library/scenes.js");
        const scenesWithUserHistory = await mergeScenesWithUserData(
          scenesWithDefaults,
          userId
        );

        // 5. Transform paths for proxy URLs
        const transformedScenes = scenesWithUserHistory.map((s) =>
          transformScene(s as unknown as Scene)
        );

        // Create a map of scene ID to scene data
        const sceneMap = new Map(
          transformedScenes.map((s) => [s.id, s])
        );

        // Attach scene data to each playlist item
        // Note: Items with restricted/hidden scenes will have scene: null
        const itemsWithScenes = playlist.items.map((item) => ({
          ...item,
          scene: sceneMap.get(item.sceneId) || null,
        }));

        res.json({
          playlist: {
            ...playlist,
            items: itemsWithScenes,
          },
        });
      } catch (cacheError) {
        console.error("Error fetching scenes from cache:", cacheError);
        // Return playlist without scene details if cache fails
        res.json({ playlist });
      }
    } else {
      res.json({ playlist });
    }
  } catch (error) {
    console.error("Error getting playlist:", error);
    res.status(500).json({ error: "Failed to get playlist" });
  }
};
```

**Step 3: Verify the file compiles**

Run: `cd server && npx tsc --noEmit`

Expected: No errors

**Step 4: Commit**

```bash
git add server/controllers/playlist.ts
git commit -m "fix: use cache for getPlaylist scene data

- Replace Stash GraphQL query with StashEntityService cache lookup
- Apply user restrictions to filter hidden/restricted scenes
- Fixes bug where Stash O-counter/favorite showed instead of user's values
"
```

---

## Task 3: Fix getUserPlaylists Scene Fetching

Same pattern for the playlists list endpoint (preview thumbnails).

**Files:**
- Modify: `server/controllers/playlist.ts:30-118` (getUserPlaylists function)

**Step 1: Replace getUserPlaylists implementation**

Replace the entire `getUserPlaylists` function (lines 30-118) with:

```typescript
/**
 * Get all playlists for current user
 * Includes first 4 items with scene preview data for thumbnail display
 */
export const getUserPlaylists = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const playlists = await prisma.playlist.findMany({
      where: {
        userId,
      },
      include: {
        _count: {
          select: { items: true },
        },
        items: {
          orderBy: {
            position: "asc",
          },
          take: 4, // Only fetch first 4 items for preview
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Fetch scene details for preview items from cache
    const playlistsWithScenes = await Promise.all(
      playlists.map(async (playlist) => {
        if (playlist.items.length === 0) {
          return playlist;
        }

        const sceneIds = playlist.items.map((item) => item.sceneId);

        try {
          // 1. Fetch scenes from cache with relations
          const scenes = await stashEntityService.getScenesByIdsWithRelations(sceneIds);

          // 2. Apply user restrictions (filter out hidden/restricted scenes)
          const isAdmin = req.user?.role === "ADMIN";
          const visibleScenes = isAdmin
            ? scenes
            : await userRestrictionService.filterScenesForUser(scenes, userId);

          // 3. Transform scenes to add proxy URLs
          const transformedScenes = visibleScenes.map((s) =>
            transformScene(s as unknown as Scene)
          );

          // Create a map of scene ID to scene data
          const sceneMap = new Map(
            transformedScenes.map((s) => [s.id, s])
          );

          // Attach scene data to each playlist item (only paths.screenshot needed for preview)
          const itemsWithScenes = playlist.items.map((item) => ({
            ...item,
            scene: sceneMap.get(item.sceneId) || null,
          }));

          return {
            ...playlist,
            items: itemsWithScenes,
          };
        } catch (cacheError) {
          console.error(
            `Error fetching scenes for playlist ${playlist.id}:`,
            cacheError
          );
          // Return playlist without scene details if cache fails
          return playlist;
        }
      })
    );

    res.json({ playlists: playlistsWithScenes });
  } catch (error) {
    console.error("Error getting playlists:", error);
    res.status(500).json({ error: "Failed to get playlists" });
  }
};
```

**Step 2: Remove unused Stash import pattern**

The dynamic import of `stashInstanceManager` is no longer used in this file. Search for any remaining references:

```typescript
// These lines should no longer exist anywhere in the file:
// const { stashInstanceManager } = await import("../services/StashInstanceManager.js");
// const stash = stashInstanceManager.getDefault();
```

Verify there are no remaining Stash imports.

**Step 3: Verify the file compiles**

Run: `cd server && npx tsc --noEmit`

Expected: No errors

**Step 4: Commit**

```bash
git add server/controllers/playlist.ts
git commit -m "fix: use cache for getUserPlaylists scene previews

- Replace Stash GraphQL query with StashEntityService cache lookup
- Apply user restrictions to filter hidden/restricted scenes from previews
"
```

---

## Task 4: Manual Testing

**Step 1: Test playlist display with user data**

1. Start the server: `npm run dev`
2. Create a playlist with several scenes
3. Rate one scene 5 stars in Peek
4. Mark another scene as favorite in Peek
5. Increment O-counter on a scene
6. View the playlist
7. **Verify:** Scenes show YOUR rating/favorite/O-counter, not Stash's global values

**Step 2: Test restricted content filtering**

1. As admin, add a tag restriction for a test user (e.g., exclude tag "Test")
2. Add a scene with that tag to a playlist
3. Log in as the restricted user
4. View the playlist
5. **Verify:** The restricted scene does not appear in the playlist

**Step 3: Test watch history duration**

1. Play a video in Peek
2. Let it play for 30+ seconds
3. Check server logs
4. **Verify:** No Stash GraphQL calls for duration
5. **Verify:** Resume time is saved correctly

**Step 4: Test edge cases**

1. Create a playlist with a scene, then delete that scene from Stash
2. Run a sync
3. View the playlist
4. **Verify:** Deleted scene shows as `scene: null`, playlist doesn't crash

**Step 5: Final commit with test confirmation**

```bash
git add -A
git commit -m "test: verify direct stash query fixes work correctly

Manual testing confirmed:
- Playlist scenes show user's personal O-counter/favorite/ratings
- Restricted scenes are filtered from playlist display
- Watch history uses cached duration (no Stash calls)
- Deleted scenes handled gracefully
"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Fix watchHistory duration lookup | `server/controllers/watchHistory.ts` |
| 2 | Fix getPlaylist scene fetching | `server/controllers/playlist.ts` |
| 3 | Fix getUserPlaylists scene previews | `server/controllers/playlist.ts` |
| 4 | Manual testing | (verification only) |

**Total commits:** 4-5 small, focused commits
