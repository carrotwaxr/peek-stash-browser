import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockReq, mockRes } from "../../helpers/controllerTestUtils.js";
import {
  createMockScene,
  createMockPerformer,
  createMockTag,
  createMockStudio,
} from "../../helpers/mockDataGenerators.js";

// ---------------------------------------------------------------------------
// Mocks — must precede imports of the module under test
// ---------------------------------------------------------------------------

vi.mock("../../../prisma/singleton.js", () => ({
  default: {
    watchHistory: { findMany: vi.fn().mockResolvedValue([]) },
    sceneRating: { findMany: vi.fn().mockResolvedValue([]) },
    performerRating: { findMany: vi.fn().mockResolvedValue([]) },
    studioRating: { findMany: vi.fn().mockResolvedValue([]) },
    tagRating: { findMany: vi.fn().mockResolvedValue([]) },
    userEntityRanking: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("../../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getAllScenes: vi.fn().mockResolvedValue([]),
    getAllPerformers: vi.fn().mockResolvedValue([]),
    generateSceneStreams: vi.fn().mockReturnValue([]),
    getSimilarSceneCandidates: vi.fn().mockResolvedValue([]),
    getScenesPaginated: vi.fn().mockResolvedValue({ scenes: [], total: 0 }),
    getScenesForScoring: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    get: vi.fn(),
    getDefaultConfig: vi.fn().mockReturnValue({ id: "default" }),
  },
}));

vi.mock("../../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    filterExcluded: vi.fn().mockImplementation((items: unknown[]) => items),
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
  },
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("../../../services/RankingComputeService.js", () => ({
  default: {
    getRankings: vi.fn(),
    getLatestComputation: vi.fn(),
    recomputeAllRankings: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../services/RecommendationScoringService.js", () => ({
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
}));

vi.mock("../../../utils/codecDetection.js", () => ({
  isSceneStreamable: vi
    .fn()
    .mockReturnValue({ isStreamable: true, reasons: [] }),
}));

vi.mock("../../../utils/hierarchyUtils.js", () => ({
  expandTagIds: vi
    .fn()
    .mockImplementation((ids: string[]) => Promise.resolve(ids)),
  expandStudioIds: vi
    .fn()
    .mockImplementation((ids: string[]) => Promise.resolve(ids)),
}));

vi.mock("../../../utils/sqlFilterBuilders.js", () => ({
  parseCompositeFilterValues: vi
    .fn()
    .mockImplementation((ids: string[]) => ({
      parsed: ids.map((id: string) => ({ id, instanceId: undefined })),
    })),
}));

vi.mock("../../../utils/entityInstanceId.js", () => ({
  getEntityInstanceId: vi.fn().mockResolvedValue("default"),
}));

vi.mock("../../../utils/seededRandom.js", () => ({
  parseRandomSort: vi
    .fn()
    .mockImplementation((field: string, _userId: number) => ({
      sortField: field,
      randomSeed: undefined,
    })),
  SeededRandom: vi.fn().mockImplementation(() => ({
    nextInt: vi.fn().mockReturnValue(0),
  })),
  generateDailySeed: vi.fn().mockReturnValue(42),
}));

vi.mock("../../../utils/stashUrl.js", () => ({
  buildStashEntityUrl: vi
    .fn()
    .mockImplementation(
      (_type: string, id: string) => `http://stash/scenes/${id}`
    ),
}));

vi.mock("../../../graphql/generated/graphql.js", () => ({
  OrientationEnum: {
    Landscape: "LANDSCAPE",
    Portrait: "PORTRAIT",
    Square: "SQUARE",
  },
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@peek/shared-types/instanceAwareId.js", () => ({
  coerceEntityRefs: vi
    .fn()
    .mockImplementation((ids: string[]) => ids),
}));

// ---------------------------------------------------------------------------
// Imports — after all vi.mock() calls
// ---------------------------------------------------------------------------

import {
  addStreamabilityInfo,
  applyQuickSceneFilters,
  applyExpensiveSceneFilters,
  sortScenes,
  mergeScenesWithUserData,
  findScenes,
  updateScene,
  findSimilarScenes,
  getRecommendedScenes,
} from "../../../controllers/library/scenes.js";
import prisma from "../../../prisma/singleton.js";
import { isSceneStreamable } from "../../../utils/codecDetection.js";
import { sceneQueryBuilder } from "../../../services/SceneQueryBuilder.js";
import { stashInstanceManager } from "../../../services/StashInstanceManager.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import { getEntityInstanceId } from "../../../utils/entityInstanceId.js";
import {
  hasAnyCriteria,
  countUserCriteria,
} from "../../../services/RecommendationScoringService.js";

const mockPrisma = vi.mocked(prisma);
const mockIsSceneStreamable = vi.mocked(isSceneStreamable);
const mockSceneQueryBuilder = vi.mocked(sceneQueryBuilder);
const mockStashInstanceManager = vi.mocked(stashInstanceManager);
const mockGetEntityInstanceId = vi.mocked(getEntityInstanceId);
const mockStashEntityService = vi.mocked(stashEntityService);
const mockHasAnyCriteria = vi.mocked(hasAnyCriteria);
const mockCountUserCriteria = vi.mocked(countUserCriteria);

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===== 1. addStreamabilityInfo =====

describe("addStreamabilityInfo", () => {
  it("returns empty array when given empty scenes", () => {
    expect(addStreamabilityInfo([])).toEqual([]);
  });

  it("attaches isStreamable, streamabilityReasons, and stashUrl to each scene", () => {
    mockIsSceneStreamable.mockReturnValue({
      isStreamable: true,
      reasons: [],
    });

    const scenes = [createMockScene({ id: "s1" })];
    const result = addStreamabilityInfo(scenes);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      isStreamable: true,
      streamabilityReasons: [],
      stashUrl: "http://stash/scenes/s1",
    });
  });

  it("propagates non-streamable info with reasons", () => {
    mockIsSceneStreamable.mockReturnValue({
      isStreamable: false,
      reasons: ["HEVC codec not supported"],
    });

    const scenes = [createMockScene({ id: "s2" })];
    const result = addStreamabilityInfo(scenes);

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

    const scenes = [
      createMockScene({ id: "a" }),
      createMockScene({ id: "b" }),
    ];
    const result = addStreamabilityInfo(scenes);

    expect(result[0]!.isStreamable).toBe(true);
    expect(result[1]!.isStreamable).toBe(false);
  });
});

