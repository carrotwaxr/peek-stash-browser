/**
 * Unit Tests for Playlist Controller Operations
 *
 * Tests createPlaylist, updatePlaylist, deletePlaylist, and duplicatePlaylist
 * controller functions. Covers validation, ownership checks, and the
 * access-control-based duplicate flow; and that the item writes (add,
 * remove) take each scene's instance from the request; a move and a bulk
 * remove name items by item id.
 */
import { PER_PAGE_MAX } from "@peek/shared-types/filters/index.js";
import type { Playlist, PlaylistItem, Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSceneToPlaylist,
  addScenesToPlaylist,
  createPlaylist,
  deletePlaylist,
  duplicatePlaylist,
  getPlaylistShares,
  movePlaylistItem,
  removePlaylistItems,
  removeSceneFromPlaylist,
  updatePlaylist,
  updatePlaylistShares,
} from "../../controllers/playlist.js";
import prisma from "../../prisma/singleton.js";
import { resolveUserPermissions } from "../../services/PermissionService.js";
import {
  getPlaylistAccess,
  getUserGroups,
} from "../../services/PlaylistAccessService.js";
import {
  appendItems,
  duplicateVisibleItems,
  loadPlaylistPreviews,
  moveItem,
} from "../../services/PlaylistQueryService.js";
import type * as dbWriteModule from "../../utils/dbWrite.js";
import { authenticated } from "../../utils/routeHelpers.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import {
  type PlaylistShareWithGroup,
  userPermissions,
} from "../helpers/fixtures.js";
import { objectContaining } from "../helpers/matchers.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

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

// Mock PlaylistQueryService (the playlist reads, not under test here)
vi.mock("../../services/PlaylistQueryService.js", () => ({
  loadPlaylistPreviews: vi.fn(() => Promise.resolve(new Map())),
  loadPlaylistItems: vi.fn(() => Promise.resolve({ items: [], totalItems: 0 })),
  duplicateVisibleItems: vi.fn(),
  appendItems: vi.fn(),
  moveItem: vi.fn(),
}));

// The writer queue runs for real; each unit's label is on `openUnits` while
// its callback runs, so a test sees which unit a Prisma call ran inside
const openUnits = vi.hoisted((): string[] => []);
vi.mock("../../utils/dbWrite.js", async (importOriginal) => {
  const actual = await importOriginal<typeof dbWriteModule>();
  const inUnit = async <T>(label: string, run: () => Promise<T>) => {
    openUnits.push(label);
    try {
      return await run();
    } finally {
      openUnits.pop();
    }
  };
  return {
    ...actual,
    dbWrite: vi.fn(<T>(label: string, fn: () => Promise<T>) =>
      actual.dbWrite(label, () => inUnit(label, fn))
    ),
    dbWriteTransaction: vi.fn(
      <T>(
        label: string,
        fn: (tx: Prisma.TransactionClient) => Promise<T>
      ): Promise<T> =>
        actual.dbWriteTransaction(label, (tx) => inUnit(label, () => fn(tx)))
    ),
  };
});

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
const mockAppendItems = vi.mocked(appendItems);
const mockPreviews = vi.mocked(loadPlaylistPreviews);
const mockDuplicateItems = vi.mocked(duplicateVisibleItems);
const mockMoveItem = vi.mocked(moveItem);

