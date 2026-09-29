/**
 * The three playlist reads through PlaylistQueryService (items 41.6, 41.7),
 * with the regression of #393 in mind: a playlist holding two instances'
 * scenes with the same id shows each item with its own instance's scene.
 *
 * The service matches items to scenes by (id, instance) and applies the
 * viewer's exclusions and allowed instances in SQL (its own unit test, and
 * integration/services/PlaylistQueries.integration.test.ts); here the
 * handlers pass the viewer and the paging to it, and attach what it returns
 * to each playlist unchanged.
 */
import type { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPlaylist,
  getSharedPlaylists,
  getUserPlaylists,
} from "../../controllers/playlist.js";
import { ValidationError } from "../../middleware/errorHandler.js";
import prisma from "../../prisma/singleton.js";
import { getPlaylistAccess } from "../../services/PlaylistAccessService.js";
import {
  type PlaylistPreviews,
  loadPlaylistItems,
  loadPlaylistPreviews,
} from "../../services/PlaylistQueryService.js";
import type {
  PlaylistItemWithScene,
  PlaylistPreviewItem,
} from "../../types/api/index.js";
import type { NormalizedScene } from "../../types/index.js";
import { reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

type SharedPlaylistRow = Prisma.PlaylistGetPayload<{
  include: {
    user: true;
    shares: { include: { group: true } };
  };
}>;

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/PlaylistQueryService.js", () => ({
  loadPlaylistPreviews: vi.fn(),
  loadPlaylistItems: vi.fn(),
}));

