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
  mergeScenesWithUserData,
} from "../../../controllers/library/scenes.js";
import prisma from "../../../prisma/singleton.js";
import { resolveAccessibleInstanceId } from "../../../services/EntityAccessService.js";
import rankingComputeService from "../../../services/RankingComputeService.js";
import type * as recommendationScoringModule from "../../../services/RecommendationScoringService.js";
import {
  hasAnyCriteria,
  scoreScoringDataByPreferences,
} from "../../../services/RecommendationScoringService.js";
import { sceneQueryBuilder } from "../../../services/SceneQueryBuilder.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import { isSceneStreamable } from "../../../utils/codecDetection.js";
import { logger } from "../../../utils/logger.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../../helpers/controllerTestUtils.js";
import { objectContaining } from "../../helpers/matchers.js";
import {
  createMockPerformer,
  createMockScene,
  createMockStudio,
  createMockTag,
} from "../../helpers/mockDataGenerators.js";
import { must } from "../../helpers/must.js";
import { partialRow } from "../../helpers/prismaMock.js";

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
    getScenesForScoring: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    getExcludedIds: vi.fn().mockResolvedValue(new Set()),
    getExclusionData: vi.fn().mockResolvedValue({
      globalIds: new Set(),
      scopedKeys: new Set(),
    }),
    isExcluded: vi.fn().mockReturnValue(false),
  },
}));

vi.mock("../../../services/SceneQueryBuilder.js", () => ({
  sceneQueryBuilder: {
    execute: vi.fn().mockResolvedValue({ scenes: [], total: 0 }),
    getByIds: vi.fn().mockResolvedValue({ scenes: [], total: 0 }),
    getByRefs: vi.fn().mockResolvedValue({ scenes: [], total: 0 }),
  },
}));

