import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the service
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
    userGroup: {
      findMany: vi.fn(),
    },
    userGroupMembership: {
      findMany: vi.fn(),
    },
  },
}));

import { resolveUserPermissions, type UserPermissions } from "../../services/PermissionService.js";
import prisma from "../../prisma/singleton.js";

const mockPrisma = vi.mocked(prisma);

describe("PermissionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveUserPermissions", () => {
    it("should return all false when user has no groups and no overrides", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        canShareOverride: null,
        canDownloadFilesOverride: null,
        canDownloadPlaylistsOverride: null,
        groupMemberships: [],
      } as never);

      const result = await resolveUserPermissions(1);

      expect(result).toEqual({
        canShare: false,
        canDownloadFiles: false,
        canDownloadPlaylists: false,
        sources: {
          canShare: "default",
          canDownloadFiles: "default",
          canDownloadPlaylists: "default",
        },
      });
    });

    it("should inherit permissions from single group", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        canShareOverride: null,
        canDownloadFilesOverride: null,
        canDownloadPlaylistsOverride: null,
        groupMemberships: [
          {
            group: {
              id: 1,
              name: "Family",
              canShare: true,
              canDownloadFiles: false,
              canDownloadPlaylists: true,
            },
          },
        ],
      } as never);

      const result = await resolveUserPermissions(1);

      expect(result).toEqual({
        canShare: true,
        canDownloadFiles: false,
        canDownloadPlaylists: true,
        sources: {
          canShare: "Family",
          canDownloadFiles: "default",
          canDownloadPlaylists: "Family",
        },
      });
    });

    it("should use most permissive when user belongs to multiple groups", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        canShareOverride: null,
        canDownloadFilesOverride: null,
        canDownloadPlaylistsOverride: null,
        groupMemberships: [
          {
            group: {
              id: 1,
              name: "Family",
              canShare: true,
              canDownloadFiles: false,
              canDownloadPlaylists: false,
            },
          },
          {
            group: {
              id: 2,
              name: "Friends",
              canShare: false,
              canDownloadFiles: true,
              canDownloadPlaylists: false,
            },
          },
        ],
      } as never);

      const result = await resolveUserPermissions(1);

      expect(result).toEqual({
        canShare: true,
        canDownloadFiles: true,
        canDownloadPlaylists: false,
        sources: {
          canShare: "Family",
          canDownloadFiles: "Friends",
          canDownloadPlaylists: "default",
        },
      });
    });

    it("should let user override take precedence over group permissions", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        canShareOverride: false, // Explicit override to disable
        canDownloadFilesOverride: true, // Explicit override to enable
        canDownloadPlaylistsOverride: null, // Inherit from group
        groupMemberships: [
          {
            group: {
              id: 1,
              name: "Family",
              canShare: true,
              canDownloadFiles: false,
              canDownloadPlaylists: true,
            },
          },
        ],
      } as never);

      const result = await resolveUserPermissions(1);

      expect(result).toEqual({
        canShare: false,
        canDownloadFiles: true,
        canDownloadPlaylists: true,
        sources: {
          canShare: "override",
          canDownloadFiles: "override",
          canDownloadPlaylists: "Family",
        },
      });
    });

    it("should return null for non-existent user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await resolveUserPermissions(999);

      expect(result).toBeNull();
    });
  });
});
