/**
 * Unit Tests for Images Library Controller
 *
 * Tests findImages and findImageById.
 * Note: mergeImagesWithUserData and transformImageResult are private
 * and tested indirectly through the handlers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (must come before module import) ---

vi.mock("../../../prisma/singleton.js", () => ({
  default: {
    imageRating: { findMany: vi.fn() },
    imageViewHistory: { findMany: vi.fn() },
  },
}));

vi.mock("../../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getImage: vi.fn(),
  },
}));

vi.mock("../../../services/ImageQueryBuilder.js", () => ({
  imageQueryBuilder: { execute: vi.fn() },
}));

vi.mock("../../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    get: vi.fn(),
    getDefaultConfig: vi.fn().mockReturnValue({ id: "default" }),
  },
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../utils/stashUrl.js", () => ({
  buildStashEntityUrl: vi
    .fn()
    .mockImplementation((_type, id) => `http://stash/images/${id}`),
}));

// --- Imports ---

import prisma from "../../../prisma/singleton.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import { imageQueryBuilder } from "../../../services/ImageQueryBuilder.js";
import {
  findImages,
  findImageById,
} from "../../../controllers/library/images.js";
import { mockReq, mockRes } from "../../helpers/controllerTestUtils.js";

const mockPrisma = vi.mocked(prisma);
const mockStashEntityService = vi.mocked(stashEntityService);
const mockImageQueryBuilder = vi.mocked(imageQueryBuilder);

const defaultUser = { id: 1, role: "USER" };
const adminUser = { id: 1, role: "ADMIN" };

/** Helper to create a minimal mock image for query builder results */
function createQueryBuilderImage(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "img1",
    stashInstanceId: overrides.stashInstanceId ?? "default",
    instanceId: overrides.instanceId ?? "default",
    title: overrides.title ?? "Test Image",
    pathThumbnail: "/api/proxy/image/img1/thumbnail",
    pathPreview: "/api/proxy/image/img1/preview",
    pathImage: "/api/proxy/image/img1/image",
    userRating: overrides.userRating ?? null,
    userFavorite: overrides.userFavorite ?? 0,
    userOCount: overrides.userOCount ?? 0,
    userViewCount: overrides.userViewCount ?? 0,
    userLastViewedAt: overrides.userLastViewedAt ?? null,
    stashRating100: overrides.stashRating100 ?? null,
    stashOCounter: overrides.stashOCounter ?? 0,
    ...overrides,
  };
}