// ===== 2. applyQuickSceneFilters =====

describe("applyQuickSceneFilters", () => {
  describe("null/undefined filter passthrough", () => {
    it("returns all scenes when filters is null", async () => {
      const scenes = [createMockScene({ id: "1" })];
      expect(await applyQuickSceneFilters(scenes, null)).toEqual(scenes);
    });

    it("returns all scenes when filters is undefined", async () => {
      const scenes = [createMockScene({ id: "1" })];
      expect(await applyQuickSceneFilters(scenes, undefined)).toEqual(scenes);
    });
  });

  describe("ids filter", () => {
    it("filters scenes to matching ids (raw array format)", async () => {
      const scenes = [
        createMockScene({ id: "1" }),
        createMockScene({ id: "2" }),
        createMockScene({ id: "3" }),
      ];
      // The ids filter in applyQuickSceneFilters checks Array.isArray(filters.ids),
      // so it must be passed as a raw array, not EntityRefFilter shape
      const result = await applyQuickSceneFilters(scenes, {
        ids: ["1", "3"] as any,
      });
      expect(result.map((s) => s.id)).toEqual(["1", "3"]);
    });

    it("skips ids filter when passed as EntityRefFilter shape (not an array)", async () => {
      const scenes = [
        createMockScene({ id: "1" }),
        createMockScene({ id: "2" }),
      ];
      // EntityRefFilter { value, modifier } is NOT an array, so the filter is skipped
      const result = await applyQuickSceneFilters(scenes, {
        ids: { value: ["1"] as any, modifier: "INCLUDES" },
      });
      expect(result).toHaveLength(2); // All scenes returned — filter not applied
    });
  });

  describe("performers filter", () => {
    const p1 = createMockPerformer({ id: "p1" });
    const p2 = createMockPerformer({ id: "p2" });
    const p3 = createMockPerformer({ id: "p3" });
    const scenes = [
      createMockScene({ id: "s1", performers: [p1, p2] }),
      createMockScene({ id: "s2", performers: [p2, p3] }),
      createMockScene({ id: "s3", performers: [p3] }),
    ];

    it("INCLUDES: returns scenes with any matching performer", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        performers: { value: ["p1"] as any, modifier: "INCLUDES" },
      });
      expect(result.map((s) => s.id)).toEqual(["s1"]);
    });

    it("INCLUDES_ALL: returns only scenes containing all listed performers", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        performers: { value: ["p2", "p3"] as any, modifier: "INCLUDES_ALL" },
      });
      expect(result.map((s) => s.id)).toEqual(["s2"]);
    });

    it("EXCLUDES: returns scenes without any listed performers", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        performers: { value: ["p1", "p2"] as any, modifier: "EXCLUDES" },
      });
      expect(result.map((s) => s.id)).toEqual(["s3"]);
    });
  });

  describe("tags filter", () => {
    const t1 = createMockTag({ id: "t1" });
    const t2 = createMockTag({ id: "t2" });
    const t3 = createMockTag({ id: "t3" });

    const scenes = [
      createMockScene({ id: "s1", tags: [t1, t2] }),
      createMockScene({ id: "s2", tags: [t2, t3] }),
      createMockScene({ id: "s3", tags: [t3] }),
    ];

    it("INCLUDES: returns scenes with any matching tag", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        tags: { value: ["t1"] as any, modifier: "INCLUDES" },
      });
      expect(result.map((s) => s.id)).toEqual(["s1"]);
    });

    it("INCLUDES_ALL: returns scenes with all matching tags", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        tags: { value: ["t2", "t3"] as any, modifier: "INCLUDES_ALL" },
      });
      expect(result.map((s) => s.id)).toEqual(["s2"]);
    });

    it("EXCLUDES: returns scenes without any listed tags", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        tags: { value: ["t1", "t2"] as any, modifier: "EXCLUDES" },
      });
      expect(result.map((s) => s.id)).toEqual(["s3"]);
    });
  });

  describe("studios filter", () => {
    const studio1 = createMockStudio({ id: "st1" });
    const studio2 = createMockStudio({ id: "st2" });

    const scenes = [
      createMockScene({ id: "s1", studio: studio1 }),
      createMockScene({ id: "s2", studio: studio2 }),
      createMockScene({ id: "s3", studio: null }),
    ];

    it("INCLUDES: returns scenes with matching studio", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        studios: { value: ["st1"] as any, modifier: "INCLUDES" },
      });
      expect(result.map((s) => s.id)).toEqual(["s1"]);
    });

    it("EXCLUDES: returns scenes without matching studio (null studio passes)", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        studios: { value: ["st1"] as any, modifier: "EXCLUDES" },
      });
      expect(result.map((s) => s.id)).toEqual(["s2", "s3"]);
    });
  });

  describe("groups filter", () => {
    const scenes = [
      createMockScene({
        id: "s1",
        groups: [{ id: "g1", instanceId: "default", name: "G1", front_image_path: null, back_image_path: null, scene_index: 0 }] as any,
      }),
      createMockScene({
        id: "s2",
        groups: [
          { id: "g1", instanceId: "default", name: "G1", front_image_path: null, back_image_path: null, scene_index: 0 },
          { id: "g2", instanceId: "default", name: "G2", front_image_path: null, back_image_path: null, scene_index: 1 },
        ] as any,
      }),
      createMockScene({ id: "s3", groups: [] }),
    ];

    it("INCLUDES: returns scenes in any listed group", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        groups: { value: ["g2"] as any, modifier: "INCLUDES" },
      });
      expect(result.map((s) => s.id)).toEqual(["s2"]);
    });

    it("INCLUDES_ALL: returns scenes in all listed groups", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        groups: { value: ["g1", "g2"] as any, modifier: "INCLUDES_ALL" },
      });
      expect(result.map((s) => s.id)).toEqual(["s2"]);
    });

    it("EXCLUDES: returns scenes not in any listed group", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        groups: { value: ["g1"] as any, modifier: "EXCLUDES" },
      });
      expect(result.map((s) => s.id)).toEqual(["s3"]);
    });
  });

  describe("bitrate filter", () => {
    const scenes = [
      createMockScene({
        id: "low",
        files: [{ path: "/a.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 1_000_000, size: 100 }],
      }),
      createMockScene({
        id: "mid",
        files: [{ path: "/b.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
      createMockScene({
        id: "high",
        files: [{ path: "/c.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 10_000_000, size: 100 }],
      }),
    ];

    it("GREATER_THAN", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        bitrate: { modifier: "GREATER_THAN", value: 5_000_000 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["high"]);
    });

    it("LESS_THAN", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        bitrate: { modifier: "LESS_THAN", value: 5_000_000 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["low"]);
    });

    it("EQUALS", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        bitrate: { modifier: "EQUALS", value: 5_000_000 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["mid"]);
    });

    it("BETWEEN", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        bitrate: { modifier: "BETWEEN", value: 2_000_000, value2: 8_000_000 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["mid"]);
    });
  });

  describe("duration filter", () => {
    const scenes = [
      createMockScene({
        id: "short",
        files: [{ path: "/a.mp4", duration: 60, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
      createMockScene({
        id: "long",
        files: [{ path: "/b.mp4", duration: 3600, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
    ];

    it("GREATER_THAN filters by duration", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        duration: { modifier: "GREATER_THAN", value: 600 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["long"]);
    });
  });

  describe("created_at date filter", () => {
    const scenes = [
      createMockScene({ id: "old", created_at: "2024-01-01T00:00:00Z" }),
      createMockScene({ id: "new", created_at: "2025-06-15T00:00:00Z" }),
    ];

    it("GREATER_THAN filters by date", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        created_at: { modifier: "GREATER_THAN", value: "2025-01-01T00:00:00Z" },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["new"]);
    });

    it("BETWEEN filters by date range", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        created_at: {
          modifier: "BETWEEN",
          value: "2023-01-01T00:00:00Z",
          value2: "2024-06-01T00:00:00Z",
        },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["old"]);
    });
  });

  describe("performer_count filter", () => {
    const scenes = [
      createMockScene({ id: "solo", performers: [createMockPerformer({ id: "p1" })] }),
      createMockScene({ id: "trio", performers: [createMockPerformer({ id: "p1" }), createMockPerformer({ id: "p2" }), createMockPerformer({ id: "p3" })] }),
    ];

    it("EQUALS filters by exact performer count", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        performer_count: { modifier: "EQUALS", value: 3 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["trio"]);
    });
  });

  describe("framerate filter", () => {
    const scenes = [
      createMockScene({
        id: "30fps",
        files: [{ path: "/a.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
      createMockScene({
        id: "60fps",
        files: [{ path: "/b.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 60, bit_rate: 5_000_000, size: 100 }],
      }),
    ];

    it("GREATER_THAN filters by framerate", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        framerate: { modifier: "GREATER_THAN", value: 30 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["60fps"]);
    });
  });

  describe("orientation filter", () => {
    const scenes = [
      createMockScene({
        id: "landscape",
        files: [{ path: "/a.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
      createMockScene({
        id: "portrait",
        files: [{ path: "/b.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1080, height: 1920, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
      createMockScene({
        id: "square",
        files: [{ path: "/c.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1080, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
    ];

    it("filters landscape scenes", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        orientation: { value: ["LANDSCAPE"] },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["landscape"]);
    });

    it("filters portrait scenes", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        orientation: { value: ["PORTRAIT"] },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["portrait"]);
    });

    it("filters multiple orientations", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        orientation: { value: ["LANDSCAPE", "SQUARE"] },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["landscape", "square"]);
    });
  });

  describe("resolution filter", () => {
    const scenes = [
      createMockScene({
        id: "720p",
        files: [{ path: "/a.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1280, height: 720, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
      createMockScene({
        id: "1080p",
        files: [{ path: "/b.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
      createMockScene({
        id: "4k",
        files: [{ path: "/c.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 3840, height: 2160, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
    ];

    it("EQUALS filters by resolution height", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        resolution: { value: "FULL_HD", modifier: "EQUALS" },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["1080p"]);
    });

    it("GREATER_THAN filters by resolution height", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        resolution: { value: "FULL_HD", modifier: "GREATER_THAN" },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["4k"]);
    });
  });

  describe("title filter", () => {
    const scenes = [
      createMockScene({ id: "s1", title: "Beach Party" }),
      createMockScene({ id: "s2", title: "Mountain Hike" }),
      createMockScene({ id: "s3", title: "Beach Sunset" }),
    ];

    it("INCLUDES: case-insensitive substring match", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        title: { value: "beach", modifier: "INCLUDES" },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["s1", "s3"]);
    });

    it("EXCLUDES: excludes substring matches", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        title: { value: "beach", modifier: "EXCLUDES" },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["s2"]);
    });

    it("EQUALS: exact case-insensitive match", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        title: { value: "mountain hike", modifier: "EQUALS" },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["s2"]);
    });
  });

  describe("details filter", () => {
    const scenes = [
      createMockScene({ id: "s1", details: "A fun day at the beach" }),
      createMockScene({ id: "s2", details: null }),
    ];

    it("INCLUDES: matches against details field", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        details: { value: "beach", modifier: "INCLUDES" },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["s1"]);
    });
  });

  describe("video_codec filter", () => {
    const scenes = [
      createMockScene({
        id: "h264",
        files: [{ path: "/a.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
      createMockScene({
        id: "hevc",
        files: [{ path: "/b.mp4", duration: 100, video_codec: "hevc", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
    ];

    it("INCLUDES: filters by video codec", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        video_codec: { value: "h264", modifier: "INCLUDES" },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["h264"]);
    });
  });

  describe("audio_codec filter", () => {
    const scenes = [
      createMockScene({
        id: "aac",
        files: [{ path: "/a.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
      createMockScene({
        id: "opus",
        files: [{ path: "/b.mp4", duration: 100, video_codec: "h264", audio_codec: "opus", width: 1920, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
    ];

    it("EXCLUDES: filters out matching audio codec", async () => {
      const result = await applyQuickSceneFilters(scenes, {
        audio_codec: { value: "aac", modifier: "EXCLUDES" },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["opus"]);
    });
  });
});

// ===== 3. applyExpensiveSceneFilters =====

describe("applyExpensiveSceneFilters", () => {
  it("returns all scenes when filters is null", () => {
    const scenes = [createMockScene({ id: "1" })];
    expect(applyExpensiveSceneFilters(scenes, null)).toEqual(scenes);
  });

  it("returns all scenes when filters is undefined", () => {
    const scenes = [createMockScene({ id: "1" })];
    expect(applyExpensiveSceneFilters(scenes, undefined)).toEqual(scenes);
  });

  describe("favorite filter", () => {
    const scenes = [
      createMockScene({ id: "fav", favorite: true }),
      createMockScene({ id: "nofav", favorite: false }),
    ];

    it("filters to favorites only", () => {
      const result = applyExpensiveSceneFilters(scenes, { favorite: true });
      expect(result.map((s) => s.id)).toEqual(["fav"]);
    });

    it("filters to non-favorites", () => {
      const result = applyExpensiveSceneFilters(scenes, { favorite: false });
      expect(result.map((s) => s.id)).toEqual(["nofav"]);
    });
  });

  describe("rating100 filter — all modifiers", () => {
    const scenes = [
      createMockScene({ id: "low", rating100: 20 }),
      createMockScene({ id: "mid", rating100: 60 }),
      createMockScene({ id: "high", rating100: 90 }),
      createMockScene({ id: "none", rating100: null }),
    ];

    it("GREATER_THAN", () => {
      const result = applyExpensiveSceneFilters(scenes, {
        rating100: { modifier: "GREATER_THAN", value: 60 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["high"]);
    });

    it("LESS_THAN", () => {
      const result = applyExpensiveSceneFilters(scenes, {
        rating100: { modifier: "LESS_THAN", value: 60 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["low", "none"]);
    });

    it("EQUALS", () => {
      const result = applyExpensiveSceneFilters(scenes, {
        rating100: { modifier: "EQUALS", value: 60 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["mid"]);
    });

    it("NOT_EQUALS", () => {
      const result = applyExpensiveSceneFilters(scenes, {
        rating100: { modifier: "NOT_EQUALS", value: 60 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["low", "high", "none"]);
    });

    it("BETWEEN", () => {
      const result = applyExpensiveSceneFilters(scenes, {
        rating100: { modifier: "BETWEEN", value: 20, value2: 70 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["low", "mid"]);
    });
  });

  describe("o_counter filter — representative modifiers", () => {
    const scenes = [
      createMockScene({ id: "zero", o_counter: 0 }),
      createMockScene({ id: "some", o_counter: 5 }),
      createMockScene({ id: "many", o_counter: 20 }),
    ];

    it("GREATER_THAN", () => {
      const result = applyExpensiveSceneFilters(scenes, {
        o_counter: { modifier: "GREATER_THAN", value: 5 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["many"]);
    });

    it("BETWEEN", () => {
      const result = applyExpensiveSceneFilters(scenes, {
        o_counter: { modifier: "BETWEEN", value: 1, value2: 10 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["some"]);
    });
  });

  describe("play_count filter — representative modifiers", () => {
    const scenes = [
      createMockScene({ id: "unwatched", play_count: 0 }),
      createMockScene({ id: "watched", play_count: 10 }),
    ];

    it("EQUALS", () => {
      const result = applyExpensiveSceneFilters(scenes, {
        play_count: { modifier: "EQUALS", value: 0 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["unwatched"]);
    });
  });

  describe("play_duration filter", () => {
    const scenes = [
      createMockScene({ id: "short", play_duration: 60 }),
      createMockScene({ id: "long", play_duration: 3600 }),
    ];

    it("GREATER_THAN", () => {
      const result = applyExpensiveSceneFilters(scenes, {
        play_duration: { modifier: "GREATER_THAN", value: 600 },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["long"]);
    });
  });

  describe("last_played_at date filter", () => {
    const scenes = [
      createMockScene({ id: "recent", last_played_at: "2025-06-01T00:00:00Z" }),
      createMockScene({ id: "old", last_played_at: "2024-01-01T00:00:00Z" }),
      createMockScene({ id: "never", last_played_at: null }),
    ];

    it("GREATER_THAN: excludes null and old dates", () => {
      const result = applyExpensiveSceneFilters(scenes, {
        last_played_at: { modifier: "GREATER_THAN", value: "2025-01-01T00:00:00Z" },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["recent"]);
    });
  });

  describe("last_o_at date filter", () => {
    const scenes = [
      createMockScene({ id: "has_o", last_o_at: "2025-06-01T00:00:00Z" }),
      createMockScene({ id: "no_o", last_o_at: null }),
    ];

    it("GREATER_THAN: filters by last_o_at", () => {
      const result = applyExpensiveSceneFilters(scenes, {
        last_o_at: { modifier: "GREATER_THAN", value: "2025-01-01T00:00:00Z" },
      } as any);
      expect(result.map((s) => s.id)).toEqual(["has_o"]);
    });
  });

  describe("performer_favorite filter", () => {
    it("returns scenes that have at least one favorite performer", () => {
      const scenes = [
        createMockScene({
          id: "s1",
          performers: [createMockPerformer({ id: "p1", favorite: true })],
        }),
        createMockScene({
          id: "s2",
          performers: [createMockPerformer({ id: "p2", favorite: false })],
        }),
      ];
      const result = applyExpensiveSceneFilters(scenes, {
        performer_favorite: true,
      });
      expect(result.map((s) => s.id)).toEqual(["s1"]);
    });
  });

  describe("studio_favorite filter", () => {
    it("returns scenes with a favorite studio", () => {
      const scenes = [
        createMockScene({
          id: "s1",
          studio: createMockStudio({ id: "st1", favorite: true }),
        }),
        createMockScene({
          id: "s2",
          studio: createMockStudio({ id: "st2", favorite: false }),
        }),
        createMockScene({ id: "s3", studio: null }),
      ];
      const result = applyExpensiveSceneFilters(scenes, {
        studio_favorite: true,
      });
      expect(result.map((s) => s.id)).toEqual(["s1"]);
    });
  });

  describe("tag_favorite filter", () => {
    it("returns scenes with at least one favorite tag", () => {
      const scenes = [
        createMockScene({
          id: "s1",
          tags: [createMockTag({ id: "t1", favorite: true })],
        }),
        createMockScene({
          id: "s2",
          tags: [createMockTag({ id: "t2", favorite: false })],
        }),
      ];
      const result = applyExpensiveSceneFilters(scenes, {
        tag_favorite: true,
      });
      expect(result.map((s) => s.id)).toEqual(["s1"]);
    });
  });
});

// ===== 4. sortScenes =====

describe("sortScenes", () => {
  it("sorts by title ASC alphabetically", () => {
    const scenes = [
      createMockScene({ id: "1", title: "Zebra" }),
      createMockScene({ id: "2", title: "Apple" }),
      createMockScene({ id: "3", title: "Mango" }),
    ];
    const result = sortScenes(scenes, "title", "ASC");
    expect(result.map((s) => s.title)).toEqual(["Apple", "Mango", "Zebra"]);
  });

  it("sorts by title DESC", () => {
    const scenes = [
      createMockScene({ id: "1", title: "Apple" }),
      createMockScene({ id: "2", title: "Zebra" }),
    ];
    const result = sortScenes(scenes, "title", "DESC");
    expect(result.map((s) => s.title)).toEqual(["Zebra", "Apple"]);
  });

  it("sorts by created_at DESC (newest first)", () => {
    const scenes = [
      createMockScene({ id: "old", created_at: "2024-01-01T00:00:00Z" }),
      createMockScene({ id: "new", created_at: "2025-06-01T00:00:00Z" }),
    ];
    const result = sortScenes(scenes, "created_at", "DESC");
    expect(result.map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("sorts by date ASC", () => {
    const scenes = [
      createMockScene({ id: "2", date: "2025-06-01" }),
      createMockScene({ id: "1", date: "2024-01-01" }),
    ];
    const result = sortScenes(scenes, "date", "ASC");
    expect(result.map((s) => s.id)).toEqual(["1", "2"]);
  });

  it("sorts by rating100 DESC", () => {
    const scenes = [
      createMockScene({ id: "low", rating100: 20 }),
      createMockScene({ id: "high", rating100: 90 }),
      createMockScene({ id: "mid", rating100: 60 }),
    ];
    const result = sortScenes(scenes, "rating100", "DESC");
    expect(result.map((s) => s.id)).toEqual(["high", "mid", "low"]);
  });

  it("sorts by o_counter DESC", () => {
    const scenes = [
      createMockScene({ id: "low", o_counter: 1 }),
      createMockScene({ id: "high", o_counter: 100 }),
    ];
    const result = sortScenes(scenes, "o_counter", "DESC");
    expect(result.map((s) => s.id)).toEqual(["high", "low"]);
  });

  it("sorts by play_count ASC", () => {
    const scenes = [
      createMockScene({ id: "more", play_count: 50 }),
      createMockScene({ id: "less", play_count: 5 }),
    ];
    const result = sortScenes(scenes, "play_count", "ASC");
    expect(result.map((s) => s.id)).toEqual(["less", "more"]);
  });

  it("sorts by bitrate (file field)", () => {
    const scenes = [
      createMockScene({
        id: "low",
        files: [{ path: "/a.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 1_000_000, size: 100 }],
      }),
      createMockScene({
        id: "high",
        files: [{ path: "/b.mp4", duration: 100, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 10_000_000, size: 100 }],
      }),
    ];
    const result = sortScenes(scenes, "bitrate", "DESC");
    expect(result.map((s) => s.id)).toEqual(["high", "low"]);
  });

  it("sorts by duration (file field)", () => {
    const scenes = [
      createMockScene({
        id: "short",
        files: [{ path: "/a.mp4", duration: 60, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
      createMockScene({
        id: "long",
        files: [{ path: "/b.mp4", duration: 7200, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, bit_rate: 5_000_000, size: 100 }],
      }),
    ];
    const result = sortScenes(scenes, "duration", "ASC");
    expect(result.map((s) => s.id)).toEqual(["short", "long"]);
  });

  it("sorts by performer_count", () => {
    const scenes = [
      createMockScene({
        id: "solo",
        performers: [createMockPerformer({ id: "p1" })],
      }),
      createMockScene({
        id: "trio",
        performers: [
          createMockPerformer({ id: "p1" }),
          createMockPerformer({ id: "p2" }),
          createMockPerformer({ id: "p3" }),
        ],
      }),
    ];
    const result = sortScenes(scenes, "performer_count", "DESC");
    expect(result.map((s) => s.id)).toEqual(["trio", "solo"]);
  });

  it("sorts by tag_count", () => {
    const scenes = [
      createMockScene({
        id: "few",
        tags: [createMockTag({ id: "t1" })],
      }),
      createMockScene({
        id: "many",
        tags: [createMockTag({ id: "t1" }), createMockTag({ id: "t2" }), createMockTag({ id: "t3" })],
      }),
    ];
    const result = sortScenes(scenes, "tag_count", "ASC");
    expect(result.map((s) => s.id)).toEqual(["few", "many"]);
  });

  it("uses secondary sort by title when primary values are equal", () => {
    const scenes = [
      createMockScene({ id: "b", title: "Bravo", rating100: 80 }),
      createMockScene({ id: "a", title: "Alpha", rating100: 80 }),
    ];
    const result = sortScenes(scenes, "rating100", "DESC");
    expect(result.map((s) => s.title)).toEqual(["Alpha", "Bravo"]);
  });

  it("sorts by scene_index with groupId context", () => {
    const scenes = [
      createMockScene({
        id: "s1",
        title: "First",
        groups: [{ id: "g1", instanceId: "default", name: "G1", front_image_path: null, back_image_path: null, scene_index: 2 }] as any,
      }),
      createMockScene({
        id: "s2",
        title: "Second",
        groups: [{ id: "g1", instanceId: "default", name: "G1", front_image_path: null, back_image_path: null, scene_index: 0 }] as any,
      }),
    ];
    const result = sortScenes(scenes, "scene_index", "ASC", 0 as any);
    // Without matching groupId, both get 999999, so secondary sort by title
    // Let's test with matching groupId:
    const result2 = sortScenes(scenes, "scene_index", "ASC", "g1" as any);
    expect(result2.map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("does not mutate the original array", () => {
    const scenes = [
      createMockScene({ id: "2", title: "B" }),
      createMockScene({ id: "1", title: "A" }),
    ];
    const original = [...scenes];
    sortScenes(scenes, "title", "ASC");
    expect(scenes.map((s) => s.id)).toEqual(original.map((s) => s.id));
  });
});

// ===== 5. mergeScenesWithUserData =====

describe("mergeScenesWithUserData", () => {
  it("merges watch history into scenes", async () => {
    const scenes = [createMockScene({ id: "s1", instanceId: "inst1" })];
    mockPrisma.watchHistory.findMany.mockResolvedValue([
      {
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
        lastOAt: new Date("2025-05-01"),
        updatedAt: new Date(),
      },
    ] as any);
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
    ] as any);
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
    ] as any);
    mockPrisma.studioRating.findMany.mockResolvedValue([]);
    mockPrisma.tagRating.findMany.mockResolvedValue([]);

    const result = await mergeScenesWithUserData(scenes, 1);
    expect(result[0]!.performers[0]!.favorite).toBe(true);
    expect(result[0]!.performers[1]!.favorite).toBe(false);
  });

  it("updates nested studio favorite", async () => {
    const studio = createMockStudio({ id: "st1", instanceId: "inst1" });
    const scenes = [
      createMockScene({ id: "s1", instanceId: "inst1", studio }),
    ];
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
    ] as any);
    mockPrisma.tagRating.findMany.mockResolvedValue([]);

    const result = await mergeScenesWithUserData(scenes, 1);
    expect(result[0]!.studio!.favorite).toBe(true);
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
    ] as any);

    const result = await mergeScenesWithUserData(scenes, 1);
    expect(result[0]!.tags[0]!.favorite).toBe(true);
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

// ===== 6. HTTP handlers =====

describe("findScenes", () => {
  it("returns 401 when user is not authenticated", async () => {
    const req = mockReq({ filter: {}, scene_filter: {} }, {}, undefined);
    const res = mockRes();

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

    const req = mockReq(
      { filter: { page: 1, per_page: 40 }, scene_filter: {} },
      {},
      { id: 1, role: "USER" }
    );
    const res = mockRes();

    await findScenes(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getBody();
    expect(body.findScenes.count).toBe(1);
    expect(body.findScenes.scenes).toHaveLength(1);
  });

  it("returns 400 for ambiguous single-ID lookup", async () => {
    const s1 = createMockScene({ id: "42", instanceId: "inst-a", title: "Scene A" });
    const s2 = createMockScene({ id: "42", instanceId: "inst-b", title: "Scene B" });
    mockSceneQueryBuilder.execute.mockResolvedValue({
      scenes: [s1, s2],
      total: 2,
    });

    const req = mockReq(
      { filter: {}, scene_filter: {}, ids: ["42"] },
      {},
      { id: 1, role: "USER" }
    );
    const res = mockRes();

    await findScenes(req, res);

    expect(res._getStatus()).toBe(400);
    const body = res._getBody();
    expect(body.error).toBe("Ambiguous lookup");
    expect(body.matches).toHaveLength(2);
  });

  it("returns 500 on unexpected error", async () => {
    mockSceneQueryBuilder.execute.mockRejectedValue(new Error("DB down"));

    const req = mockReq(
      { filter: {}, scene_filter: {} },
      {},
      { id: 1, role: "USER" }
    );
    const res = mockRes();

    await findScenes(req, res);

    expect(res._getStatus()).toBe(500);
    expect(res._getBody()).toMatchObject({ error: "Failed to find scenes" });
  });
});

describe("updateScene", () => {
  it("returns 404 when stash instance is not found", async () => {
    mockGetEntityInstanceId.mockResolvedValue("unknown");
    mockStashInstanceManager.get.mockReturnValue(undefined as any);

    const req = mockReq(
      { title: "Updated Title" },
      { id: "123" },
      { id: 1, role: "USER" }
    );
    const res = mockRes();

    await updateScene(req, res);

    expect(res._getStatus()).toBe(404);
    expect(res._getBody()).toMatchObject({
      error: "Stash instance not found for scene",
    });
  });

  it("returns 500 when sceneUpdate returns null", async () => {
    mockGetEntityInstanceId.mockResolvedValue("default");
    const mockStash = { sceneUpdate: vi.fn().mockResolvedValue({ sceneUpdate: null }) };
    mockStashInstanceManager.get.mockReturnValue(mockStash as any);

    const req = mockReq(
      { title: "Updated Title" },
      { id: "123" },
      { id: 1, role: "USER" }
    );
    const res = mockRes();

    await updateScene(req, res);

    expect(res._getStatus()).toBe(500);
    expect(res._getBody()).toMatchObject({
      error: "Scene update returned null",
    });
  });

  it("returns updated scene on success", async () => {
    mockGetEntityInstanceId.mockResolvedValue("default");
    const updatedScene = createMockScene({ id: "123", title: "Updated Title" });
    const mockStash = {
      sceneUpdate: vi.fn().mockResolvedValue({ sceneUpdate: updatedScene }),
    };
    mockStashInstanceManager.get.mockReturnValue(mockStash as any);
    // Ensure mergeScenesWithUserData returns the scene unchanged
    mockPrisma.watchHistory.findMany.mockResolvedValue([]);
    mockPrisma.sceneRating.findMany.mockResolvedValue([]);
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.studioRating.findMany.mockResolvedValue([]);
    mockPrisma.tagRating.findMany.mockResolvedValue([]);

    const req = mockReq(
      { title: "Updated Title" },
      { id: "123" },
      { id: 1, role: "USER" }
    );
    const res = mockRes();

    await updateScene(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getBody();
    expect(body.success).toBe(true);
    expect(body.scene.title).toBe("Updated Title");
  });

  it("returns 500 on unexpected error", async () => {
    mockGetEntityInstanceId.mockRejectedValue(new Error("DB crash"));

    const req = mockReq(
      { title: "x" },
      { id: "123" },
      { id: 1, role: "USER" }
    );
    const res = mockRes();

    await updateScene(req, res);

    expect(res._getStatus()).toBe(500);
    expect(res._getBody()).toMatchObject({ error: "Failed to update scene" });
  });
});

describe("findSimilarScenes", () => {
  it("returns 401 when user is not authenticated", async () => {
    const req = mockReq({}, { id: "s1" }, undefined, { page: "1" });
    const res = mockRes();

    await findSimilarScenes(req, res);

    expect(res._getStatus()).toBe(401);
  });

  it("returns empty result when no candidates found", async () => {
    mockStashEntityService.getSimilarSceneCandidates.mockResolvedValue([]);

    const req = mockReq({}, { id: "s1" }, { id: 1, role: "USER" }, { page: "1" });
    const res = mockRes();

    await findSimilarScenes(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getBody();
    expect(body.scenes).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("returns paginated similar scenes", async () => {
    const candidates = [
      { sceneId: "c1", weight: 10, date: "2025-01-01" },
      { sceneId: "c2", weight: 8, date: "2025-01-02" },
    ];
    mockStashEntityService.getSimilarSceneCandidates.mockResolvedValue(candidates);

    const scene1 = createMockScene({ id: "c1" });
    const scene2 = createMockScene({ id: "c2" });
    mockSceneQueryBuilder.getByIds.mockResolvedValue({
      scenes: [scene2, scene1], // intentionally out of order
      total: 2,
    });

    const req = mockReq({}, { id: "s1" }, { id: 1, role: "USER" }, { page: "1" });
    const res = mockRes();

    await findSimilarScenes(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getBody();
    // Should preserve score order (c1 first, higher weight)
    expect(body.scenes.map((s: any) => s.id)).toEqual(["c1", "c2"]);
    expect(body.count).toBe(2);
  });

  it("returns 500 on error", async () => {
    mockStashEntityService.getSimilarSceneCandidates.mockRejectedValue(
      new Error("DB error")
    );

    const req = mockReq({}, { id: "s1" }, { id: 1, role: "USER" }, { page: "1" });
    const res = mockRes();

    await findSimilarScenes(req, res);

    expect(res._getStatus()).toBe(500);
  });
});

describe("getRecommendedScenes", () => {
  it("returns 401 when user is not authenticated", async () => {
    const req = mockReq({}, {}, undefined, { page: "1" });
    const res = mockRes();

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(401);
  });

  it("returns empty result with message when user has no criteria", async () => {
    mockHasAnyCriteria.mockReturnValue(false);

    const req = mockReq({}, {}, { id: 1, role: "USER" }, { page: "1" });
    const res = mockRes();

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getBody();
    expect(body.scenes).toEqual([]);
    expect(body.message).toBe("No recommendations yet");
  });

  it("returns 500 on unexpected error", async () => {
    // Force an error by making prisma throw
    mockPrisma.performerRating.findMany.mockRejectedValue(
      new Error("DB down")
    );

    const req = mockReq({}, {}, { id: 1, role: "USER" }, { page: "1" });
    const res = mockRes();

    await getRecommendedScenes(req, res);

    expect(res._getStatus()).toBe(500);
    expect(res._getBody()).toMatchObject({
      error: "Failed to get recommended scenes",
    });
  });
});
