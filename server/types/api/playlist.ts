// server/types/api/playlist.ts
/**
 * Playlist API types that stay on the server. The rest of the playlist
 * contract is in `shared/types/api/playlist.ts` and reaches the controllers
 * through `./index.js`.
 */

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
