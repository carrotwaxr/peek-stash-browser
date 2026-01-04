// server/types/api/playlist.ts
/**
 * Playlist API Types
 *
 * Request and response types for /api/playlists/* endpoints.
 */
import type { Scene } from "stashapp-api";
import type { NormalizedScene } from "../index.js";

// =============================================================================
// COMMON TYPES
// =============================================================================

/**
 * Playlist item with optional scene data (can be raw Scene or NormalizedScene)
 */
export interface PlaylistItemWithScene {
  id: number;
  playlistId: number;
  sceneId: string;
  position: number;
  addedAt: Date;
  scene?: Scene | NormalizedScene | null;
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
 * GET /api/playlists
 * Get all playlists for current user
 */
export interface GetUserPlaylistsResponse {
  playlists: PlaylistData[];
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

export interface GetPlaylistResponse {
  playlist: PlaylistData;
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
  description?: string;
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

export interface AddSceneToPlaylistRequest {
  sceneId: string;
}

export interface AddSceneToPlaylistResponse {
  item: {
    id: number;
    playlistId: number;
    sceneId: string;
    position: number;
    addedAt: Date;
  };
}

// =============================================================================
// REMOVE SCENE FROM PLAYLIST
// =============================================================================

/**
 * DELETE /api/playlists/:id/items/:sceneId
 * Remove scene from playlist
 */
export interface RemoveSceneFromPlaylistParams extends Record<string, string> {
  id: string;
  sceneId: string;
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
    sceneId: string;
    position: number;
  }>;
}

export interface ReorderPlaylistResponse {
  success: true;
  message: string;
}
