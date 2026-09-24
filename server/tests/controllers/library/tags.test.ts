/**
 * Unit Tests for Tags Library Controller
 *
 * Tests mergeTagsWithUserData, applyTagFilters, findTags, findTagsMinimal
 * and findTagsForScenes.
 */
import { coerceEntityRefs } from "@peek/shared-types/instanceAwareId.js";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTagFilters,
  findTags,
  findTagsForScenes,
  findTagsMinimal,
  mergeTagsWithUserData,
} from "../../../controllers/library/tags.js";
import { CriterionModifier } from "../../../graphql/types.js";
// --- Imports ---

import prisma from "../../../prisma/singleton.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import { tagQueryBuilder } from "../../../services/TagQueryBuilder.js";
import { userStatsService } from "../../../services/UserStatsService.js";
import { reqFor, resFor, testUser } from "../../helpers/controllerTestUtils.js";
import { createMockTag } from "../../helpers/mockDataGenerators.js";
import { must } from "../../helpers/must.js";
import { partialRow } from "../../helpers/prismaMock.js";

// --- Mocks (must come before module import) ---

vi.mock(
  "../../../prisma/singleton.js",
  () => import("../../helpers/prismaSingletonMock.js")
);

vi.mock("../../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getAllTags: vi.fn(),
    getAllPerformers: vi.fn(),
    getAllStudios: vi.fn(),
    getAllScenes: vi.fn(),
    getTag: vi.fn(),
  },
}));

vi.mock("../../../services/TagQueryBuilder.js", () => ({
  tagQueryBuilder: { execute: vi.fn() },
}));

vi.mock("../../../services/UserStatsService.js", () => ({
  userStatsService: { getTagStats: vi.fn().mockResolvedValue(new Map()) },
}));

vi.mock("../../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    filterExcluded: vi.fn().mockImplementation((items: unknown[]) => items),
  },
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("../../../utils/entityInstanceId.js", () => ({
  disambiguateEntityNames: vi
    .fn()
    .mockImplementation((entities: unknown[]) => entities),
}));

vi.mock("@peek/shared-types/instanceAwareId.js", () => ({
  coerceEntityRefs: vi.fn().mockImplementation((ids: string[]) => ids),
}));

vi.mock("../../../utils/hierarchyUtils.js", () => ({
  hydrateTagRelationships: vi
    .fn()
    .mockImplementation((tags) => Promise.resolve(tags)),
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../utils/seededRandom.js", () => ({
  parseRandomSort: vi.fn().mockImplementation((field: string) => ({
    sortField: field,
    randomSeed: undefined,
  })),
}));

