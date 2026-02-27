/**
 * Unit Tests for PlaylistAccessService
 *
 * Tests the access control layer that determines whether a user has
 * owner, shared, or no access to a given playlist.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    playlist: { findUnique: vi.fn() },
    playlistShare: { findMany: vi.fn() },
    userGroupMembership: { findMany: vi.fn() },
  },
}));

import prisma from "../../prisma/singleton.js";
import {
  getPlaylistAccess,
  getUserGroups,
} from "../../services/PlaylistAccessService.js";

const mockPrisma = vi.mocked(prisma);

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
      mockPrisma.playlist.findUnique.mockResolvedValue({
        userId: 1,
      } as any);

      const result = await getPlaylistAccess(1, 1);
      expect(result.level).toBe("owner");
    });

    it("returns 'shared' with group names when shared via group", async () => {
      mockPrisma.playlist.findUnique.mockResolvedValue({
        userId: 2, // Different user
      } as any);
      mockPrisma.playlistShare.findMany.mockResolvedValue([
        { group: { name: "Family" } },
        { group: { name: "Friends" } },
      ] as any);

      const result = await getPlaylistAccess(1, 1);
      expect(result.level).toBe("shared");
      if (result.level === "shared") {
        expect(result.groups).toEqual(["Family", "Friends"]);
      }
    });

    it("returns 'none' when user does not own and has no shared access", async () => {
      mockPrisma.playlist.findUnique.mockResolvedValue({
        userId: 2, // Different user
      } as any);
      mockPrisma.playlistShare.findMany.mockResolvedValue([]);

      const result = await getPlaylistAccess(1, 1);
      expect(result.level).toBe("none");
    });

    it("does not check shares when user is owner", async () => {
      mockPrisma.playlist.findUnique.mockResolvedValue({
        userId: 5,
      } as any);

      const result = await getPlaylistAccess(1, 5);
      expect(result.level).toBe("owner");
      // Should not query playlistShare since user is owner
      expect(mockPrisma.playlistShare.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getUserGroups", () => {
    it("returns groups the user belongs to", async () => {
      mockPrisma.userGroupMembership.findMany.mockResolvedValue([
        { group: { id: 1, name: "Family" } },
        { group: { id: 2, name: "Friends" } },
      ] as any);

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
