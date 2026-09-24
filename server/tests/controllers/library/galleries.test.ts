/**
 * Unit Tests for Galleries Library Controller
 *
 * Tests applyGalleryFilters, findGalleries and findGalleriesMinimal.
 * Note: mergeGalleriesWithUserData is private and tested indirectly through
 * the handlers.
 */
import { coerceEntityRefs } from "@peek/shared-types/instanceAwareId.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyGalleryFilters,
  findGalleries,
  findGalleriesMinimal,
} from "../../../controllers/library/galleries.js";
import { CriterionModifier } from "../../../graphql/types.js";
// --- Imports ---

import prisma from "../../../prisma/singleton.js";
import { galleryQueryBuilder } from "../../../services/GalleryQueryBuilder.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import { reqFor, resFor, testUser } from "../../helpers/controllerTestUtils.js";
import { createMockGallery } from "../../helpers/mockDataGenerators.js";
import { must } from "../../helpers/must.js";

// --- Mocks (must come before module import) ---

vi.mock(
  "../../../prisma/singleton.js",
  () => import("../../helpers/prismaSingletonMock.js")
);

vi.mock("../../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getAllGalleries: vi.fn(),
    getGallery: vi.fn(),
    getPerformersByIds: vi.fn().mockResolvedValue([]),
    getStudio: vi.fn(),
    getTagsByIds: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../services/GalleryQueryBuilder.js", () => ({
  galleryQueryBuilder: { execute: vi.fn() },
}));

vi.mock("../../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    filterExcluded: vi.fn().mockImplementation((items: unknown[]) => items),
  },
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("@peek/shared-types/instanceAwareId.js", () => ({
  coerceEntityRefs: vi.fn().mockImplementation((ids: string[]) => ids),
}));

