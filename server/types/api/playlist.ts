// server/types/api/playlist.ts
/**
 * Playlist API Types
 *
 * Request and response types for /api/playlists/* endpoints.
 */
import type { NormalizedScene } from "../index.js";

// =============================================================================
// COMMON TYPES
// =============================================================================

/**
 * A playlist item with its scene: the viewer's view of the scene (their own
 * rating, favorite, O and play fields), or null when the viewer cannot see
 * it (hidden, restricted, deleted, or on an instance they do not use)
 */
export interface PlaylistItemWithScene {
  id: number;
  playlistId: number;
  instanceId: string | null;
  sceneId: string;
  position: number;
  addedAt: Date;
  scene: NormalizedScene | null;
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
  isPublic: boolean;
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
  /** How many of the playlist's items the viewer can see */
  _count: { items: number };
  /** The first four items the viewer can see, in position order */
  items: PlaylistPreviewItem[];
}

/**
 * GET /api/playlists
 * Get all playlists for current user
 */
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
 * Without `page` and `per_page`, every item, in position order, with null
 * for the scenes the viewer cannot see. With either, one page of the items
 * the viewer can see: `page` from 1, `per_page` 1..100 (50 when absent).
 */
export interface GetPlaylistQuery extends Record<string, string | undefined> {
  page?: string;
  per_page?: string;
}

export interface GetPlaylistResponse {
  playlist: PlaylistData;
  /** How many of the playlist's items the viewer can see */
  totalItems: number;
  /** The page read, when the request asked for one */
  page?: number;
  perPage?: number;
  isOwner?: boolean;
  accessLevel?: "owner" | "shared";
  sharedViaGroups?: string[];
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
    instanceId: string | null;
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
// REORDER PLAYLIST
// =============================================================================

/**
 * PUT /api/playlists/:id/reorder
 * Reorder playlist items
 */
export interface ReorderPlaylistParams extends Record<string, string> {
  id: string;
}

export interface ReorderPlaylistRequest {
  items: Array<{
    instanceId: string;
    sceneId: string;
    position: number;
  }>;
}

export interface ReorderPlaylistResponse {
  success: true;
  message: string;
}

// =============================================================================
// GET SHARED PLAYLISTS
// =============================================================================

/**
 * GET /api/playlists/shared
 * Get playlists shared with current user
 */
export interface SharedPlaylistData {
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
