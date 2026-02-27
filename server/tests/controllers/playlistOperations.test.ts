/**
 * Unit Tests for Playlist Controller Operations
 *
 * Tests createPlaylist, updatePlaylist, deletePlaylist, and duplicatePlaylist
 * controller functions. Covers validation, ownership checks, and the
 * access-control-based duplicate flow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    playlist: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    playlistItem: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    playlistShare: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    userGroupMembership: { findMany: vi.fn() },
    $transaction: vi.fn(),
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
  resolveUserPermissions: vi.fn(async () => ({ canShare: true })),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import prisma from "../../prisma/singleton.js";
import { getPlaylistAccess, getUserGroups } from "../../services/PlaylistAccessService.js";
import { resolveUserPermissions } from "../../services/PermissionService.js";
import {
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  duplicatePlaylist,
  getPlaylistShares,
  updatePlaylistShares,
} from "../../controllers/playlist.js";
import type { Request, Response } from "express";

const mockPrisma = vi.mocked(prisma);
const mockGetAccess = vi.mocked(getPlaylistAccess);
const mockGetUserGroups = vi.mocked(getUserGroups);
const mockResolvePermissions = vi.mocked(resolveUserPermissions);

const USER = { id: 1, username: "testuser", role: "USER" };

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

describe("Playlist Controller Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("createPlaylist", () => {
    it("creates playlist with valid name", async () => {
      const createdPlaylist = {
        id: 1,
        name: "My Playlist",
        description: null,
        userId: 1,
        isPublic: false,
        _count: { items: 0 },
      };
      mockPrisma.playlist.create.mockResolvedValue(createdPlaylist as any);

      const req = createMockRequest({
        body: { name: "My Playlist" },
        user: USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await createPlaylist(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(201);
      expect(responseJson).toHaveBeenCalledWith({ playlist: createdPlaylist });
    });

    it("trims whitespace from name and description", async () => {
      mockPrisma.playlist.create.mockResolvedValue({ id: 1 } as any);

      const req = createMockRequest({
        body: { name: "  My Playlist  ", description: "  A description  " },
        user: USER,
      });
      const { json, status } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await createPlaylist(req as any, res as any);

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
      const req = createMockRequest({
        body: { name: "" },
        user: USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await createPlaylist(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Playlist name is required",
      });
    });

    it("rejects whitespace-only name", async () => {
      const req = createMockRequest({
        body: { name: "   " },
        user: USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await createPlaylist(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Playlist name is required",
      });
    });

    it("rejects missing name", async () => {
      const req = createMockRequest({
        body: {},
        user: USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await createPlaylist(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(400);
    });

    it("returns 401 when user is not authenticated", async () => {
      const req = createMockRequest({
        body: { name: "Test" },
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await createPlaylist(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(401);
    });
  });

  describe("updatePlaylist", () => {
    it("updates playlist name when user is owner", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
      } as any);
      mockPrisma.playlist.update.mockResolvedValue({
        id: 1,
        name: "Updated",
        _count: { items: 3 },
      } as any);

      const req = createMockRequest({
        params: { id: "1" },
        body: { name: "Updated" },
        user: USER,
      });
      const { json, status, responseJson } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await updatePlaylist(req as any, res as any);

      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          playlist: expect.objectContaining({ name: "Updated" }),
        })
      );
    });

    it("returns 404 when user is not owner", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(null);

      const req = createMockRequest({
        params: { id: "1" },
        body: { name: "Hijack" },
        user: USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await updatePlaylist(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(mockPrisma.playlist.update).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid playlist ID", async () => {
      const req = createMockRequest({
        params: { id: "abc" },
        body: { name: "Test" },
        user: USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await updatePlaylist(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Invalid playlist ID",
      });
    });
  });

  describe("deletePlaylist", () => {
    it("deletes playlist when user is owner", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
      } as any);
      mockPrisma.playlist.delete.mockResolvedValue({} as any);

      const req = createMockRequest({
        params: { id: "1" },
        user: USER,
      });
      const { json, status } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await deletePlaylist(req as any, res as any);

      expect(mockPrisma.playlist.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(json).toHaveBeenCalledWith({
        success: true,
        message: "Playlist deleted",
      });
    });

    it("returns 404 when user is not owner", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue(null);

      const req = createMockRequest({
        params: { id: "1" },
        user: USER,
      });
      const { json, status, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await deletePlaylist(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(mockPrisma.playlist.delete).not.toHaveBeenCalled();
    });
  });

  describe("duplicatePlaylist", () => {
    it("duplicates playlist when user has owner access", async () => {
      mockGetAccess.mockResolvedValue({ level: "owner" });
      mockPrisma.playlist.findUnique.mockResolvedValue({
        id: 1,
        name: "Original",
        description: "Desc",
        shuffle: false,
        repeat: "none",
        items: [
          { sceneId: "s1", instanceId: "i1", position: 0 },
          { sceneId: "s2", instanceId: "i1", position: 1 },
        ],
      } as any);
      mockPrisma.playlist.create.mockResolvedValue({
        id: 2,
        name: "Original (Copy)",
        _count: { items: 2 },
      } as any);

      const req = createMockRequest({
        params: { id: "1" },
        user: USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await duplicatePlaylist(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(201);
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
      mockPrisma.playlist.findUnique.mockResolvedValue({
        id: 1,
        name: "Shared Playlist",
        description: null,
        shuffle: true,
        repeat: "all",
        items: [],
      } as any);
      mockPrisma.playlist.create.mockResolvedValue({
        id: 3,
        name: "Shared Playlist (Copy)",
        _count: { items: 0 },
      } as any);

      const req = createMockRequest({
        params: { id: "1" },
        user: USER,
      });
      const { json, status, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await duplicatePlaylist(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(201);
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

      const req = createMockRequest({
        params: { id: "1" },
        user: USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await duplicatePlaylist(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(mockPrisma.playlist.create).not.toHaveBeenCalled();
    });
  });

  describe("getPlaylistShares", () => {
    it("returns shares for owned playlist", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
      } as any);
      mockPrisma.playlistShare.findMany.mockResolvedValue([
        {
          sharedAt: new Date("2025-06-01"),
          group: { id: 10, name: "Family" },
        },
      ] as any);

      const req = createMockRequest({
        params: { id: "1" },
        user: USER,
      });
      const { json, status } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await getPlaylistShares(req as any, res as any);

      expect(json).toHaveBeenCalledWith({
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

      const req = createMockRequest({
        params: { id: "1" },
        user: USER,
      });
      const { json, status, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await getPlaylistShares(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(404);
    });
  });

  describe("updatePlaylistShares", () => {
    it("replaces shares with new group IDs", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
      } as any);
      mockResolvePermissions.mockResolvedValue({ canShare: true } as any);
      mockGetUserGroups.mockResolvedValue([
        { id: 10, name: "Family" },
        { id: 20, name: "Friends" },
      ]);
      mockPrisma.$transaction.mockResolvedValue([]);
      mockPrisma.playlistShare.findMany.mockResolvedValue([
        {
          sharedAt: new Date("2025-06-01"),
          group: { id: 10, name: "Family" },
        },
      ] as any);

      const req = createMockRequest({
        params: { id: "1" },
        body: { groupIds: [10] },
        user: USER,
      });
      const { json, status } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await updatePlaylistShares(req as any, res as any);

      expect(json).toHaveBeenCalledWith({
        shares: [
          expect.objectContaining({ groupId: 10, groupName: "Family" }),
        ],
      });
    });

    it("returns 403 when user lacks canShare permission", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
      } as any);
      mockResolvePermissions.mockResolvedValue({ canShare: false } as any);

      const req = createMockRequest({
        params: { id: "1" },
        body: { groupIds: [10] },
        user: USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await updatePlaylistShares(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        error: "You don't have permission to share playlists",
      });
    });

    it("returns 403 when sharing with group user does not belong to", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
      } as any);
      mockResolvePermissions.mockResolvedValue({ canShare: true } as any);
      mockGetUserGroups.mockResolvedValue([
        { id: 10, name: "Family" },
      ]);

      const req = createMockRequest({
        params: { id: "1" },
        body: { groupIds: [10, 99] }, // 99 is not a user's group
        user: USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await updatePlaylistShares(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        error: "You can only share with groups you belong to",
      });
    });

    it("allows clearing all shares without permission check", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
      } as any);
      mockPrisma.$transaction.mockResolvedValue([]);
      mockPrisma.playlistShare.findMany.mockResolvedValue([]);

      const req = createMockRequest({
        params: { id: "1" },
        body: { groupIds: [] }, // Empty = clear all
        user: USER,
      });
      const { json, status } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await updatePlaylistShares(req as any, res as any);

      // Should NOT check permissions when clearing shares
      expect(mockResolvePermissions).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({ shares: [] });
    });

    it("returns 400 when groupIds is not an array", async () => {
      mockPrisma.playlist.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
      } as any);

      const req = createMockRequest({
        params: { id: "1" },
        body: { groupIds: "not-an-array" },
        user: USER,
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const res = { json, status } as unknown as Response;

      await updatePlaylistShares(req as any, res as any);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: "groupIds must be an array",
      });
    });
  });
});