vi.mock("../../../services/EntityAccessService.js", () => ({
  resolveAccessibleInstanceId: vi.fn().mockResolvedValue("inst-a"),
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("../../../services/RankingComputeService.js", () => ({
  default: {
    ensureFresh: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock(
  "../../../services/RecommendationScoringService.js",
  async (importOriginal) => {
    const actual = await importOriginal<typeof recommendationScoringModule>();
    return {
      diversifyByScoreTier: actual.diversifyByScoreTier,
      buildDerivedWeightsFromScoringData: vi.fn().mockReturnValue({
        derivedPerformerWeights: new Map(),
        derivedStudioWeights: new Map(),
        derivedTagWeights: new Map(),
      }),
      buildImplicitWeightsFromRankings: vi.fn().mockReturnValue({
        implicitPerformerWeights: new Map(),
        implicitStudioWeights: new Map(),
        implicitTagWeights: new Map(),
      }),
      scoreScoringDataByPreferences: vi.fn().mockReturnValue(0),
      countUserCriteria: vi.fn().mockReturnValue({
        favoritePerformers: 0,
        ratedPerformers: 0,
        favoriteStudios: 0,
        ratedStudios: 0,
        favoriteTags: 0,
        ratedTags: 0,
        ratedScenes: 0,
        favoriteScenes: 0,
      }),
      hasAnyCriteria: vi.fn().mockReturnValue(false),
    };
  }
);

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
const mockHasAnyCriteria = vi.mocked(hasAnyCriteria);
const mockScore = vi.mocked(scoreScoringDataByPreferences);
const mockLogger = vi.mocked(logger, true);
const mockRankingService = vi.mocked(rankingComputeService, true);

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.watchHistory.findMany.mockResolvedValue([]);
  mockPrisma.sceneRating.findMany.mockResolvedValue([]);
  mockPrisma.performerRating.findMany.mockResolvedValue([]);
  mockPrisma.studioRating.findMany.mockResolvedValue([]);
  mockPrisma.tagRating.findMany.mockResolvedValue([]);
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

// ===== 2. mergeScenesWithUserData =====

describe("mergeScenesWithUserData", () => {
  it("merges watch history into scenes", async () => {
    const scenes = [createMockScene({ id: "s1", instanceId: "inst1" })];
    mockPrisma.watchHistory.findMany.mockResolvedValue([
      partialRow({
        id: 1,
        userId: 1,
        sceneId: "s1",
        instanceId: "inst1",
        oCount: 3,
        playCount: 10,
        playDuration: 5000,
        resumeTime: 120,
        playHistory: JSON.stringify(["2025-06-01T00:00:00Z"]),
        oHistory: JSON.stringify(["2025-05-01T00:00:00Z"]),
        lastPlayedAt: new Date("2025-06-01"),
      }),
    ]);
    mockPrisma.sceneRating.findMany.mockResolvedValue([]);
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.studioRating.findMany.mockResolvedValue([]);
    mockPrisma.tagRating.findMany.mockResolvedValue([]);

    const result = await mergeScenesWithUserData(scenes, 1);
    expect(result[0]).toMatchObject({
      o_counter: 3,
      play_count: 10,
      play_duration: 5000,
      resume_time: 120,
    });
  });

  it("reads histories stored as JSON-encoded strings", async () => {
    const scenes = [createMockScene({ id: "s1", instanceId: "inst1" })];
    mockPrisma.watchHistory.findMany.mockResolvedValue([
      partialRow({
        sceneId: "s1",
        instanceId: "inst1",
        playHistory: JSON.stringify([
          "2025-06-01T00:00:00Z",
          "2025-06-02T00:00:00Z",
        ]),
        oHistory: JSON.stringify(["2025-05-01T00:00:00Z"]),
      }),
    ]);

    const result = await mergeScenesWithUserData(scenes, 1);
    expect(result[0]).toMatchObject({
      play_history: ["2025-06-01T00:00:00Z", "2025-06-02T00:00:00Z"],
      o_history: ["2025-05-01T00:00:00Z"],
      last_played_at: "2025-06-02T00:00:00Z",
      last_o_at: "2025-05-01T00:00:00Z",
    });
  });

  it("reads a malformed history as an empty list", async () => {
    const scenes = [createMockScene({ id: "s1", instanceId: "inst1" })];
    mockPrisma.watchHistory.findMany.mockResolvedValue([
      partialRow({
        sceneId: "s1",
        instanceId: "inst1",
        oCount: 1,
        playHistory: "not json",
        oHistory: "not json",
      }),
    ]);

    const result = await mergeScenesWithUserData(scenes, 1);
    expect(result[0]).toMatchObject({
      o_counter: 1,
      play_history: [],
      o_history: [],
      last_played_at: null,
      last_o_at: null,
    });
  });

  it("merges scene ratings (rating100 and favorite)", async () => {
    const scenes = [createMockScene({ id: "s1", instanceId: "inst1" })];
    mockPrisma.watchHistory.findMany.mockResolvedValue([]);
    mockPrisma.sceneRating.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        sceneId: "s1",
        instanceId: "inst1",
        rating: 85,
        favorite: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.studioRating.findMany.mockResolvedValue([]);
    mockPrisma.tagRating.findMany.mockResolvedValue([]);

    const result = await mergeScenesWithUserData(scenes, 1);
    expect(result[0]).toMatchObject({
      rating: 85,
      rating100: 85,
      favorite: true,
    });
  });

  it("updates nested performer favorites", async () => {
    const p1 = createMockPerformer({ id: "p1", instanceId: "inst1" });
    const p2 = createMockPerformer({ id: "p2", instanceId: "inst1" });
    const scenes = [
      createMockScene({ id: "s1", instanceId: "inst1", performers: [p1, p2] }),
    ];
    mockPrisma.watchHistory.findMany.mockResolvedValue([]);
    mockPrisma.sceneRating.findMany.mockResolvedValue([]);
    mockPrisma.performerRating.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        performerId: "p1",
        instanceId: "inst1",
        rating: null,
        favorite: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.studioRating.findMany.mockResolvedValue([]);
    mockPrisma.tagRating.findMany.mockResolvedValue([]);

    const result = await mergeScenesWithUserData(scenes, 1);
    expect(must(must(result[0]).performers[0]).favorite).toBe(true);
    expect(must(must(result[0]).performers[1]).favorite).toBe(false);
  });

  it("updates nested studio favorite", async () => {
    const studio = createMockStudio({ id: "st1", instanceId: "inst1" });
    const scenes = [createMockScene({ id: "s1", instanceId: "inst1", studio })];
    mockPrisma.watchHistory.findMany.mockResolvedValue([]);
    mockPrisma.sceneRating.findMany.mockResolvedValue([]);
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.studioRating.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        studioId: "st1",
        instanceId: "inst1",
        rating: null,
        favorite: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.tagRating.findMany.mockResolvedValue([]);

    const result = await mergeScenesWithUserData(scenes, 1);
    expect(must(must(result[0]).studio).favorite).toBe(true);
  });

  it("updates nested tag favorites", async () => {
    const t1 = createMockTag({ id: "t1", instanceId: "inst1" });
    const scenes = [
      createMockScene({ id: "s1", instanceId: "inst1", tags: [t1] }),
    ];
    mockPrisma.watchHistory.findMany.mockResolvedValue([]);
    mockPrisma.sceneRating.findMany.mockResolvedValue([]);
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.studioRating.findMany.mockResolvedValue([]);
    mockPrisma.tagRating.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        tagId: "t1",
        instanceId: "inst1",
        rating: null,
        favorite: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await mergeScenesWithUserData(scenes, 1);
    expect(must(must(result[0]).tags[0]).favorite).toBe(true);
  });

  it("uses targeted query for small scene sets (< 100)", async () => {
    const scenes = [createMockScene({ id: "s1" })];
    mockPrisma.watchHistory.findMany.mockResolvedValue([]);
    mockPrisma.sceneRating.findMany.mockResolvedValue([]);
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.studioRating.findMany.mockResolvedValue([]);
    mockPrisma.tagRating.findMany.mockResolvedValue([]);

    await mergeScenesWithUserData(scenes, 1);

    // Watch history and scene ratings should filter by sceneId
    expect(mockPrisma.watchHistory.findMany).toHaveBeenCalledWith({
      where: { userId: 1, sceneId: { in: ["s1"] } },
    });
    expect(mockPrisma.sceneRating.findMany).toHaveBeenCalledWith({
      where: { userId: 1, sceneId: { in: ["s1"] } },
    });
  });
});

// ===== 3. HTTP handlers =====

describe("findScenes", () => {
  it("returns 401 when user is not authenticated", async () => {
    const req = reqFor(findScenes, { body: { filter: {}, scene_filter: {} } });
    const res = resFor(findScenes);

    await findScenes(req, res);

    expect(res._getStatus()).toBe(401);
    expect(res._getBody()).toEqual({ error: "Unauthorized" });
  });

  it("returns scenes from the SQL query builder path", async () => {
    const scene = createMockScene({ id: "s1", title: "Test" });
    mockSceneQueryBuilder.execute.mockResolvedValue({
      scenes: [scene],
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

  it("findScenes logs its timings at DEBUG, not INFO", async () => {
    mockSceneQueryBuilder.execute.mockResolvedValue({
      scenes: [createMockScene({ id: "s1" })],
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
      scenes: [createMockScene({ id: "s1" }), createMockScene({ id: "s2" })],
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
      scenes: [createMockScene({ id: "s1" })],
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
      scenes: [scene],
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
      scenes: [s1, s2],
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

  it("returns 500 on unexpected error", async () => {
    mockSceneQueryBuilder.execute.mockRejectedValue(new Error("DB down"));

    const req = reqFor(findScenes, {
      body: { filter: {}, scene_filter: {} },
      user: testUser(),
    });
    const res = resFor(findScenes);

    await findScenes(req, res);

    expect(res._getStatus()).toBe(500);
    expect(res._getBody()).toMatchObject({ error: "Failed to find scenes" });
  });

  describe("with PEEK_FILTER_POLICY=drop", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("an unknown key is logged once and the request succeeds", async () => {
      vi.stubEnv("PEEK_FILTER_POLICY", "drop");
      mockSceneQueryBuilder.execute.mockResolvedValue({
        scenes: [createMockScene({ id: "s1" })],
        total: 1,
      });
      const body = malformed({
        filter: { page: 1 },
        scene_filter: { b7_not_a_field: { value: 1 } },
      });

      for (const attempt of [1, 2]) {
        const req = reqFor(findScenes, { body, user: testUser() });
        const res = resFor(findScenes);
        await findScenes(req, res);
        expect(res._getStatus(), `request ${attempt}`).toBe(200);
        expect(res._getOkBody().findScenes.count).toBe(1);
      }

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Unknown filter input ignored",
        objectContaining({
          route: "POST /library/scenes",
          path: "scene_filter.b7_not_a_field",
        })
      );
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
        scenes: [createMockScene({ id: "s1" })],
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
    mockSceneQueryBuilder.getByRefs.mockResolvedValue({ scenes: [], total: 0 });
  });

  it("returns 401 when user is not authenticated", async () => {
    const req = reqFor(findSimilarScenes, {
      params: { id: "101" },
      query: { page: "1" },
    });
    const res = resFor(findSimilarScenes);

    await findSimilarScenes(req, res);

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
      query: { page: "1" },
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
    mockSceneQueryBuilder.getByRefs.mockResolvedValue({
      scenes: [scene13],
      total: 1,
    });

    const req = reqFor(findSimilarScenes, {
      params: { id: "101" },
      user: testUser(),
      query: { page: "2", instanceId: "inst-a" },
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
    mockSceneQueryBuilder.getByRefs.mockResolvedValue({
      scenes: [scene2, other, scene1], // intentionally out of order
      total: 3,
    });

    const req = reqFor(findSimilarScenes, {
      params: { id: "101" },
      user: testUser(),
      query: { page: "1" },
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
    ["page", { id: "101" }, { page: "abc" }],
    ["instanceId", { id: "101" }, { instanceId: "not an instance" }],
    ["per_page", { id: "101" }, { per_page: "5" }],
    ["id", { id: "s1" }, {}],
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

  it("returns 500 on error", async () => {
    mockStashEntityService.getSimilarSceneCandidates.mockRejectedValue(
      new Error("DB error")
    );

    const req = reqFor(findSimilarScenes, {
      params: { id: "101" },
      user: testUser(),
      query: { page: "1" },
    });
    const res = resFor(findSimilarScenes);

    await findSimilarScenes(req, res);

    expect(res._getStatus()).toBe(500);
  });
});

describe("getRecommendedScenes", () => {
  it("returns 401 when user is not authenticated", async () => {
    const req = reqFor(getRecommendedScenes, { query: { page: "1" } });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(401);
  });

  it("starts a ranking refresh without waiting and reads no ranking time itself", async () => {
    mockHasAnyCriteria.mockReturnValue(false);
    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "1" },
    });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(200);
    expect(mockRankingService.ensureFresh).toHaveBeenCalledExactlyOnceWith(1);
    expect(mockPrisma.userEntityRanking.findFirst).not.toHaveBeenCalled();
  });

  it("returns empty result with message when user has no criteria", async () => {
    mockHasAnyCriteria.mockReturnValue(false);

    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "1" },
    });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getOkBody();
    expect(body.scenes).toEqual([]);
    expect(body.message).toBe("No recommendations yet");
  });

  describe("play history", () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const scoringRow = (id: string) => ({
      id,
      instanceId: "default",
      studioId: null,
      performerIds: [],
      tagIds: [],
      oCounter: 0,
      date: null,
    });
    afterEach(() => {
      mockHasAnyCriteria.mockReturnValue(false);
      mockScore.mockReturnValue(0);
    });

    // Every scene matches the user's criteria with the same base score, so
    // the watch status alone decides which are recommended
    const recommend = async (ids: string[]) => {
      mockHasAnyCriteria.mockReturnValue(true);
      mockScore.mockReturnValue(10);
      mockStashEntityService.getScenesForScoring.mockResolvedValueOnce(
        ids.map(scoringRow)
      );
      const req = reqFor(getRecommendedScenes, {
        user: testUser(),
        query: { page: "1" },
      });
      const res = resFor(getRecommendedScenes);
      await getRecommendedScenes(req, res);
      return res;
    };
    const requestedIds = () =>
      must(mockSceneQueryBuilder.getByIds.mock.calls[0])[0].ids;

    it("reads a play history stored as a JSON-encoded string", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        // Played an hour ago: marked down below zero, so left out
        partialRow({
          sceneId: "recent",
          playCount: 1,
          playHistory: JSON.stringify([
            new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          ]),
        }),
        // Played a month ago: marked up
        partialRow({
          sceneId: "old",
          playCount: 1,
          playHistory: JSON.stringify([
            new Date(Date.now() - 30 * DAY_MS).toISOString(),
          ]),
        }),
      ]);

      const res = await recommend(["recent", "old", "unwatched"]);

      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().count).toBe(2);
      expect([...requestedIds()].sort()).toEqual(["old", "unwatched"]);
    });

    it("reads a malformed play history as an empty list", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        partialRow({
          sceneId: "malformed",
          playCount: 1,
          playHistory: "not json",
        }),
      ]);

      const res = await recommend(["malformed", "unwatched"]);

      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().count).toBe(2);
      expect([...requestedIds()].sort()).toEqual(["malformed", "unwatched"]);
    });
  });

  describe("score tiers", () => {
    afterEach(() => {
      mockHasAnyCriteria.mockReturnValue(false);
      mockScore.mockReturnValue(0);
    });

    it("answers 200 when one scene is the only match", async () => {
      const actual = await vi.importActual<typeof recommendationScoringModule>(
        "../../../services/RecommendationScoringService.js"
      );
      mockScore.mockImplementation(actual.scoreScoringDataByPreferences);
      mockHasAnyCriteria.mockReturnValue(true);
      mockPrisma.performerRating.findMany.mockResolvedValue([
        partialRow({
          performerId: "p1",
          instanceId: "default",
          favorite: true,
          rating: null,
        }),
      ]);
      // p1 is in one scene only, so one scene scores: the score range is 0
      mockStashEntityService.getScenesForScoring.mockResolvedValueOnce([
        {
          id: "s1",
          instanceId: "default",
          studioId: null,
          performerIds: ["p1"],
          tagIds: [],
          oCounter: 0,
          date: null,
        },
        {
          id: "s2",
          instanceId: "default",
          studioId: null,
          performerIds: ["p2"],
          tagIds: [],
          oCounter: 0,
          date: null,
        },
      ]);
      mockSceneQueryBuilder.getByIds.mockResolvedValueOnce({
        scenes: [createMockScene({ id: "s1" })],
        total: 1,
      });

      const req = reqFor(getRecommendedScenes, {
        user: testUser(),
        query: { page: "1" },
      });
      const res = resFor(getRecommendedScenes);
      await getRecommendedScenes(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getOkBody();
      expect(body.count).toBe(1);
      expect(body.scenes.map((s) => s.id)).toEqual(["s1"]);
    });
  });

  it("echoes per_page 1000 as 250 and asks for at most 250 scenes", async () => {
    mockHasAnyCriteria.mockReturnValue(true);
    mockScore.mockReturnValue(10);
    mockStashEntityService.getScenesForScoring.mockResolvedValueOnce(
      Array.from({ length: 300 }, (_, i) => ({
        id: String(i + 1),
        instanceId: "default",
        studioId: null,
        performerIds: [],
        tagIds: [],
        oCounter: 0,
        date: null,
      }))
    );

    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "1", per_page: "1000" },
    });
    const res = resFor(getRecommendedScenes);
    try {
      await getRecommendedScenes(req, res);
    } finally {
      mockHasAnyCriteria.mockReturnValue(false);
      mockScore.mockReturnValue(0);
    }

    expect(res._getStatus()).toBe(200);
    const body = res._getOkBody();
    expect(body.perPage).toBe(250);
    expect(body.count).toBe(300);
    expect(
      must(mockSceneQueryBuilder.getByIds.mock.calls[0])[0].ids
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
      expect(mockPrisma.performerRating.findMany).not.toHaveBeenCalled();
    }
  );

  it("returns 500 on unexpected error", async () => {
    // Force an error by making prisma throw
    mockPrisma.performerRating.findMany.mockRejectedValue(new Error("DB down"));

    const req = reqFor(getRecommendedScenes, {
      user: testUser(),
      query: { page: "1" },
    });
    const res = resFor(getRecommendedScenes);

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(500);
    expect(res._getBody()).toMatchObject({
      error: "Failed to get recommended scenes",
    });
  });
});
