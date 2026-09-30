import prisma from "../prisma/singleton.js";
import { resolveUserPermissions } from "../services/PermissionService.js";
import {
  getPlaylistAccess,
  getUserGroups,
} from "../services/PlaylistAccessService.js";
import {
  loadPlaylistItems,
  loadPlaylistPreviews,
} from "../services/PlaylistQueryService.js";
import { getUserAllowedInstanceIds } from "../services/UserInstanceService.js";
import type {
  AddSceneToPlaylistParams,
  AddSceneToPlaylistRequest,
  AddSceneToPlaylistResponse,
  ApiErrorResponse,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  DeletePlaylistParams,
  DeletePlaylistResponse,
  DuplicatePlaylistResponse,
  GetPlaylistParams,
  GetPlaylistQuery,
  GetPlaylistResponse,
  GetPlaylistSharesResponse,
  GetSharedPlaylistsResponse,
  GetUserPlaylistsResponse,
  RemoveSceneFromPlaylistParams,
  RemoveSceneFromPlaylistResponse,
  ReorderPlaylistParams,
  ReorderPlaylistRequest,
  ReorderPlaylistResponse,
  TypedAuthRequest,
  TypedResponse,
  UpdatePlaylistParams,
  UpdatePlaylistRequest,
  UpdatePlaylistResponse,
  UpdatePlaylistSharesRequest,
  UpdatePlaylistSharesResponse,
} from "../types/api/index.js";
import { dbWrite, dbWriteBatch } from "../utils/dbWrite.js";
import {
  getEntityInstanceId,
  getEntityInstanceIds,
} from "../utils/entityInstanceId.js";
import { parsePlaylistItemsRequest } from "../utils/listRequest.js";
import { emptyToNull } from "../utils/sqlHelpers.js";

/**
 * Get all playlists for current user, each with the first four items and
 * the item count the user can see (PlaylistQueryService)
 */
