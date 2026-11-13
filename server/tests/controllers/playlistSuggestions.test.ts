/**
 * The Suggestions tab's routes: POST /api/playlists/:id/suggestions runs the
 * scene list request within the playlist's suggestions, and its count route
 * counts the same. Both check the viewer may open the playlist before any
 * suggestion is computed, and parse the body before either.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countPlaylistSuggestions,
  findPlaylistSuggestions,
} from "../../controllers/playlist.js";
import { getPlaylistAccess } from "../../services/PlaylistAccessService.js";
import { getSuggestionRefs } from "../../services/PlaylistSuggestionService.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import type { FindPlaylistSuggestionsRequest } from "../../types/api/index.js";
import {
  type Malformed,
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../helpers/controllerTestUtils.js";
import { objectContaining } from "../helpers/matchers.js";
import { createMockScene } from "../helpers/mockDataGenerators.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/PlaylistAccessService.js", () => ({
  getPlaylistAccess: vi.fn(),
  getUserGroups: vi.fn(),
}));

vi.mock("../../services/PlaylistSuggestionService.js", () => ({
  getSuggestionRefs: vi.fn(),
  getPlaylistSuggestions: vi.fn(),
}));

vi.mock("../../services/SceneQueryBuilder.js", () => ({
  sceneQueryBuilder: {
    execute: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock("../../utils/stashUrl.js", () => ({
  buildStashEntityUrl: vi.fn(
    (
      type: string,
      id: string,
      _inst: string | undefined,
      viewer: { role: string } | undefined
    ) => (viewer?.role === "ADMIN" ? `http://stash/${type}s/${id}` : null)
  ),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockGetAccess = vi.mocked(getPlaylistAccess);
const mockRefs = vi.mocked(getSuggestionRefs);
const mockBuilder = vi.mocked(sceneQueryBuilder, true);

const refs = [
  { id: "s1", instanceId: "A" },
  { id: "s2", instanceId: "B" },
];

type Body = FindPlaylistSuggestionsRequest | Malformed;

const find = async (
  body: Body,
  parts: { id?: string; role?: "ADMIN" | "USER" } = {}
) => {
  const req = reqFor(findPlaylistSuggestions, {
    body,
    params: { id: parts.id ?? "7" },
    user: testUser({ role: parts.role ?? "USER" }),
    allowedInstanceIds: ["A", "B"],
    timeZone: "America/Chicago",
  });
  const res = resFor(findPlaylistSuggestions);
  await findPlaylistSuggestions(req, res);
  return res;
};

const count = async (body: Body, parts: { id?: string } = {}) => {
  const req = reqFor(countPlaylistSuggestions, {
    body,
    params: { id: parts.id ?? "7" },
    user: testUser(),
    allowedInstanceIds: ["A", "B"],
    timeZone: "America/Chicago",
  });
  const res = resFor(countPlaylistSuggestions);
  await countPlaylistSuggestions(req, res);
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAccess.mockResolvedValue({ level: "owner" });
  mockRefs.mockResolvedValue(refs);
  mockBuilder.execute.mockResolvedValue({ items: [], total: 0 });
  mockBuilder.count.mockResolvedValue(0);
});

describe("findPlaylistSuggestions", () => {
  it("runs the parsed request within the suggestions, for the viewer", async () => {
    mockGetAccess.mockResolvedValue({ level: "shared", groups: ["Family"] });
    await find({
      filter: { page: 2, per_page: 60, q: "beach", sort: "title" },
      scene_filter: { tags: { value: ["12:B"], modifier: "INCLUDES" } },
    });

    expect(mockGetAccess).toHaveBeenCalledExactlyOnceWith(7, 1);
    expect(mockRefs).toHaveBeenCalledExactlyOnceWith({
      userId: 1,
      playlistId: 7,
      allowedInstanceIds: ["A", "B"],
    });
    expect(mockBuilder.execute).toHaveBeenCalledExactlyOnceWith(
      objectContaining({
        userId: 1,
        allowedInstanceIds: ["A", "B"],
        timeZone: "America/Chicago",
        ranked: refs,
        request: objectContaining({
          page: 2,
          perPage: 60,
          q: "beach",
          sort: objectContaining({ field: "title" }),
          filter: {
            tags: objectContaining({ refs: [{ id: "12", instanceId: "B" }] }),
          },
        }),
      })
    );
  });

  it("sorts by the suggestion rank, best first, when the body names no sort", async () => {
    await find({});
    expect(mockBuilder.execute).toHaveBeenCalledExactlyOnceWith(
      objectContaining({
        request: objectContaining({
          sort: objectContaining({ field: "recommended", direction: "DESC" }),
        }),
      })
    );
  });

  it("answers the builder's page and total, with Stash links for an admin only", async () => {
    mockBuilder.execute.mockResolvedValue({
      items: [createMockScene({ id: "s1", instanceId: "A" })],
      total: 9,
    });

    const user = (await find({ filter: { per_page: 12 } }))._getOkBody();
    expect(user).toMatchObject({ count: 9, page: 1, perPage: 12 });
    expect(user.scenes.map((s) => s.stashUrl)).toEqual([null]);

    const admin = (await find({}, { role: "ADMIN" }))._getOkBody();
    expect(admin.scenes.map((s) => s.stashUrl)).toEqual([
      "http://stash/scenes/s1",
    ]);
  });

  it("answers no suggestions without a list query", async () => {
    mockRefs.mockResolvedValue([]);
    const res = await find({ filter: { per_page: 24 } });
    expect(res._getOkBody()).toEqual({
      scenes: [],
      count: 0,
      page: 1,
      perPage: 24,
    });
    expect(mockBuilder.execute).not.toHaveBeenCalled();
  });

  it("answers 404 to a viewer who cannot open the playlist, before computing", async () => {
    mockGetAccess.mockResolvedValue({ level: "none" });
    const res = await find({});
    expect(res._getStatus()).toBe(404);
    expect(mockRefs).not.toHaveBeenCalled();
    expect(mockBuilder.execute).not.toHaveBeenCalled();
  });

  it("answers 400 to an id that is not a number", async () => {
    const res = await find({}, { id: "abc" });
    expect(res._getStatus()).toBe(400);
    expect(mockGetAccess).not.toHaveBeenCalled();
  });

  it.each([
    ["ids", { ids: ["1:A"] }],
    ["scene_filter.ids", { scene_filter: { ids: { value: ["1:A"] } } }],
  ])("a body naming %s answers 400 before any read", async (path, body) => {
    await expect(find(malformed(body))).rejects.toMatchObject({
      statusCode: 400,
      issues: [{ path, message: "Suggestions list their own scenes" }],
    });
    expect(mockGetAccess).not.toHaveBeenCalled();
    expect(mockRefs).not.toHaveBeenCalled();
  });
});

describe("countPlaylistSuggestions", () => {
  it("counts the parsed request within the suggestions", async () => {
    mockBuilder.count.mockResolvedValue(4);
    const res = await count({
      scene_filter: { tags: { value: ["12:B"], modifier: "INCLUDES" } },
    });
    expect(res._getOkBody()).toEqual({ count: 4 });
    expect(mockBuilder.count).toHaveBeenCalledExactlyOnceWith(
      objectContaining({
        userId: 1,
        allowedInstanceIds: ["A", "B"],
        timeZone: "America/Chicago",
        ranked: refs,
      })
    );
  });

  it("answers 0 without a count query when there are no suggestions", async () => {
    mockRefs.mockResolvedValue([]);
    expect((await count({}))._getOkBody()).toEqual({ count: 0 });
    expect(mockBuilder.count).not.toHaveBeenCalled();
  });

  it("answers 404 to a viewer who cannot open the playlist", async () => {
    mockGetAccess.mockResolvedValue({ level: "none" });
    const res = await count({});
    expect(res._getStatus()).toBe(404);
    expect(mockRefs).not.toHaveBeenCalled();
    expect(mockBuilder.count).not.toHaveBeenCalled();
  });
});
