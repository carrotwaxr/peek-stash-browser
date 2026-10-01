// shared/types/api/playlist.ts
/**
 * Playlist API Types
 *
 * Request and response types for /api/playlists/* endpoints.
 */
import type { NormalizedScene } from "../entities.js";

// =============================================================================
// COMMON TYPES
// =============================================================================

/**
 * A playlist item the viewer can see, with the viewer's view of its scene
 * (their own rating, favorite, O and play fields). Items the viewer cannot
 * see (hidden, restricted, deleted, or on an instance they do not use) are
 * never listed.
 */
export interface PlaylistItemWithScene {
  id: number;
  playlistId: number;
  instanceId: string;
  sceneId: string;
  position: number;
  addedAt: Date;
  scene: NormalizedScene;
}

/** A preview's scene: what the playlists page shows of it */
export interface PlaylistPreviewScene {
  id: string;
  instanceId: string;
  title: string | null;
  paths: { screenshot: string | null };
}

/**
 * One of the first four items of a playlist the viewer can see, for the
 * preview thumbnails
 */
export interface PlaylistPreviewItem {
  sceneId: string;
  instanceId: string;
  position: number;
  scene: PlaylistPreviewScene;
}

/**
 * Playlist with item count and optional items
 * Uses Partial for optional fields since not all queries return all data
 */
export interface PlaylistData {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  shuffle: boolean;
  repeat: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    items: number;
  };
  items?: PlaylistItemWithScene[];
}

// =============================================================================
// GET USER PLAYLISTS
// =============================================================================

/**
 * A playlist on the playlists page and in the add-to-playlist menu: its
 * previews and count are what the viewer can see (invariant 3)
 */
export interface PlaylistSummary extends Omit<
  PlaylistData,
  "_count" | "items"
> {
  /** With `containsScene`: whether the playlist has that scene (B3) */
  containsScene?: boolean;
  /** How many of the playlist's items the viewer can see */
  _count: { items: number };
  /** The first four items the viewer can see, in position order */
  items: PlaylistPreviewItem[];
}

/**
 * GET /api/playlists
 * Get all playlists for current user; `containsScene` is a scene as
 * `"id:instanceId"`, and each playlist then says whether it holds it
 */
export interface GetUserPlaylistsQuery extends Record<
  string,
  string | undefined
> {
  containsScene?: string;
}

export interface GetUserPlaylistsResponse {
  playlists: PlaylistSummary[];
}

// =============================================================================
// GET PLAYLIST
// =============================================================================

/**
 * GET /api/playlists/:id
 * Get single playlist with items and scene details
 */
export interface GetPlaylistParams extends Record<string, string> {
  id: string;
}

/**
 * One page of the items the viewer can see: `page` from 1 (1 when absent),
 * `per_page` 1..100 (50 when absent). `sort` is one of `PLAYLIST_ITEM_SORTS`
 * (also `random_<seed>`; position when absent); `direction` is ASC or DESC
 * (ASC for position and added_at when absent, DESC for a scene sort).
 */
export interface GetPlaylistQuery extends Record<string, string | undefined> {
  page?: string;
  per_page?: string;
  sort?: string;
  direction?: string;
}

/**
 * `owner` is optional until B8 fills it, and becomes required with it.
 */
export interface GetPlaylistResponse {
  playlist: PlaylistData & { items: PlaylistItemWithScene[] };
  /** How many of the playlist's items the viewer can see */
  totalItems: number;
  /**
   * The owner's count of items they cannot play (hidden, restricted,
   * deleted from Stash, or on an instance they do not use); 0 for anyone
   * else, who is told nothing about them
   */
  unavailableItems: number;
  /** The page read */
  page: number;
  perPage: number;
  /**
   * The sort the items came back in: one of `PLAYLIST_ITEM_SORTS`, a random
   * one as `random_<seed>` (a bare `random` names the seed it used)
   */
  sort: string;
  direction: "ASC" | "DESC";
  isOwner: boolean;
  accessLevel: "owner" | "shared";
  sharedViaGroups?: string[];
  /** Who owns the playlist, for "Shared by" */
  owner?: { id: number; username: string };
}

// =============================================================================
// GET PLAYLIST QUEUE
// =============================================================================

/**
 * One entry of a play queue, in the shape of the client's `PlaybackEntry`:
 * ids and the fields the sidebar shows
 */
export interface PlaylistQueueEntry {
  sceneId: string;
  instanceId: string;
  position: number;
  scene: {
    title: string | null;
    paths: { screenshot: string | null };
    files: [{ duration: number | null; basename: string | null }] | [];
    studio: { name: string } | null;
  };
}

/**
 * GET /api/playlists/:id/queue
 * The items the viewer can play, in the order the page shows them (`sort`
 * and `direction` as on the item page; a random order is `sort=random_<seed>`)
 */
export interface GetPlaylistQueueQuery extends Record<
  string,
  string | undefined
> {
  sort?: string;
  direction?: string;
}

export interface GetPlaylistQueueResponse {
  entries: PlaylistQueueEntry[];
}

// =============================================================================
// CREATE PLAYLIST
// =============================================================================

/**
 * POST /api/playlists
 * Create new playlist
 */
export interface CreatePlaylistRequest {
  name: string;
  description?: string;
  isPublic?: boolean;
}

export interface CreatePlaylistResponse {
  playlist: PlaylistData;
}

