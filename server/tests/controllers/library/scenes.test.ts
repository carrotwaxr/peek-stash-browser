import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
// ---------------------------------------------------------------------------
// Imports — after all vi.mock() calls
// ---------------------------------------------------------------------------

import {
  addStreamabilityInfo,
  findScenes,
  findSimilarScenes,
  getRecommendedScenes,
} from "../../../controllers/library/scenes.js";
import prisma from "../../../prisma/singleton.js";
import { resolveAccessibleInstanceId } from "../../../services/EntityAccessService.js";
import rankingComputeService from "../../../services/RankingComputeService.js";
import { recommendationService } from "../../../services/RecommendationService.js";
import { sceneQueryBuilder } from "../../../services/SceneQueryBuilder.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import { isSceneStreamable } from "../../../utils/codecDetection.js";
import { logger } from "../../../utils/logger.js";
import { libraryHandler } from "../../../utils/routeHelpers.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../../helpers/controllerTestUtils.js";
import { objectContaining } from "../../helpers/matchers.js";
import { createMockScene } from "../../helpers/mockDataGenerators.js";
import { must } from "../../helpers/must.js";

// ---------------------------------------------------------------------------
// Mocks — must precede imports of the module under test
// ---------------------------------------------------------------------------

vi.mock(
  "../../../prisma/singleton.js",
  () => import("../../helpers/prismaSingletonMock.js")
);

