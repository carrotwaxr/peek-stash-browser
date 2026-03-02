/**
 * Regression tests for playlist scene map multi-instance collision (#393).
 *
 * When a playlist contains scenes from multiple Stash instances that share
 * the same numeric ID, the scene map must use composite keys (id + instanceId)
 * to avoid one instance's data overwriting another's.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NormalizedScene } from "../../types/index.js";

// ---------- mocks (must be before imports of modules under test) ----------

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    playlist: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefaultConfig: vi.fn(() => ({ id: "inst-A" })),
  },
}));

vi.mock("../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getScenesByIdsWithRelations: vi.fn(),
  },
}));

vi.mock("../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    filterExcluded: vi.fn(async (scenes: unknown[]) => scenes),
  },
}));

vi.mock("../../utils/stashUrlProxy.js", () => ({
  transformScene: vi.fn((s: unknown) => s),
}));

vi.mock("../../services/PlaylistAccessService.js", () => ({
  getPlaylistAccess: vi.fn(),
  getUserGroups: vi.fn(),
}));

vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(async () => ({})),
}));

vi.mock("../../utils/entityInstanceId.js", () => ({
  getEntityInstanceId: vi.fn(),
  getEntityInstanceIds: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Dynamic import mock for mergeScenesWithUserData (used in getPlaylist)
vi.mock("../../controllers/library/scenes.js", () => ({
  mergeScenesWithUserData: vi.fn(async (scenes: unknown[]) => scenes),
}));

vi.mock("../../utils/instanceUtils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/instanceUtils.js")>();
  return { ...actual };
});

// ---------- imports ----------

import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { getPlaylistAccess } from "../../services/PlaylistAccessService.js";
import {
  getUserPlaylists,
  getSharedPlaylists,
  getPlaylist,
} from "../../controllers/playlist.js";
import { mockReq, mockRes } from "../helpers/controllerTestUtils.js";

const mockPrisma = vi.mocked(prisma);
const mockGetScenes = vi.mocked(stashEntityService.getScenesByIdsWithRelations);
const mockGetAccess = vi.mocked(getPlaylistAccess);

const USER = { id: 1, username: "testuser", role: "USER" };

/** Minimal NormalizedScene stub with the fields the controller reads. */
function stubScene(id: string, instanceId: string, title: string): NormalizedScene {
  return {
    id,
    instanceId,
    title,
    code: null,
    date: null,
    details: null,
    rating100: null,
    organized: false,
    urls: [],
    o_counter: 0,
    play_count: 0,
    play_duration: 0,
    resume_time: 0,
    play_history: [],
    o_history: [],
    last_played_at: null,
    last_o_at: null,
    interactive: false,
    interactive_speed: null,
    captions: [],
    created_at: "",
    updated_at: "",
    rating: null,
    favorite: false,
    tags: [],
    performers: [],
    studio: null,
    groups: [],
    galleries: [],
    files: [],
    paths: { screenshot: null, preview: null, stream: null, funscript: null, sprite: null, vtt: null, chapters_vtt: null },
    sceneStreams: [],
    stash_ids: [],
  } as unknown as NormalizedScene;
}

describe("Playlist multi-instance scene map (#393)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  /**
   * Shared assertion: given two scenes with the same numeric ID but different
   * instances, each playlist item should resolve to the correct instance's scene.
   */

  it("getUserPlaylists maps scenes by composite key, not bare ID", async () => {
    const sceneA = stubScene("42", "inst-A", "Scene from A");
    const sceneB = stubScene("42", "inst-B", "Scene from B");

    mockPrisma.playlist.findMany.mockResolvedValueOnce([
      {
        id: 1,
        userId: USER.id,
        name: "Mixed",
        description: null,
        isPublic: false,
        shuffle: false,
        repeat: "none",
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { items: 2 },
        items: [
          { id: 1, playlistId: 1, sceneId: "42", instanceId: "inst-A", position: 0, addedAt: new Date() },
          { id: 2, playlistId: 1, sceneId: "42", instanceId: "inst-B", position: 1, addedAt: new Date() },
        ],
      } as any,
    ]);

    // getScenesByIdsWithRelations is called once per instance group
    mockGetScenes
      .mockResolvedValueOnce([sceneA])   // inst-A batch
      .mockResolvedValueOnce([sceneB]);   // inst-B batch

    const req = mockReq({}, {}, USER);
    const res = mockRes();
    await getUserPlaylists(req as any, res);

    const body = res._getBody();
    const items = body.playlists[0].items;
    expect(items).toHaveLength(2);
    expect(items[0].scene?.title).toBe("Scene from A");
    expect(items[1].scene?.title).toBe("Scene from B");
  });

  it("getSharedPlaylists maps scenes by composite key, not bare ID", async () => {
    const sceneA = stubScene("42", "inst-A", "Scene from A");
    const sceneB = stubScene("42", "inst-B", "Scene from B");

    mockPrisma.playlist.findMany.mockResolvedValueOnce([
      {
        id: 2,
        userId: 99,
        name: "Shared Mixed",
        description: null,
        isPublic: false,
        shuffle: false,
        repeat: "none",
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 99, username: "other" },
        shares: [{ sharedAt: new Date(), group: { name: "Group1" } }],
        _count: { items: 2 },
        items: [
          { id: 10, playlistId: 2, sceneId: "42", instanceId: "inst-A", position: 0, addedAt: new Date() },
          { id: 11, playlistId: 2, sceneId: "42", instanceId: "inst-B", position: 1, addedAt: new Date() },
        ],
      } as any,
    ]);

    mockGetScenes
      .mockResolvedValueOnce([sceneA])
      .mockResolvedValueOnce([sceneB]);

    const req = mockReq({}, {}, USER);
    const res = mockRes();
    await getSharedPlaylists(req as any, res);

    const body = res._getBody();
    const items = body.playlists[0].items;
    expect(items).toHaveLength(2);
    expect(items[0].scene?.title).toBe("Scene from A");
    expect(items[1].scene?.title).toBe("Scene from B");
  });

  it("getPlaylist maps scenes by composite key, not bare ID", async () => {
    const sceneA = stubScene("42", "inst-A", "Scene from A");
    const sceneB = stubScene("42", "inst-B", "Scene from B");

    mockGetAccess.mockResolvedValueOnce({ level: "owner" } as any);
    mockPrisma.playlist.findUnique.mockResolvedValueOnce({
      id: 3,
      userId: USER.id,
      name: "Detail Mixed",
      description: null,
      isPublic: false,
      shuffle: false,
      repeat: "none",
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        { id: 20, playlistId: 3, sceneId: "42", instanceId: "inst-A", position: 0, addedAt: new Date() },
        { id: 21, playlistId: 3, sceneId: "42", instanceId: "inst-B", position: 1, addedAt: new Date() },
      ],
    } as any);

    mockGetScenes
      .mockResolvedValueOnce([sceneA])
      .mockResolvedValueOnce([sceneB]);

    const req = mockReq({}, { id: "3" }, USER);
    const res = mockRes();
    await getPlaylist(req as any, res);

    const body = res._getBody();
    const items = body.playlist.items;
    expect(items).toHaveLength(2);
    expect(items[0].scene?.title).toBe("Scene from A");
    expect(items[1].scene?.title).toBe("Scene from B");
  });
});