vi.mock("../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn(() => Promise.resolve(["inst-A", "inst-B"])),
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

const mockPrisma = vi.mocked(prisma, true);
const mockPreviews = vi.mocked(loadPlaylistPreviews);
const mockItems = vi.mocked(loadPlaylistItems);
const mockGetAccess = vi.mocked(getPlaylistAccess);

const USER = { id: 1, username: "testuser", role: "USER" };
const ALLOWED = ["inst-A", "inst-B"];

function preview(
  sceneId: string,
  instanceId: string,
  position: number,
  title: string
): PlaylistPreviewItem {
  return {
    sceneId,
    instanceId,
    position,
    scene: { id: sceneId, instanceId, title, paths: { screenshot: null } },
  };
}

/** Playlist 1's previews: scene 42 on A and on B, 2 of them visible */
const MIXED: PlaylistPreviews = {
  items: [
    preview("42", "inst-A", 0, "Scene from A"),
    preview("42", "inst-B", 1, "Scene from B"),
  ],
  visibleCount: 2,
};

function item(
  id: number,
  sceneId: string,
  instanceId: string,
  position: number,
  scene: NormalizedScene | null
): PlaylistItemWithScene {
  return {
    id,
    playlistId: 3,
    sceneId,
    instanceId,
    position,
    addedAt: new Date(),
    scene,
  };
}

const sceneStub = (id: string, instanceId: string, title: string) =>
  partialRow<NormalizedScene>({ id, instanceId, title });

describe("Playlist reads through PlaylistQueryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("getUserPlaylists attaches each playlist's previews and visible count", async () => {
    mockPrisma.playlist.findMany.mockResolvedValueOnce([
      partialRow({ id: 1, userId: USER.id, name: "Mixed" }),
      partialRow({ id: 2, userId: USER.id, name: "Nothing visible" }),
    ]);
    mockPreviews.mockResolvedValueOnce(new Map([[1, MIXED]]));

    const req = reqFor(getUserPlaylists, { user: USER });
    const res = resFor(getUserPlaylists);
    await getUserPlaylists(req, res);

    expect(mockPreviews).toHaveBeenCalledExactlyOnceWith({
      userId: USER.id,
      allowedInstanceIds: ALLOWED,
      playlistIds: [1, 2],
    });
    const [mixed, nothing] = res._getOkBody().playlists;
    expect(must(mixed).items).toEqual(MIXED.items);
    expect(must(mixed)._count).toEqual({ items: 2 });
    expect(must(nothing).items).toEqual([]);
    expect(must(nothing)._count).toEqual({ items: 0 });
  });

  it("getSharedPlaylists attaches the viewer's previews and visible count", async () => {
    mockPrisma.playlist.findMany.mockResolvedValueOnce([
      partialRow<SharedPlaylistRow>({
        id: 1,
        userId: 99,
        name: "Shared Mixed",
        description: null,
        user: partialRow({ id: 99, username: "other" }),
        shares: [
          partialRow({
            sharedAt: new Date("2026-01-02T00:00:00Z"),
            group: partialRow({ name: "Group1" }),
          }),
        ],
      }),
    ]);
    mockPreviews.mockResolvedValueOnce(new Map([[1, MIXED]]));

    const req = reqFor(getSharedPlaylists, { user: USER });
    const res = resFor(getSharedPlaylists);
    await getSharedPlaylists(req, res);

    expect(mockPreviews).toHaveBeenCalledExactlyOnceWith({
      userId: USER.id,
      allowedInstanceIds: ALLOWED,
      playlistIds: [1],
    });
    const shared = must(res._getOkBody().playlists[0]);
    expect(shared.items).toEqual(MIXED.items);
    expect(shared.sceneCount).toBe(2);
    expect(shared.owner).toEqual({ id: 99, username: "other" });
    expect(shared.sharedViaGroups).toEqual(["Group1"]);
  });

  it("getPlaylist without page returns every item the service gives, with totalItems", async () => {
    const items = [
      item(20, "42", "inst-A", 0, sceneStub("42", "inst-A", "Scene from A")),
      item(21, "42", "inst-B", 1, sceneStub("42", "inst-B", "Scene from B")),
      item(22, "43", "inst-A", 2, null),
    ];
    mockGetAccess.mockResolvedValueOnce({ level: "owner" });
    mockPrisma.playlist.findUnique.mockResolvedValueOnce(
      partialRow({ id: 3, userId: USER.id, name: "Detail Mixed" })
    );
    mockItems.mockResolvedValueOnce({ items, totalItems: 2 });

    const req = reqFor(getPlaylist, { params: { id: "3" }, user: USER });
    const res = resFor(getPlaylist);
    await getPlaylist(req, res);

    expect(mockItems).toHaveBeenCalledExactlyOnceWith({
      userId: USER.id,
      allowedInstanceIds: ALLOWED,
      playlistId: 3,
      paging: undefined,
    });
    const body = res._getOkBody();
    expect(body.playlist.items).toEqual(items);
    expect(body.playlist.name).toBe("Detail Mixed");
    expect(body.totalItems).toBe(2);
    expect(body.page).toBeUndefined();
    expect(body.perPage).toBeUndefined();
    expect(body.isOwner).toBe(true);
  });

  it("getPlaylist with page and per_page reads that page for the viewer", async () => {
    mockGetAccess.mockResolvedValueOnce({ level: "shared", groups: ["G"] });
    mockPrisma.playlist.findUnique.mockResolvedValueOnce(
      partialRow({ id: 3, userId: 99, name: "Shared" })
    );
    mockItems.mockResolvedValueOnce({ items: [], totalItems: 6 });

    const req = reqFor(getPlaylist, {
      params: { id: "3" },
      query: { page: "2", per_page: "500" },
      user: USER,
    });
    const res = resFor(getPlaylist);
    await getPlaylist(req, res);

    expect(mockItems).toHaveBeenCalledExactlyOnceWith({
      userId: USER.id,
      allowedInstanceIds: ALLOWED,
      playlistId: 3,
      paging: { page: 2, perPage: 100 },
    });
    const body = res._getOkBody();
    expect(body.totalItems).toBe(6);
    expect(body.page).toBe(2);
    expect(body.perPage).toBe(100);
    expect(body.accessLevel).toBe("shared");
    expect(body.sharedViaGroups).toEqual(["G"]);
  });

  it("getPlaylist with an invalid page answers 400 through the central handler, before any read", async () => {
    const req = reqFor(getPlaylist, {
      params: { id: "3" },
      query: { page: "abc" },
      user: USER,
    });
    const res = resFor(getPlaylist);

    await expect(getPlaylist(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(mockGetAccess).not.toHaveBeenCalled();
    expect(mockItems).not.toHaveBeenCalled();
  });

  it("getPlaylist answers 404 without reading items when the viewer has no access", async () => {
    mockGetAccess.mockResolvedValueOnce({ level: "none" });

    const req = reqFor(getPlaylist, { params: { id: "3" }, user: USER });
    const res = resFor(getPlaylist);
    await getPlaylist(req, res);

    expect(res._getStatus()).toBe(404);
    expect(mockItems).not.toHaveBeenCalled();
  });
});
