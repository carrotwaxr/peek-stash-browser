/**
 * Unit Tests for shared playlist authorization boundaries
 *
 * Verifies that shared users CANNOT perform owner-only operations:
 * - Remove a scene from a shared playlist
 * - Move one item, or remove several, in a shared playlist
 * - Save a view sort as a shared playlist's order
 * - Remove a shared playlist's unavailable items
 * - Rename/update a shared playlist
 * - Delete a shared playlist
 *
 * These tests complement playlistSharedAccess.test.ts which verifies
 * shared users CAN add scenes (the intentional asymmetry documented
 * in the addSceneToPlaylist controller comment).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deletePlaylist,
  movePlaylistItem,
  removePlaylistItems,
  removeSceneFromPlaylist,
  removeUnavailablePlaylistItems,
  sortPlaylist,
  updatePlaylist,
} from "../../controllers/playlist.js";
import { ValidationError } from "../../middleware/errorHandler.js";
import prisma from "../../prisma/singleton.js";
import {
  moveItem,
  removeUnavailableItems,
  sortPlaylistItems,
} from "../../services/PlaylistQueryService.js";
import type { SortPlaylistRequest } from "../../types/api/index.js";
import {
  type Malformed,
  malformed,
  reqFor,
  resFor,
} from "../helpers/controllerTestUtils.js";

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
  sortPlaylistItems: vi.fn(),
  removeUnavailableItems: vi.fn(),
  moveItem: vi.fn(),
}));

// Mock PermissionService
vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(() => Promise.resolve({})),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockSortPlaylistItems = vi.mocked(sortPlaylistItems);
const mockRemoveUnavailable = vi.mocked(removeUnavailableItems);
const mockMoveItem = vi.mocked(moveItem);

/** User IDs: owner = 1, shared user = 2 */
const OWNER_ID = 1;
const SHARED_USER_ID = 2;

const SHARED_USER = {
  id: SHARED_USER_ID,
  username: "shareduser",
  role: "USER",
};

