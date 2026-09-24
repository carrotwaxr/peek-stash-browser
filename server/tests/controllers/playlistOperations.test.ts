/**
 * Unit Tests for Playlist Controller Operations
 *
 * Tests createPlaylist, updatePlaylist, deletePlaylist, and duplicatePlaylist
 * controller functions. Covers validation, ownership checks, and the
 * access-control-based duplicate flow.
 */
import type { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlaylist,
  deletePlaylist,
  duplicatePlaylist,
  getPlaylistShares,
  updatePlaylist,
  updatePlaylistShares,
} from "../../controllers/playlist.js";
import prisma from "../../prisma/singleton.js";
import { resolveUserPermissions } from "../../services/PermissionService.js";
import {
  getPlaylistAccess,
  getUserGroups,
} from "../../services/PlaylistAccessService.js";
import { mockReq, mockRes } from "../helpers/controllerTestUtils.js";
import {
  type PlaylistShareWithGroup,
  type PlaylistWithItems,
  userPermissions,
} from "../helpers/fixtures.js";
import { partialRow } from "../helpers/prismaMock.js";

type PlaylistWithItemCount = Prisma.PlaylistGetPayload<{
  include: { _count: { select: { items: true } } };
}>;

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock PlaylistAccessService
vi.mock("../../services/PlaylistAccessService.js", () => ({
  getPlaylistAccess: vi.fn(),
  getUserGroups: vi.fn(),
}));

// Mock entityInstanceId
vi.mock("../../utils/entityInstanceId.js", () => ({
  getEntityInstanceId: vi.fn(async () => "instance-1"),
  getEntityInstanceIds: vi.fn(async () => new Map()),
}));

// Mock StashEntityService
vi.mock("../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getScenesByIdsWithRelations: vi.fn(async () => []),
  },
}));

// Mock EntityExclusionHelper
vi.mock("../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    filterExcluded: vi.fn(async (scenes: unknown[]) => scenes),
  },
}));

// Mock PermissionService
vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(async () => ({ canShare: true })),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockGetAccess = vi.mocked(getPlaylistAccess);
const mockGetUserGroups = vi.mocked(getUserGroups);
const mockResolvePermissions = vi.mocked(resolveUserPermissions);

const USER = { id: 1, username: "testuser", role: "USER" };

