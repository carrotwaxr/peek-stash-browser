/**
 * Unit Tests for shared playlist authorization boundaries
 *
 * Verifies that shared users CANNOT perform owner-only operations:
 * - Remove a scene from a shared playlist
 * - Reorder scenes in a shared playlist
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
  removeSceneFromPlaylist,
  reorderPlaylist,
  updatePlaylist,
} from "../../controllers/playlist.js";
import prisma from "../../prisma/singleton.js";
import { reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { partialRow } from "../helpers/prismaMock.js";

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
  getEntityInstanceId: vi.fn(() => Promise.resolve("instance-1")),
  getEntityInstanceIds: vi.fn(() => Promise.resolve(new Map())),
}));

// Mock StashEntityService
vi.mock("../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getScenesByIdsWithRelations: vi.fn(() => Promise.resolve([])),
  },
}));

// Mock EntityExclusionHelper
vi.mock("../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    filterExcluded: vi.fn((scenes: unknown[]) => Promise.resolve(scenes)),
  },
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
  isPublic: false,
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
        user: SHARED_USER,
      });
      const res = resFor(removeSceneFromPlaylist);

      await removeSceneFromPlaylist(req, res);

      expect(mockPrisma.playlistItem.delete).not.toHaveBeenCalled();
    });

    it("allows owner to remove a scene (control test)", async () => {
      // Owner's findFirst returns the playlist
      mockPrisma.playlist.findFirst.mockResolvedValue(SHARED_PLAYLIST);
      mockPrisma.playlistItem.delete.mockResolvedValue(partialRow({}));

      const req = reqFor(removeSceneFromPlaylist, {
        params: { id: "1", sceneId: "scene-123" },
        user: { id: OWNER_ID, username: "owner", role: "USER" },
      });
      const res = resFor(removeSceneFromPlaylist);

      await removeSceneFromPlaylist(req, res);

      // Owner should succeed — should NOT get 404
      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(mockPrisma.playlistItem.delete).toHaveBeenCalled();
    });
  });

  describe("reorderPlaylist - shared user rejected", () => {
    it("returns 404 when shared user tries to reorder scenes", async () => {
      const req = reqFor(reorderPlaylist, {
        params: { id: "1" },
        body: {
          items: [
            { sceneId: "scene-1", position: 1 },
            { sceneId: "scene-2", position: 0 },
          ],
        },
        user: SHARED_USER,
      });
      const res = resFor(reorderPlaylist);

      await reorderPlaylist(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Playlist not found",
      });
    });

    it("does not update any playlist item positions", async () => {
      const req = reqFor(reorderPlaylist, {
        params: { id: "1" },
        body: {
          items: [
            { sceneId: "scene-1", position: 1 },
            { sceneId: "scene-2", position: 0 },
          ],
        },
        user: SHARED_USER,
      });
      const res = resFor(reorderPlaylist);

      await reorderPlaylist(req, res);

      expect(mockPrisma.playlistItem.update).not.toHaveBeenCalled();
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

    it("returns 404 when shared user tries to toggle public/shuffle/repeat", async () => {
      const req = reqFor(updatePlaylist, {
        params: { id: "1" },
        body: { isPublic: true, shuffle: true, repeat: "all" },
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
