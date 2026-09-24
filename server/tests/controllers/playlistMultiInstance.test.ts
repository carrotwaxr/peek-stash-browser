/**
 * Regression tests for playlist scene map multi-instance collision (#393).
 *
 * When a playlist contains scenes from multiple Stash instances that share
 * the same numeric ID, the scene map must use composite keys (id + instanceId)
 * to avoid one instance's data overwriting another's.
 */
import type { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPlaylist,
  getSharedPlaylists,
  getUserPlaylists,
} from "../../controllers/playlist.js";
// ---------- imports ----------

import prisma from "../../prisma/singleton.js";
import { getPlaylistAccess } from "../../services/PlaylistAccessService.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import type { NormalizedScene } from "../../types/index.js";
import { reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { type PlaylistWithItems } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

type PlaylistWithCountAndItems = Prisma.PlaylistGetPayload<{
  include: { _count: { select: { items: true } }; items: true };
}>;
type SharedPlaylistWithItems = Prisma.PlaylistGetPayload<{
  include: {
    user: true;
    shares: { include: { group: true } };
    _count: { select: { items: true } };
    items: true;
  };
}>;

// ---------- mocks (must be before imports of modules under test) ----------

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

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
    filterExcluded: vi.fn((scenes: unknown[]) => Promise.resolve(scenes)),
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
  resolveUserPermissions: vi.fn(() => Promise.resolve({})),
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
  mergeScenesWithUserData: vi.fn((scenes: unknown[]) =>
    Promise.resolve(scenes)
  ),
}));

vi.mock("../../utils/instanceUtils.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../utils/instanceUtils.js")>();
  return { ...actual };
});

const mockPrisma = vi.mocked(prisma, true);
const mockGetScenes = vi.mocked(stashEntityService.getScenesByIdsWithRelations);
const mockGetAccess = vi.mocked(getPlaylistAccess);

const USER = { id: 1, username: "testuser", role: "USER" };

/** Minimal NormalizedScene stub with the fields the controller reads. */
function stubScene(
  id: string,
  instanceId: string,
  title: string
): NormalizedScene {
  return partialRow<NormalizedScene>({
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
    paths: {
      screenshot: null,
      preview: null,
      stream: null,
      sprite: null,
      vtt: null,
      chapters_vtt: null,
      caption: null,
    },
    sceneStreams: [],
  });
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
      partialRow<PlaylistWithCountAndItems>({
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
          {
            id: 1,
            playlistId: 1,
            sceneId: "42",
            instanceId: "inst-A",
            position: 0,
            addedAt: new Date(),
          },
          {
            id: 2,
            playlistId: 1,
            sceneId: "42",
            instanceId: "inst-B",
            position: 1,
            addedAt: new Date(),
          },
        ],
      }),
    ]);

    // getScenesByIdsWithRelations is called once per instance group
    mockGetScenes
      .mockResolvedValueOnce([sceneA]) // inst-A batch
      .mockResolvedValueOnce([sceneB]); // inst-B batch

    const req = reqFor(getUserPlaylists, { user: USER });
    const res = resFor(getUserPlaylists);
    await getUserPlaylists(req, res);

    const body = res._getOkBody();
    const items = must(must(body.playlists[0]).items);
    expect(items).toHaveLength(2);
    expect(must(items[0]).scene?.title).toBe("Scene from A");
    expect(must(items[1]).scene?.title).toBe("Scene from B");
  });

  it("getSharedPlaylists maps scenes by composite key, not bare ID", async () => {
    const sceneA = stubScene("42", "inst-A", "Scene from A");
    const sceneB = stubScene("42", "inst-B", "Scene from B");

    mockPrisma.playlist.findMany.mockResolvedValueOnce([
      partialRow<SharedPlaylistWithItems>({
        id: 2,
        userId: 99,
        name: "Shared Mixed",
        description: null,
        isPublic: false,
        shuffle: false,
        repeat: "none",
        createdAt: new Date(),
        updatedAt: new Date(),
        user: partialRow({ id: 99, username: "other" }),
        shares: [
          partialRow({
            sharedAt: new Date(),
            group: partialRow({ name: "Group1" }),
          }),
        ],
        _count: { items: 2 },
        items: [
          {
            id: 10,
            playlistId: 2,
            sceneId: "42",
            instanceId: "inst-A",
            position: 0,
            addedAt: new Date(),
          },
          {
            id: 11,
            playlistId: 2,
            sceneId: "42",
            instanceId: "inst-B",
            position: 1,
            addedAt: new Date(),
          },
        ],
      }),
    ]);

    mockGetScenes
      .mockResolvedValueOnce([sceneA])
      .mockResolvedValueOnce([sceneB]);

    const req = reqFor(getSharedPlaylists, { user: USER });
    const res = resFor(getSharedPlaylists);
    await getSharedPlaylists(req, res);

    const body = res._getOkBody();
    const items = must(must(body.playlists[0]).items);
    expect(items).toHaveLength(2);
    expect(must(items[0]).scene?.title).toBe("Scene from A");
    expect(must(items[1]).scene?.title).toBe("Scene from B");
  });

  it("getPlaylist maps scenes by composite key, not bare ID", async () => {
    const sceneA = stubScene("42", "inst-A", "Scene from A");
    const sceneB = stubScene("42", "inst-B", "Scene from B");

    mockGetAccess.mockResolvedValueOnce({ level: "owner" });
    mockPrisma.playlist.findUnique.mockResolvedValueOnce(
      partialRow<PlaylistWithItems>({
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
          {
            id: 20,
            playlistId: 3,
            sceneId: "42",
            instanceId: "inst-A",
            position: 0,
            addedAt: new Date(),
          },
          {
            id: 21,
            playlistId: 3,
            sceneId: "42",
            instanceId: "inst-B",
            position: 1,
            addedAt: new Date(),
          },
        ],
      })
    );

    mockGetScenes
      .mockResolvedValueOnce([sceneA])
      .mockResolvedValueOnce([sceneB]);

    const req = reqFor(getPlaylist, { params: { id: "3" }, user: USER });
    const res = resFor(getPlaylist);
    await getPlaylist(req, res);

    const body = res._getOkBody();
    const items = must(body.playlist.items);
    expect(items).toHaveLength(2);
    expect(must(items[0]).scene?.title).toBe("Scene from A");
    expect(must(items[1]).scene?.title).toBe("Scene from B");
  });
});
