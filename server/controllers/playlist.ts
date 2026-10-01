import { PER_PAGE_MAX } from "@peek/shared-types/filters/index.js";
import prisma from "../prisma/singleton.js";
import { resolveUserPermissions } from "../services/PermissionService.js";
import {
  getPlaylistAccess,
  getUserGroups,
} from "../services/PlaylistAccessService.js";
import {
  appendItems,
  duplicateVisibleItems,
  loadPlaylistItems,
  loadPlaylistPreviews,
  playlistsHoldingScene,
} from "../services/PlaylistQueryService.js";
import type {
  AddSceneToPlaylistParams,
  AddSceneToPlaylistRequest,
  AddSceneToPlaylistResponse,
  AddScenesToPlaylistRequest,
  AddScenesToPlaylistResponse,
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
  GetUserPlaylistsQuery,
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
import { dbWrite, dbWriteBatch, dbWriteTransaction } from "../utils/dbWrite.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import {
  parsePlaylistItemsRequest,
  parsePlaylistsQuery,
} from "../utils/listRequest.js";
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
 * With `containsScene`, the ids of these playlists that hold that scene;
 * undefined when the request did not ask
 */
async function holdingScene(
  playlistIds: readonly number[],
  scene: EntityRef | undefined
): Promise<Set<number> | undefined> {
  return scene === undefined
    ? undefined
    : playlistsHoldingScene(playlistIds, scene);
}

/**
 * Get all playlists for current user, each with the first four items and
 * the item count the user can see (PlaylistQueryService); with
 * `containsScene`, each says whether it holds that scene
 */
export const getUserPlaylists = async (
  req: TypedLibraryRequest<
    unknown,
    Record<string, string>,
    GetUserPlaylistsQuery
  >,
  res: TypedResponse<GetUserPlaylistsResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  // A ValidationError (400) reaches the central error handler
  const { containsScene } = parsePlaylistsQuery(req.query, { userId });

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
  const holding = await holdingScene(
    playlists.map((p) => p.id),
    containsScene
  );

  res.json({
    playlists: playlists.map((playlist) => {
      const preview = previews.get(playlist.id);
      return {
        ...playlist,
        ...(holding && { containsScene: holding.has(playlist.id) }),
        _count: { items: preview?.visibleCount ?? 0 },
        items: preview?.items ?? [],
      };
    }),
  });
};

/**
 * Get playlists shared with current user (not owned by them), each with the
 * first four items and the item count this user can see: their own
 * exclusions and instances, never the owner's (invariant 10); with
 * `containsScene`, each says whether it holds that scene
 */
