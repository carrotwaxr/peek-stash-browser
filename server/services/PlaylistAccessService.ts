import prisma from "../prisma/singleton.js";
import { resolveUserPermissions } from "./PermissionService.js";

export type PlaylistAccessLevel =
  | { level: "owner" }
  | { level: "shared"; groups: string[] }
  | { level: "none" };

/**
 * Determines a user's access level to a playlist.
 * Returns "owner" if user owns it, "shared" with group names if shared with them, "none" otherwise.
 * A share counts only while its owner may share (Can Share, from a group or
 * an override; an admin has no bypass). The shares stay stored, so the
 * permission coming back brings them back.
 *
 * `viewablePlaylistSql` (utils/playlistAccessSql.ts) is this rule as one SQL
 * condition: the two must change together, and
 * integration/services/PlaylistAccessSql.integration.test.ts holds them equal.
 */
export async function getPlaylistAccess(
  playlistId: number,
  userId: number
): Promise<PlaylistAccessLevel> {
  // First check if user owns the playlist
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { userId: true },
  });

  if (!playlist) {
    return { level: "none" };
  }

  if (playlist.userId === userId) {
    return { level: "owner" };
  }

  // Check if playlist is shared with any group the user belongs to
  const sharedGroups = await prisma.playlistShare.findMany({
    where: {
      playlistId,
      group: {
        members: {
          some: { userId },
        },
      },
    },
    select: {
      group: {
        select: { name: true },
      },
    },
  });

  if (sharedGroups.length > 0) {
    if (!(await resolveUserPermissions(playlist.userId))?.canShare) {
      return { level: "none" };
    }
    return {
      level: "shared",
      groups: sharedGroups.map((s) => s.group.name),
    };
  }

  return { level: "none" };
}

/**
 * Gets the groups a user belongs to (for the share modal).
 */
export async function getUserGroups(userId: number) {
  const memberships = await prisma.userGroupMembership.findMany({
    where: { userId },
    select: {
      group: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return memberships.map((m) => m.group);
}