// =============================================================================
// UPDATE PLAYLIST
// =============================================================================

/**
 * PUT /api/playlists/:id
 * Update playlist
 */
export interface UpdatePlaylistParams extends Record<string, string> {
  id: string;
}

export interface UpdatePlaylistRequest {
  name?: string;
  /** A client may send null to clear the description. */
  description?: string | null;
  isPublic?: boolean;
  shuffle?: boolean;
  repeat?: string;
}

export interface UpdatePlaylistResponse {
  playlist: PlaylistData;
}

// =============================================================================
// DELETE PLAYLIST
// =============================================================================

/**
 * DELETE /api/playlists/:id
 * Delete playlist
 */
export interface DeletePlaylistParams extends Record<string, string> {
  id: string;
}

export interface DeletePlaylistResponse {
  success: true;
  message: string;
}

// =============================================================================
// ADD SCENE TO PLAYLIST
// =============================================================================

/**
 * POST /api/playlists/:id/items
 * Add scene to playlist
 */
export interface AddSceneToPlaylistParams extends Record<string, string> {
  id: string;
}

/** The scene and its instance; the server never guesses the instance */
export interface AddSceneToPlaylistRequest {
  instanceId: string;
  sceneId: string;
}

export interface AddSceneToPlaylistResponse {
  item: {
    id: number;
    playlistId: number;
    instanceId: string;
    sceneId: string;
    position: number;
    addedAt: Date;
  };
}

// =============================================================================
// REMOVE SCENE FROM PLAYLIST
// =============================================================================

/**
 * DELETE /api/playlists/:id/items/:sceneId?instanceId=
 * Remove scene from playlist: the item of that scene on that instance
 */
export interface RemoveSceneFromPlaylistParams extends Record<string, string> {
  id: string;
  sceneId: string;
}

export interface RemoveSceneFromPlaylistQuery extends Record<
  string,
  string | string[] | undefined
> {
  instanceId?: string | string[];
}

export interface RemoveSceneFromPlaylistResponse {
  success: true;
  message: string;
}

// =============================================================================
// ADD SCENES TO PLAYLIST
// =============================================================================

/**
 * POST /api/playlists/:id/items/bulk
 * Add several scenes at once (1 to PER_PAGE_MAX), in the order given, after
 * the last item; scenes already there or not visible to the adder are
 * skipped and counted
 */
export interface AddScenesToPlaylistRequest {
  scenes: { sceneId: string; instanceId: string }[];
}

export interface AddScenesToPlaylistResponse {
  added: number;
  alreadyInPlaylist: number;
  /** Scenes the requester cannot see or that no longer exist */
  unavailable: number;
}

// =============================================================================
// MOVE, REMOVE AND SORT ITEMS
// =============================================================================

/**
 * Move one item to an index among the items the owner sees
 */
export interface MovePlaylistItemRequest {
  index: number;
}

export interface MovePlaylistItemResponse {
  success: true;
}

/**
 * Remove several items by item id
 */
export interface RemovePlaylistItemsRequest {
  itemIds: number[];
}

export interface RemovePlaylistItemsResponse {
  removed: number;
}

/**
 * Save a view sort as the playlist's order
 */
export interface SortPlaylistRequest {
  sort: string;
  direction: "ASC" | "DESC";
}

export interface SortPlaylistResponse {
  success: true;
  itemCount: number;
}

/**
 * POST /api/playlists/:id/items/remove-unavailable
 * Remove the items whose scene is deleted from Stash (owner only)
 */
export interface RemoveUnavailableItemsResponse {
  removed: number;
}

// =============================================================================
// GET SHARED PLAYLISTS
// =============================================================================

/**
 * GET /api/playlists/shared
 * Get playlists shared with current user; takes `containsScene` as
 * `GET /api/playlists` does (`GetUserPlaylistsQuery`)
 */
export interface SharedPlaylistData {
  /** With `containsScene`: whether the playlist has that scene (B3) */
  containsScene?: boolean;
  id: number;
  name: string;
  description: string | null;
  /** How many of the playlist's items the viewer can see */
  sceneCount: number;
  owner: { id: number; username: string };
  sharedViaGroups: string[];
  sharedAt: string;
  /** The first four items the viewer can see, in position order */
  items: PlaylistPreviewItem[];
}

export interface GetSharedPlaylistsResponse {
  playlists: SharedPlaylistData[];
}

// =============================================================================
// GET PLAYLIST SHARES
// =============================================================================

/**
 * GET /api/playlists/:id/shares
 * Get sharing info for a playlist (owner only)
 */
export interface PlaylistShareInfo {
  groupId: number;
  groupName: string;
  sharedAt: string;
}

export interface GetPlaylistSharesResponse {
  shares: PlaylistShareInfo[];
}

// =============================================================================
// UPDATE PLAYLIST SHARES
// =============================================================================

/**
 * PUT /api/playlists/:id/shares
 * Update sharing - set which groups (owner only, requires canShare)
 */
export interface UpdatePlaylistSharesRequest {
  groupIds: number[];
}

export interface UpdatePlaylistSharesResponse {
  shares: PlaylistShareInfo[];
}

// =============================================================================
// DUPLICATE PLAYLIST
// =============================================================================

/**
 * POST /api/playlists/:id/duplicate
 * Create a copy of a shared playlist
 */
export interface DuplicatePlaylistResponse {
  playlist: PlaylistData;
}
