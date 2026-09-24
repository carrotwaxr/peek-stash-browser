/**
 * Unit Tests for Studios Library Controller
 *
 * Tests mergeStudiosWithUserData, applyStudioFilters (sync), findStudios
 * and findStudiosMinimal.
 */
import { coerceEntityRefs } from "@peek/shared-types/instanceAwareId.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyStudioFilters,
  findStudios,
  findStudiosMinimal,
  mergeStudiosWithUserData,
} from "../../../controllers/library/studios.js";
import { CriterionModifier } from "../../../graphql/types.js";
// --- Imports ---

import prisma from "../../../prisma/singleton.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import { studioQueryBuilder } from "../../../services/StudioQueryBuilder.js";
import { userStatsService } from "../../../services/UserStatsService.js";
import { mockReq, mockRes } from "../../helpers/controllerTestUtils.js";
import { createMockStudio } from "../../helpers/mockDataGenerators.js";
import { must } from "../../helpers/must.js";

// --- Mocks (must come before module import) ---

vi.mock(
  "../../../prisma/singleton.js",
  () => import("../../helpers/prismaSingletonMock.js")
);

vi.mock("../../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getAllStudios: vi.fn(),
    getStudio: vi.fn(),
  },
}));

vi.mock("../../../services/StudioQueryBuilder.js", () => ({
  studioQueryBuilder: { execute: vi.fn() },
}));

vi.mock("../../../services/UserStatsService.js", () => ({
  userStatsService: { getStudioStats: vi.fn().mockResolvedValue(new Map()) },
}));

vi.mock("../../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    filterExcluded: vi.fn().mockImplementation((items) => items),
  },
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("../../../utils/entityInstanceId.js", () => ({
  disambiguateEntityNames: vi.fn().mockImplementation((entities) => entities),
}));

vi.mock("@peek/shared-types/instanceAwareId.js", () => ({
  coerceEntityRefs: vi.fn().mockImplementation((ids) => ids),
}));

vi.mock("../../../utils/hierarchyUtils.js", () => ({
  hydrateStudioRelationships: vi
    .fn()
    .mockImplementation((studios) => Promise.resolve(studios)),
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../utils/seededRandom.js", () => ({
  parseRandomSort: vi.fn().mockImplementation((field) => ({
    sortField: field,
    randomSeed: undefined,
  })),
}));