vi.mock("../../../utils/hierarchyUtils.js", () => ({
  expandStudioIds: vi.fn().mockImplementation((ids) => Promise.resolve(ids)),
  expandTagIds: vi.fn().mockImplementation((ids) => Promise.resolve(ids)),
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
      ) => (viewer?.role === "ADMIN" ? `http://stash/galleries/${id}` : null)
    ),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockStashEntityService = vi.mocked(stashEntityService);
const mockGalleryQueryBuilder = vi.mocked(galleryQueryBuilder);

const defaultUser = testUser();
const adminUser = testUser({ role: "ADMIN" });

describe("Galleries Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no ratings
    mockPrisma.galleryRating.findMany.mockResolvedValue([]);
    mockPrisma.imageRating.findMany.mockResolvedValue([]);
  });

  // ─── applyGalleryFilters ────────────────────────────────────

  describe("applyGalleryFilters", () => {
    it("returns all galleries when filters is null", async () => {
      const galleries = [createMockGallery(), createMockGallery()];
      const result = await applyGalleryFilters(galleries, null);
      expect(result).toHaveLength(2);
    });

    it("returns all galleries when filters is undefined", async () => {
      const galleries = [createMockGallery()];
      const result = await applyGalleryFilters(galleries, undefined);
      expect(result).toHaveLength(1);
    });

    it("filters by ids", async () => {
      const galleries = [
        createMockGallery({ id: "g1" }),
        createMockGallery({ id: "g2" }),
        createMockGallery({ id: "g3" }),
      ];
      const result = await applyGalleryFilters(galleries, {
        ids: { value: coerceEntityRefs(["g1", "g3"]), modifier: "INCLUDES" },
      });
      expect(result).toHaveLength(2);
      expect(result.map((g) => g.id)).toEqual(["g1", "g3"]);
    });

    it("filters by favorite", async () => {
      const galleries = [
        createMockGallery({ id: "g1", favorite: true }),
        createMockGallery({ id: "g2", favorite: false }),
      ];
      const result = await applyGalleryFilters(galleries, { favorite: true });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("g1");
    });

    it("filters by rating100 GREATER_THAN", async () => {
      const galleries = [
        createMockGallery({ id: "g1", rating100: 80 }),
        createMockGallery({ id: "g2", rating100: 30 }),
      ];
      const result = await applyGalleryFilters(galleries, {
        rating100: { modifier: CriterionModifier.GreaterThan, value: 50 },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("g1");
    });

    it("filters by rating100 BETWEEN", async () => {
      const galleries = [
        createMockGallery({ id: "g1", rating100: 50 }),
        createMockGallery({ id: "g2", rating100: 80 }),
        createMockGallery({ id: "g3", rating100: 20 }),
      ];
      const result = await applyGalleryFilters(galleries, {
        rating100: {
          modifier: CriterionModifier.Between,
          value: 40,
          value2: 60,
        },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("g1");
    });

    it("filters by image_count GREATER_THAN", async () => {
      const galleries = [
        createMockGallery({ id: "g1", image_count: 100 }),
        createMockGallery({ id: "g2", image_count: 5 }),
      ];
      const result = await applyGalleryFilters(galleries, {
        image_count: { modifier: CriterionModifier.GreaterThan, value: 50 },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("g1");
    });

    it("filters by image_count EQUALS", async () => {
      const galleries = [
        createMockGallery({ id: "g1", image_count: 10 }),
        createMockGallery({ id: "g2", image_count: 20 }),
      ];
      const result = await applyGalleryFilters(galleries, {
        image_count: { modifier: CriterionModifier.Equals, value: 10 },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("g1");
    });

    it("filters by title text search", async () => {
      const galleries = [
        createMockGallery({ id: "g1", title: "Beach Photos" }),
        createMockGallery({ id: "g2", title: "Urban Shots" }),
      ];
      const result = await applyGalleryFilters(galleries, {
        title: { value: "beach", modifier: CriterionModifier.Includes },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("g1");
    });

    it("filters by studios (with hierarchy expansion)", async () => {
      const galleries = [
        createMockGallery({
          id: "g1",
          studio: { id: "s1", name: "Studio1" },
        }),
        createMockGallery({
          id: "g2",
          studio: { id: "s2", name: "Studio2" },
        }),
        createMockGallery({ id: "g3", studio: null }),
      ];
      const result = await applyGalleryFilters(galleries, {
        studios: {
          value: coerceEntityRefs(["s1"]),
          modifier: CriterionModifier.Includes,
        },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("g1");
    });

    it("filters by performers", async () => {
      const galleries = [
        createMockGallery({
          id: "g1",
          performers: [
            { id: "p1", name: "Perf1", gender: null, image_path: null },
          ],
        }),
        createMockGallery({
          id: "g2",
          performers: [
            { id: "p2", name: "Perf2", gender: null, image_path: null },
          ],
        }),
      ];
      const result = await applyGalleryFilters(galleries, {
        performers: {
          value: coerceEntityRefs(["p1"]),
          modifier: CriterionModifier.Includes,
        },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("g1");
    });

    it("filters by tags (with hierarchy expansion)", async () => {
      const galleries = [
        createMockGallery({
          id: "g1",
          tags: [{ id: "t1", name: "Tag1", image_path: null }],
        }),
        createMockGallery({
          id: "g2",
          tags: [{ id: "t2", name: "Tag2", image_path: null }],
        }),
      ];
      const result = await applyGalleryFilters(galleries, {
        tags: {
          value: coerceEntityRefs(["t1"]),
          modifier: CriterionModifier.Includes,
        },
      });
      expect(result).toHaveLength(1);
      expect(must(result[0]).id).toBe("g1");
    });
  });

  // ─── findGalleries HTTP handler ─────────────────────────────

  describe("findGalleries", () => {
    it("returns galleries from query builder on happy path", async () => {
      const galleries = [createMockGallery({ id: "g1", title: "TestGallery" })];
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        galleries,
        total: 1,
      });

      const req = reqFor(findGalleries, {
        body: { filter: {}, gallery_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getOkBody();
      expect(body.findGalleries.count).toBe(1);
      expect(body.findGalleries.galleries).toHaveLength(1);
    });

    it("adds stashUrl to each gallery for an admin", async () => {
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        galleries: [createMockGallery({ id: "g1" })],
        total: 1,
      });

      const req = reqFor(findGalleries, {
        body: { filter: {}, gallery_filter: {} },
        user: adminUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      expect(must(res._getOkBody().findGalleries.galleries[0])).toHaveProperty(
        "stashUrl",
        "http://stash/galleries/g1"
      );
    });

    it("does not send stashUrl to a regular user", async () => {
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        galleries: [
          createMockGallery({ id: "g1" }),
          createMockGallery({ id: "g2" }),
        ],
        total: 2,
      });

      const req = reqFor(findGalleries, {
        body: { filter: {}, gallery_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      const galleries = res._getOkBody().findGalleries.galleries;
      expect(galleries).toHaveLength(2);
      for (const gallery of galleries)
        expect(gallery).toHaveProperty("stashUrl", null);
    });

    it("returns 400 for ambiguous single-ID lookup", async () => {
      const galleries = [
        createMockGallery({ id: "g1", instanceId: "inst-a" }),
        createMockGallery({ id: "g1", instanceId: "inst-b" }),
      ];
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        galleries,
        total: 2,
      });

      const req = reqFor(findGalleries, {
        body: { ids: ["g1"], filter: {}, gallery_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toBe("Ambiguous lookup");
    });

    it("returns 500 when query builder throws", async () => {
      mockGalleryQueryBuilder.execute.mockRejectedValue(new Error("DB error"));

      const req = reqFor(findGalleries, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getErrorBody().error).toBe("Failed to find galleries");
    });

    it("fetches detail counts for single-ID lookup", async () => {
      const gallery = createMockGallery({
        id: "g1",
        instanceId: "default",
      });
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        galleries: [gallery],
        total: 1,
      });
      mockStashEntityService.getGallery.mockResolvedValue({
        ...gallery,
        image_count: 42,
      });

      const req = reqFor(findGalleries, {
        body: { ids: ["g1"], filter: {}, gallery_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleries);

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockStashEntityService.getGallery).toHaveBeenCalledWith(
        "g1",
        "default"
      );
    });
  });

  // ─── findGalleriesMinimal ───────────────────────────────────

  describe("findGalleriesMinimal", () => {
    it("returns minimal galleries on happy path", async () => {
      const galleries = [
        createMockGallery({ id: "g1", title: "Alpha" }),
        createMockGallery({ id: "g2", title: "Beta" }),
      ];
      mockStashEntityService.getAllGalleries.mockResolvedValue(galleries);

      const req = reqFor(findGalleriesMinimal, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().galleries).toHaveLength(2);
    });

    it("returns empty when cache is not initialized", async () => {
      mockStashEntityService.getAllGalleries.mockResolvedValue([]);

      const req = reqFor(findGalleriesMinimal, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getOkBody().galleries).toEqual([]);
    });

    it("applies search query filtering", async () => {
      const galleries = [
        createMockGallery({ id: "g1", title: "Beach Photos" }),
        createMockGallery({ id: "g2", title: "Urban Shots" }),
      ];
      mockStashEntityService.getAllGalleries.mockResolvedValue(galleries);

      const req = reqFor(findGalleriesMinimal, {
        body: { filter: { q: "beach" } },
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      expect(res._getOkBody().galleries).toHaveLength(1);
    });

    it("applies count_filter with min_image_count", async () => {
      const galleries = [
        createMockGallery({ id: "g1", image_count: 100 }),
        createMockGallery({ id: "g2", image_count: 2 }),
      ];
      mockStashEntityService.getAllGalleries.mockResolvedValue(galleries);

      const req = reqFor(findGalleriesMinimal, {
        body: { filter: {}, count_filter: { min_image_count: 10 } },
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      expect(res._getOkBody().galleries).toHaveLength(1);
    });

    it("sorts by title", async () => {
      const galleries = [
        createMockGallery({ id: "g1", title: "Zebra" }),
        createMockGallery({ id: "g2", title: "Alpha" }),
      ];
      mockStashEntityService.getAllGalleries.mockResolvedValue(galleries);

      const req = reqFor(findGalleriesMinimal, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      const result = res._getOkBody().galleries;
      expect(must(result[0]).title).toBe("Alpha");
      expect(must(result[1]).title).toBe("Zebra");
    });

    it("returns 500 on error", async () => {
      mockStashEntityService.getAllGalleries.mockRejectedValue(
        new Error("fail")
      );

      const req = reqFor(findGalleriesMinimal, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findGalleriesMinimal);

      await findGalleriesMinimal(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });
});
