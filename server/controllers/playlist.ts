import prisma from "../prisma/singleton.js";
import { canUserAccessEntity } from "../services/EntityAccessService.js";
import { resolveUserPermissions } from "../services/PermissionService.js";
import {
  getPlaylistAccess,
  getUserGroups,
} from "../services/PlaylistAccessService.js";
import {
  loadPlaylistItems,
  loadPlaylistPreviews,
} from "../services/PlaylistQueryService.js";
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
  RemoveSceneFromPlaylistQuery,
  RemoveSceneFromPlaylistResponse,
  ReorderPlaylistParams,
  ReorderPlaylistRequest,
  ReorderPlaylistResponse,
  TypedAuthRequest,
  TypedLibraryRequest,
  TypedResponse,
  UpdatePlaylistParams,
  UpdatePlaylistRequest,
  UpdatePlaylistResponse,
  UpdatePlaylistSharesRequest,
  UpdatePlaylistSharesResponse,
} from "../types/api/index.js";
import { dbWrite, dbWriteBatch } from "../utils/dbWrite.js";
import { entityKey } from "../utils/entityRef.js";
import { parsePlaylistItemsRequest } from "../utils/listRequest.js";
import { emptyToNull } from "../utils/sqlHelpers.js";
import { INSTANCE_ID_PATTERN } from "../utils/stashMediaPath.js";

/**
 * A scene reference from a request: a playlist item names its scene and the
 * scene's instance, and the server never guesses the instance. `where`
 * names the field in the refusal.
 */
function parseSceneRef(
  sceneId: unknown,
  instanceId: unknown,
  where = ""
): { sceneId: string; instanceId: string } | { error: string } {
  if (typeof sceneId !== "string" || sceneId === "") {
    return { error: `${where}sceneId is required` };
  }
  if (instanceId === undefined) {
    return { error: `${where}instanceId is required` };
  }
  if (typeof instanceId !== "string" || !INSTANCE_ID_PATTERN.test(instanceId)) {
    return { error: `${where}instanceId must be an instance id` };
  }
  return { sceneId, instanceId };
}

/**
 * Get all playlists for current user, each with the first four items and
 * the item count the user can see (PlaylistQueryService)
 */
export const getUserPlaylists = async (
  req: TypedLibraryRequest,
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
    allowedInstanceIds: req.allowedInstanceIds,
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
  req: TypedLibraryRequest,
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
    allowedInstanceIds: req.allowedInstanceIds,
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
  req: TypedLibraryRequest<unknown, GetPlaylistParams, GetPlaylistQuery>,
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
    allowedInstanceIds: req.allowedInstanceIds,
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

  const ref = parseSceneRef(req.body.sceneId, req.body.instanceId);
  if ("error" in ref) {
    res.status(400).json({ error: ref.error });
    return;
  }
  const { sceneId, instanceId } = ref;

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

  // Only a scene this user can see: missing, hidden, restricted or on an
  // instance they do not use alike
  if (!(await canUserAccessEntity(userId, "scene", sceneId, instanceId))) {
    res.status(404).json({ error: "Scene not found" });
    return;
  }

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
    res.status(409).json({ error: "Scene already in playlist" });
    return;
  }

  // Calculate next position
  const nextPosition =
    playlist.items.length > 0
      ? (playlist.items[0] as (typeof playlist.items)[number]).position + 1
      : 0;

  // Two adds of the same scene at once: the second one's unique-key clash
  // answers 409 through the error handler
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
  req: TypedAuthRequest<
    unknown,
    RemoveSceneFromPlaylistParams,
    RemoveSceneFromPlaylistQuery
  >,
  res: TypedResponse<RemoveSceneFromPlaylistResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const playlistId = parseInt(req.params.id);

  if (isNaN(playlistId)) {
    res.status(400).json({ error: "Invalid playlist ID" });
    return;
  }

  const ref = parseSceneRef(req.params.sceneId, req.query.instanceId);
  if ("error" in ref) {
    res.status(400).json({ error: ref.error });
    return;
  }
  const { sceneId, instanceId } = ref;

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

  // Delete the item of that scene on that instance only; the same id on
  // another instance is another item
  const { count } = await dbWrite("playlist.removeItem", () =>
    prisma.playlistItem.deleteMany({
      where: { playlistId, instanceId, sceneId },
    })
  );

  if (count === 0) {
    res.status(404).json({ error: "Scene not in playlist" });
    return;
  }

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

  const { items } = req.body; // Array of { sceneId, instanceId, position }

  if (!Array.isArray(items)) {
    res.status(400).json({ error: "Items must be an array" });
    return;
  }

  // Every item names its scene, the scene's instance and a position
  const moves: { sceneId: string; instanceId: string; position: number }[] = [];
  for (const [index, item] of (items as unknown[]).entries()) {
    const where = `items[${index}].`;
    if (typeof item !== "object" || item === null) {
      res.status(400).json({ error: `items[${index}] must be an object` });
      return;
    }
    const fields = item as Record<string, unknown>;
    const ref = parseSceneRef(fields.sceneId, fields.instanceId, where);
    if ("error" in ref) {
      res.status(400).json({ error: ref.error });
      return;
    }
    const { position } = fields;
    if (
      typeof position !== "number" ||
      !Number.isInteger(position) ||
      position < 0
    ) {
      res
        .status(400)
        .json({ error: `${where}position must be a non-negative integer` });
      return;
    }
    moves.push({ ...ref, position });
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

  // Every item must be in this playlist, on the instance it names
  const stored = await prisma.playlistItem.findMany({
    where: { playlistId },
    select: { sceneId: true, instanceId: true },
  });
  const inPlaylist = new Set(
    stored.map((row) => entityKey(row.sceneId, row.instanceId))
  );
  const missing = moves.findIndex(
    (item) => !inPlaylist.has(entityKey(item.sceneId, item.instanceId))
  );
  if (missing !== -1) {
    res
      .status(400)
      .json({ error: `items[${missing}] is not in this playlist` });
    return;
  }

  // Update every position in one batch
  await dbWriteBatch(
    "playlist.reorder",
    moves.map((item) =>
      prisma.playlistItem.update({
        where: {
          playlistId_instanceId_sceneId: {
            playlistId,
            instanceId: item.instanceId,
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