vi.mock("../../../utils/stashUrl.js", () => ({
  buildStashEntityUrl: vi
    .fn()
    .mockImplementation((_type, id, _inst, viewer) =>
      viewer?.role === "ADMIN" ? `http://stash/studios/${id}` : null
    ),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockStashEntityService = vi.mocked(stashEntityService);
const mockStudioQueryBuilder = vi.mocked(studioQueryBuilder);
const mockUserStatsService = vi.mocked(userStatsService);

const defaultUser = { id: 1, role: "USER" };
const adminUser = { id: 1, role: "ADMIN" };

describe("Studios Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── mergeStudiosWithUserData ───────────────────────────────

  describe("mergeStudiosWithUserData", () => {
    it("returns studios with default stats when no ratings exist", async () => {
      mockPrisma.studioRating.findMany.mockResolvedValue([]);
      mockUserStatsService.getStudioStats.mockResolvedValue(new Map());

      const studios = [createMockStudio({ id: "s1" })];
      const result = await mergeStudiosWithUserData(studios, 1);

      expect(result).toHaveLength(1);
      expect(must(result[0]).o_counter).toBe(0);
      expect(must(result[0]).play_count).toBe(0);
    });

    it("merges ratings via composite key", async () => {
      mockPrisma.studioRating.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 1,
          studioId: "s1",
          instanceId: "default",
          rating: 90,
          favorite: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockUserStatsService.getStudioStats.mockResolvedValue(new Map());

      const studios = [createMockStudio({ id: "s1", instanceId: "default" })];
      const result = await mergeStudiosWithUserData(studios, 1);

      expect(must(result[0]).rating).toBe(90);
      expect(must(result[0]).rating100).toBe(90);
      expect(must(result[0]).favorite).toBe(true);
    });

    it("merges pre-computed stats from UserStatsService", async () => {
      mockPrisma.studioRating.findMany.mockResolvedValue([]);
      const statsMap = new Map([
        ["s1\0default", { oCounter: 7, playCount: 20 }],
      ]);
      mockUserStatsService.getStudioStats.mockResolvedValue(statsMap);

      const studios = [createMockStudio({ id: "s1", instanceId: "default" })];
      const result = await mergeStudiosWithUserData(studios, 1);

      expect(must(result[0]).o_counter).toBe(7);
      expect(must(result[0]).play_count).toBe(20);
    });
  });

  // ─── applyStudioFilters (SYNC function) ─────────────────────

  describe("applyStudioFilters", () => {
    it("returns all studios when filters is null", () => {
      const studios = [createMockStudio(), createMockStudio()];
      const result = applyStudioFilters(studios, null);
      expect(result).toHaveLength(2);
    });

    it("returns all studios when filters is undefined", () => {
      const studios = [createMockStudio()];
      const result = applyStudioFilters(studios, undefined);
      expect(result).toHaveLength(1);
    });

    it("filters by ids", () => {
      const studios = [
        createMockStudio({ id: "s1" }),
        createMockStudio({ id: "s2" }),
        createMockStudio({ id: "s3" }),
      ];
      const result = applyStudioFilters(studios, {
        ids: { value: coerceEntityRefs(["s1", "s3"]), modifier: "INCLUDES" },
      });
      expect(result).toHaveLength(2);
      expect(result.map((s) => s.id)).toEqual(["s1", "s3"]);
    });

    it("filters by favorite", () => {
      const studios = [
        createMockStudio({ id: "s1", favorite: true }),
        createMockStudio({ id: "s2", favorite: false }),
      ];
      const result = applyStudioFilters(studios, { favorite: true });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s1");
    });

    it("filters by tags INCLUDES", () => {
      const studios = [
        createMockStudio({
          id: "s1",
          tags: [{ id: "t1", name: "A" }] as any,
        }),
        createMockStudio({
          id: "s2",
          tags: [{ id: "t2", name: "B" }] as any,
        }),
      ];
      const result = applyStudioFilters(studios, {
        tags: { value: ["t1"], modifier: CriterionModifier.Includes },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s1");
    });

    it("filters by tags INCLUDES_ALL", () => {
      const studios = [
        createMockStudio({
          id: "s1",
          tags: [
            { id: "t1", name: "A" },
            { id: "t2", name: "B" },
          ] as any,
        }),
        createMockStudio({
          id: "s2",
          tags: [{ id: "t1", name: "A" }] as any,
        }),
      ];
      const result = applyStudioFilters(studios, {
        tags: { value: ["t1", "t2"], modifier: CriterionModifier.IncludesAll },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s1");
    });

    it("filters by tags EXCLUDES", () => {
      const studios = [
        createMockStudio({
          id: "s1",
          tags: [{ id: "t1", name: "A" }] as any,
        }),
        createMockStudio({
          id: "s2",
          tags: [{ id: "t2", name: "B" }] as any,
        }),
      ];
      const result = applyStudioFilters(studios, {
        tags: { value: ["t1"], modifier: CriterionModifier.Excludes },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s2");
    });

    it("filters by rating100 GREATER_THAN", () => {
      const studios = [
        createMockStudio({ id: "s1", rating100: 80 }),
        createMockStudio({ id: "s2", rating100: 30 }),
      ];
      const result = applyStudioFilters(studios, {
        rating100: { modifier: CriterionModifier.GreaterThan, value: 50 },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s1");
    });

    it("filters by rating100 BETWEEN", () => {
      const studios = [
        createMockStudio({ id: "s1", rating100: 50 }),
        createMockStudio({ id: "s2", rating100: 80 }),
        createMockStudio({ id: "s3", rating100: 20 }),
      ];
      const result = applyStudioFilters(studios, {
        rating100: {
          modifier: CriterionModifier.Between,
          value: 40,
          value2: 60,
        },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s1");
    });

    it("filters by o_counter EQUALS", () => {
      const studios = [
        createMockStudio({ id: "s1", o_counter: 10 }),
        createMockStudio({ id: "s2", o_counter: 5 }),
      ];
      const result = applyStudioFilters(studios, {
        o_counter: { modifier: "EQUALS", value: 10 },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s1");
    });

    it("filters by play_count LESS_THAN", () => {
      const studios = [
        createMockStudio({ id: "s1", play_count: 3 }),
        createMockStudio({ id: "s2", play_count: 20 }),
      ];
      const result = applyStudioFilters(studios, {
        play_count: { modifier: "LESS_THAN", value: 10 },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s1");
    });

    it("filters by scene_count NOT_EQUALS", () => {
      const studios = [
        createMockStudio({ id: "s1", scene_count: 10 }),
        createMockStudio({ id: "s2", scene_count: 5 }),
      ];
      const result = applyStudioFilters(studios, {
        scene_count: { modifier: CriterionModifier.NotEquals, value: 10 },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s2");
    });

    it("filters by name text search (case insensitive)", () => {
      const studios = [
        createMockStudio({ id: "s1", name: "Brazzers" }),
        createMockStudio({ id: "s2", name: "Reality Kings" }),
      ];
      const result = applyStudioFilters(studios, {
        name: { value: "brazz", modifier: CriterionModifier.Includes },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s1");
    });

    it("filters by details text search", () => {
      const studios = [
        createMockStudio({ id: "s1", details: "premium content provider" }),
        createMockStudio({ id: "s2", details: "independent studio" }),
      ];
      const result = applyStudioFilters(studios, {
        details: { value: "premium", modifier: CriterionModifier.Includes },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s1");
    });

    it("filters by created_at GREATER_THAN", () => {
      const studios = [
        createMockStudio({ id: "s1", created_at: "2024-06-01T00:00:00Z" }),
        createMockStudio({ id: "s2", created_at: "2024-01-01T00:00:00Z" }),
      ];
      const result = applyStudioFilters(studios, {
        created_at: {
          modifier: CriterionModifier.GreaterThan,
          value: "2024-03-01T00:00:00Z",
        },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s1");
    });

    it("filters by updated_at BETWEEN", () => {
      const studios = [
        createMockStudio({ id: "s1", updated_at: "2024-04-01T00:00:00Z" }),
        createMockStudio({ id: "s2", updated_at: "2024-08-01T00:00:00Z" }),
      ];
      const result = applyStudioFilters(studios, {
        updated_at: {
          modifier: CriterionModifier.Between,
          value: "2024-03-01T00:00:00Z",
          value2: "2024-05-01T00:00:00Z",
        },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("s1");
    });
  });

  // ─── findStudios HTTP handler ───────────────────────────────

  describe("findStudios", () => {
    it("returns studios from query builder on happy path", async () => {
      const studios = [createMockStudio({ id: "s1", name: "TestStudio" })];
      mockStudioQueryBuilder.execute.mockResolvedValue({
        studios,
        total: 1,
      });

      const req = mockReq({ filter: {}, studio_filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findStudios(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getBody();
      expect(body.findStudios.count).toBe(1);
      expect(body.findStudios.studios).toHaveLength(1);
    });

    it("adds stashUrl to each studio for an admin", async () => {
      mockStudioQueryBuilder.execute.mockResolvedValue({
        studios: [createMockStudio({ id: "s1" })],
        total: 1,
      });

      const req = mockReq({ filter: {}, studio_filter: {} }, {}, adminUser);
      const res = mockRes();

      await findStudios(req, res);

      expect(res._getBody().findStudios.studios[0].stashUrl).toBe(
        "http://stash/studios/s1"
      );
    });

    it("does not send stashUrl to a regular user", async () => {
      mockStudioQueryBuilder.execute.mockResolvedValue({
        studios: [
          createMockStudio({ id: "s1" }),
          createMockStudio({ id: "s2" }),
        ],
        total: 2,
      });

      const req = mockReq({ filter: {}, studio_filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findStudios(req, res);

      const studios = res._getBody().findStudios.studios;
      expect(studios).toHaveLength(2);
      for (const studio of studios) expect(studio.stashUrl).toBeNull();
    });

    it("returns 400 for ambiguous single-ID lookup", async () => {
      const studios = [
        createMockStudio({ id: "s1", instanceId: "inst-a" }),
        createMockStudio({ id: "s1", instanceId: "inst-b" }),
      ];
      mockStudioQueryBuilder.execute.mockResolvedValue({
        studios,
        total: 2,
      });

      const req = mockReq(
        { ids: ["s1"], filter: {}, studio_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findStudios(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toBe("Ambiguous lookup");
    });

    it("returns 500 when query builder throws", async () => {
      mockStudioQueryBuilder.execute.mockRejectedValue(new Error("DB error"));

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findStudios(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getBody().error).toBe("Failed to find studios");
    });

    it("fetches detail counts for single-ID lookup", async () => {
      const studio = createMockStudio({ id: "s1", instanceId: "default" });
      mockStudioQueryBuilder.execute.mockResolvedValue({
        studios: [studio],
        total: 1,
      });
      mockStashEntityService.getStudio.mockResolvedValue({
        ...studio,
        scene_count: 100,
        image_count: 50,
        gallery_count: 10,
        performer_count: 25,
        group_count: 5,
      });
      mockStashEntityService.getAllStudios.mockResolvedValue([studio]);

      const req = mockReq(
        { ids: ["s1"], filter: {}, studio_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findStudios(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockStashEntityService.getStudio).toHaveBeenCalledWith(
        "s1",
        "default"
      );
    });
  });

  // ─── findStudiosMinimal ─────────────────────────────────────

  describe("findStudiosMinimal", () => {
    it("returns minimal studios on happy path", async () => {
      const studios = [
        createMockStudio({ id: "s1", name: "Alpha Studio" }),
        createMockStudio({ id: "s2", name: "Beta Studio" }),
      ];
      mockStashEntityService.getAllStudios.mockResolvedValue(studios);

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findStudiosMinimal(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody().studios).toHaveLength(2);
    });

    it("applies search query filtering", async () => {
      const studios = [
        createMockStudio({ id: "s1", name: "Alpha" }),
        createMockStudio({ id: "s2", name: "Beta" }),
      ];
      mockStashEntityService.getAllStudios.mockResolvedValue(studios);

      const req = mockReq({ filter: { q: "alpha" } }, {}, defaultUser);
      const res = mockRes();

      await findStudiosMinimal(req, res);

      expect(res._getBody().studios).toHaveLength(1);
    });

    it("applies count_filter with min_scene_count", async () => {
      const studios = [
        createMockStudio({ id: "s1", scene_count: 50 }),
        createMockStudio({ id: "s2", scene_count: 2 }),
      ];
      mockStashEntityService.getAllStudios.mockResolvedValue(studios);

      const req = mockReq(
        { filter: {}, count_filter: { min_scene_count: 10 } },
        {},
        defaultUser
      );
      const res = mockRes();

      await findStudiosMinimal(req, res);

      expect(res._getBody().studios).toHaveLength(1);
    });

    it("applies pagination via per_page", async () => {
      const studios = [
        createMockStudio({ id: "s1", name: "A" }),
        createMockStudio({ id: "s2", name: "B" }),
        createMockStudio({ id: "s3", name: "C" }),
      ];
      mockStashEntityService.getAllStudios.mockResolvedValue(studios);

      const req = mockReq({ filter: { per_page: 2 } }, {}, defaultUser);
      const res = mockRes();

      await findStudiosMinimal(req, res);

      expect(res._getBody().studios).toHaveLength(2);
    });

    it("returns 500 on error", async () => {
      mockStashEntityService.getAllStudios.mockRejectedValue(
        new Error("cache failure")
      );

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findStudiosMinimal(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });
});
