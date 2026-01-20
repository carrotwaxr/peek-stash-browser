import prisma from "../prisma/singleton.js";

export interface UserPermissions {
  canShare: boolean;
  canDownloadFiles: boolean;
  canDownloadPlaylists: boolean;
  sources: {
    canShare: string; // "default", "override", or group name
    canDownloadFiles: string;
    canDownloadPlaylists: string;
  };
}

type PermissionKey = "canShare" | "canDownloadFiles" | "canDownloadPlaylists";
type OverrideKey =
  | "canShareOverride"
  | "canDownloadFilesOverride"
  | "canDownloadPlaylistsOverride";

const PERMISSION_KEYS: { permission: PermissionKey; override: OverrideKey }[] = [
  { permission: "canShare", override: "canShareOverride" },
  { permission: "canDownloadFiles", override: "canDownloadFilesOverride" },
  { permission: "canDownloadPlaylists", override: "canDownloadPlaylistsOverride" },
];

export async function resolveUserPermissions(
  userId: number
): Promise<UserPermissions | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      canShareOverride: true,
      canDownloadFilesOverride: true,
      canDownloadPlaylistsOverride: true,
      groupMemberships: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
              canShare: true,
              canDownloadFiles: true,
              canDownloadPlaylists: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const result: UserPermissions = {
    canShare: false,
    canDownloadFiles: false,
    canDownloadPlaylists: false,
    sources: {
      canShare: "default",
      canDownloadFiles: "default",
      canDownloadPlaylists: "default",
    },
  };

  const groups = user.groupMemberships.map((m) => m.group);

  for (const { permission, override } of PERMISSION_KEYS) {
    const overrideValue = user[override];

    // User override takes precedence
    if (overrideValue !== null) {
      result[permission] = overrideValue;
      result.sources[permission] = "override";
      continue;
    }

    // Find first group that grants permission (most permissive wins)
    const grantingGroup = groups.find((g) => g[permission] === true);
    if (grantingGroup) {
      result[permission] = true;
      result.sources[permission] = grantingGroup.name;
    }
    // Otherwise stays false with "default" source
  }

  return result;
}