describe("Playlist Controller Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("createPlaylist", () => {
    it("creates playlist with valid name", async () => {
      const createdPlaylist = partialRow<PlaylistWithItemCount>({
        id: 1,
        name: "My Playlist",
        description: null,
        userId: 1,
        isPublic: false,
        _count: { items: 0 },
      });
      mockPrisma.playlist.create.mockResolvedValue(createdPlaylist);

      const req = mockReq({ name: "My Playlist" }, {}, USER);
      const res = mockRes();

      await createPlaylist(req, res);

      expect(res._getStatus()).toBe(201);
      expect(res._getBody()).toEqual({ playlist: createdPlaylist });
    });

    it("trims whitespace from name and description", async () => {
      mockPrisma.playlist.create.mockResolvedValue(partialRow({ id: 1 }));

      const req = mockReq(
        { name: "  My Playlist  ", description: "  A description  " },
        {},
        USER
      );
      const res = mockRes();

      await createPlaylist(req, res);

      expect(mockPrisma.playlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "My Playlist",
            description: "A description",
          }),
        })
      );
    });

    it("rejects empty name", async () => {
      const req = mockReq({ name: "" }, {}, USER);
      const res = mockRes();

      await createPlaylist(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({
        error: "Playlist name is required",
      });
    });

    it("rejects whitespace-only name", async () => {
      const req = mockReq({ name: "   " }, {}, USER);
      const res = mockRes();

      await createPlaylist(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({
        error: "Playlist name is required",
      });
    });

    it("rejects missing name", async () => {
      const req = mockReq({}, {}, USER);
      const res = mockRes();

      await createPlaylist(req, res);

      expect(res._getStatus()).toBe(400);
    });

    it("returns 401 when user is not authenticated", async () => {
      const req = mockReq({ name: "Test" });
      const res = mockRes();

      await createPlaylist(req, res);

      expect(res._getStatus()).toBe(401);
    });
  });

  describe("updatePlaylist", () => {
    it("updates playlist name when user is owner", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
        })
      );
      mockPrisma.playlist.update.mockResolvedValue(
        partialRow<PlaylistWithItemCount>({
          id: 1,
          name: "Updated",
          _count: { items: 3 },
        })
      );

      const req = mockReq({ name: "Updated" }, { id: "1" }, USER);
      const res = mockRes();

      await updatePlaylist(req, res);

      expect(res._getBody()).toEqual(
        expect.objectContaining({
          playlist: expect.objectContaining({ name: "Updated" }),
        })
      );
    });

    it("returns 404 when user is not owner", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(null);

      const req = mockReq({ name: "Hijack" }, { id: "1" }, USER);
      const res = mockRes();

      await updatePlaylist(req, res);

      expect(res._getStatus()).toBe(404);
      expect(mockPrisma.playlist.update).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid playlist ID", async () => {
      const req = mockReq({ name: "Test" }, { id: "abc" }, USER);
      const res = mockRes();

      await updatePlaylist(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({
        error: "Invalid playlist ID",
      });
    });
  });

  describe("deletePlaylist", () => {
    it("deletes playlist when user is owner", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
        })
      );
      mockPrisma.playlist.delete.mockResolvedValue(partialRow({}));

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();

      await deletePlaylist(req, res);

      expect(mockPrisma.playlist.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(res._getBody()).toEqual({
        success: true,
        message: "Playlist deleted",
      });
    });

    it("returns 404 when user is not owner", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(null);

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();

      await deletePlaylist(req, res);

      expect(res._getStatus()).toBe(404);
      expect(mockPrisma.playlist.delete).not.toHaveBeenCalled();
    });
  });

  describe("duplicatePlaylist", () => {
    it("duplicates playlist when user has owner access", async () => {
      mockGetAccess.mockResolvedValue({ level: "owner" });
      mockPrisma.playlist.findUnique.mockResolvedValue(
        partialRow<PlaylistWithItems>({
          id: 1,
          name: "Original",
          description: "Desc",
          shuffle: false,
          repeat: "none",
          items: [
            partialRow({ sceneId: "s1", instanceId: "i1", position: 0 }),
            partialRow({ sceneId: "s2", instanceId: "i1", position: 1 }),
          ],
        })
      );
      mockPrisma.playlist.create.mockResolvedValue(
        partialRow<PlaylistWithItemCount>({
          id: 2,
          name: "Original (Copy)",
          _count: { items: 2 },
        })
      );

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();

      await duplicatePlaylist(req, res);

      expect(res._getStatus()).toBe(201);
      expect(mockPrisma.playlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Original (Copy)",
            userId: USER.id,
            isPublic: false,
          }),
        })
      );
    });

    it("duplicates playlist when user has shared access", async () => {
      mockGetAccess.mockResolvedValue({ level: "shared", groups: ["Family"] });
      mockPrisma.playlist.findUnique.mockResolvedValue(
        partialRow<PlaylistWithItems>({
          id: 1,
          name: "Shared Playlist",
          description: null,
          shuffle: true,
          repeat: "all",
          items: [],
        })
      );
      mockPrisma.playlist.create.mockResolvedValue(
        partialRow<PlaylistWithItemCount>({
          id: 3,
          name: "Shared Playlist (Copy)",
          _count: { items: 0 },
        })
      );

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();

      await duplicatePlaylist(req, res);

      expect(res._getStatus()).toBe(201);
      // Duplicate is owned by the duplicating user
      expect(mockPrisma.playlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER.id,
          }),
        })
      );
    });

    it("returns 404 when user has no access", async () => {
      mockGetAccess.mockResolvedValue({ level: "none" });

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();

      await duplicatePlaylist(req, res);

      expect(res._getStatus()).toBe(404);
      expect(mockPrisma.playlist.create).not.toHaveBeenCalled();
    });
  });

  describe("getPlaylistShares", () => {
    it("returns shares for owned playlist", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
        })
      );
      mockPrisma.playlistShare.findMany.mockResolvedValue([
        partialRow<PlaylistShareWithGroup>({
          sharedAt: new Date("2025-06-01"),
          group: partialRow({ id: 10, name: "Family" }),
        }),
      ]);

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();

      await getPlaylistShares(req, res);

      expect(res._getBody()).toEqual({
        shares: [
          {
            groupId: 10,
            groupName: "Family",
            sharedAt: "2025-06-01T00:00:00.000Z",
          },
        ],
      });
    });

    it("returns 404 for non-owned playlist", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(null);

      const req = mockReq({}, { id: "1" }, USER);
      const res = mockRes();

      await getPlaylistShares(req, res);

      expect(res._getStatus()).toBe(404);
    });
  });

  describe("updatePlaylistShares", () => {
    it("replaces shares with new group IDs", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
        })
      );
      mockResolvePermissions.mockResolvedValue(
        userPermissions({ canShare: true })
      );
      mockGetUserGroups.mockResolvedValue([
        { id: 10, name: "Family" },
        { id: 20, name: "Friends" },
      ]);
      mockPrisma.$transaction.mockResolvedValue([]);
      mockPrisma.playlistShare.findMany.mockResolvedValue([
        partialRow<PlaylistShareWithGroup>({
          sharedAt: new Date("2025-06-01"),
          group: partialRow({ id: 10, name: "Family" }),
        }),
      ]);

      const req = mockReq({ groupIds: [10] }, { id: "1" }, USER);
      const res = mockRes();

      await updatePlaylistShares(req, res);

      expect(res._getBody()).toEqual({
        shares: [expect.objectContaining({ groupId: 10, groupName: "Family" })],
      });
    });

    it("returns 403 when user lacks canShare permission", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
        })
      );
      mockResolvePermissions.mockResolvedValue(
        userPermissions({ canShare: false })
      );

      const req = mockReq({ groupIds: [10] }, { id: "1" }, USER);
      const res = mockRes();

      await updatePlaylistShares(req, res);

      expect(res._getStatus()).toBe(403);
      expect(res._getBody()).toEqual({
        error: "You don't have permission to share playlists",
      });
    });

    it("returns 403 when sharing with group user does not belong to", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
        })
      );
      mockResolvePermissions.mockResolvedValue(
        userPermissions({ canShare: true })
      );
      mockGetUserGroups.mockResolvedValue([{ id: 10, name: "Family" }]);

      const req = mockReq(
        { groupIds: [10, 99] }, // 99 is not a user's group
        { id: "1" },
        USER
      );
      const res = mockRes();

      await updatePlaylistShares(req, res);

      expect(res._getStatus()).toBe(403);
      expect(res._getBody()).toEqual({
        error: "You can only share with groups you belong to",
      });
    });

    it("allows clearing all shares without permission check", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
        })
      );
      mockPrisma.$transaction.mockResolvedValue([]);
      mockPrisma.playlistShare.findMany.mockResolvedValue([]);

      const req = mockReq(
        { groupIds: [] }, // Empty = clear all
        { id: "1" },
        USER
      );
      const res = mockRes();

      await updatePlaylistShares(req, res);

      // Should NOT check permissions when clearing shares
      expect(mockResolvePermissions).not.toHaveBeenCalled();
      expect(res._getBody()).toEqual({ shares: [] });
    });

    it("returns 400 when groupIds is not an array", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
        })
      );

      const req = mockReq({ groupIds: "not-an-array" }, { id: "1" }, USER);
      const res = mockRes();

      await updatePlaylistShares(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({
        error: "groupIds must be an array",
      });
    });
  });
});
