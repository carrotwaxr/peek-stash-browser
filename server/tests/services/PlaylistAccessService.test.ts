/**
 * Unit Tests for PlaylistAccessService
 *
 * Tests the access control layer that determines whether a user has
 * owner, shared, or no access to a given playlist.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  getPlaylistAccess,
  getUserGroups,
} from "../../services/PlaylistAccessService.js";
import {
  type MembershipWithGroup,
  type PlaylistShareWithGroup,
} from "../helpers/fixtures.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const mockPrisma = vi.mocked(prisma, true);

describe("PlaylistAccessService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPlaylistAccess", () => {
    it("returns 'none' when playlist does not exist", async () => {
      mockPrisma.playlist.findUnique.mockResolvedValue(null);

      const result = await getPlaylistAccess(999, 1);
      expect(result.level).toBe("none");
    });

    it("returns 'owner' when user owns the playlist", async () => {
      mockPrisma.playlist.findUnique.mockResolvedValue(
        partialRow({
          userId: 1,
        })
      );

      const result = await getPlaylistAccess(1, 1);
      expect(result.level).toBe("owner");
    });

    it("returns 'shared' with group names when shared via group", async () => {
      mockPrisma.playlist.findUnique.mockResolvedValue(
        partialRow({
          userId: 2, // Different user
        })
      );
      mockPrisma.playlistShare.findMany.mockResolvedValue([
        partialRow<PlaylistShareWithGroup>({
          group: partialRow({ name: "Family" }),
        }),
        partialRow<PlaylistShareWithGroup>({
          group: partialRow({ name: "Friends" }),
        }),
      ]);

      const result = await getPlaylistAccess(1, 1);
      expect(result).toEqual({
        level: "shared",
        groups: ["Family", "Friends"],
      });
    });

    it("returns 'none' when user does not own and has no shared access", async () => {
      mockPrisma.playlist.findUnique.mockResolvedValue(
        partialRow({
          userId: 2, // Different user
        })
      );
      mockPrisma.playlistShare.findMany.mockResolvedValue([]);

      const result = await getPlaylistAccess(1, 1);
      expect(result.level).toBe("none");
    });

    it("does not check shares when user is owner", async () => {
      mockPrisma.playlist.findUnique.mockResolvedValue(
        partialRow({
          userId: 5,
        })
      );

      const result = await getPlaylistAccess(1, 5);
      expect(result.level).toBe("owner");
      // Should not query playlistShare since user is owner
      expect(mockPrisma.playlistShare.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getUserGroups", () => {
    it("returns groups the user belongs to", async () => {
      mockPrisma.userGroupMembership.findMany.mockResolvedValue([
        partialRow<MembershipWithGroup>({
          group: partialRow({ id: 1, name: "Family" }),
        }),
        partialRow<MembershipWithGroup>({
          group: partialRow({ id: 2, name: "Friends" }),
        }),
      ]);

      const result = await getUserGroups(1);
      expect(result).toEqual([
        { id: 1, name: "Family" },
        { id: 2, name: "Friends" },
      ]);
    });

    it("returns empty array when user has no groups", async () => {
      mockPrisma.userGroupMembership.findMany.mockResolvedValue([]);

      const result = await getUserGroups(1);
      expect(result).toEqual([]);
    });
  });
});