/** The shared playlist — owned by user 1, shared with user 2's group */
const SHARED_PLAYLIST = {
  id: 1,
  userId: OWNER_ID,
  name: "Owner Playlist",
  description: "A playlist owned by user 1",
  shuffle: false,
  repeat: "none",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

describe("Shared playlist authorization boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: ownership check returns null for shared user (they don't own playlist 1)
    // This simulates: findFirst({ where: { id: 1, userId: 2 } }) => null
    mockPrisma.playlist.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("removeSceneFromPlaylist - shared user rejected", () => {
    it("returns 404 when shared user tries to remove a scene", async () => {
      const req = reqFor(removeSceneFromPlaylist, {
        params: { id: "1", sceneId: "scene-123" },
        query: { instanceId: "instance-1" },
        user: SHARED_USER,
      });
      const res = resFor(removeSceneFromPlaylist);

      await removeSceneFromPlaylist(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Playlist not found",
      });
    });

    it("does not delete any playlist item", async () => {
      const req = reqFor(removeSceneFromPlaylist, {
        params: { id: "1", sceneId: "scene-123" },
        query: { instanceId: "instance-1" },
        user: SHARED_USER,
      });
      const res = resFor(removeSceneFromPlaylist);

      await removeSceneFromPlaylist(req, res);

      expect(mockPrisma.playlistItem.deleteMany).not.toHaveBeenCalled();
    });

    it("allows owner to remove a scene (control test)", async () => {
      // Owner's findFirst returns the playlist
      mockPrisma.playlist.findFirst.mockResolvedValue(SHARED_PLAYLIST);
      mockPrisma.playlistItem.deleteMany.mockResolvedValue({ count: 1 });

      const req = reqFor(removeSceneFromPlaylist, {
        params: { id: "1", sceneId: "scene-123" },
        query: { instanceId: "instance-1" },
        user: { id: OWNER_ID, username: "owner", role: "USER" },
      });
      const res = resFor(removeSceneFromPlaylist);

      await removeSceneFromPlaylist(req, res);

      // Owner should succeed — should NOT get 404
      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(mockPrisma.playlistItem.deleteMany).toHaveBeenCalledWith({
        where: {
          playlistId: 1,
          instanceId: "instance-1",
          sceneId: "scene-123",
        },
      });
    });
  });

  describe("sortPlaylist - owner only", () => {
    const sortAs = (
      user: { id: number; username: string; role: string },
      body: SortPlaylistRequest | Malformed
    ) => {
      const req = reqFor(sortPlaylist, {
        params: { id: "1" },
        body,
        user,
        allowedInstanceIds: ["instance-1"],
      });
      const res = resFor(sortPlaylist);
      return { run: () => sortPlaylist(req, res), res };
    };

    it("a recipient's sort answers 404 and writes nothing", async () => {
      const { run, res } = sortAs(SHARED_USER, {
        sort: "title",
        direction: "ASC",
      });

      await run();

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Playlist not found" });
      expect(mockSortPlaylistItems).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it.each([
      ["sort=scene_index", { sort: "scene_index", direction: "ASC" }],
      ["an unknown sort", { sort: "bogus", direction: "ASC" }],
      ["no sort", { direction: "ASC" }],
      ["no direction", { sort: "title" }],
      ["an unknown field", { sort: "title", direction: "ASC", page: 2 }],
    ])("%s answers 400", async (_name, body) => {
      mockPrisma.playlist.findFirst.mockResolvedValue(SHARED_PLAYLIST);
      const { run } = sortAs(
        { id: OWNER_ID, username: "owner", role: "USER" },
        malformed(body)
      );

      await expect(run()).rejects.toBeInstanceOf(ValidationError);
      expect(mockSortPlaylistItems).not.toHaveBeenCalled();
    });

    it("the owner's save renumbers in the sort it names (control test)", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(SHARED_PLAYLIST);
      mockSortPlaylistItems.mockResolvedValue(6);
      const { run, res } = sortAs(
        { id: OWNER_ID, username: "owner", role: "USER" },
        { sort: "random_7", direction: "DESC" }
      );

      await run();

      expect(mockPrisma.playlist.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: OWNER_ID },
        select: { id: true },
      });
      expect(mockSortPlaylistItems).toHaveBeenCalledWith({
        userId: OWNER_ID,
        allowedInstanceIds: ["instance-1"],
        playlistId: 1,
        sort: { field: "random", direction: "DESC", seed: 7 },
      });
      expect(res._getOkBody()).toEqual({ success: true, itemCount: 6 });
    });
  });

  describe("removeUnavailablePlaylistItems - owner only", () => {
    const removeAs = (user: { id: number; username: string; role: string }) => {
      const req = reqFor(removeUnavailablePlaylistItems, {
        params: { id: "1" },
        user,
        allowedInstanceIds: ["instance-1"],
      });
      const res = resFor(removeUnavailablePlaylistItems);
      return { run: () => removeUnavailablePlaylistItems(req, res), res };
    };

    it("a recipient's remove unavailable answers 404 and removes nothing", async () => {
      const { run, res } = removeAs(SHARED_USER);

      await run();

      expect(mockPrisma.playlist.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: SHARED_USER_ID },
        select: { id: true },
      });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Playlist not found" });
      expect(mockRemoveUnavailable).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(mockPrisma.playlistItem.deleteMany).not.toHaveBeenCalled();
    });

    it("the owner's remove answers how many items went (control test)", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(SHARED_PLAYLIST);
      mockRemoveUnavailable.mockResolvedValue(3);
      const { run, res } = removeAs({
        id: OWNER_ID,
        username: "owner",
        role: "USER",
      });

      await run();

      expect(mockRemoveUnavailable).toHaveBeenCalledExactlyOnceWith(1);
      expect(res._getOkBody()).toEqual({ removed: 3 });
    });
  });

  describe("movePlaylistItem and removePlaylistItems - owner only", () => {
    it("a recipient's move answers 404 and moves nothing", async () => {
      const req = reqFor(movePlaylistItem, {
        params: { id: "1", itemId: "7" },
        body: { index: 0 },
        user: SHARED_USER,
        allowedInstanceIds: ["instance-1"],
      });
      const res = resFor(movePlaylistItem);

      await movePlaylistItem(req, res);

      expect(mockPrisma.playlist.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: SHARED_USER_ID },
        select: { id: true },
      });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Playlist not found" });
      expect(mockMoveItem).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it("a recipient's bulk remove answers 404 and removes nothing", async () => {
      const req = reqFor(removePlaylistItems, {
        params: { id: "1" },
        body: { itemIds: [7, 8] },
        user: SHARED_USER,
      });
      const res = resFor(removePlaylistItems);

      await removePlaylistItems(req, res);

      expect(mockPrisma.playlist.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: SHARED_USER_ID },
        select: { id: true },
      });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Playlist not found" });
      expect(mockPrisma.playlistItem.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("updatePlaylist - shared user rejected", () => {
    it("returns 404 when shared user tries to rename the playlist", async () => {
      const req = reqFor(updatePlaylist, {
        params: { id: "1" },
        body: { name: "Hijacked Playlist Name" },
        user: SHARED_USER,
      });
      const res = resFor(updatePlaylist);

      await updatePlaylist(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Playlist not found",
      });
    });

    it("returns 404 when shared user tries to change description", async () => {
      const req = reqFor(updatePlaylist, {
        params: { id: "1" },
        body: { description: "Overwritten description" },
        user: SHARED_USER,
      });
      const res = resFor(updatePlaylist);

      await updatePlaylist(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Playlist not found",
      });
    });

    it("returns 404 when shared user tries to toggle shuffle/repeat", async () => {
      const req = reqFor(updatePlaylist, {
        params: { id: "1" },
        body: { shuffle: true, repeat: "all" },
        user: SHARED_USER,
      });
      const res = resFor(updatePlaylist);

      await updatePlaylist(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Playlist not found",
      });
    });

    it("does not update the playlist in the database", async () => {
      const req = reqFor(updatePlaylist, {
        params: { id: "1" },
        body: { name: "Hijacked Name" },
        user: SHARED_USER,
      });
      const res = resFor(updatePlaylist);

      await updatePlaylist(req, res);

      expect(mockPrisma.playlist.update).not.toHaveBeenCalled();
    });
  });

  describe("deletePlaylist - shared user rejected", () => {
    it("returns 404 when shared user tries to delete the playlist", async () => {
      const req = reqFor(deletePlaylist, {
        params: { id: "1" },
        user: SHARED_USER,
      });
      const res = resFor(deletePlaylist);

      await deletePlaylist(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Playlist not found",
      });
    });

    it("does not delete the playlist from the database", async () => {
      const req = reqFor(deletePlaylist, {
        params: { id: "1" },
        user: SHARED_USER,
      });
      const res = resFor(deletePlaylist);

      await deletePlaylist(req, res);

      expect(mockPrisma.playlist.delete).not.toHaveBeenCalled();
    });

    it("allows owner to delete (control test)", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(SHARED_PLAYLIST);
      mockPrisma.playlist.delete.mockResolvedValue(SHARED_PLAYLIST);

      const req = reqFor(deletePlaylist, {
        params: { id: "1" },
        user: { id: OWNER_ID, username: "owner", role: "USER" },
      });
      const res = resFor(deletePlaylist);

      await deletePlaylist(req, res);

      // Owner should succeed
      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(mockPrisma.playlist.delete).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Playlist deleted",
      });
    });
  });
});
