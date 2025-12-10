import { Response } from "express";
import { Scene } from "stashapp-api";
import { AuthenticatedRequest } from "../middleware/auth.js";
import prisma from "../prisma/singleton.js";
import type { NormalizedScene } from "../types/index.js";
import { transformScene } from "../utils/stashUrlProxy.js";

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

    // Fetch scene details for preview items from Stash
    const playlistsWithScenes = await Promise.all(
      playlists.map(async (playlist) => {
        if (playlist.items.length === 0) {
          return playlist;
        }

        const sceneIds = playlist.items.map((item) => item.sceneId);

        try {
          const { stashInstanceManager } = await import(
            "../services/StashInstanceManager.js"
          );
          const stash = stashInstanceManager.getDefault();

          const scenesResponse = await stash.findScenes({
            scene_ids: sceneIds.map((id) => parseInt(id)),
          });

          const scenes = scenesResponse.findScenes.scenes;

          // Transform scenes to add API key to image paths
          const transformedScenes = scenes.map((s: unknown) =>
            transformScene(s as Scene)
          );

          // Create a map of scene ID to scene data
          const sceneMap = new Map(
            transformedScenes.map((s: Scene) => [s.id, s])
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
        } catch (stashError) {
          console.error(
            `Error fetching scenes for playlist ${playlist.id}:`,
            stashError
          );
          // Return playlist without scene details if Stash fails
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

/**
 * Get single playlist with items and scene details from Stash
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

    // Fetch scene details from Stash for all items
    if (playlist.items.length > 0) {
      const sceneIds = playlist.items.map((item) => item.sceneId);

      // Get Stash instance and fetch scenes
      const { stashInstanceManager } = await import(
        "../services/StashInstanceManager.js"
      );
      const stash = stashInstanceManager.getDefault();

      try {
        const scenesResponse = await stash.findScenes({
          scene_ids: sceneIds.map((id) => parseInt(id)),
        });

        const scenes = scenesResponse.findScenes.scenes;

        // Transform scenes to add API key to image paths
        // GraphQL response types don't exactly match Scene type, use unknown for type safety
        const transformedScenes = scenes.map((s: unknown) =>
          transformScene(s as Scene)
        );

        // Override with per-user watch history
        const { mergeScenesWithUserData } = await import("./library/scenes.js");
        // Type assertion safe: scenes from API are compatible with Normalized type structure
        const scenesWithUserHistory = await mergeScenesWithUserData(
          transformedScenes as unknown as NormalizedScene[],
          userId
        );

        // Create a map of scene ID to scene data
        const sceneMap = new Map(
          scenesWithUserHistory.map((s: NormalizedScene) => [s.id, s])
        );

        // Attach scene data to each playlist item
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
      } catch (stashError) {
        console.error("Error fetching scenes from Stash:", stashError);
        // Return playlist without scene details if Stash fails
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

/**
 * Create new playlist
 */
export const createPlaylist = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, description, isPublic } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Playlist name is required" });
    }

    const playlist = await prisma.playlist.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        isPublic: isPublic === true,
        userId,
      },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    res.status(201).json({ playlist });
  } catch (error) {
    console.error("Error creating playlist:", error);
    res.status(500).json({ error: "Failed to create playlist" });
  }
};

/**
 * Update playlist
 */
export const updatePlaylist = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const playlistId = parseInt(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(playlistId)) {
      return res.status(400).json({ error: "Invalid playlist ID" });
    }

    const { name, description, isPublic, shuffle, repeat } = req.body;

    // Check ownership
    const existing = await prisma.playlist.findFirst({
      where: {
        id: playlistId,
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    const playlist = await prisma.playlist.update({
      where: { id: playlistId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && {
          description: description?.trim() || null,
        }),
        ...(isPublic !== undefined && { isPublic: isPublic === true }),
        ...(shuffle !== undefined && { shuffle: shuffle === true }),
        ...(repeat !== undefined && { repeat }),
      },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    res.json({ playlist });
  } catch (error) {
    console.error("Error updating playlist:", error);
    res.status(500).json({ error: "Failed to update playlist" });
  }
};

/**
 * Delete playlist
 */
export const deletePlaylist = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const playlistId = parseInt(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(playlistId)) {
      return res.status(400).json({ error: "Invalid playlist ID" });
    }

    // Check ownership
    const existing = await prisma.playlist.findFirst({
      where: {
        id: playlistId,
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    // Delete playlist (items will cascade delete)
    await prisma.playlist.delete({
      where: { id: playlistId },
    });

    res.json({ success: true, message: "Playlist deleted" });
  } catch (error) {
    console.error("Error deleting playlist:", error);
    res.status(500).json({ error: "Failed to delete playlist" });
  }
};

/**
 * Add scene to playlist
 */
export const addSceneToPlaylist = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const playlistId = parseInt(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(playlistId)) {
      return res.status(400).json({ error: "Invalid playlist ID" });
    }

    const { sceneId } = req.body;

    if (!sceneId) {
      return res.status(400).json({ error: "Scene ID is required" });
    }

    // Check ownership
    const playlist = await prisma.playlist.findFirst({
      where: {
        id: playlistId,
        userId,
      },
      include: {
        items: {
          orderBy: {
            position: "desc",
          },
          take: 1,
        },
      },
    });

    if (!playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    // Check if scene already in playlist
    const existing = await prisma.playlistItem.findUnique({
      where: {
        playlistId_sceneId: {
          playlistId,
          sceneId,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ error: "Scene already in playlist" });
    }

    // Calculate next position
    const nextPosition =
      playlist.items.length > 0 ? playlist.items[0].position + 1 : 0;

    const item = await prisma.playlistItem.create({
      data: {
        playlistId,
        sceneId,
        position: nextPosition,
      },
    });

    res.status(201).json({ item });
  } catch (error) {
    console.error("Error adding scene to playlist:", error);
    res.status(500).json({ error: "Failed to add scene to playlist" });
  }
};

/**
 * Remove scene from playlist
 */
export const removeSceneFromPlaylist = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const playlistId = parseInt(req.params.id);
    const { sceneId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(playlistId)) {
      return res.status(400).json({ error: "Invalid playlist ID" });
    }

    // Check ownership
    const playlist = await prisma.playlist.findFirst({
      where: {
        id: playlistId,
        userId,
      },
    });

    if (!playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    // Delete the item
    await prisma.playlistItem.delete({
      where: {
        playlistId_sceneId: {
          playlistId,
          sceneId,
        },
      },
    });

    res.json({ success: true, message: "Scene removed from playlist" });
  } catch (error) {
    console.error("Error removing scene from playlist:", error);
    res.status(500).json({ error: "Failed to remove scene from playlist" });
  }
};

/**
 * Reorder playlist items
 */
export const reorderPlaylist = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const playlistId = parseInt(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (isNaN(playlistId)) {
      return res.status(400).json({ error: "Invalid playlist ID" });
    }

    const { items } = req.body; // Array of { sceneId, position }

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Items must be an array" });
    }

    // Check ownership
    const playlist = await prisma.playlist.findFirst({
      where: {
        id: playlistId,
        userId,
      },
    });

    if (!playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    // Update positions in a transaction
    await prisma.$transaction(
      items.map((item) =>
        prisma.playlistItem.update({
          where: {
            playlistId_sceneId: {
              playlistId,
              sceneId: item.sceneId,
            },
          },
          data: {
            position: item.position,
          },
        })
      )
    );

    res.json({ success: true, message: "Playlist reordered" });
  } catch (error) {
    console.error("Error reordering playlist:", error);
    res.status(500).json({ error: "Failed to reorder playlist" });
  }
};
