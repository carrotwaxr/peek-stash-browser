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
  getPlaylistQueue,
  getSharedPlaylists,
  getUserPlaylists,
} from "../../controllers/playlist.js";
import { ValidationError } from "../../middleware/errorHandler.js";
import prisma from "../../prisma/singleton.js";
import { resolveUserPermissions } from "../../services/PermissionService.js";
import { getPlaylistAccess } from "../../services/PlaylistAccessService.js";
import {
  type PlaylistPreviews,
  countUnavailableItems,
  loadPlaylistItems,
  loadPlaylistPreviews,
  loadPlaylistQueue,
} from "../../services/PlaylistQueryService.js";
import type {
  PlaylistItemWithScene,
  PlaylistPreviewItem,
  PlaylistQueueEntry,
} from "../../types/api/index.js";
import type { NormalizedScene } from "../../types/index.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { userPermissions } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

type PlaylistWithOwner = Prisma.PlaylistGetPayload<{
  include: { user: true };
}>;
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
  loadPlaylistQueue: vi.fn(),
  countUnavailableItems: vi.fn(),
}));

vi.mock("../../services/PlaylistAccessService.js", () => ({
  getPlaylistAccess: vi.fn(),
  getUserGroups: vi.fn(),
}));

vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockPreviews = vi.mocked(loadPlaylistPreviews);
const mockItems = vi.mocked(loadPlaylistItems);
const mockQueue = vi.mocked(loadPlaylistQueue);
const mockUnavailable = vi.mocked(countUnavailableItems);
const mockGetAccess = vi.mocked(getPlaylistAccess);
const mockResolvePermissions = vi.mocked(resolveUserPermissions);

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
  scene: NormalizedScene
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
    // Owners may share unless a case says otherwise
    mockResolvePermissions.mockResolvedValue(
      userPermissions({ canShare: true })
    );
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("getUserPlaylists passes req.allowedInstanceIds to the builder or service: each playlist's previews and visible count", async () => {
    mockPrisma.playlist.findMany.mockResolvedValueOnce([
      partialRow({ id: 1, userId: USER.id, name: "Mixed" }),
      partialRow({ id: 2, userId: USER.id, name: "Nothing visible" }),
    ]);
    mockPreviews.mockResolvedValueOnce(new Map([[1, MIXED]]));

    const req = reqFor(getUserPlaylists, {
      user: USER,
      allowedInstanceIds: ALLOWED,
    });
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

    const req = reqFor(getSharedPlaylists, {
      user: USER,
      allowedInstanceIds: ALLOWED,
    });
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

  it("getSharedPlaylists leaves out a playlist whose owner lacks Can Share, resolving each owner once", async () => {
    const sharedRow = (id: number, ownerId: number) =>
      partialRow<SharedPlaylistRow>({
        id,
        userId: ownerId,
        name: `Shared ${id}`,
        description: null,
        user: partialRow({ id: ownerId, username: `owner${ownerId}` }),
        shares: [
          partialRow({
            sharedAt: new Date("2026-01-02T00:00:00Z"),
            group: partialRow({ name: "Group1" }),
          }),
        ],
      });
    mockPrisma.playlist.findMany.mockResolvedValueOnce([
      sharedRow(1, 99),
      sharedRow(2, 98),
      sharedRow(3, 99),
    ]);
    mockResolvePermissions.mockImplementation((userId) =>
      Promise.resolve(userPermissions({ canShare: userId === 99 }))
    );
    mockPreviews.mockResolvedValueOnce(new Map([[1, MIXED]]));

    const req = reqFor(getSharedPlaylists, {
      user: USER,
      allowedInstanceIds: ALLOWED,
    });
    const res = resFor(getSharedPlaylists);
    await getSharedPlaylists(req, res);

    expect(mockResolvePermissions).toHaveBeenCalledTimes(2);
    expect(mockPreviews).toHaveBeenCalledExactlyOnceWith({
      userId: USER.id,
      allowedInstanceIds: ALLOWED,
      playlistIds: [1, 3],
    });
    expect(res._getOkBody().playlists.map((p) => p.id)).toEqual([1, 3]);
  });

  it("getPlaylist without page reads page 1 of 50, and the owner's unavailable count", async () => {
    const items = [
      item(20, "42", "inst-A", 0, sceneStub("42", "inst-A", "Scene from A")),
      item(21, "42", "inst-B", 1, sceneStub("42", "inst-B", "Scene from B")),
    ];
    mockGetAccess.mockResolvedValueOnce({ level: "owner" });
    mockPrisma.playlist.findUnique.mockResolvedValueOnce(
      partialRow<PlaylistWithOwner>({
        id: 3,
        userId: USER.id,
        name: "Detail Mixed",
        user: partialRow({ id: USER.id, username: USER.username }),
      })
    );
    mockItems.mockResolvedValueOnce({ items, totalItems: 2 });
    mockUnavailable.mockResolvedValueOnce(1);

    const req = reqFor(getPlaylist, {
      params: { id: "3" },
      user: USER,
      allowedInstanceIds: ALLOWED,
    });
    const res = resFor(getPlaylist);
    await getPlaylist(req, res);

    expect(mockItems).toHaveBeenCalledExactlyOnceWith({
      userId: USER.id,
      allowedInstanceIds: ALLOWED,
      playlistId: 3,
      paging: { page: 1, perPage: 50 },
      sort: { field: "position", direction: "ASC", seed: undefined },
    });
    expect(mockUnavailable).toHaveBeenCalledExactlyOnceWith({
      userId: USER.id,
      allowedInstanceIds: ALLOWED,
      playlistId: 3,
    });
    const body = res._getOkBody();
    expect(body.playlist.items).toEqual(items);
    expect(body.playlist.name).toBe("Detail Mixed");
    expect(body.totalItems).toBe(2);
    expect(body.unavailableItems).toBe(1);
    expect(body.page).toBe(1);
    expect(body.perPage).toBe(50);
    expect(body.sort).toBe("position");
    expect(body.direction).toBe("ASC");
    expect(body.isOwner).toBe(true);
    expect(body.owner).toEqual({ id: USER.id, username: USER.username });
    // The owner's row is read with its owner, but the answer carries only
    // the name and id
    expect(mockPrisma.playlist.findUnique).toHaveBeenCalledWith({
      where: { id: 3 },
      include: { user: { select: { id: true, username: true } } },
    });
    expect(body.playlist).not.toHaveProperty("user");
  });

  it("getPlaylist with page and per_page reads that page for the viewer", async () => {
    mockGetAccess.mockResolvedValueOnce({ level: "shared", groups: ["G"] });
    mockPrisma.playlist.findUnique.mockResolvedValueOnce(
      partialRow<PlaylistWithOwner>({
        id: 3,
        userId: 99,
        name: "Shared",
        user: partialRow({ id: 99, username: "other" }),
      })
    );
    mockItems.mockResolvedValueOnce({ items: [], totalItems: 6 });

    const req = reqFor(getPlaylist, {
      params: { id: "3" },
      query: { page: "2", per_page: "500" },
      user: USER,
      allowedInstanceIds: ALLOWED,
    });
    const res = resFor(getPlaylist);
    await getPlaylist(req, res);

    expect(mockItems).toHaveBeenCalledExactlyOnceWith({
      userId: USER.id,
      allowedInstanceIds: ALLOWED,
      playlistId: 3,
      paging: { page: 2, perPage: 100 },
      sort: { field: "position", direction: "ASC", seed: undefined },
    });
    const body = res._getOkBody();
    expect(body.totalItems).toBe(6);
    expect(body.page).toBe(2);
    expect(body.perPage).toBe(100);
    expect(body.accessLevel).toBe("shared");
    expect(body.sharedViaGroups).toEqual(["G"]);
    expect(body.owner).toEqual({ id: 99, username: "other" });
    // A recipient learns nothing of the items they cannot play
    expect(body.unavailableItems).toBe(0);
    expect(mockUnavailable).not.toHaveBeenCalled();
  });

  it("getPlaylist with an invalid page answers 400 through the central handler, before any read", async () => {
    const req = reqFor(getPlaylist, {
      params: { id: "3" },
      query: { page: "abc" },
      user: USER,
      allowedInstanceIds: ALLOWED,
    });
    const res = resFor(getPlaylist);

    await expect(getPlaylist(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(mockGetAccess).not.toHaveBeenCalled();
    expect(mockItems).not.toHaveBeenCalled();
  });

  it("getPlaylistQueue reads the viewer's queue in the request's sort", async () => {
    const entries: PlaylistQueueEntry[] = [
      {
        sceneId: "42",
        instanceId: "inst-B",
        position: 0,
        scene: {
          title: "Scene from B",
          paths: { screenshot: null },
          files: [],
          studio: null,
        },
      },
    ];
    mockGetAccess.mockResolvedValueOnce({ level: "shared", groups: ["G"] });
    mockQueue.mockResolvedValueOnce(entries);

    const req = reqFor(getPlaylistQueue, {
      params: { id: "3" },
      query: { sort: "random_7", direction: "DESC" },
      user: USER,
      allowedInstanceIds: ALLOWED,
    });
    const res = resFor(getPlaylistQueue);
    await getPlaylistQueue(req, res);

    expect(mockQueue).toHaveBeenCalledExactlyOnceWith({
      userId: USER.id,
      allowedInstanceIds: ALLOWED,
      playlistId: 3,
      sort: { field: "random", direction: "DESC", seed: 7 },
    });
    expect(res._getOkBody()).toEqual({ entries });
  });

  it("getPlaylistQueue answers 404 without reading when the viewer has no access, and refuses paging", async () => {
    mockGetAccess.mockResolvedValueOnce({ level: "none" });
    const req = reqFor(getPlaylistQueue, {
      params: { id: "3" },
      user: USER,
      allowedInstanceIds: ALLOWED,
    });
    const res = resFor(getPlaylistQueue);
    await getPlaylistQueue(req, res);
    expect(res._getStatus()).toBe(404);
    expect(mockQueue).not.toHaveBeenCalled();

    const paged = reqFor(getPlaylistQueue, {
      params: { id: "3" },
      query: malformed({ page: "2" }),
      user: USER,
      allowedInstanceIds: ALLOWED,
    });
    await expect(
      getPlaylistQueue(paged, resFor(getPlaylistQueue))
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it("getPlaylist answers 404 without reading items when the viewer has no access", async () => {
    mockGetAccess.mockResolvedValueOnce({ level: "none" });

    const req = reqFor(getPlaylist, {
      params: { id: "3" },
      user: USER,
      allowedInstanceIds: ALLOWED,
    });
    const res = resFor(getPlaylist);
    await getPlaylist(req, res);

    expect(res._getStatus()).toBe(404);
    expect(mockItems).not.toHaveBeenCalled();
  });
});