/** Helper to create a mock NormalizedImage for findImageById */
function createMockNormalizedImage(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "img1",
    instanceId: overrides.instanceId ?? "default",
    title: overrides.title ?? "Test Image",
    code: null,
    details: null,
    photographer: null,
    date: null,
    rating100: overrides.rating100 ?? null,
    o_counter: overrides.o_counter ?? 0,
    organized: false,
    paths: {
      thumbnail: "/api/proxy/image/img1/thumbnail",
      preview: "/api/proxy/image/img1/preview",
      image: "/api/proxy/image/img1/image",
    },
    width: 800,
    height: 600,
    filePath: "/path/img1.jpg",
    fileSize: 1024,
    performers: [],
    tags: [],
    studio: null,
    galleries: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Images Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.imageRating.findMany.mockResolvedValue([]);
    mockPrisma.imageViewHistory.findMany.mockResolvedValue([]);
  });

  // ─── findImages HTTP handler ────────────────────────────────

  describe("findImages", () => {
    it("returns images from query builder on happy path", async () => {
      const images = [createQueryBuilderImage({ id: "img1" })];
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: images as any,
        total: 1,
      });

      const req = mockReq(
        { filter: {}, image_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findImages(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getBody();
      expect(body.findImages.count).toBe(1);
      expect(body.findImages.images).toHaveLength(1);
    });

    it("transforms image results with paths object", async () => {
      const images = [
        createQueryBuilderImage({
          id: "img1",
          pathThumbnail: "/thumb",
          pathPreview: "/prev",
          pathImage: "/full",
        }),
      ];
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: images as any,
        total: 1,
      });

      const req = mockReq(
        { filter: {}, image_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findImages(req, res);

      const body = res._getBody();
      const img = body.findImages.images[0];
      expect(img.paths).toEqual({
        thumbnail: "/thumb",
        preview: "/prev",
        image: "/full",
      });
    });

    it("adds stashUrl to each image", async () => {
      const images = [createQueryBuilderImage({ id: "img1" })];
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: images as any,
        total: 1,
      });

      const req = mockReq(
        { filter: {}, image_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findImages(req, res);

      const body = res._getBody();
      expect(body.findImages.images[0].stashUrl).toBe(
        "http://stash/images/img1"
      );
    });

    it("passes filter parameters to query builder", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = mockReq(
        {
          filter: { sort: "title", direction: "DESC", page: 2, per_page: 20 },
          image_filter: {
            favorite: true,
            rating100: { modifier: "GREATER_THAN", value: 50 },
          },
        },
        {},
        defaultUser
      );
      const res = mockRes();

      await findImages(req, res);

      expect(mockImageQueryBuilder.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          sort: "title",
          sortDirection: "DESC",
          page: 2,
          perPage: 20,
        })
      );
    });

    it("builds filters from image_filter body", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = mockReq(
        {
          filter: {},
          image_filter: {
            performers: { value: ["p1"], modifier: "INCLUDES" },
            tags: { value: ["t1"], modifier: "INCLUDES" },
            studios: { value: ["s1"] },
            galleries: { value: ["g1"] },
          },
        },
        {},
        defaultUser
      );
      const res = mockRes();

      await findImages(req, res);

      const callArgs = mockImageQueryBuilder.execute.mock.calls[0][0];
      expect(callArgs.filters.performers).toEqual({
        value: ["p1"],
        modifier: "INCLUDES",
      });
      expect(callArgs.filters.tags).toEqual({
        value: ["t1"],
        modifier: "INCLUDES",
      });
      expect(callArgs.filters.studios).toEqual({
        value: ["s1"],
        modifier: "INCLUDES",
      });
      expect(callArgs.filters.galleries).toEqual({
        value: ["g1"],
        modifier: "INCLUDES",
      });
    });

    it("supports top-level ids parameter", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = mockReq(
        { filter: {}, ids: ["img1", "img2"] },
        {},
        defaultUser
      );
      const res = mockRes();

      await findImages(req, res);

      const callArgs = mockImageQueryBuilder.execute.mock.calls[0][0];
      expect(callArgs.filters.ids).toEqual({
        value: ["img1", "img2"],
        modifier: "INCLUDES",
      });
    });

    it("parses random_<seed> sort field", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = mockReq(
        { filter: { sort: "random_12345" }, image_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findImages(req, res);

      const callArgs = mockImageQueryBuilder.execute.mock.calls[0][0];
      expect(callArgs.sort).toBe("random");
      expect(callArgs.randomSeed).toBe(12345);
    });

    it("handles bare 'random' sort field", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = mockReq(
        { filter: { sort: "random" }, image_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findImages(req, res);

      const callArgs = mockImageQueryBuilder.execute.mock.calls[0][0];
      expect(callArgs.randomSeed).toBeDefined();
      expect(typeof callArgs.randomSeed).toBe("number");
    });

    it("admins skip exclusions", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = mockReq(
        { filter: {}, image_filter: {} },
        {},
        adminUser
      );
      const res = mockRes();

      await findImages(req, res);

      const callArgs = mockImageQueryBuilder.execute.mock.calls[0][0];
      expect(callArgs.applyExclusions).toBe(false);
    });

    it("non-admins apply exclusions", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = mockReq(
        { filter: {}, image_filter: {} },
        {},
        defaultUser
      );
      const res = mockRes();

      await findImages(req, res);

      const callArgs = mockImageQueryBuilder.execute.mock.calls[0][0];
      expect(callArgs.applyExclusions).toBe(true);
    });

    it("returns 500 when query builder throws", async () => {
      mockImageQueryBuilder.execute.mockRejectedValue(
        new Error("DB error")
      );

      const req = mockReq({ filter: {} }, {}, defaultUser);
      const res = mockRes();

      await findImages(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getBody().error).toBe("Failed to find images");
    });
  });

  // ─── findImageById ──────────────────────────────────────────

  describe("findImageById", () => {
    it("returns image with merged user data on happy path", async () => {
      const image = createMockNormalizedImage({ id: "img1" });
      mockStashEntityService.getImage.mockResolvedValue(image as any);

      const req = mockReq({}, { id: "img1" }, defaultUser, {});
      const res = mockRes();

      await findImageById(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getBody();
      expect(body.id).toBe("img1");
      expect(body.stashUrl).toBe("http://stash/images/img1");
    });

    it("returns 404 when image not found", async () => {
      mockStashEntityService.getImage.mockResolvedValue(null as any);

      const req = mockReq({}, { id: "missing" }, defaultUser, {});
      const res = mockRes();

      await findImageById(req, res);

      expect(res._getStatus()).toBe(404);
      expect(res._getBody().error).toBe("Image not found");
    });

    it("uses instanceId from query parameter", async () => {
      const image = createMockNormalizedImage({
        id: "img1",
        instanceId: "custom-inst",
      });
      mockStashEntityService.getImage.mockResolvedValue(image as any);

      const req = mockReq({}, { id: "img1" }, defaultUser, {
        instanceId: "custom-inst",
      });
      const res = mockRes();

      await findImageById(req, res);

      expect(mockStashEntityService.getImage).toHaveBeenCalledWith(
        "img1",
        "custom-inst"
      );
    });

    it("falls back to default instance when no query param", async () => {
      const image = createMockNormalizedImage({ id: "img1" });
      mockStashEntityService.getImage.mockResolvedValue(image as any);

      const req = mockReq({}, { id: "img1" }, defaultUser, {});
      const res = mockRes();

      await findImageById(req, res);

      expect(mockStashEntityService.getImage).toHaveBeenCalledWith(
        "img1",
        "default"
      );
    });

    it("returns 500 on error", async () => {
      mockStashEntityService.getImage.mockRejectedValue(
        new Error("service fail")
      );

      const req = mockReq({}, { id: "img1" }, defaultUser, {});
      const res = mockRes();

      await findImageById(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getBody().error).toBe("Failed to find image");
    });
  });
});
