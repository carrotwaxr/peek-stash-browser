/**
 * Merge Recovery (admin): deleted scenes that users' data still points at.
 *
 * A scene's id means nothing without its Stash instance, so each orphan
 * names both.
 */

/**
 * A soft-deleted scene that some user's play history, rating or playlist
 * entry still references.
 */
export interface OrphanedScene {
  id: string;
  instanceId: string;
  instanceName: string;
  title: string | null;
  phash: string | null;
  /** ISO 8601 */
  deletedAt: string;
  /** Watch histories, ratings and playlist entries on the scene */
  userActivityCount: number;
  totalPlayCount: number;
  /** Playlist entries (across all users' playlists) that hold the scene */
  playlistEntryCount: number;
  hasRatings: boolean;
  hasFavorites: boolean;
}

/** GET /api/admin/orphaned-scenes */
export interface OrphanedScenesResponse {
  scenes: OrphanedScene[];
  totalCount: number;
}

/** POST /api/admin/orphaned-scenes/:ref/discard */
export interface DiscardOrphanResponse {
  ok: true;
  watchHistoryDeleted: number;
  ratingsDeleted: number;
  playlistEntriesDeleted: number;
}
