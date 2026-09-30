/**
 * Unit Tests for Playlist Controller Operations
 *
 * Tests createPlaylist, updatePlaylist, deletePlaylist, and duplicatePlaylist
 * controller functions. Covers validation, ownership checks, and the
 * access-control-based duplicate flow; and that the item writes (add,
 * remove, reorder) take each scene's instance from the request.
 */
import type { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSceneToPlaylist,
  createPlaylist,
  deletePlaylist,
  duplicatePlaylist,
  getPlaylistShares,
  removeSceneFromPlaylist,
  reorderPlaylist,
  updatePlaylist,
  updatePlaylistShares,
} from "../../controllers/playlist.js";
import prisma from "../../prisma/singleton.js";
import { canUserAccessEntity } from "../../services/EntityAccessService.js";
import { resolveUserPermissions } from "../../services/PermissionService.js";
import {
  getPlaylistAccess,
  getUserGroups,
} from "../../services/PlaylistAccessService.js";
import { authenticated } from "../../utils/routeHelpers.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import {
  type PlaylistShareWithGroup,
  type PlaylistWithItems,
  userPermissions,
} from "../helpers/fixtures.js";
import { objectContaining } from "../helpers/matchers.js";
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

vi.mock("../../services/EntityAccessService.js", () => ({
  canUserAccessEntity: vi.fn(),
}));

// Mock PlaylistQueryService (the playlist reads, not under test here)
vi.mock("../../services/PlaylistQueryService.js", () => ({
  loadPlaylistPreviews: vi.fn(() => Promise.resolve(new Map())),
  loadPlaylistItems: vi.fn(() => Promise.resolve({ items: [], totalItems: 0 })),
}));

