/**
 * Unit Tests for shared playlist access — adding scenes
 *
 * Issue #415: Users with shared access should be able to add scenes
 * to playlists shared with them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    playlist: { findFirst: vi.fn(), findUnique: vi.fn() },
    playlistItem: { findUnique: vi.fn(), create: vi.fn() },
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
import { getPlaylistAccess } from "../../services/PlaylistAccessService.js";
import { addSceneToPlaylist } from "../../controllers/playlist.js";
import type { Request, Response } from "express";

const mockPrisma = vi.mocked(prisma);
const mockGetAccess = vi.mocked(getPlaylistAccess);

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

describe("addSceneToPlaylist - shared access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("allows shared user to add scene to shared playlist", async () => {
    // User 2 has shared access (not owner)
    mockGetAccess.mockResolvedValue({ level: "shared", groups: ["Family"] });

    // Playlist exists (owned by user 1)
    mockPrisma.playlist.findFirst.mockResolvedValue(null); // NOT owner
    mockPrisma.playlist.findUnique.mockResolvedValue({
      id: 1,
      userId: 1, // Different user
      name: "Shared Playlist",
      items: [],
    } as any);

    // Scene not already in playlist
    mockPrisma.playlistItem.findUnique.mockResolvedValue(null);

    // Create succeeds
    mockPrisma.playlistItem.create.mockResolvedValue({
      id: 1,
      playlistId: 1,
      sceneId: "scene-123",
      instanceId: "instance-1",
      position: 0,
    } as any);

    const mockReq = createMockRequest({
      params: { id: "1" },
      body: { sceneId: "scene-123" },
      user: { id: 2, username: "shareduser", role: "USER" },
    });
    const { json, status, responseStatus } = createMockResponse();
    const mockRes = { json, status } as unknown as Response;

    await addSceneToPlaylist(mockReq as any, mockRes as any);

    // Should succeed with 201, NOT 404
    expect(responseStatus).not.toHaveBeenCalledWith(404);
    expect(mockPrisma.playlistItem.create).toHaveBeenCalled();
  });

  it("rejects user with no access from adding scenes", async () => {
    mockGetAccess.mockResolvedValue({ level: "none" });

    const mockReq = createMockRequest({
      params: { id: "1" },
      body: { sceneId: "scene-123" },
      user: { id: 3, username: "stranger", role: "USER" },
    });
    const { json, status, responseJson, responseStatus } =
      createMockResponse();
    const mockRes = { json, status } as unknown as Response;

    await addSceneToPlaylist(mockReq as any, mockRes as any);

    // Should be rejected
    expect(responseStatus).toHaveBeenCalledWith(404);
    expect(mockPrisma.playlistItem.create).not.toHaveBeenCalled();
  });
});