vi.mock("../../../services/StashEntityService.js", () => ({
  stashEntityService: {
    generateSceneStreams: vi.fn().mockReturnValue([]),
    getPlaybackStreams: vi.fn().mockResolvedValue([]),
    getSimilarSceneCandidates: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../services/SceneQueryBuilder.js", () => ({
  sceneQueryBuilder: {
    execute: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getByRefs: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../services/RecommendationService.js", () => ({
  recommendationService: {
    getRankedRefs: vi.fn(),
  },
}));

vi.mock("../../../services/EntityAccessService.js", () => ({
  resolveAccessibleInstanceId: vi.fn().mockResolvedValue("inst-a"),
}));

vi.mock("../../../services/RankingComputeService.js", () => ({
  default: {
    ensureFresh: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../utils/codecDetection.js", () => ({
  isSceneStreamable: vi
    .fn()
    .mockReturnValue({ isStreamable: true, reasons: [] }),
}));

vi.mock("../../../utils/seededRandom.js", () => ({
  parseRandomSort: vi
    .fn()
    .mockImplementation((field: string, _userId: number) => ({
      sortField: field,
      randomSeed: undefined,
    })),
  SeededRandom: vi.fn().mockImplementation(() => ({
    shuffle: vi.fn(<T>(items: T[]) => items),
  })),
  generateDailySeed: vi.fn().mockReturnValue(42),
}));

vi.mock("../../../utils/stashUrl.js", () => ({
  buildStashEntityUrl: vi
    .fn()
    .mockImplementation(
      (
        type: string,
        id: string,
        _inst: string | undefined,
        viewer: { role: string } | undefined
      ) => (viewer?.role === "ADMIN" ? `http://stash/${type}s/${id}` : null)
    ),
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockIsSceneStreamable = vi.mocked(isSceneStreamable);
const mockSceneQueryBuilder = vi.mocked(sceneQueryBuilder);
const mockStashEntityService = vi.mocked(stashEntityService);
const mockResolveInstance = vi.mocked(resolveAccessibleInstanceId);
const mockLogger = vi.mocked(logger, true);
const mockRankingService = vi.mocked(rankingComputeService, true);
const mockRecommendationService = vi.mocked(recommendationService, true);

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.userEntityRanking.findMany.mockResolvedValue([]);
  mockPrisma.userEntityRanking.findFirst.mockResolvedValue(null);
});

// ===== 1. addStreamabilityInfo =====

const ADMIN_VIEWER = { role: "ADMIN" };

describe("addStreamabilityInfo", () => {
  it("returns empty array when given empty scenes", () => {
    expect(addStreamabilityInfo([], ADMIN_VIEWER)).toEqual([]);
  });

  it("attaches isStreamable, streamabilityReasons, and stashUrl to each scene", () => {
    mockIsSceneStreamable.mockReturnValue({
      isStreamable: true,
      reasons: [],
    });

    const scenes = [createMockScene({ id: "s1" })];
    const result = addStreamabilityInfo(scenes, ADMIN_VIEWER);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      isStreamable: true,
      streamabilityReasons: [],
      stashUrl: "http://stash/scenes/s1",
    });
  });

  it("gives a regular user no stashUrl", () => {
    mockIsSceneStreamable.mockReturnValue({ isStreamable: true, reasons: [] });

    const scenes = [createMockScene({ id: "s1" })];
    const result = addStreamabilityInfo(scenes, { role: "USER" });

    expect(result[0]).toMatchObject({ isStreamable: true, stashUrl: null });
  });

  it("propagates non-streamable info with reasons", () => {
    mockIsSceneStreamable.mockReturnValue({
      isStreamable: false,
      reasons: ["HEVC codec not supported"],
    });

    const scenes = [createMockScene({ id: "s2" })];
    const result = addStreamabilityInfo(scenes, ADMIN_VIEWER);

    expect(result[0]).toMatchObject({
      isStreamable: false,
      streamabilityReasons: ["HEVC codec not supported"],
    });
  });

  it("processes multiple scenes independently", () => {
    mockIsSceneStreamable
      .mockReturnValueOnce({ isStreamable: true, reasons: [] })
      .mockReturnValueOnce({
        isStreamable: false,
        reasons: ["Unsupported codec"],
      });

    const scenes = [createMockScene({ id: "a" }), createMockScene({ id: "b" })];
    const result = addStreamabilityInfo(scenes, ADMIN_VIEWER);

    expect(must(result[0]).isStreamable).toBe(true);
    expect(must(result[1]).isStreamable).toBe(false);
  });
});

// ===== 2. HTTP handlers =====

describe("findScenes", () => {
  it("returns 401 when user is not authenticated", async () => {
    const req = reqFor(findScenes, { body: { filter: {}, scene_filter: {} } });
    const res = resFor(findScenes);

    await libraryHandler(findScenes)(req, res, vi.fn());

    expect(res._getStatus()).toBe(401);
    expect(res._getBody()).toEqual({ error: "Unauthorized" });
  });

  it("returns scenes from the SQL query builder path", async () => {
    const scene = createMockScene({ id: "s1", title: "Test" });
    mockSceneQueryBuilder.execute.mockResolvedValue({
      items: [scene],
      total: 1,
    });

    const req = reqFor(findScenes, {
      body: { filter: { page: 1, per_page: 40 }, scene_filter: {} },
      user: testUser(),
    });
    const res = resFor(findScenes);

    await findScenes(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getOkBody();
    expect(body.findScenes.count).toBe(1);
    expect(body.findScenes.scenes).toHaveLength(1);
  });

  it("passes req.allowedInstanceIds to the builder or service", async () => {
    mockSceneQueryBuilder.execute.mockResolvedValue({ items: [], total: 0 });
    const req = reqFor(findScenes, {
      body: { filter: { page: 1, per_page: 40 }, scene_filter: {} },
      user: testUser(),
      allowedInstanceIds: ["inst-a", "inst-b"],
    });
    const res = resFor(findScenes);

    await findScenes(req, res);

    expect(mockSceneQueryBuilder.execute).toHaveBeenCalledWith(
      expect.objectContaining({ allowedInstanceIds: ["inst-a", "inst-b"] })
    );
  });

  it("findScenes logs its timings at DEBUG, not INFO", async () => {
    mockSceneQueryBuilder.execute.mockResolvedValue({
      items: [createMockScene({ id: "s1" })],
      total: 1,
    });

    const req = reqFor(findScenes, {
      body: { filter: { page: 1, per_page: 40 }, scene_filter: {} },
      user: testUser(),
    });
    const res = resFor(findScenes);

    await findScenes(req, res);

    expect(res._getStatus()).toBe(200);
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      "findScenes complete (SQL path)",
      objectContaining({ resultCount: 1, total: 1 })
    );
  });

  it("does not send stashUrl to a regular user", async () => {
    mockSceneQueryBuilder.execute.mockResolvedValue({
      items: [createMockScene({ id: "s1" }), createMockScene({ id: "s2" })],
      total: 2,
    });

    const req = reqFor(findScenes, {
      body: { filter: { page: 1, per_page: 40 }, scene_filter: {} },
      user: testUser(),
    });
    const res = resFor(findScenes);

    await findScenes(req, res);

    const scenes = res._getOkBody().findScenes.scenes;
    expect(scenes).toHaveLength(2);
    for (const scene of scenes) expect(scene.stashUrl).toBeNull();
  });

  it("adds stashUrl for an admin", async () => {
    mockSceneQueryBuilder.execute.mockResolvedValue({
      items: [createMockScene({ id: "s1" })],
      total: 1,
    });

    const req = reqFor(findScenes, {
      body: { filter: { page: 1, per_page: 40 }, scene_filter: {} },
      user: testUser({ role: "ADMIN" }),
    });
    const res = resFor(findScenes);

    await findScenes(req, res);

    expect(must(res._getOkBody().findScenes.scenes[0]).stashUrl).toBe(
      "http://stash/scenes/s1"
    );
  });

  it("attaches playback streams to a single-id lookup", async () => {
    const scene = createMockScene({ id: "42", instanceId: "inst-a" });
    mockSceneQueryBuilder.execute.mockResolvedValue({
      items: [scene],
      total: 1,
    });
    const streams = [
      {
        url: "/api/scene/42/proxy-stream/stream?instanceId=inst-a",
        mime_type: "video/mp4",
        label: "Direct stream",
      },
    ];
    mockStashEntityService.getPlaybackStreams.mockResolvedValueOnce(streams);

    const req = reqFor(findScenes, { body: { ids: ["42"] }, user: testUser() });
    const res = resFor(findScenes);

    await findScenes(req, res);

    expect(res._getStatus()).toBe(200);
    expect(mockStashEntityService.getPlaybackStreams).toHaveBeenCalledWith(
      "42",
      "inst-a"
    );
    expect(must(res._getOkBody().findScenes.scenes[0]).sceneStreams).toEqual(
      streams
    );
  });

  it("returns 400 for ambiguous single-ID lookup", async () => {
    const s1 = createMockScene({
      id: "42",
      instanceId: "inst-a",
      title: "Scene A",
    });
    const s2 = createMockScene({
      id: "42",
      instanceId: "inst-b",
      title: "Scene B",
    });
    mockSceneQueryBuilder.execute.mockResolvedValue({
      items: [s1, s2],
      total: 2,
    });

    const req = reqFor(findScenes, {
      body: { filter: {}, scene_filter: {}, ids: ["42"] },
      user: testUser(),
    });
    const res = resFor(findScenes);

    await findScenes(req, res);

    expect(res._getStatus()).toBe(400);
    const body = res._getBody();
    assert("matches" in body, "expected an ambiguous-lookup body");
    expect(body.error).toBe("Ambiguous lookup");
    expect(body.matches).toHaveLength(2);
  });

  it("a failure reaches the error handler: unexpected error", async () => {
    mockSceneQueryBuilder.execute.mockRejectedValue(new Error("DB down"));

    const req = reqFor(findScenes, {
      body: { filter: {}, scene_filter: {} },
      user: testUser(),
    });
    const res = resFor(findScenes);

    await expect(findScenes(req, res)).rejects.toThrow("DB down");

    expect(res.json).not.toHaveBeenCalled();
  });

  describe("PEEK_FILTER_POLICY=drop no longer drops", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("an unknown key answers 400", async () => {
      vi.stubEnv("PEEK_FILTER_POLICY", "drop");
      const body = malformed({
        filter: { page: 1 },
        scene_filter: { b7_not_a_field: { value: 1 } },
      });
      const req = reqFor(findScenes, { body, user: testUser() });
      const res = resFor(findScenes);

      await expect(findScenes(req, res)).rejects.toMatchObject({
        statusCode: 400,
        issues: [{ path: "scene_filter.b7_not_a_field" }],
      });
      expect(mockSceneQueryBuilder.execute).not.toHaveBeenCalled();
    });
  });

  describe("with USE_SQL_QUERY_BUILDER=false", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("findScenes ignores USE_SQL_QUERY_BUILDER=false", async () => {
      // A module could read the flag once, when it loads: load a fresh
      // module graph with the flag set
      vi.stubEnv("USE_SQL_QUERY_BUILDER", "false");
      vi.resetModules();
      const { findScenes: freshFindScenes } =
        await import("../../../controllers/library/scenes.js");
      const { sceneQueryBuilder: freshBuilder } =
        await import("../../../services/SceneQueryBuilder.js");
      vi.mocked(freshBuilder).execute.mockResolvedValue({
        items: [createMockScene({ id: "s1" })],
        total: 1,
      });

      const req = reqFor(freshFindScenes, {
        body: { filter: { page: 1, per_page: 40 }, scene_filter: {} },
        user: testUser(),
      });
      const res = resFor(freshFindScenes);

      await freshFindScenes(req, res);

      expect(vi.mocked(freshBuilder).execute).toHaveBeenCalled();
      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().findScenes.count).toBe(1);
    });
  });
});