const USER = { id: 1, username: "testuser", role: "USER" };
const ALLOWED = ["inst-a"];

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
        allowedInstanceIds: ALLOWED,
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
          allowedInstanceIds: ALLOWED,
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
        allowedInstanceIds: ALLOWED,
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
        allowedInstanceIds: ALLOWED,
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
    const COPY_SQL = "INSERT INTO PlaylistItem SELECT ?";

    /** The copy's creation and the item statement run on this fake id */
    function stubCopy(copyId: number, name: string, added: number) {
      mockDuplicateItems.mockReturnValue({
        sql: COPY_SQL,
        paramsFor: (newPlaylistId) => [newPlaylistId, "bound"],
      });
      mockPrisma.playlist.create.mockResolvedValue(
        partialRow({ id: copyId, name, userId: USER.id })
      );
      mockPrisma.$executeRawUnsafe.mockResolvedValue(added);
    }

    it("duplicates playlist when user has owner access", async () => {
      mockGetAccess.mockResolvedValue({ level: "owner" });
      mockPrisma.playlist.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          name: "Original",
          description: "Desc",
          shuffle: false,
          repeat: "none",
        })
      );
      stubCopy(2, "Original (Copy)", 2);

      const req = reqFor(duplicatePlaylist, {
        params: { id: "1" },
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(duplicatePlaylist);

      await duplicatePlaylist(req, res);

      expect(res._getStatus()).toBe(201);
      expect(mockDuplicateItems).toHaveBeenCalledWith(USER.id, ALLOWED, 1);
      expect(mockPrisma.playlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: "Original (Copy)",
            description: "Desc",
            userId: USER.id,
            shuffle: false,
            repeat: "none",
          },
        })
      );
      // The items are copied by the statement, with the new playlist's id
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        COPY_SQL,
        2,
        "bound"
      );
      // The answer counts what was copied
      expect(res._getBody()).toEqual({
        playlist: objectContaining({ id: 2, _count: { items: 2 } }),
      });
    });

    it("duplicates playlist when user has shared access", async () => {
      mockGetAccess.mockResolvedValue({ level: "shared", groups: ["Family"] });
      mockPrisma.playlist.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          name: "Shared Playlist",
          description: null,
          shuffle: true,
          repeat: "all",
        })
      );
      stubCopy(3, "Shared Playlist (Copy)", 0);

      const req = reqFor(duplicatePlaylist, {
        params: { id: "1" },
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(duplicatePlaylist);

      await duplicatePlaylist(req, res);

      expect(res._getStatus()).toBe(201);
      // Duplicate is owned by the duplicating user
      expect(mockPrisma.playlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            userId: USER.id,
            shuffle: true,
            repeat: "all",
          }),
        })
      );
    });

    it("returns 404 when user has no access", async () => {
      mockGetAccess.mockResolvedValue({ level: "none" });

      const req = reqFor(duplicatePlaylist, {
        params: { id: "1" },
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(duplicatePlaylist);

      await duplicatePlaylist(req, res);

      expect(res._getStatus()).toBe(404);
      expect(mockPrisma.playlist.create).not.toHaveBeenCalled();
    });
  });

  describe("writes go through the queue", () => {
    /** The write units open when each Prisma call ran */
    const seen: string[][] = [];
    const note = () => {
      seen.push([...openUnits]);
    };
    const takeSeen = () => seen.splice(0);

    it("create, update, delete and duplicate each run inside one dbWrite unit", async () => {
      mockPrisma.playlist.create.mockImplementation(
        prismaImpl(() => {
          note();
          return partialRow({ id: 5, name: "n" });
        })
      );
      await createPlaylist(
        reqFor(createPlaylist, { body: { name: "n" }, user: USER }),
        resFor(createPlaylist)
      );
      expect(takeSeen()).toEqual([["playlist.create"]]);

      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({ id: 5, userId: USER.id })
      );
      mockPrisma.playlist.update.mockImplementation(
        prismaImpl(() => {
          note();
          return partialRow({ id: 5, name: "m" });
        })
      );
      await updatePlaylist(
        reqFor(updatePlaylist, {
          body: { name: "m" },
          params: { id: "5" },
          user: USER,
          allowedInstanceIds: ALLOWED,
        }),
        resFor(updatePlaylist)
      );
      expect(takeSeen()).toEqual([["playlist.update"]]);

      mockPrisma.playlist.delete.mockImplementation(
        prismaImpl(() => {
          note();
          return partialRow({});
        })
      );
      await deletePlaylist(
        reqFor(deletePlaylist, { params: { id: "5" }, user: USER }),
        resFor(deletePlaylist)
      );
      expect(takeSeen()).toEqual([["playlist.delete"]]);

      mockGetAccess.mockResolvedValue({ level: "owner" });
      mockPrisma.playlist.findUnique.mockResolvedValue(
        partialRow({ id: 5, name: "m", repeat: "none", shuffle: false })
      );
      mockDuplicateItems.mockReturnValue({
        sql: "INSERT",
        paramsFor: (id) => [id],
      });
      mockPrisma.playlist.create.mockImplementation(
        prismaImpl(() => {
          note();
          return partialRow({ id: 6, name: "m (Copy)" });
        })
      );
      mockPrisma.$executeRawUnsafe.mockImplementation(
        prismaImpl(() => {
          note();
          return 1;
        })
      );
      await duplicatePlaylist(
        reqFor(duplicatePlaylist, {
          params: { id: "5" },
          user: USER,
          allowedInstanceIds: ALLOWED,
        }),
        resFor(duplicatePlaylist)
      );
      expect(takeSeen()).toEqual([
        ["playlist.duplicate"],
        ["playlist.duplicate"],
      ]);
    });

    it("update answers the count the requester can see", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({ id: 5, userId: USER.id })
      );
      mockPrisma.playlist.update.mockResolvedValue(
        partialRow({ id: 5, name: "m" })
      );
      mockPreviews.mockResolvedValue(
        new Map([[5, { items: [], visibleCount: 2 }]])
      );

      const res = resFor(updatePlaylist);
      await updatePlaylist(
        reqFor(updatePlaylist, {
          body: { name: "m" },
          params: { id: "5" },
          user: USER,
          allowedInstanceIds: ALLOWED,
        }),
        res
      );

      expect(mockPreviews).toHaveBeenCalledWith({
        userId: USER.id,
        allowedInstanceIds: ALLOWED,
        playlistIds: [5],
      });
      expect(res._getBody()).toEqual({
        playlist: objectContaining({ _count: { items: 2 } }),
      });
    });

    it("create answers an empty playlist", async () => {
      mockPrisma.playlist.create.mockResolvedValue(
        partialRow({ id: 5, name: "n" })
      );
      const res = resFor(createPlaylist);
      await createPlaylist(
        reqFor(createPlaylist, { body: { name: "n" }, user: USER }),
        res
      );
      expect(res._getBody()).toEqual({
        playlist: objectContaining({ _count: { items: 0 } }),
      });
    });

    it("create and update ignore an isPublic field and never store it", async () => {
      mockPrisma.playlist.create.mockResolvedValue(partialRow({ id: 5 }));
      await createPlaylist(
        reqFor(createPlaylist, {
          body: malformed({ name: "n", isPublic: true }),
          user: USER,
        }),
        resFor(createPlaylist)
      );
      const [createArgs] = mockPrisma.playlist.create.mock.calls[0] ?? [];
      expect(createArgs?.data).not.toHaveProperty("isPublic");

      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({ id: 5, userId: USER.id })
      );
      mockPrisma.playlist.update.mockResolvedValue(partialRow({ id: 5 }));
      await updatePlaylist(
        reqFor(updatePlaylist, {
          body: malformed({ name: "m", isPublic: true }),
          params: { id: "5" },
          user: USER,
          allowedInstanceIds: ALLOWED,
        }),
        resFor(updatePlaylist)
      );
      const [updateArgs] = mockPrisma.playlist.update.mock.calls[0] ?? [];
      expect(updateArgs?.data).not.toHaveProperty("isPublic");
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

    it("updating shares with a stored share for a group the owner left succeeds and drops it", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(
        partialRow({ id: 1, userId: 1 })
      );
      mockResolvePermissions.mockResolvedValue(
        userPermissions({ canShare: true })
      );
      // The owner now belongs to group 10 only; group 99 is a stored share
      mockGetUserGroups.mockResolvedValue([{ id: 10, name: "Family" }]);
      mockPrisma.playlistShare.findMany
        .mockResolvedValueOnce([partialRow({ groupId: 99 })])
        .mockResolvedValueOnce([
          partialRow<PlaylistShareWithGroup>({
            sharedAt: new Date("2025-06-01"),
            group: partialRow({ id: 10, name: "Family" }),
          }),
        ]);
      mockPrisma.$transaction.mockResolvedValue([]);

      const req = reqFor(updatePlaylistShares, {
        body: { groupIds: [10, 99] },
        params: { id: "1" },
        user: USER,
      });
      const res = resFor(updatePlaylistShares);

      await updatePlaylistShares(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockPrisma.playlistShare.create).toHaveBeenCalledExactlyOnceWith({
        data: { playlistId: 1, groupId: 10 },
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
      // 99 is no stored share, so it is being added
      mockPrisma.playlistShare.findMany.mockResolvedValue([]);

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
      mockAppendItems.mockResolvedValue({
        added: 0,
        alreadyInPlaylist: 0,
        unavailable: 1,
      });

      const req = reqFor(addSceneToPlaylist, {
        params: { id: "1" },
        body: { sceneId: "42", instanceId: "inst-b" },
        user: USER,
      });
      const res = resFor(addSceneToPlaylist);

      await addSceneToPlaylist(req, res);

      expect(mockAppendItems).toHaveBeenCalledWith(1, USER.id, [
        { id: "42", instanceId: "inst-b" },
      ]);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res._getErrorBody().error).toBe("Scene not found");
      expect(mockPrisma.playlistItem.findUnique).not.toHaveBeenCalled();
    });

    it("add of a scene already there answers 409", async () => {
      mockGetAccess.mockResolvedValue({ level: "owner" });
      mockAppendItems.mockResolvedValue({
        added: 0,
        alreadyInPlaylist: 1,
        unavailable: 0,
      });

      const req = reqFor(addSceneToPlaylist, {
        params: { id: "1" },
        body: { sceneId: "42", instanceId: "inst-b" },
        user: USER,
      });
      const res = resFor(addSceneToPlaylist);

      await addSceneToPlaylist(req, res);

      expect(mockAppendItems).toHaveBeenCalledWith(1, USER.id, [
        { id: "42", instanceId: "inst-b" },
      ]);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(mockPrisma.playlistItem.findUnique).not.toHaveBeenCalled();
    });

    it("add answers 201 with the stored item, read after the write", async () => {
      mockGetAccess.mockResolvedValue({ level: "shared", groups: ["g"] });
      mockAppendItems.mockResolvedValue({
        added: 1,
        alreadyInPlaylist: 0,
        unavailable: 0,
      });
      const stored = partialRow<PlaylistItem>({
        id: 9,
        playlistId: 1,
        sceneId: "42",
        instanceId: "inst-b",
        position: 3,
      });
      mockPrisma.playlistItem.findUnique.mockResolvedValue(stored);

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
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res._getOkBody()).toEqual({ item: stored });
      // The position is numbered inside the insert, never read before it
      expect(mockPrisma.playlist.findUnique).not.toHaveBeenCalled();
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
  });

  describe("move one item, remove several", () => {
    const OWNED = partialRow<Playlist>({
      id: 1,
      userId: USER.id,
      name: "Mine",
    });

    const moveReq = (itemId: string, body: unknown) => {
      const req = reqFor(movePlaylistItem, {
        params: { id: "1", itemId },
        body: malformed(body),
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(movePlaylistItem);
      return { run: () => movePlaylistItem(req, res), res };
    };

    const removeReq = (body: unknown) => {
      const req = reqFor(removePlaylistItems, {
        params: { id: "1" },
        body: malformed(body),
        user: USER,
      });
      const res = resFor(removePlaylistItems);
      return { run: () => removePlaylistItems(req, res), res };
    };

    it("a move hands the service the owner's view and answers success", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(OWNED);
      mockMoveItem.mockResolvedValue(true);
      const { run, res } = moveReq("7", { index: 2 });

      await run();

      expect(mockPrisma.playlist.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: USER.id },
        select: { id: true },
      });
      expect(mockMoveItem).toHaveBeenCalledExactlyOnceWith(
        1,
        USER.id,
        ALLOWED,
        7,
        2
      );
      expect(res._getOkBody()).toEqual({ success: true });
    });

    it("moving an item of another playlist, or an unknown item id, answers 404", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(OWNED);
      // The service reads the playlist's own items and finds none with that id
      mockMoveItem.mockResolvedValue(false);
      const { run, res } = moveReq("999", { index: 0 });

      await run();

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res._getErrorBody().error).toBe("Item not found");
    });

    it.each([
      ["negative", { index: -1 }],
      ["a fraction", { index: 1.5 }],
      ["a string", { index: "1" }],
      ["missing", {}],
      ["null", { index: null }],
    ])(
      "index not a non-negative integer (%s) answers 400",
      async (_what, body) => {
        const { run, res } = moveReq("7", body);

        await run();

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res._getErrorBody().error).toBe(
          "index must be a non-negative integer"
        );
        expect(mockMoveItem).not.toHaveBeenCalled();
      }
    );

    it.each([["abc"], ["0"], ["1.5"]])(
      "an item id of %s answers 400",
      async (itemId) => {
        const { run, res } = moveReq(itemId, { index: 0 });

        await run();

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockMoveItem).not.toHaveBeenCalled();
      }
    );

    it("removing item ids deletes those of this playlist only, in one unit, and answers the count", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(OWNED);
      const units: string[][] = [];
      mockPrisma.playlistItem.deleteMany.mockImplementation(
        prismaImpl(() => {
          units.push([...openUnits]);
          return { count: 2 };
        })
      );
      const { run, res } = removeReq({ itemIds: [11, 12, 99] });

      await run();

      expect(
        mockPrisma.playlistItem.deleteMany
      ).toHaveBeenCalledExactlyOnceWith({
        where: { playlistId: 1, id: { in: [11, 12, 99] } },
      });
      expect(units).toEqual([["playlist.removeItems"]]);
      expect(res._getOkBody()).toEqual({ removed: 2 });
    });

    it.each([
      [
        "more than 250 ids",
        { itemIds: Array.from({ length: 251 }, (_, i) => i + 1) },
      ],
      ["no ids", { itemIds: [] }],
      ["not an array", { itemIds: 5 }],
      ["a zero id", { itemIds: [1, 0] }],
      ["a string id", { itemIds: [1, "2"] }],
      ["no body field", {}],
    ])("%s answers 400 and removes nothing", async (_what, body) => {
      const { run, res } = removeReq(body);

      await run();

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getErrorBody().error).toBe(
        "itemIds must be an array of 1 to 250 item ids"
      );
      expect(mockPrisma.playlist.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.playlistItem.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("addScenesToPlaylist", () => {
    const bulkReq = (body: unknown, id = "1") => {
      const req = reqFor(addScenesToPlaylist, {
        params: { id },
        body: malformed(body),
        user: USER,
      });
      const res = resFor(addScenesToPlaylist);
      return { run: () => addScenesToPlaylist(req, res), res };
    };

    const scenes = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        sceneId: String(i + 1),
        instanceId: "inst-a",
      }));

    it("a playlist id that is not a number answers 400", async () => {
      const { run, res } = bulkReq({ scenes: scenes(1) }, "abc");

      await run();

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getErrorBody().error).toBe("Invalid playlist ID");
      expect(mockAppendItems).not.toHaveBeenCalled();
    });

    it.each([
      ["no scenes field", {}],
      ["scenes that are not an array", { scenes: "42" }],
      ["an empty array", { scenes: [] }],
      ["more than a page of scenes", { scenes: scenes(PER_PAGE_MAX + 1) }],
    ])("%s answers 400 and adds nothing", async (_what, body) => {
      const { run, res } = bulkReq(body);

      await run();

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getErrorBody().error).toBe(
        `scenes must be an array of 1 to ${PER_PAGE_MAX} scenes`
      );
      expect(mockGetAccess).not.toHaveBeenCalled();
      expect(mockAppendItems).not.toHaveBeenCalled();
    });

    it.each([
      ["null", null, "scenes[1] must be an object"],
      ["a string", "42", "scenes[1] must be an object"],
      [
        "an entry without a scene id",
        { instanceId: "inst-a" },
        "scenes[1].sceneId is required",
      ],
      [
        "an entry without an instance",
        { sceneId: "9" },
        "scenes[1].instanceId is required",
      ],
      [
        "an entry with a malformed instance",
        { sceneId: "9", instanceId: "not an id!" },
        "scenes[1].instanceId must be an instance id",
      ],
    ])(
      "an entry that is %s answers 400 naming it, before any access check",
      async (_what, entry, message) => {
        const { run, res } = bulkReq({
          scenes: [{ sceneId: "1", instanceId: "inst-a" }, entry],
        });

        await run();

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res._getErrorBody().error).toBe(message);
        expect(mockGetAccess).not.toHaveBeenCalled();
        expect(mockAppendItems).not.toHaveBeenCalled();
      }
    );

    it("a playlist the user has no access to answers 404 and adds nothing", async () => {
      mockGetAccess.mockResolvedValue({ level: "none" });
      const { run, res } = bulkReq({ scenes: scenes(2) });

      await run();

      expect(mockGetAccess).toHaveBeenCalledWith(1, USER.id);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res._getErrorBody().error).toBe("Playlist not found");
      expect(mockAppendItems).not.toHaveBeenCalled();
    });

    it("answers the counts appendItems returns, asking for the scenes in the order given", async () => {
      mockGetAccess.mockResolvedValue({ level: "owner" });
      mockAppendItems.mockResolvedValue({
        added: 2,
        alreadyInPlaylist: 1,
        unavailable: 1,
      });
      const { run, res } = bulkReq({
        scenes: [
          { sceneId: "30", instanceId: "inst-b" },
          { sceneId: "10", instanceId: "inst-a" },
          { sceneId: "10", instanceId: "inst-b" },
          { sceneId: "20", instanceId: "inst-a" },
        ],
      });

      await run();

      expect(mockAppendItems).toHaveBeenCalledWith(1, USER.id, [
        { id: "30", instanceId: "inst-b" },
        { id: "10", instanceId: "inst-a" },
        { id: "10", instanceId: "inst-b" },
        { id: "20", instanceId: "inst-a" },
      ]);
      expect(res.status).not.toHaveBeenCalled();
      expect(res._getOkBody()).toEqual({
        added: 2,
        alreadyInPlaylist: 1,
        unavailable: 1,
      });
    });

    it("accepts a full page of scenes", async () => {
      mockGetAccess.mockResolvedValue({ level: "owner" });
      mockAppendItems.mockResolvedValue({
        added: PER_PAGE_MAX,
        alreadyInPlaylist: 0,
        unavailable: 0,
      });
      const { run, res } = bulkReq({ scenes: scenes(PER_PAGE_MAX) });

      await run();

      expect(res._getOkBody().added).toBe(PER_PAGE_MAX);
    });
  });
});