export const getSharedPlaylists = async (
  req: TypedLibraryRequest<
    unknown,
    Record<string, string>,
    GetUserPlaylistsQuery
  >,
  res: TypedResponse<GetSharedPlaylistsResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  // A ValidationError (400) reaches the central error handler
  const { containsScene } = parsePlaylistsQuery(req.query, { userId });

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
  const holding = await holdingScene(
    sharedPlaylists.map((p) => p.id),
    containsScene
  );

  res.json({
    playlists: sharedPlaylists.map((p) => {
      const preview = previews.get(p.id);
      return {
        ...(holding && { containsScene: holding.has(p.id) }),
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

  const { name, description } = req.body;

  if (!name || name.trim() === "") {
    res.status(400).json({ error: "Playlist name is required" });
    return;
  }

  const playlist = await dbWrite("playlist.create", () =>
    prisma.playlist.create({
      data: {
        name: name.trim(),
        description: emptyToNull(description?.trim()),
        userId,
      },
    })
  );

  // A new playlist has no items
  res.status(201).json({ playlist: { ...playlist, _count: { items: 0 } } });
};

/**
 * Update playlist
 */
export const updatePlaylist = async (
  req: TypedLibraryRequest<UpdatePlaylistRequest, UpdatePlaylistParams>,
  res: TypedResponse<UpdatePlaylistResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const playlistId = parseInt(req.params.id);

  if (isNaN(playlistId)) {
    res.status(400).json({ error: "Invalid playlist ID" });
    return;
  }

  const { name, description, repeat } = req.body;
  // The body is not validated: only a literal true turns this on
  const { shuffle }: { shuffle?: unknown } = req.body;

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

  const playlist = await dbWrite("playlist.update", () =>
    prisma.playlist.update({
      where: { id: playlistId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && {
          description: emptyToNull(description?.trim()),
        }),
        ...(shuffle !== undefined && { shuffle: shuffle === true }),
        ...(repeat !== undefined && { repeat }),
      },
    })
  );

  // The count is what the requester can see, not the rows
  const previews = await loadPlaylistPreviews({
    userId,
    allowedInstanceIds: req.allowedInstanceIds,
    playlistIds: [playlistId],
  });
  res.json({
    playlist: {
      ...playlist,
      _count: { items: previews.get(playlistId)?.visibleCount ?? 0 },
    },
  });
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
  await dbWrite("playlist.delete", () =>
    prisma.playlist.delete({
      where: { id: playlistId },
    })
  );

  res.json({ success: true, message: "Playlist deleted" });
};

/**
 * Add scene to playlist: owners and shared users alike (remove, reorder and
 * rename stay owner-only). The item takes the next position inside the
 * insert (appendItems), so two adds at once never share one.
 */
export const addSceneToPlaylist = async (
  req: TypedLibraryRequest<AddSceneToPlaylistRequest, AddSceneToPlaylistParams>,
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

  const access = await getPlaylistAccess(playlistId, userId);
  if (access.level === "none") {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  const result = await appendItems(playlistId, userId, [
    { id: sceneId, instanceId },
  ]);
  // Only a scene this user can see: missing, hidden, restricted or on an
  // instance they do not use alike
  if (result.unavailable > 0) {
    res.status(404).json({ error: "Scene not found" });
    return;
  }
  if (result.alreadyInPlaylist > 0) {
    res.status(409).json({ error: "Scene already in playlist" });
    return;
  }

  const item = await prisma.playlistItem.findUnique({
    where: {
      playlistId_instanceId_sceneId: { playlistId, instanceId, sceneId },
    },
  });
  if (!item) {
    // Removed, or the playlist deleted, since the add
    res.status(404).json({ error: "Scene not in playlist" });
    return;
  }

  res.status(201).json({ item });
};

/**
 * Add several scenes at once (`POST /playlists/:id/items/bulk`), at most a
 * page of them, in the order given: the ones already there or that the
 * adder cannot see are skipped and counted. Access as a single add.
 */
export const addScenesToPlaylist = async (
  req: TypedLibraryRequest<
    AddScenesToPlaylistRequest,
    AddSceneToPlaylistParams
  >,
  res: TypedResponse<AddScenesToPlaylistResponse | ApiErrorResponse>
) => {
  const userId = req.user.id;
  const playlistId = parseInt(req.params.id);

  if (isNaN(playlistId)) {
    res.status(400).json({ error: "Invalid playlist ID" });
    return;
  }

  // The body is not validated: every entry is checked here
  const { scenes }: { scenes?: unknown } = req.body;
  if (
    !Array.isArray(scenes) ||
    scenes.length === 0 ||
    scenes.length > PER_PAGE_MAX
  ) {
    res.status(400).json({
      error: `scenes must be an array of 1 to ${PER_PAGE_MAX} scenes`,
    });
    return;
  }

  const refs: EntityRef[] = [];
  for (const [index, entry] of (scenes as unknown[]).entries()) {
    if (typeof entry !== "object" || entry === null) {
      res.status(400).json({ error: `scenes[${index}] must be an object` });
      return;
    }
    const fields = entry as Record<string, unknown>;
    const ref = parseSceneRef(
      fields.sceneId,
      fields.instanceId,
      `scenes[${index}].`
    );
    if ("error" in ref) {
      res.status(400).json({ error: ref.error });
      return;
    }
    refs.push({ id: ref.sceneId, instanceId: ref.instanceId });
  }

  const access = await getPlaylistAccess(playlistId, userId);
  if (access.level === "none") {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  const { added, alreadyInPlaylist, unavailable } = await appendItems(
    playlistId,
    userId,
    refs
  );
  res.json({ added, alreadyInPlaylist, unavailable });
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
  req: TypedLibraryRequest<unknown, GetPlaylistParams>,
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

  const original = await prisma.playlist.findUnique({
    where: { id: playlistId },
  });

  if (!original) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  // The copy holds the items the requester can see, copied by one statement
  const items = duplicateVisibleItems(
    userId,
    req.allowedInstanceIds,
    playlistId
  );
  const { copy, added } = await dbWriteTransaction(
    "playlist.duplicate",
    async (tx) => {
      const copy = await tx.playlist.create({
        data: {
          name: `${original.name} (Copy)`,
          description: original.description,
          userId,
          shuffle: original.shuffle,
          repeat: original.repeat,
        },
      });
      const added = await tx.$executeRawUnsafe(
        items.sql,
        ...items.paramsFor(copy.id)
      );
      return { copy, added };
    }
  );

  res.status(201).json({ playlist: { ...copy, _count: { items: added } } });
};