describe("findSimilarScenes", () => {
  beforeEach(() => {
    mockResolveInstance.mockResolvedValue("inst-a");
    mockStashEntityService.getSimilarSceneCandidates.mockResolvedValue([]);
    mockSceneQueryBuilder.getByRefs.mockResolvedValue([]);
  });

  it("returns 401 when user is not authenticated", async () => {
    const req = reqFor(findSimilarScenes, {
      params: { id: "101" },
      query: { page: "1", instanceId: "inst-a" },
    });
    const res = resFor(findSimilarScenes);

    await libraryHandler(findSimilarScenes)(req, res, vi.fn());

    expect(res._getStatus()).toBe(401);
  });

  it("404 when the seed is not visible to the user", async () => {
    mockResolveInstance.mockResolvedValue(null);

    const req = reqFor(findSimilarScenes, {
      params: { id: "101" },
      user: testUser(),
      query: { page: "1", instanceId: "inst-b" },
    });
    const res = resFor(findSimilarScenes);

    await findSimilarScenes(req, res);

    expect(res._getStatus()).toBe(404);
    expect(mockResolveInstance).toHaveBeenCalledWith(
      testUser().id,
      "scene",
      "101",
      "inst-b"
    );
    expect(
      mockStashEntityService.getSimilarSceneCandidates
    ).not.toHaveBeenCalled();
  });

  it("returns empty result when no candidates found", async () => {
    const req = reqFor(findSimilarScenes, {
      params: { id: "101" },
      user: testUser(),
      query: { page: "1", instanceId: "inst-a" },
    });
    const res = resFor(findSimilarScenes);

    await findSimilarScenes(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getOkBody();
    expect(body.scenes).toEqual([]);
    expect(body.count).toBe(0);
    // The seed is passed with the instance the access check resolved
    expect(
      mockStashEntityService.getSimilarSceneCandidates
    ).toHaveBeenCalledWith(
      { id: "101", instanceId: "inst-a" },
      testUser().id,
      500
    );
  });

  it("fetches the page by (id, instance) refs in candidate order", async () => {
    const candidate = (sceneId: string, weight: number) => ({
      sceneId,
      instanceId: "inst-a",
      weight,
      date: null,
    });
    // 13 candidates: page 2 holds the 13th only
    mockStashEntityService.getSimilarSceneCandidates.mockResolvedValue(
      Array.from({ length: 13 }, (_, i) => candidate(`c${i + 1}`, 13 - i))
    );
    const scene13 = createMockScene({ id: "c13", instanceId: "inst-a" });
    mockSceneQueryBuilder.getByRefs.mockResolvedValue([scene13]);

    const req = reqFor(findSimilarScenes, {
      params: { id: "101" },
      user: testUser(),
      query: { page: "2", instanceId: "inst-a" },
      allowedInstanceIds: ["default"],
    });
    const res = resFor(findSimilarScenes);

    await findSimilarScenes(req, res);

    expect(res._getStatus()).toBe(200);
    expect(mockSceneQueryBuilder.getByRefs).toHaveBeenCalledWith({
      userId: testUser().id,
      refs: [{ id: "c13", instanceId: "inst-a" }],
      allowedInstanceIds: ["default"],
    });
    const body = res._getOkBody();
    expect(body.scenes.map((s) => s.id)).toEqual(["c13"]);
    expect(body.count).toBe(13);
    expect(body.page).toBe(2);
  });

  it("returns paginated similar scenes in score order", async () => {
    mockStashEntityService.getSimilarSceneCandidates.mockResolvedValue([
      { sceneId: "c1", instanceId: "inst-a", weight: 10, date: "2025-01-01" },
      { sceneId: "c2", instanceId: "inst-a", weight: 8, date: "2025-01-02" },
    ]);

    const scene1 = createMockScene({ id: "c1", instanceId: "inst-a" });
    const scene2 = createMockScene({ id: "c2", instanceId: "inst-a" });
    // A same-id scene on another instance is not the one the candidate named
    const other = createMockScene({ id: "c1", instanceId: "inst-b" });
    mockSceneQueryBuilder.getByRefs.mockResolvedValue([scene2, other, scene1]);

    const req = reqFor(findSimilarScenes, {
      params: { id: "101" },
      user: testUser(),
      query: { page: "1", instanceId: "inst-a" },
    });
    const res = resFor(findSimilarScenes);

    await findSimilarScenes(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getOkBody();
    // Should preserve score order (c1 first, higher weight)
    expect(body.scenes.map((s) => `${s.id}:${s.instanceId}`)).toEqual([
      "c1:inst-a",
      "c2:inst-a",
    ]);
    expect(body.count).toBe(2);
  });

  it.each([
    ["page", { id: "101" }, { page: "abc", instanceId: "inst-a" }],
    ["instanceId", { id: "101" }, { instanceId: "not an instance" }],
    ["instanceId", { id: "101" }, { page: "1" }],
    ["per_page", { id: "101" }, { per_page: "5", instanceId: "inst-a" }],
    ["id", { id: "s1" }, { instanceId: "inst-a" }],
  ])(
    "a bad %s answers 400 before the seed is resolved",
    async (path, params: { id: string }, query: Record<string, string>) => {
      const req = reqFor(findSimilarScenes, {
        params,
        user: testUser(),
        query,
      });
      const res = resFor(findSimilarScenes);

      await expect(findSimilarScenes(req, res)).rejects.toMatchObject({
        statusCode: 400,
        issues: [{ path }],
      });
      expect(mockResolveInstance).not.toHaveBeenCalled();
    }
  );

  it("a failure reaches the error handler: error", async () => {
    mockStashEntityService.getSimilarSceneCandidates.mockRejectedValue(
      new Error("DB error")
    );

    const req = reqFor(findSimilarScenes, {
      params: { id: "101" },
      user: testUser(),
      query: { page: "1", instanceId: "inst-a" },
    });
    const res = resFor(findSimilarScenes);

    await expect(findSimilarScenes(req, res)).rejects.toThrow("DB error");

    expect(res.json).not.toHaveBeenCalled();
  });
});

describe("getRecommendedScenes", () => {
  const noCriteria = {
    favoritedPerformers: 0,
    ratedPerformers: 0,
    favoritedStudios: 0,
    ratedStudios: 0,
    favoritedTags: 0,
    ratedTags: 0,
    favoritedScenes: 0,
    ratedScenes: 0,
  };
  const someCriteria = { ...noCriteria, favoritedPerformers: 1 };
  const ref = (id: string, instanceId = "default") => ({ id, instanceId });

  beforeEach(() => {
    mockRecommendationService.getRankedRefs.mockResolvedValue({
      refs: [],
      criteria: noCriteria,
    });
  });

  it("returns 401 when user is not authenticated", async () => {
    const req = reqFor(getRecommendedScenes, { query: { page: "1" } });
    const res = resFor(getRecommendedScenes);

    await libraryHandler(getRecommendedScenes)(req, res, vi.fn());

    expect(res._getStatus()).toBe(401);
    expect(mockRecommendationService.getRankedRefs).not.toHaveBeenCalled();
  });

  it("page 1 awaits ensureFresh with wait: true before reading the ranked list", async () => {
    const order: string[] = [];
    mockRankingService.ensureFresh.mockImplementationOnce(async () => {
      await Promise.resolve();
      order.push("ensureFresh");
    });
    mockRecommendationService.getRankedRefs.mockImplementationOnce(() => {
      order.push("getRankedRefs");
      return Promise.resolve({ refs: [], criteria: noCriteria });
    });
    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "1" },
    });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(200);
    expect(mockRankingService.ensureFresh).toHaveBeenCalledExactlyOnceWith(1, {
      wait: true,
    });
    expect(order).toEqual(["ensureFresh", "getRankedRefs"]);
    expect(mockPrisma.userEntityRanking.findFirst).not.toHaveBeenCalled();
  });

  it("pages above 1 call no ensureFresh", async () => {
    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "2" },
    });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(200);
    expect(mockRankingService.ensureFresh).not.toHaveBeenCalled();
    expect(mockRecommendationService.getRankedRefs).toHaveBeenCalledOnce();
  });

  it("a failed recompute on page 1 still answers with the stored rankings (logged)", async () => {
    // RankingComputeService.refresh logs the failure before rejecting
    mockRankingService.ensureFresh.mockRejectedValueOnce(
      new Error("recompute failed")
    );
    mockRecommendationService.getRankedRefs.mockResolvedValue({
      refs: [ref("s1")],
      criteria: someCriteria,
    });
    mockSceneQueryBuilder.getByRefs.mockResolvedValue([
      createMockScene({ id: "s1", instanceId: "default" }),
    ]);
    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "1" },
    });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(200);
    expect(res._getOkBody().scenes.map((s) => s.id)).toEqual(["s1"]);
  });

  it("returns empty result with message when user has no criteria", async () => {
    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "1" },
    });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getOkBody();
    expect(body.scenes).toEqual([]);
    expect(body.count).toBe(0);
    expect(body.message).toBe("No recommendations yet");
    expect(body.criteria).toEqual(noCriteria);
    expect(mockSceneQueryBuilder.getByRefs).not.toHaveBeenCalled();
  });

  it("says so when the user's criteria match no scene", async () => {
    mockRecommendationService.getRankedRefs.mockResolvedValue({
      refs: [],
      criteria: someCriteria,
    });
    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "1" },
    });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getOkBody();
    expect(body.scenes).toEqual([]);
    expect(body.message).toBe("No matching recommendations found");
    expect(body.criteria).toEqual(someCriteria);
  });

  it("passes req.allowedInstanceIds to the builder or service: the ranked list of the request's instances", async () => {
    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "1" },
      allowedInstanceIds: ["inst-a", "inst-b"],
    });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    expect(
      mockRecommendationService.getRankedRefs
    ).toHaveBeenCalledExactlyOnceWith(1, ["inst-a", "inst-b"]);
  });

  it("fetches one page by (id, instance) in ranked order and counts the whole list", async () => {
    mockRecommendationService.getRankedRefs.mockResolvedValue({
      refs: [
        ref("s1", "inst-a"),
        ref("s2", "inst-b"),
        ref("s1", "inst-b"),
        ref("s3", "inst-a"),
        ref("s4", "inst-a"),
      ],
      criteria: someCriteria,
    });
    // Page 2 of 2: s1@B then s3@A, returned by the builder the other way round
    const s3 = createMockScene({ id: "s3", instanceId: "inst-a" });
    const s1b = createMockScene({ id: "s1", instanceId: "inst-b" });
    mockSceneQueryBuilder.getByRefs.mockResolvedValue([s3, s1b]);
    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "2", per_page: "2" },
      allowedInstanceIds: ["default"],
    });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(200);
    expect(mockSceneQueryBuilder.getByRefs).toHaveBeenCalledExactlyOnceWith({
      userId: 1,
      refs: [ref("s1", "inst-b"), ref("s3", "inst-a")],
      allowedInstanceIds: ["default"],
    });
    const body = res._getOkBody();
    expect(body.scenes.map((s) => `${s.id}:${s.instanceId}`)).toEqual([
      "s1:inst-b",
      "s3:inst-a",
    ]);
    expect(body.count).toBe(5);
    expect(body.page).toBe(2);
    expect(body.perPage).toBe(2);
  });

  it("leaves out a ranked scene the page fetch no longer returns", async () => {
    mockRecommendationService.getRankedRefs.mockResolvedValue({
      refs: [ref("s1"), ref("s2")],
      criteria: someCriteria,
    });
    mockSceneQueryBuilder.getByRefs.mockResolvedValue([
      createMockScene({ id: "s2", instanceId: "default" }),
    ]);
    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "1" },
    });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    const body = res._getOkBody();
    expect(body.scenes.map((s) => s.id)).toEqual(["s2"]);
    expect(body.count).toBe(2);
  });

  it("echoes per_page 1000 as 250 and asks for at most 250 scenes", async () => {
    mockRecommendationService.getRankedRefs.mockResolvedValue({
      refs: Array.from({ length: 300 }, (_, i) => ref(String(i + 1))),
      criteria: someCriteria,
    });
    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "1", per_page: "1000" },
    });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getOkBody();
    expect(body.perPage).toBe(250);
    expect(body.count).toBe(300);
    expect(
      must(mockSceneQueryBuilder.getByRefs.mock.calls[0])[0].refs
    ).toHaveLength(250);
  });

  it.each([
    ["page", { page: "abc" }],
    ["per_page", { per_page: "many" }],
    ["sort", { sort: "title" }],
  ])(
    "a bad %s answers 400 before any read",
    async (path, query: Record<string, string>) => {
      const req = reqFor(getRecommendedScenes, { user: testUser(), query });
      const res = resFor(getRecommendedScenes);

      await expect(getRecommendedScenes(req, res)).rejects.toMatchObject({
        statusCode: 400,
        issues: [{ path }],
      });
      expect(mockRecommendationService.getRankedRefs).not.toHaveBeenCalled();
      expect(mockRankingService.ensureFresh).not.toHaveBeenCalled();
    }
  );

  it("a failure reaches the error handler: unexpected error", async () => {
    mockRecommendationService.getRankedRefs.mockRejectedValue(
      new Error("DB down")
    );

    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "1" },
    });
    const res = resFor(getRecommendedScenes);

    await expect(getRecommendedScenes(req, res)).rejects.toThrow("DB down");

    expect(res.json).not.toHaveBeenCalled();
  });
});
