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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    playlist: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    playlistItem: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), update: vi.fn() },
    playlistShare: { findMany: vi.fn() },
  },
}));

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
  resolveUserPermissions: vi.fn(async () => ({})),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import prisma from "../../prisma/singleton.js";
import {
  removeSceneFromPlaylist,
  reorderPlaylist,
  updatePlaylist,
  deletePlaylist,
} from "../../controllers/playlist.js";
import type { Request, Response } from "express";

const mockPrisma = vi.mocked(prisma);

/** User IDs: owner = 1, shared user = 2 */
const OWNER_ID = 1;
const SHARED_USER_ID = 2;

const SHARED_USER = { id: SHARED_USER_ID, username: "shareduser", role: "USER" };

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

function createMockRequest(options: {
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  user?: { id: number; username: string; role: string };
}): Partial<Request> {
  return {
    params: options.params || {},
    body: options.body || {},
    user: options.user,
  } as Partial<Request>;
}

function createMockResponse() {
  const responseJson = vi.fn();
  const responseStatus = vi.fn(() => ({ json: responseJson }));
  return {
    json: responseJson,
    status: responseStatus,
    responseJson,
    responseStatus,
  };
}

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
      const mockReq = createMockRequest({
        params: { id: "1", sceneId: "scene-123" },
        user: SHARED_USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      await removeSceneFromPlaylist(mockReq as any, mockRes as any);

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({ error: "Playlist not found" });
    });

    it("does not delete any playlist item", async () => {
      const mockReq = createMockRequest({
        params: { id: "1", sceneId: "scene-123" },
        user: SHARED_USER,
      });
      const { json, status } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      await removeSceneFromPlaylist(mockReq as any, mockRes as any);

      expect(mockPrisma.playlistItem.delete).not.toHaveBeenCalled();
    });

    it("allows owner to remove a scene (control test)", async () => {
      // Owner's findFirst returns the playlist
      mockPrisma.playlist.findFirst.mockResolvedValue(SHARED_PLAYLIST as any);
      mockPrisma.playlistItem.delete.mockResolvedValue({} as any);

      const mockReq = createMockRequest({
        params: { id: "1", sceneId: "scene-123" },
        user: { id: OWNER_ID, username: "owner", role: "USER" },
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      await removeSceneFromPlaylist(mockReq as any, mockRes as any);

      // Owner should succeed — should NOT get 404
      expect(responseStatus).not.toHaveBeenCalledWith(404);
      expect(mockPrisma.playlistItem.delete).toHaveBeenCalled();
    });
  });

  describe("reorderPlaylist - shared user rejected", () => {
    it("returns 404 when shared user tries to reorder scenes", async () => {
      const mockReq = createMockRequest({
        params: { id: "1" },
        body: {
          items: [
            { sceneId: "scene-1", position: 1 },
            { sceneId: "scene-2", position: 0 },
          ],
        },
        user: SHARED_USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      await reorderPlaylist(mockReq as any, mockRes as any);

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({ error: "Playlist not found" });
    });

    it("does not update any playlist item positions", async () => {
      const mockReq = createMockRequest({
        params: { id: "1" },
        body: {
          items: [
            { sceneId: "scene-1", position: 1 },
            { sceneId: "scene-2", position: 0 },
          ],
        },
        user: SHARED_USER,
      });
      const { json, status } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      await reorderPlaylist(mockReq as any, mockRes as any);

      expect(mockPrisma.playlistItem.update).not.toHaveBeenCalled();
    });
  });

  describe("updatePlaylist - shared user rejected", () => {
    it("returns 404 when shared user tries to rename the playlist", async () => {
      const mockReq = createMockRequest({
        params: { id: "1" },
        body: { name: "Hijacked Playlist Name" },
        user: SHARED_USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      await updatePlaylist(mockReq as any, mockRes as any);

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({ error: "Playlist not found" });
    });

    it("returns 404 when shared user tries to change description", async () => {
      const mockReq = createMockRequest({
        params: { id: "1" },
        body: { description: "Overwritten description" },
        user: SHARED_USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      await updatePlaylist(mockReq as any, mockRes as any);

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({ error: "Playlist not found" });
    });

    it("returns 404 when shared user tries to toggle public/shuffle/repeat", async () => {
      const mockReq = createMockRequest({
        params: { id: "1" },
        body: { isPublic: true, shuffle: true, repeat: "all" },
        user: SHARED_USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      await updatePlaylist(mockReq as any, mockRes as any);

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({ error: "Playlist not found" });
    });

    it("does not update the playlist in the database", async () => {
      const mockReq = createMockRequest({
        params: { id: "1" },
        body: { name: "Hijacked Name" },
        user: SHARED_USER,
      });
      const { json, status } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      await updatePlaylist(mockReq as any, mockRes as any);

      expect(mockPrisma.playlist.update).not.toHaveBeenCalled();
    });
  });

  describe("deletePlaylist - shared user rejected", () => {
    it("returns 404 when shared user tries to delete the playlist", async () => {
      const mockReq = createMockRequest({
        params: { id: "1" },
        user: SHARED_USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      await deletePlaylist(mockReq as any, mockRes as any);

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({ error: "Playlist not found" });
    });

    it("does not delete the playlist from the database", async () => {
      const mockReq = createMockRequest({
        params: { id: "1" },
        user: SHARED_USER,
      });
      const { json, status } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      await deletePlaylist(mockReq as any, mockRes as any);

      expect(mockPrisma.playlist.delete).not.toHaveBeenCalled();
    });

    it("allows owner to delete (control test)", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(SHARED_PLAYLIST as any);
      mockPrisma.playlist.delete.mockResolvedValue(SHARED_PLAYLIST as any);

      const mockReq = createMockRequest({
        params: { id: "1" },
        user: { id: OWNER_ID, username: "owner", role: "USER" },
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      await deletePlaylist(mockReq as any, mockRes as any);

      // Owner should succeed
      expect(responseStatus).not.toHaveBeenCalledWith(404);
      expect(mockPrisma.playlist.delete).toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({ success: true, message: "Playlist deleted" });
    });
  });
});