// Mock PermissionService
vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(() => Promise.resolve({ canShare: true })),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockGetAccess = vi.mocked(getPlaylistAccess);
const mockGetUserGroups = vi.mocked(getUserGroups);
const mockResolvePermissions = vi.mocked(resolveUserPermissions);
const mockCanAccess = vi.mocked(canUserAccessEntity);

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

      const req = reqFor(createPlaylist, {
        body: { name: "My Playlist" },
        user: USER,
      });
      const res = resFor(createPlaylist);

      await createPlaylist(req, res);

      expect(res._getStatus()).toBe(201);
      expect(res._getBody()).toEqual({ playlist: createdPlaylist });
    });

    it("trims whitespace from name and description", async () => {
      mockPrisma.playlist.create.mockResolvedValue(partialRow({ id: 1 }));

      const req = reqFor(createPlaylist, {
        body: { name: "  My Playlist  ", description: "  A description  " },
        user: USER,
      });
      const res = resFor(createPlaylist);

      await createPlaylist(req, res);

      expect(mockPrisma.playlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            name: "My Playlist",
            description: "A description",
          }),
        })
      );
    });

    it.each([[""], ["   "]])(
      "stores a blank description (%j) as null",
      async (description) => {
        mockPrisma.playlist.create.mockResolvedValue(partialRow({ id: 1 }));

        const req = reqFor(createPlaylist, {
          body: { name: "My Playlist", description },
          user: USER,
        });
        await createPlaylist(req, resFor(createPlaylist));

        expect(mockPrisma.playlist.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: objectContaining({ description: null }),
          })
        );
      }
    );

    it("rejects empty name", async () => {
      const req = reqFor(createPlaylist, { body: { name: "" }, user: USER });
      const res = resFor(createPlaylist);

      await createPlaylist(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({
        error: "Playlist name is required",
      });
    });

    it("rejects whitespace-only name", async () => {
      const req = reqFor(createPlaylist, { body: { name: "   " }, user: USER });
      const res = resFor(createPlaylist);

      await createPlaylist(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({
        error: "Playlist name is required",
      });
    });

    it("rejects missing name", async () => {
      const req = reqFor(createPlaylist, { user: USER });
      const res = resFor(createPlaylist);

      await createPlaylist(req, res);

      expect(res._getStatus()).toBe(400);
    });

    it("returns 401 when user is not authenticated", async () => {
      const req = reqFor(createPlaylist, { body: { name: "Test" } });
      const res = resFor(createPlaylist);

      await authenticated(createPlaylist)(req, res, vi.fn());

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

      const req = reqFor(updatePlaylist, {
        body: { name: "Updated" },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updatePlaylist);

      await updatePlaylist(req, res);

      expect(res._getBody()).toEqual(
        expect.objectContaining({
          playlist: objectContaining({ name: "Updated" }),
        })
      );
    });

    it.each([[""], ["   "], [null]])(
      "clears the description when an update sends %j",
      async (description) => {
        mockPrisma.playlist.findFirst.mockResolvedValue(
          partialRow({ id: 1, userId: 1 })
        );
        mockPrisma.playlist.update.mockResolvedValue(
          partialRow<PlaylistWithItemCount>({ id: 1, _count: { items: 0 } })
        );

        const req = reqFor(updatePlaylist, {
          body: { description },
          params: { id: "1" },
          user: USER,
        });
        await updatePlaylist(req, resFor(updatePlaylist));

        expect(mockPrisma.playlist.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: objectContaining({ description: null }),
          })
        );
      }
    );

    it("returns 404 when user is not owner", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(null);

      const req = reqFor(updatePlaylist, {
        body: { name: "Hijack" },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updatePlaylist);

      await updatePlaylist(req, res);

      expect(res._getStatus()).toBe(404);
      expect(mockPrisma.playlist.update).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid playlist ID", async () => {
      const req = reqFor(updatePlaylist, {
        body: { name: "Test" },
        params: { id: "abc" },
        user: USER,
      });
      const res = resFor(updatePlaylist);

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

      const req = reqFor(deletePlaylist, { params: { id: "1" }, user: USER });
      const res = resFor(deletePlaylist);

      await deletePlaylist(req, res);

      expect(mockPrisma.playlist.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(res._getBody()).toEqual({
        success: true,
        message: "Playlist deleted",
      });
    });

    it("a database failure reaches the error handler", async () => {
      mockPrisma.playlist.findFirst.mockRejectedValue(new Error("DB down"));

      const req = reqFor(deletePlaylist, { params: { id: "1" }, user: USER });
      const res = resFor(deletePlaylist);

      await expect(deletePlaylist(req, res)).rejects.toThrow("DB down");

      expect(res.json).not.toHaveBeenCalled();
    });

    it("returns 404 when user is not owner", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(null);

      const req = reqFor(deletePlaylist, { params: { id: "1" }, user: USER });
      const res = resFor(deletePlaylist);

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

      const req = reqFor(duplicatePlaylist, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(duplicatePlaylist);

      await duplicatePlaylist(req, res);

      expect(res._getStatus()).toBe(201);
      expect(mockPrisma.playlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
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

      const req = reqFor(duplicatePlaylist, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(duplicatePlaylist);

      await duplicatePlaylist(req, res);

      expect(res._getStatus()).toBe(201);
      // Duplicate is owned by the duplicating user
      expect(mockPrisma.playlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            userId: USER.id,
          }),
        })
      );
    });

    it("returns 404 when user has no access", async () => {
      mockGetAccess.mockResolvedValue({ level: "none" });

      const req = reqFor(duplicatePlaylist, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(duplicatePlaylist);

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

      const req = reqFor(getPlaylistShares, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(getPlaylistShares);

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

      const req = reqFor(getPlaylistShares, {
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(getPlaylistShares);

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

      const req = reqFor(updatePlaylistShares, {
        body: { groupIds: [10] },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updatePlaylistShares);

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

      const req = reqFor(updatePlaylistShares, {
        body: { groupIds: [10] },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updatePlaylistShares);

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

      const req = reqFor(updatePlaylistShares, {
        body: { groupIds: [10, 99] },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updatePlaylistShares);

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

      const req = reqFor(updatePlaylistShares, {
        body: { groupIds: [] },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updatePlaylistShares);

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

      const req = reqFor(updatePlaylistShares, {
        body: malformed({ groupIds: "not-an-array" }),
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updatePlaylistShares);

      await updatePlaylistShares(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toEqual({
        error: "groupIds must be an array",
      });
    });
  });

  describe("item writes name each scene's instance", () => {
    it("add without an instance answers 400 and asks nothing", async () => {
      const req = reqFor(addSceneToPlaylist, {
        params: { id: "1" },
        body: malformed({ sceneId: "42" }),
        user: USER,
      });
      const res = resFor(addSceneToPlaylist);

      await addSceneToPlaylist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getErrorBody().error).toBe("instanceId is required");
      expect(mockGetAccess).not.toHaveBeenCalled();
      expect(mockPrisma.playlistItem.create).not.toHaveBeenCalled();
    });

    it("add of a scene the user cannot see answers 404", async () => {
      mockGetAccess.mockResolvedValue({ level: "owner" });
      mockPrisma.playlist.findUnique.mockResolvedValue(
        partialRow<PlaylistWithItems>({ id: 1, userId: USER.id, items: [] })
      );
      mockCanAccess.mockResolvedValue(false);

      const req = reqFor(addSceneToPlaylist, {
        params: { id: "1" },
        body: { sceneId: "42", instanceId: "inst-b" },
        user: USER,
      });
      const res = resFor(addSceneToPlaylist);

      await addSceneToPlaylist(req, res);

      expect(mockCanAccess).toHaveBeenCalledWith(
        USER.id,
        "scene",
        "42",
        "inst-b"
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockPrisma.playlistItem.create).not.toHaveBeenCalled();
    });

    it("add of a scene already there answers 409", async () => {
      mockGetAccess.mockResolvedValue({ level: "owner" });
      mockPrisma.playlist.findUnique.mockResolvedValue(
        partialRow<PlaylistWithItems>({ id: 1, userId: USER.id, items: [] })
      );
      mockCanAccess.mockResolvedValue(true);
      mockPrisma.playlistItem.findUnique.mockResolvedValue(
        partialRow({
          id: 9,
          playlistId: 1,
          sceneId: "42",
          instanceId: "inst-b",
        })
      );

      const req = reqFor(addSceneToPlaylist, {
        params: { id: "1" },
        body: { sceneId: "42", instanceId: "inst-b" },
        user: USER,
      });
      const res = resFor(addSceneToPlaylist);

      await addSceneToPlaylist(req, res);

      expect(mockPrisma.playlistItem.findUnique).toHaveBeenCalledWith({
        where: {
          playlistId_instanceId_sceneId: {
            playlistId: 1,
            instanceId: "inst-b",
            sceneId: "42",
          },
        },
      });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(mockPrisma.playlistItem.create).not.toHaveBeenCalled();
    });

    it("remove with a repeated instance answers 400", async () => {
      const req = reqFor(removeSceneFromPlaylist, {
        params: { id: "1", sceneId: "42" },
        query: { instanceId: ["inst-a", "inst-b"] },
        user: USER,
      });
      const res = resFor(removeSceneFromPlaylist);

      await removeSceneFromPlaylist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPrisma.playlistItem.deleteMany).not.toHaveBeenCalled();
    });

    it("remove of an item that is not there answers 404", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({ id: 1, userId: USER.id, name: "Mine" })
      );
      mockPrisma.playlistItem.deleteMany.mockResolvedValue({ count: 0 });

      const req = reqFor(removeSceneFromPlaylist, {
        params: { id: "1", sceneId: "42" },
        query: { instanceId: "inst-b" },
        user: USER,
      });
      const res = resFor(removeSceneFromPlaylist);

      await removeSceneFromPlaylist(req, res);

      expect(mockPrisma.playlistItem.deleteMany).toHaveBeenCalledWith({
        where: { playlistId: 1, instanceId: "inst-b", sceneId: "42" },
      });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it.each([
      ["no instance", { sceneId: "42", position: 1 }, "items[1].instanceId"],
      [
        "no position",
        { sceneId: "42", instanceId: "inst-b" },
        "items[1].position",
      ],
      [
        "a negative position",
        { sceneId: "42", instanceId: "inst-b", position: -1 },
        "items[1].position",
      ],
      ["not an object", "42", "items[1]"],
    ])(
      "reorder with an item of %s answers 400 naming the index",
      async (_what, second, named) => {
        const req = reqFor(reorderPlaylist, {
          params: { id: "1" },
          body: malformed({
            items: [
              { sceneId: "42", instanceId: "inst-a", position: 0 },
              second,
            ],
          }),
          user: USER,
        });
        const res = resFor(reorderPlaylist);

        await reorderPlaylist(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res._getErrorBody().error).toContain(named);
        expect(mockPrisma.playlist.findFirst).not.toHaveBeenCalled();
      }
    );

    it("reorder updates each item on its own instance", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({ id: 1, userId: USER.id, name: "Mine" })
      );
      mockPrisma.playlistItem.findMany.mockResolvedValue([
        partialRow({ sceneId: "42", instanceId: "inst-a" }),
        partialRow({ sceneId: "42", instanceId: "inst-b" }),
      ]);
      mockPrisma.playlistItem.update.mockResolvedValue(partialRow({}));

      const req = reqFor(reorderPlaylist, {
        params: { id: "1" },
        body: {
          items: [
            { sceneId: "42", instanceId: "inst-b", position: 0 },
            { sceneId: "42", instanceId: "inst-a", position: 1 },
          ],
        },
        user: USER,
      });
      const res = resFor(reorderPlaylist);

      await reorderPlaylist(req, res);

      expect(res._getOkBody()).toEqual(objectContaining({ success: true }));
      expect(mockPrisma.playlistItem.update).toHaveBeenNthCalledWith(1, {
        where: {
          playlistId_instanceId_sceneId: {
            playlistId: 1,
            instanceId: "inst-b",
            sceneId: "42",
          },
        },
        data: { position: 0 },
      });
      expect(mockPrisma.playlistItem.update).toHaveBeenNthCalledWith(2, {
        where: {
          playlistId_instanceId_sceneId: {
            playlistId: 1,
            instanceId: "inst-a",
            sceneId: "42",
          },
        },
        data: { position: 1 },
      });
    });

    it("reorder naming an item not in the playlist answers 400 and updates nothing", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({ id: 1, userId: USER.id, name: "Mine" })
      );
      mockPrisma.playlistItem.findMany.mockResolvedValue([
        partialRow({ sceneId: "42", instanceId: "inst-a" }),
      ]);

      const req = reqFor(reorderPlaylist, {
        params: { id: "1" },
        body: {
          items: [
            { sceneId: "42", instanceId: "inst-a", position: 0 },
            { sceneId: "42", instanceId: "inst-b", position: 1 },
          ],
        },
        user: USER,
      });
      const res = resFor(reorderPlaylist);

      await reorderPlaylist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getErrorBody().error).toBe(
        "items[1] is not in this playlist"
      );
      expect(mockPrisma.playlistItem.update).not.toHaveBeenCalled();
    });
  });
});
