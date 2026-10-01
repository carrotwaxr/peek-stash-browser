/**
 * Unit Tests for shared playlist access — adding scenes
 *
 * Issue #415: Users with shared access should be able to add scenes
 * to playlists shared with them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addSceneToPlaylist } from "../../controllers/playlist.js";
import prisma from "../../prisma/singleton.js";
import { getPlaylistAccess } from "../../services/PlaylistAccessService.js";
import { appendItems } from "../../services/PlaylistQueryService.js";
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

// Mock PlaylistQueryService (the playlist reads and the add's statement,
// not under test here)
vi.mock("../../services/PlaylistQueryService.js", () => ({
  loadPlaylistPreviews: vi.fn(() => Promise.resolve(new Map())),
  loadPlaylistItems: vi.fn(() => Promise.resolve({ items: [], totalItems: 0 })),
  appendItems: vi.fn(),
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
const mockGetAccess = vi.mocked(getPlaylistAccess);
const mockAppendItems = vi.mocked(appendItems);

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

    // The scene is visible to user 2 and not in the playlist yet
    mockAppendItems.mockResolvedValue({
      added: 1,
      alreadyInPlaylist: 0,
      unavailable: 0,
    });
    mockPrisma.playlistItem.findUnique.mockResolvedValue(
      partialRow({
        id: 1,
        playlistId: 1,
        sceneId: "scene-123",
        instanceId: "instance-1",
        position: 0,
      })
    );

    const req = reqFor(addSceneToPlaylist, {
      params: { id: "1" },
      body: { sceneId: "scene-123", instanceId: "instance-1" },
      user: { id: 2, username: "shareduser", role: "USER" },
    });
    const res = resFor(addSceneToPlaylist);

    await addSceneToPlaylist(req, res);

    // Should succeed with 201, NOT 404
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockAppendItems).toHaveBeenCalledWith(1, 2, [
      { id: "scene-123", instanceId: "instance-1" },
    ]);
  });

  it("rejects user with no access from adding scenes", async () => {
    mockGetAccess.mockResolvedValue({ level: "none" });

    const req = reqFor(addSceneToPlaylist, {
      params: { id: "1" },
      body: { sceneId: "scene-123", instanceId: "instance-1" },
      user: { id: 3, username: "stranger", role: "USER" },
    });
    const res = resFor(addSceneToPlaylist);

    await addSceneToPlaylist(req, res);

    // Should be rejected
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockAppendItems).not.toHaveBeenCalled();
  });
});