export const getUserPlaylists = async (
  req: TypedAuthRequest,
  res: TypedResponse<GetUserPlaylistsResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const playlists = await prisma.playlist.findMany({
    where: {
      userId,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const previews = await loadPlaylistPreviews({
    userId,
    allowedInstanceIds: await getUserAllowedInstanceIds(userId),
    playlistIds: playlists.map((p) => p.id),
  });

  res.json({
    playlists: playlists.map((playlist) => {
      const preview = previews.get(playlist.id);
      return {
        ...playlist,
        _count: { items: preview?.visibleCount ?? 0 },
        items: preview?.items ?? [],
      };
    }),
  });
};

/**
 * Get playlists shared with current user (not owned by them), each with the
 * first four items and the item count this user can see: their own
 * exclusions and instances, never the owner's (invariant 10)
 */
export const getSharedPlaylists = async (
  req: TypedAuthRequest,
  res: TypedResponse<GetSharedPlaylistsResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  // Find playlists shared with groups the user belongs to (excluding own playlists)
  const sharedPlaylists = await prisma.playlist.findMany({
    where: {
      userId: { not: userId },
      shares: {
        some: {
          group: {
            members: {
              some: { userId },
            },
          },
        },
      },
    },
    include: {
      user: {
        select: { id: true, username: true },
      },
      shares: {
        where: {
          group: {
            members: {
              some: { userId },
            },
          },
        },
        select: {
          sharedAt: true,
          group: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const previews = await loadPlaylistPreviews({
    userId,
    allowedInstanceIds: await getUserAllowedInstanceIds(userId),
    playlistIds: sharedPlaylists.map((p) => p.id),
  });

  res.json({
    playlists: sharedPlaylists.map((p) => {
      const preview = previews.get(p.id);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        sceneCount: preview?.visibleCount ?? 0,
        owner: { id: p.user.id, username: p.user.username },
        sharedViaGroups: p.shares.map((s) => s.group.name),
        sharedAt:
          p.shares.length > 0
            ? p.shares
                .reduce(
                  (earliest, s) =>
                    s.sharedAt < earliest ? s.sharedAt : earliest,
                  (p.shares[0] as (typeof p.shares)[number]).sharedAt
                )
                .toISOString()
            : new Date().toISOString(),
        items: preview?.items ?? [],
      };
    }),
  });
};

/**
 * Get single playlist with its items and their scenes as this user sees
 * them: every item without `page` and `per_page`, else one page of the
 * items the user can see (PlaylistQueryService.loadPlaylistItems)
 */
export const getPlaylist = async (
  req: TypedAuthRequest<unknown, GetPlaylistParams, GetPlaylistQuery>,
  res: TypedResponse<GetPlaylistResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  // A ValidationError (400) reaches the central error handler
  const request = parsePlaylistItemsRequest(req.query, { userId });

  const playlistId = parseInt(req.params.id);

  if (isNaN(playlistId)) {
    res.status(400).json({ error: "Invalid playlist ID" });
    return;
  }

  // Check access level
  const access = await getPlaylistAccess(playlistId, userId);
  if (access.level === "none") {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
  });

  if (!playlist) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  const { paging } = request;
  const { items, totalItems } = await loadPlaylistItems({
    userId,
    allowedInstanceIds: await getUserAllowedInstanceIds(userId),
    playlistId,
    paging,
  });

  res.json({
    playlist: { ...playlist, items },
    totalItems,
    ...(paging && { page: paging.page, perPage: paging.perPage }),
    isOwner: access.level === "owner",
    accessLevel: access.level,
    ...(access.level === "shared" ? { sharedViaGroups: access.groups } : {}),
  });
};

/**
 * Create new playlist
 */
export const createPlaylist = async (
  req: TypedAuthRequest<CreatePlaylistRequest>,
  res: TypedResponse<CreatePlaylistResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;

  const { name, description, isPublic } = req.body;

  if (!name || name.trim() === "") {
    res.status(400).json({ error: "Playlist name is required" });
    return;
  }

  const playlist = await prisma.playlist.create({
    data: {
      name: name.trim(),
      description: emptyToNull(description?.trim()),
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
};

/**
 * Update playlist
 */
export const updatePlaylist = async (
  req: TypedAuthRequest<UpdatePlaylistRequest, UpdatePlaylistParams>,
  res: TypedResponse<UpdatePlaylistResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const playlistId = parseInt(req.params.id);

  if (isNaN(playlistId)) {
    res.status(400).json({ error: "Invalid playlist ID" });
    return;
  }

  const { name, description, repeat } = req.body;
  // The body is not validated: only a literal true turns these on
  const { isPublic, shuffle }: { isPublic?: unknown; shuffle?: unknown } =
    req.body;

  // Check ownership
  const existing = await prisma.playlist.findFirst({
    where: {
      id: playlistId,
      userId,
    },
  });

  if (!existing) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  const playlist = await prisma.playlist.update({
    where: { id: playlistId },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && {
        description: emptyToNull(description?.trim()),
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
};

/**
 * Delete playlist
 */
export const deletePlaylist = async (
  req: TypedAuthRequest<unknown, DeletePlaylistParams>,
  res: TypedResponse<DeletePlaylistResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const playlistId = parseInt(req.params.id);

  if (isNaN(playlistId)) {
    res.status(400).json({ error: "Invalid playlist ID" });
    return;
  }

  // Check ownership
  const existing = await prisma.playlist.findFirst({
    where: {
      id: playlistId,
      userId,
    },
  });

  if (!existing) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  // Delete playlist (items will cascade delete)
  await prisma.playlist.delete({
    where: { id: playlistId },
  });

  res.json({ success: true, message: "Playlist deleted" });
};

/**
 * Add scene to playlist
 */
export const addSceneToPlaylist = async (
  req: TypedAuthRequest<AddSceneToPlaylistRequest, AddSceneToPlaylistParams>,
  res: TypedResponse<AddSceneToPlaylistResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const playlistId = parseInt(req.params.id);

  if (isNaN(playlistId)) {
    res.status(400).json({ error: "Invalid playlist ID" });
    return;
  }

  const { sceneId } = req.body;

  if (!sceneId) {
    res.status(400).json({ error: "Scene ID is required" });
    return;
  }

  // Check access — owners and shared users can add scenes
  // Note: remove/reorder/rename remain owner-only (intentional asymmetry)
  const access = await getPlaylistAccess(playlistId, userId);
  if (access.level === "none") {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
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
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  // Get scene instanceId
  const instanceId = await getEntityInstanceId("scene", sceneId);

  // Check if scene already in playlist
  const existing = await prisma.playlistItem.findUnique({
    where: {
      playlistId_instanceId_sceneId: {
        playlistId,
        instanceId,
        sceneId,
      },
    },
  });

  if (existing) {
    res.status(400).json({ error: "Scene already in playlist" });
    return;
  }

  // Calculate next position
  const nextPosition =
    playlist.items.length > 0
      ? (playlist.items[0] as (typeof playlist.items)[number]).position + 1
      : 0;

  const item = await dbWrite("playlist.addItem", () =>
    prisma.playlistItem.create({
      data: {
        playlistId,
        instanceId,
        sceneId,
        position: nextPosition,
      },
    })
  );

  res.status(201).json({ item });
};

/**
 * Remove scene from playlist
 */
export const removeSceneFromPlaylist = async (
  req: TypedAuthRequest<unknown, RemoveSceneFromPlaylistParams>,
  res: TypedResponse<RemoveSceneFromPlaylistResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const playlistId = parseInt(req.params.id);
  const { sceneId } = req.params;

  if (isNaN(playlistId)) {
    res.status(400).json({ error: "Invalid playlist ID" });
    return;
  }

  // Check ownership
  const playlist = await prisma.playlist.findFirst({
    where: {
      id: playlistId,
      userId,
    },
  });

  if (!playlist) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  // Get scene instanceId
  const instanceId = await getEntityInstanceId("scene", sceneId);

  // Delete the item
  await dbWrite("playlist.removeItem", () =>
    prisma.playlistItem.delete({
      where: {
        playlistId_instanceId_sceneId: {
          playlistId,
          instanceId,
          sceneId,
        },
      },
    })
  );

  res.json({ success: true, message: "Scene removed from playlist" });
};

/**
 * Reorder playlist items
 */
export const reorderPlaylist = async (
  req: TypedAuthRequest<ReorderPlaylistRequest, ReorderPlaylistParams>,
  res: TypedResponse<ReorderPlaylistResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const playlistId = parseInt(req.params.id);

  if (isNaN(playlistId)) {
    res.status(400).json({ error: "Invalid playlist ID" });
    return;
  }

  const { items } = req.body; // Array of { sceneId, position }

  if (!Array.isArray(items)) {
    res.status(400).json({ error: "Items must be an array" });
    return;
  }

  // Check ownership
  const playlist = await prisma.playlist.findFirst({
    where: {
      id: playlistId,
      userId,
    },
  });

  if (!playlist) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  // Get instanceIds for all scenes
  const sceneIds = items.map((item) => item.sceneId);
  const instanceIdMap = await getEntityInstanceIds("scene", sceneIds);

  // Update every position in one batch
  await dbWriteBatch(
    "playlist.reorder",
    items.map((item) => {
      const instanceId = instanceIdMap.get(item.sceneId);
      if (!instanceId) {
        throw new Error(`Missing instanceId for scene ${item.sceneId}`);
      }
      return prisma.playlistItem.update({
        where: {
          playlistId_instanceId_sceneId: {
            playlistId,
            instanceId,
            sceneId: item.sceneId,
          },
        },
        data: {
          position: item.position,
        },
      });
    })
  );

  res.json({ success: true, message: "Playlist reordered" });
};

/**
 * Get sharing info for a playlist (owner only)
 */
export const getPlaylistShares = async (
  req: TypedAuthRequest<unknown, GetPlaylistParams>,
  res: TypedResponse<GetPlaylistSharesResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const playlistId = parseInt(req.params.id);

  if (isNaN(playlistId)) {
    res.status(400).json({ error: "Invalid playlist ID" });
    return;
  }

  // Verify ownership
  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, userId },
  });

  if (!playlist) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  const shares = await prisma.playlistShare.findMany({
    where: { playlistId },
    select: {
      sharedAt: true,
      group: {
        select: { id: true, name: true },
      },
    },
  });

  res.json({
    shares: shares.map((s) => ({
      groupId: s.group.id,
      groupName: s.group.name,
      sharedAt: s.sharedAt.toISOString(),
    })),
  });
};

/**
 * Update sharing for a playlist (owner only, requires canShare permission)
 */
export const updatePlaylistShares = async (
  req: TypedAuthRequest<UpdatePlaylistSharesRequest, GetPlaylistParams>,
  res: TypedResponse<UpdatePlaylistSharesResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const playlistId = parseInt(req.params.id);

  if (isNaN(playlistId)) {
    res.status(400).json({ error: "Invalid playlist ID" });
    return;
  }

  const { groupIds } = req.body;

  if (!Array.isArray(groupIds)) {
    res.status(400).json({ error: "groupIds must be an array" });
    return;
  }

  // Verify ownership
  const playlist = await prisma.playlist.findFirst({
    where: { id: playlistId, userId },
  });

  if (!playlist) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  // If sharing with any groups, check canShare permission
  if (groupIds.length > 0) {
    const permissions = await resolveUserPermissions(userId);
    if (!permissions?.canShare) {
      res
        .status(403)
        .json({ error: "You don't have permission to share playlists" });
      return;
    }

    // Verify user belongs to all specified groups
    const userGroups = await getUserGroups(userId);
    const userGroupIds = new Set(userGroups.map((g) => g.id));

    for (const groupId of groupIds) {
      if (!userGroupIds.has(groupId)) {
        res
          .status(403)
          .json({ error: "You can only share with groups you belong to" });
        return;
      }
    }
  }

  // Replace all shares with new set
  await dbWriteBatch("playlist.shares", [
    prisma.playlistShare.deleteMany({ where: { playlistId } }),
    ...groupIds.map((groupId) =>
      prisma.playlistShare.create({
        data: { playlistId, groupId },
      })
    ),
  ]);

  // Fetch updated shares
  const shares = await prisma.playlistShare.findMany({
    where: { playlistId },
    select: {
      sharedAt: true,
      group: {
        select: { id: true, name: true },
      },
    },
  });

  res.json({
    shares: shares.map((s) => ({
      groupId: s.group.id,
      groupName: s.group.name,
      sharedAt: s.sharedAt.toISOString(),
    })),
  });
};

/**
 * Duplicate a playlist (requires access - owner or shared)
 */
export const duplicatePlaylist = async (
  req: TypedAuthRequest<unknown, GetPlaylistParams>,
  res: TypedResponse<DuplicatePlaylistResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const playlistId = parseInt(req.params.id);

  if (isNaN(playlistId)) {
    res.status(400).json({ error: "Invalid playlist ID" });
    return;
  }

  // Check access
  const access = await getPlaylistAccess(playlistId, userId);
  if (access.level === "none") {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  // Fetch original playlist with items
  const original = await prisma.playlist.findUnique({
    where: { id: playlistId },
    include: {
      items: {
        orderBy: { position: "asc" },
      },
    },
  });

  if (!original) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  // Create duplicate
  const duplicate = await prisma.playlist.create({
    data: {
      name: `${original.name} (Copy)`,
      description: original.description,
      userId,
      isPublic: false,
      shuffle: original.shuffle,
      repeat: original.repeat,
      items: {
        create: original.items.map((item) => ({
          sceneId: item.sceneId,
          instanceId: item.instanceId,
          position: item.position,
        })),
      },
    },
    include: {
      _count: {
        select: { items: true },
      },
    },
  });

  res.status(201).json({ playlist: duplicate });
};