vi.mock("../../../utils/stashUrl.js", () => ({
  buildStashEntityUrl: vi
    .fn()
    .mockImplementation(
      (
        _type: string,
        id: string | number,
        _inst: string | undefined,
        viewer: { role: string } | undefined
      ) => (viewer?.role === "ADMIN" ? `http://stash/tags/${id}` : null)
    ),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockStashEntityService = vi.mocked(stashEntityService);
const mockTagQueryBuilder = vi.mocked(tagQueryBuilder);
const mockUserStatsService = vi.mocked(userStatsService);

const defaultUser = testUser();
const adminUser = testUser({ role: "ADMIN" });

describe("Tags Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── mergeTagsWithUserData ───────────────────────────────────

  describe("mergeTagsWithUserData", () => {
    it("returns tags with default stats when no ratings exist", async () => {
      mockPrisma.tagRating.findMany.mockResolvedValue([]);
      mockUserStatsService.getTagStats.mockResolvedValue(new Map());

      const tags = [createMockTag({ id: "t1" })];
      const result = await mergeTagsWithUserData(tags, 1);

      expect(result).toHaveLength(1);
      expect(must(result[0]).o_counter).toBe(0);
      expect(must(result[0]).play_count).toBe(0);
    });

    it("merges ratings via composite key (id + instanceId)", async () => {
      mockPrisma.tagRating.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 1,
          tagId: "t1",
          instanceId: "default",
          rating: 80,
          favorite: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockUserStatsService.getTagStats.mockResolvedValue(new Map());

      const tags = [createMockTag({ id: "t1", instanceId: "default" })];
      const result = await mergeTagsWithUserData(tags, 1);

      expect(must(result[0]).rating).toBe(80);
      expect(must(result[0]).rating100).toBe(80);
      expect(must(result[0]).favorite).toBe(true);
    });

    it("merges pre-computed stats from UserStatsService", async () => {
      mockPrisma.tagRating.findMany.mockResolvedValue([]);
      const statsMap = new Map([
        ["t1\0default", { oCounter: 5, playCount: 10 }],
      ]);
      mockUserStatsService.getTagStats.mockResolvedValue(statsMap);

      const tags = [createMockTag({ id: "t1", instanceId: "default" })];
      const result = await mergeTagsWithUserData(tags, 1);

      expect(must(result[0]).o_counter).toBe(5);
      expect(must(result[0]).play_count).toBe(10);
    });
  });

  // ─── applyTagFilters ────────────────────────────────────────

  describe("applyTagFilters", () => {
    it("returns all tags when filters is null", async () => {
      const tags = [createMockTag(), createMockTag()];
      const result = await applyTagFilters(tags, null);
      expect(result).toHaveLength(2);
    });

    it("returns all tags when filters is undefined", async () => {
      const tags = [createMockTag()];
      const result = await applyTagFilters(tags, undefined);
      expect(result).toHaveLength(1);
    });

    it("filters by ids", async () => {
      const tags = [
        createMockTag({ id: "t1" }),
        createMockTag({ id: "t2" }),
        createMockTag({ id: "t3" }),
      ];
      const result = await applyTagFilters(tags, {
        ids: { value: coerceEntityRefs(["t1", "t3"]), modifier: "INCLUDES" },
      });
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.id)).toEqual(["t1", "t3"]);
    });

    it("filters by favorite", async () => {
      const tags = [
        createMockTag({ id: "t1", favorite: true }),
        createMockTag({ id: "t2", favorite: false }),
      ];
      const result = await applyTagFilters(tags, { favorite: true });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t1");
    });

    it("filters by rating100 GREATER_THAN", async () => {
      const tags = [
        createMockTag({ id: "t1", rating100: 50 }),
        createMockTag({ id: "t2", rating100: 80 }),
        createMockTag({ id: "t3", rating100: 30 }),
      ];
      const result = await applyTagFilters(tags, {
        rating100: { modifier: "GREATER_THAN", value: 40 },
      });
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.id)).toEqual(["t1", "t2"]);
    });

    it("filters by rating100 BETWEEN", async () => {
      const tags = [
        createMockTag({ id: "t1", rating100: 50 }),
        createMockTag({ id: "t2", rating100: 80 }),
        createMockTag({ id: "t3", rating100: 30 }),
      ];
      const result = await applyTagFilters(tags, {
        rating100: { modifier: "BETWEEN", value: 40, value2: 60 },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t1");
    });

    it("filters by o_counter EQUALS", async () => {
      const tags = [
        createMockTag({ id: "t1", o_counter: 5 }),
        createMockTag({ id: "t2", o_counter: 10 }),
      ];
      const result = await applyTagFilters(tags, {
        o_counter: { modifier: "EQUALS", value: 5 },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t1");
    });

    it("filters by play_count LESS_THAN", async () => {
      const tags = [
        createMockTag({ id: "t1", play_count: 3 }),
        createMockTag({ id: "t2", play_count: 10 }),
      ];
      const result = await applyTagFilters(tags, {
        play_count: { modifier: "LESS_THAN", value: 5 },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t1");
    });

    it("filters by scene_count GREATER_THAN", async () => {
      const tags = [
        createMockTag({ id: "t1", scene_count: 20 }),
        createMockTag({ id: "t2", scene_count: 5 }),
      ];
      const result = await applyTagFilters(tags, {
        scene_count: { modifier: CriterionModifier.GreaterThan, value: 10 },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t1");
    });

    it("filters by name text search (case insensitive)", async () => {
      const tags = [
        createMockTag({ id: "t1", name: "Action" }),
        createMockTag({ id: "t2", name: "Comedy" }),
      ];
      const result = await applyTagFilters(tags, {
        name: { value: "act", modifier: CriterionModifier.Includes },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t1");
    });

    it("filters by description text search", async () => {
      const tags = [
        createMockTag({ id: "t1", description: "high energy scenes" }),
        createMockTag({ id: "t2", description: "relaxing content" }),
      ];
      const result = await applyTagFilters(tags, {
        description: { value: "energy", modifier: CriterionModifier.Includes },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t1");
    });

    it("filters by created_at GREATER_THAN", async () => {
      const tags = [
        createMockTag({ id: "t1", created_at: "2024-06-01T00:00:00Z" }),
        createMockTag({ id: "t2", created_at: "2024-01-01T00:00:00Z" }),
      ];
      const result = await applyTagFilters(tags, {
        created_at: {
          modifier: CriterionModifier.GreaterThan,
          value: "2024-03-01T00:00:00Z",
        },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t1");
    });

    it("filters by updated_at LESS_THAN", async () => {
      const tags = [
        createMockTag({ id: "t1", updated_at: "2024-02-01T00:00:00Z" }),
        createMockTag({ id: "t2", updated_at: "2024-06-01T00:00:00Z" }),
      ];
      const result = await applyTagFilters(tags, {
        updated_at: {
          modifier: CriterionModifier.LessThan,
          value: "2024-03-01T00:00:00Z",
        },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t1");
    });

    it("filters by performers (tags used by matching performers)", async () => {
      mockStashEntityService.getAllPerformers.mockResolvedValue([
        partialRow({
          id: "p1",
          name: "Perf 1",
          tags: [partialRow({ id: "t1", name: "Tag1" })],
        }),
      ]);

      const tags = [createMockTag({ id: "t1" }), createMockTag({ id: "t2" })];
      const result = await applyTagFilters(tags, {
        performers: { value: coerceEntityRefs(["p1"]), modifier: "INCLUDES" },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t1");
    });

    it("filters by studios (tags directly on matching studios)", async () => {
      mockStashEntityService.getAllStudios.mockResolvedValue([
        partialRow({
          id: "s1",
          name: "Studio 1",
          tags: [partialRow({ id: "t2", name: "Tag2" })],
        }),
      ]);

      const tags = [createMockTag({ id: "t1" }), createMockTag({ id: "t2" })];
      const result = await applyTagFilters(tags, {
        studios: { value: coerceEntityRefs(["s1"]), modifier: "INCLUDES" },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t2");
    });

    it("filters by scenes_filter.id (tags on matching scenes)", async () => {
      mockStashEntityService.getAllScenes.mockResolvedValue([
        partialRow({
          id: "sc1",
          tags: [partialRow({ id: "t1", name: "Tag1" })],
          performers: [],
        }),
      ]);
      mockStashEntityService.getAllPerformers.mockResolvedValue([]);

      const tags = [createMockTag({ id: "t1" }), createMockTag({ id: "t2" })];
      const result = await applyTagFilters(tags, {
        scenes_filter: {
          id: {
            value: coerceEntityRefs(["sc1"]),
            modifier: CriterionModifier.Includes,
          },
        },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t1");
    });

    it("filters by scenes_filter.groups (tags on scenes in those groups)", async () => {
      mockStashEntityService.getAllScenes.mockResolvedValue([
        partialRow({
          id: "sc1",
          tags: [partialRow({ id: "t1", name: "Tag1" })],
          performers: [],
          groups: [partialRow({ id: "g1" })],
        }),
      ]);
      mockStashEntityService.getAllPerformers.mockResolvedValue([]);

      const tags = [createMockTag({ id: "t1" }), createMockTag({ id: "t2" })];
      const result = await applyTagFilters(tags, {
        scenes_filter: {
          groups: {
            value: coerceEntityRefs(["g1"]),
            modifier: CriterionModifier.Includes,
          },
        },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("t1");
    });
  });

  // ─── findTags HTTP handler ──────────────────────────────────

  describe("findTags", () => {
    it("returns tags from query builder on happy path", async () => {
      const tags = [createMockTag({ id: "t1", name: "TestTag" })];
      mockTagQueryBuilder.execute.mockResolvedValue({ tags, total: 1 });

      const req = reqFor(findTags, {
        body: { filter: {}, tag_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findTags);

      await findTags(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getOkBody();
      expect(body.findTags.count).toBe(1);
      expect(body.findTags.tags).toHaveLength(1);
    });

    it("adds stashUrl to each tag for an admin", async () => {
      mockTagQueryBuilder.execute.mockResolvedValue({
        tags: [createMockTag({ id: "t1" })],
        total: 1,
      });

      const req = reqFor(findTags, {
        body: { filter: {}, tag_filter: {} },
        user: adminUser,
      });
      const res = resFor(findTags);

      await findTags(req, res);

      expect(must(res._getOkBody().findTags.tags[0])).toHaveProperty(
        "stashUrl",
        "http://stash/tags/t1"
      );
    });

    it("does not send stashUrl to a regular user", async () => {
      mockTagQueryBuilder.execute.mockResolvedValue({
        tags: [createMockTag({ id: "t1" }), createMockTag({ id: "t2" })],
        total: 2,
      });

      const req = reqFor(findTags, {
        body: { filter: {}, tag_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findTags);

      await findTags(req, res);

      const tags = res._getOkBody().findTags.tags;
      expect(tags).toHaveLength(2);
      for (const tag of tags) expect(tag).toHaveProperty("stashUrl", null);
    });

    it("returns 400 for ambiguous single-ID lookup", async () => {
      const tags = [
        createMockTag({ id: "t1", instanceId: "inst-a" }),
        createMockTag({ id: "t1", instanceId: "inst-b" }),
      ];
      mockTagQueryBuilder.execute.mockResolvedValue({ tags, total: 2 });

      const req = reqFor(findTags, {
        body: { ids: ["t1"], filter: {}, tag_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findTags);

      await findTags(req, res);

      expect(res._getStatus()).toBe(400);
      const body = res._getBody();
      assert("matches" in body, "expected an ambiguous-lookup body");
      expect(body.error).toBe("Ambiguous lookup");
      expect(body.matches).toHaveLength(2);
    });

    it("returns 500 when query builder throws", async () => {
      mockTagQueryBuilder.execute.mockRejectedValue(new Error("DB error"));

      const req = reqFor(findTags, { body: { filter: {} }, user: defaultUser });
      const res = resFor(findTags);

      await findTags(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getErrorBody().error).toBe("Failed to find tags");
    });

    it("fetches detail counts for single-ID lookup", async () => {
      const tag = createMockTag({ id: "t1", instanceId: "default" });
      mockTagQueryBuilder.execute.mockResolvedValue({
        tags: [tag],
        total: 1,
      });
      mockStashEntityService.getTag.mockResolvedValue({
        ...tag,
        scene_count: 42,
        image_count: 10,
        gallery_count: 3,
        performer_count: 5,
        studio_count: 2,
        group_count: 1,
        scene_marker_count: 7,
      });
      mockStashEntityService.getAllTags.mockResolvedValue([tag]);

      const req = reqFor(findTags, {
        body: { ids: ["t1"], filter: {}, tag_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findTags);

      await findTags(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockStashEntityService.getTag).toHaveBeenCalledWith(
        "t1",
        "default"
      );
    });

    it("does not skip exclusions when fetching by ids", async () => {
      mockTagQueryBuilder.execute.mockResolvedValue({ tags: [], total: 0 });

      const req = reqFor(findTags, {
        body: { ids: ["t1"], tag_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findTags);

      await findTags(req, res);

      expect(mockTagQueryBuilder.execute).toHaveBeenCalledTimes(1);
      const call = must(mockTagQueryBuilder.execute.mock.calls[0])[0];
      expect(call.applyExclusions).not.toBe(false);
    });
  });

  // ─── findTagsMinimal ────────────────────────────────────────

  describe("findTagsMinimal", () => {
    it("returns minimal tags on happy path", async () => {
      const tags = [
        createMockTag({ id: "t1", name: "Alpha" }),
        createMockTag({ id: "t2", name: "Beta" }),
      ];
      mockStashEntityService.getAllTags.mockResolvedValue(tags);

      const req = reqFor(findTagsMinimal, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findTagsMinimal);

      await findTagsMinimal(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().tags).toHaveLength(2);
    });

    it("applies search query filtering", async () => {
      const tags = [
        createMockTag({ id: "t1", name: "Action" }),
        createMockTag({ id: "t2", name: "Comedy" }),
      ];
      mockStashEntityService.getAllTags.mockResolvedValue(tags);

      const req = reqFor(findTagsMinimal, {
        body: { filter: { q: "act" } },
        user: defaultUser,
      });
      const res = resFor(findTagsMinimal);

      await findTagsMinimal(req, res);

      expect(res._getOkBody().tags).toHaveLength(1);
    });

    it("applies sorting by specified field", async () => {
      const tags = [
        createMockTag({ id: "t1", name: "Zebra" }),
        createMockTag({ id: "t2", name: "Alpha" }),
      ];
      mockStashEntityService.getAllTags.mockResolvedValue(tags);

      const req = reqFor(findTagsMinimal, {
        body: { filter: { sort: "name", direction: "ASC" } },
        user: defaultUser,
      });
      const res = resFor(findTagsMinimal);

      await findTagsMinimal(req, res);

      const result = res._getOkBody().tags;
      expect(must(result[0]).name).toBe("Alpha");
      expect(must(result[1]).name).toBe("Zebra");
    });

    it("respects per_page pagination", async () => {
      const tags = [
        createMockTag({ id: "t1", name: "A" }),
        createMockTag({ id: "t2", name: "B" }),
        createMockTag({ id: "t3", name: "C" }),
      ];
      mockStashEntityService.getAllTags.mockResolvedValue(tags);

      const req = reqFor(findTagsMinimal, {
        body: { filter: { per_page: 2 } },
        user: defaultUser,
      });
      const res = resFor(findTagsMinimal);

      await findTagsMinimal(req, res);

      expect(res._getOkBody().tags).toHaveLength(2);
    });

    it("applies count_filter with min_scene_count", async () => {
      const tags = [
        createMockTag({ id: "t1", scene_count: 10 }),
        createMockTag({ id: "t2", scene_count: 0 }),
      ];
      mockStashEntityService.getAllTags.mockResolvedValue(tags);

      const req = reqFor(findTagsMinimal, {
        body: { filter: {}, count_filter: { min_scene_count: 5 } },
        user: defaultUser,
      });
      const res = resFor(findTagsMinimal);

      await findTagsMinimal(req, res);

      expect(res._getOkBody().tags).toHaveLength(1);
    });

    it("returns 500 on error", async () => {
      mockStashEntityService.getAllTags.mockRejectedValue(
        new Error("cache failure")
      );

      const req = reqFor(findTagsMinimal, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findTagsMinimal);

      await findTagsMinimal(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ─── findTagsForScenes ──────────────────────────────────────

  describe("findTagsForScenes", () => {
    it("returns tags found on matching scenes", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { tagId: "t1" },
        { tagId: "t2" },
      ]);
      const allTags = [
        createMockTag({ id: "t1", name: "Tag1" }),
        createMockTag({ id: "t2", name: "Tag2" }),
      ];
      mockStashEntityService.getAllTags.mockResolvedValue(allTags);

      const req = reqFor(findTagsForScenes, {
        body: { performerId: "p1" },
        user: defaultUser,
      });
      const res = resFor(findTagsForScenes);

      await findTagsForScenes(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().tags.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty tags when no scene tags found", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const req = reqFor(findTagsForScenes, { user: defaultUser });
      const res = resFor(findTagsForScenes);

      await findTagsForScenes(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().tags).toEqual([]);
    });

    it("returns 500 on error", async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error("SQL error"));

      const req = reqFor(findTagsForScenes, { user: defaultUser });
      const res = resFor(findTagsForScenes);

      await findTagsForScenes(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getErrorBody().error).toBe("Failed to find tags for scenes");
    });
  });
});
