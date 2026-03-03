/**
 * Unit Tests for Galleries Library Controller
 *
 * Tests applyGalleryFilters, findGalleries, findGalleryById,
 * findGalleriesMinimal, and getGalleryImages.
 * Note: mergeGalleriesWithUserData and mergeImagesWithUserData are private
 * and tested indirectly through the handlers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (must come before module import) ---

vi.mock("../../../prisma/singleton.js", () => ({
  default: {
    galleryRating: { findMany: vi.fn() },
    imageRating: { findMany: vi.fn() },
    stashImage: { findMany: vi.fn(), count: vi.fn() },
  },
}));

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

vi.mock("../../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    get: vi.fn(),
    getDefaultConfig: vi.fn().mockReturnValue({ id: "default" }),
  },
}));

vi.mock("../../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    filterExcluded: vi.fn().mockImplementation((items) => items),
  },
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("@peek/shared-types/instanceAwareId.js", () => ({
  coerceEntityRefs: vi.fn().mockImplementation((ids) => ids),
}));

vi.mock("../../../utils/hierarchyUtils.js", () => ({
  expandStudioIds: vi
    .fn()
    .mockImplementation((ids) => Promise.resolve(ids)),
  expandTagIds: vi.fn().mockImplementation((ids) => Promise.resolve(ids)),
}));

vi.mock("../../../controllers/library/performers.js", () => ({
  mergePerformersWithUserData: vi
    .fn()
    .mockImplementation((items) => Promise.resolve(items)),
}));

vi.mock("../../../controllers/library/studios.js", () => ({
  mergeStudiosWithUserData: vi
    .fn()
    .mockImplementation((items) => Promise.resolve(items)),
}));

vi.mock("../../../controllers/library/tags.js", () => ({
  mergeTagsWithUserData: vi
    .fn()
    .mockImplementation((items) => Promise.resolve(items)),
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../utils/seededRandom.js", () => ({
  parseRandomSort: vi
    .fn()
    .mockImplementation((field) => ({ sortField: field, randomSeed: undefined })),
}));

vi.mock("../../../utils/stashUrl.js", () => ({
  buildStashEntityUrl: vi
    .fn()
    .mockImplementation((_type, id) => `http://stash/galleries/${id}`),
}));

// --- Imports ---

import prisma from "../../../prisma/singleton.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import { galleryQueryBuilder } from "../../../services/GalleryQueryBuilder.js";
import {
  applyGalleryFilters,
  findGalleries,
  findGalleryById,
  findGalleriesMinimal,
  getGalleryImages,
} from "../../../controllers/library/galleries.js";
import { mockReq, mockRes } from "../../helpers/controllerTestUtils.js";
import { createMockGallery } from "../../helpers/mockDataGenerators.js";

const mockPrisma = vi.mocked(prisma);
const mockStashEntityService = vi.mocked(stashEntityService);
const mockGalleryQueryBuilder = vi.mocked(galleryQueryBuilder);

const defaultUser = { id: 1, role: "USER" };
const adminUser = { id: 1, role: "ADMIN" };

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
        ids: { value: ["g1", "g3"], modifier: "INCLUDES" },
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
      expect(result[0].id).toBe("g1");
    });

    it("filters by rating100 GREATER_THAN", async () => {
      const galleries = [
        createMockGallery({ id: "g1", rating100: 80 }),
        createMockGallery({ id: "g2", rating100: 30 }),
      ];
      const result = await applyGalleryFilters(galleries, {
        rating100: { modifier: "GREATER_THAN", value: 50 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by rating100 BETWEEN", async () => {
      const galleries = [
        createMockGallery({ id: "g1", rating100: 50 }),
        createMockGallery({ id: "g2", rating100: 80 }),
        createMockGallery({ id: "g3", rating100: 20 }),
      ];
      const result = await applyGalleryFilters(galleries, {
        rating100: { modifier: "BETWEEN", value: 40, value2: 60 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by image_count GREATER_THAN", async () => {
      const galleries = [
        createMockGallery({ id: "g1", image_count: 100 }),
        createMockGallery({ id: "g2", image_count: 5 }),
      ];
      const result = await applyGalleryFilters(galleries, {
        image_count: { modifier: "GREATER_THAN", value: 50 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by image_count EQUALS", async () => {
      const galleries = [
        createMockGallery({ id: "g1", image_count: 10 }),
        createMockGallery({ id: "g2", image_count: 20 }),
      ];
      const result = await applyGalleryFilters(galleries, {
        image_count: { modifier: "EQUALS", value: 10 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by title text search", async () => {
      const galleries = [
        createMockGallery({ id: "g1", title: "Beach Photos" }),
        createMockGallery({ id: "g2", title: "Urban Shots" }),
      ];
      const result = await applyGalleryFilters(galleries, {
        title: { value: "beach", modifier: "INCLUDES" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by studios (with hierarchy expansion)", async () => {
      const galleries = [
        createMockGallery({
          id: "g1",
          studio: { id: "s1", name: "Studio1" } as any,
        }),
        createMockGallery({
          id: "g2",
          studio: { id: "s2", name: "Studio2" } as any,
        }),
        createMockGallery({ id: "g3", studio: null }),
      ];
      const result = await applyGalleryFilters(galleries, {
        studios: { value: ["s1"] },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by performers", async () => {
      const galleries = [
        createMockGallery({
          id: "g1",
          performers: [{ id: "p1", name: "Perf1" }] as any,
        }),
        createMockGallery({
          id: "g2",
          performers: [{ id: "p2", name: "Perf2" }] as any,
        }),
      ];
      const result = await applyGalleryFilters(galleries, {
        performers: { value: ["p1"], modifier: "INCLUDES" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("filters by tags (with hierarchy expansion)", async () => {
      const galleries = [
        createMockGallery({
          id: "g1",
          tags: [{ id: "t1", name: "Tag1" }] as any,
        }),
        createMockGallery({
          id: "g2",
          tags: [{ id: "t2", name: "Tag2" }] as any,
        }),
      ];
      const result = await applyGalleryFilters(galleries, {
        tags: { value: ["t1"] },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });
  });

  // ─── findGalleries HTTP handler ─────────────────────────────

  describe("findGalleries", () => {
    it("returns galleries from query builder on happy path", async () => {
      const galleries = [
        createMockGallery({ id: "g1", title: "TestGallery" }),
      ];
      mockGalleryQueryBuilder.execute.mockResolvedValue({
        galleries,
        total: 1,
      });

      const req = mockReq(
        { filter: {}, gallery_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getBody();
      expect(body.findGalleries.count).toBe(1);
      expect(body.findGalleries.galleries).toHaveLength(1);
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

      const req = mockReq(
        { ids: ["g1"], filter: {}, gallery_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toBe("Ambiguous lookup");
    });

    it("returns 500 when query builder throws", async () => {
      mockGalleryQueryBuilder.execute.mockRejectedValue(
        new Error("DB error")
      );

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getBody().error).toBe("Failed to find galleries");
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
      } as any);

      const req = mockReq(
        { ids: ["g1"], filter: {}, gallery_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findGalleries(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockStashEntityService.getGallery).toHaveBeenCalledWith(
        "g1",
        "default"
      );
    });
  });

  // ─── findGalleryById ────────────────────────────────────────

  describe("findGalleryById", () => {
    it("returns gallery with hydrated data on happy path", async () => {
      const gallery = createMockGallery({
        id: "g1",
        instanceId: "default",
        performers: [],
        tags: [],
        studio: null,
      });
      mockStashEntityService.getGallery.mockResolvedValue(gallery as any);

      const req = mockReq({}, { id: "g1" }, defaultUser, {});
      const res = mockRes();

      await findGalleryById(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getBody();
      expect(body.id).toBe("g1");
    });

    it("returns 404 when gallery not found", async () => {
      mockStashEntityService.getGallery.mockResolvedValue(null as any);

      const req = mockReq({}, { id: "missing" }, defaultUser, {});
      const res = mockRes();

      await findGalleryById(req, res);

      expect(res._getStatus()).toBe(404);
      expect(res._getBody().error).toBe("Gallery not found");
    });

    it("hydrates performers with cached data", async () => {
      const gallery = createMockGallery({
        id: "g1",
        instanceId: "default",
        performers: [{ id: "p1", name: "Basic" }] as any,
        tags: [],
        studio: null,
      });
      mockStashEntityService.getGallery.mockResolvedValue(gallery as any);
      mockStashEntityService.getPerformersByIds.mockResolvedValue([
        { id: "p1", name: "Full Performer", image_path: "/img.jpg" },
      ] as any);

      const req = mockReq({}, { id: "g1" }, defaultUser, {});
      const res = mockRes();

      await findGalleryById(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockStashEntityService.getPerformersByIds).toHaveBeenCalled();
    });

    it("hydrates studio with cached data", async () => {
      const gallery = createMockGallery({
        id: "g1",
        instanceId: "default",
        performers: [],
        tags: [],
        studio: { id: "s1", name: "Basic" } as any,
      });
      mockStashEntityService.getGallery.mockResolvedValue(gallery as any);
      mockStashEntityService.getStudio.mockResolvedValue({
        id: "s1",
        name: "Full Studio",
        instanceId: "default",
      } as any);

      const req = mockReq({}, { id: "g1" }, defaultUser, {});
      const res = mockRes();

      await findGalleryById(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockStashEntityService.getStudio).toHaveBeenCalledWith(
        "s1",
        "default"
      );
    });

    it("hydrates tags with cached data", async () => {
      const gallery = createMockGallery({
        id: "g1",
        instanceId: "default",
        performers: [],
        tags: [{ id: "t1", name: "Basic" }] as any,
        studio: null,
      });
      mockStashEntityService.getGallery.mockResolvedValue(gallery as any);
      mockStashEntityService.getTagsByIds.mockResolvedValue([
        { id: "t1", name: "Full Tag" },
      ] as any);

      const req = mockReq({}, { id: "g1" }, defaultUser, {});
      const res = mockRes();

      await findGalleryById(req, res);

      expect(res._getStatus()).toBe(200);
      expect(mockStashEntityService.getTagsByIds).toHaveBeenCalled();
    });

    it("returns 500 on error", async () => {
      mockStashEntityService.getGallery.mockRejectedValue(
        new Error("service fail")
      );

      const req = mockReq({}, { id: "g1" }, defaultUser, {});
      const res = mockRes();

      await findGalleryById(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getBody().error).toBe("Failed to find gallery");
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

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findGalleriesMinimal(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody().galleries).toHaveLength(2);
    });

    it("returns empty when cache is not initialized", async () => {
      mockStashEntityService.getAllGalleries.mockResolvedValue([]);

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findGalleriesMinimal(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody().galleries).toEqual([]);
    });

    it("applies search query filtering", async () => {
      const galleries = [
        createMockGallery({ id: "g1", title: "Beach Photos" }),
        createMockGallery({ id: "g2", title: "Urban Shots" }),
      ];
      mockStashEntityService.getAllGalleries.mockResolvedValue(galleries);

      const req = mockReq({ filter: { q: "beach" } }, {}, defaultUser);
      const res = mockRes();

      await findGalleriesMinimal(req, res);

      expect(res._getBody().galleries).toHaveLength(1);
    });

    it("applies count_filter with min_image_count", async () => {
      const galleries = [
        createMockGallery({ id: "g1", image_count: 100 }),
        createMockGallery({ id: "g2", image_count: 2 }),
      ];
      mockStashEntityService.getAllGalleries.mockResolvedValue(galleries);

      const req = mockReq(
        { filter: {}, count_filter: { min_image_count: 10 } },
        {},
        defaultUser
      );
      const res = mockRes();

      await findGalleriesMinimal(req, res);

      expect(res._getBody().galleries).toHaveLength(1);
    });

    it("sorts by title", async () => {
      const galleries = [
        createMockGallery({ id: "g1", title: "Zebra" }),
        createMockGallery({ id: "g2", title: "Alpha" }),
      ];
      mockStashEntityService.getAllGalleries.mockResolvedValue(galleries);

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findGalleriesMinimal(req, res);

      const result = res._getBody().galleries;
      expect(result[0].title).toBe("Alpha");
      expect(result[1].title).toBe("Zebra");
    });

    it("returns 500 on error", async () => {
      mockStashEntityService.getAllGalleries.mockRejectedValue(
        new Error("fail")
      );

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findGalleriesMinimal(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });

  // ─── getGalleryImages ───────────────────────────────────────

  describe("getGalleryImages", () => {
    it("returns images for a gallery on happy path", async () => {
      mockStashEntityService.getGallery.mockResolvedValue(
        createMockGallery({ id: "g1" }) as any
      );
      mockPrisma.stashImage.findMany.mockResolvedValue([
        {
          id: "img1",
          title: "Image 1",
          code: null,
          details: null,
          photographer: null,
          date: null,
          width: 800,
          height: 600,
          rating100: null,
          oCounter: 0,
          filePath: "/path/img1.jpg",
          fileSize: BigInt(1024),
          stashCreatedAt: new Date(),
          stashUpdatedAt: new Date(),
          performers: [],
          tags: [],
          studio: null,
        },
      ] as any);

      const req = mockReq(
        {},
        { galleryId: "g1" },
        defaultUser,
        {}
      );
      const res = mockRes();

      await getGalleryImages(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getBody();
      expect(body.images).toHaveLength(1);
      expect(body.count).toBe(1);
    });

    it("returns 401 when userId is missing", async () => {
      const req = mockReq({}, { galleryId: "g1" }, {}, {});
      const res = mockRes();

      await getGalleryImages(req, res);

      expect(res._getStatus()).toBe(401);
      expect(res._getBody().error).toBe("Unauthorized");
    });

    it("includes pagination metadata when per_page is specified", async () => {
      mockStashEntityService.getGallery.mockResolvedValue(
        createMockGallery({ id: "g1" }) as any
      );
      mockPrisma.stashImage.count.mockResolvedValue(50);
      mockPrisma.stashImage.findMany.mockResolvedValue([
        {
          id: "img1",
          title: null,
          code: null,
          details: null,
          photographer: null,
          date: null,
          width: 800,
          height: 600,
          rating100: null,
          oCounter: 0,
          filePath: "/path/img1.jpg",
          fileSize: null,
          stashCreatedAt: null,
          stashUpdatedAt: null,
          performers: [],
          tags: [],
          studio: null,
        },
      ] as any);

      const req = mockReq(
        {},
        { galleryId: "g1" },
        defaultUser,
        { page: "1", per_page: "20" }
      );
      const res = mockRes();

      await getGalleryImages(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getBody();
      expect(body.pagination).toBeDefined();
      expect(body.pagination.total).toBe(50);
      expect(body.pagination.per_page).toBe(20);
    });

    it("returns 500 on error", async () => {
      mockStashEntityService.getGallery.mockRejectedValue(
        new Error("gallery error")
      );

      const req = mockReq(
        {},
        { galleryId: "g1" },
        defaultUser,
        {}
      );
      const res = mockRes();

      await getGalleryImages(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getBody().error).toBe("Failed to fetch gallery images");
    });
  });
});
