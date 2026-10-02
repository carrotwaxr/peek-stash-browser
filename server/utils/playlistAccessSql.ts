/**
 * The playlist access rule as SQL (invariant 6): the check is in the query, so
 * another user's playlists never reach a filter, a count or a picker.
 */
import type { SqlFragment } from "./sqlClauses.js";

/**
 * The playlists the viewer may read, as a condition on `<alias>` (a Playlist
 * row): their own, or shared with a group they belong to while the owner may
 * share (canShareOverride, else any group granting canShare), the rule
 * getPlaylistAccess applies one playlist at a time. An admin has no bypass.
 *
 * Params: the viewer's id, twice.
 */
export function viewablePlaylistSql(
  alias: string,
  userId: number
): SqlFragment {
  return {
    sql: `(${alias}.userId = ? OR (EXISTS (SELECT 1 FROM PlaylistShare ps JOIN UserGroupMembership m ON m.groupId = ps.groupId WHERE ps.playlistId = ${alias}.id AND m.userId = ?) AND COALESCE((SELECT u.canShareOverride FROM User u WHERE u.id = ${alias}.userId), EXISTS (SELECT 1 FROM UserGroupMembership om JOIN UserGroup g ON g.id = om.groupId WHERE om.userId = ${alias}.userId AND g.canShare = 1)) = 1))`,
    params: [userId, userId],
  };
}

/** The viewer's own playlists only */
export function ownPlaylistSql(alias: string, userId: number): SqlFragment {
  return { sql: `${alias}.userId = ?`, params: [userId] };
}
