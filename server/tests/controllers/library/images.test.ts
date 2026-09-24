/**
 * Unit Tests for Images Library Controller
 *
 * Tests findImages.
 * Note: transformImageResult is private and tested indirectly through the
 * handler.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findImages } from "../../../controllers/library/images.js";
// --- Imports ---

import prisma from "../../../prisma/singleton.js";
import { imageQueryBuilder } from "../../../services/ImageQueryBuilder.js";
import type { NormalizedImage } from "../../../types/index.js";
import { reqFor, resFor, testUser } from "../../helpers/controllerTestUtils.js";
import { must } from "../../helpers/must.js";

// --- Mocks (must come before module import) ---

vi.mock(
  "../../../prisma/singleton.js",
  () => import("../../helpers/prismaSingletonMock.js")
);

vi.mock("../../../services/ImageQueryBuilder.js", () => ({
  imageQueryBuilder: { execute: vi.fn() },
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
    .mockImplementation(
      (
        _type: string,
        id: string | number,
        _inst: string | undefined,
        viewer: { role: string } | undefined
      ) => (viewer?.role === "ADMIN" ? `http://stash/images/${id}` : null)
    ),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockImageQueryBuilder = vi.mocked(imageQueryBuilder);

const defaultUser = testUser();
const adminUser = testUser({ role: "ADMIN" });

/**
 * A query builder result row. `execute` declares `NormalizedImage[]` but
 * returns hydrated SQL rows of this shape (its `hydrateImages` casts them the
 * same way), which the controller reads; item 74 types the rows honestly.
 */
function createQueryBuilderImage(
  overrides: Record<string, unknown> = {}
): NormalizedImage {
  const row = {
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
  return row as unknown as NormalizedImage;
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
        images: images,
        total: 1,
      });

      const req = reqFor(findImages, {
        body: { filter: {}, image_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      expect(res._getStatus()).toBe(200);
      const body = res._getOkBody();
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
        images: images,
        total: 1,
      });

      const req = reqFor(findImages, {
        body: { filter: {}, image_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      const body = res._getOkBody();
      const img = must(body.findImages.images[0]);
      expect(img.paths).toEqual({
        thumbnail: "/thumb",
        preview: "/prev",
        image: "/full",
      });
    });

    it("adds stashUrl to each image for an admin", async () => {
      const images = [createQueryBuilderImage({ id: "img1" })];
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: images,
        total: 1,
      });

      const req = reqFor(findImages, {
        body: { filter: {}, image_filter: {} },
        user: adminUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      const body = res._getOkBody();
      expect(must(body.findImages.images[0])).toHaveProperty(
        "stashUrl",
        "http://stash/images/img1"
      );
    });

    it("does not send stashUrl to a regular user", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [
          createQueryBuilderImage({ id: "img1" }),
          createQueryBuilderImage({ id: "img2" }),
        ],
        total: 2,
      });

      const req = reqFor(findImages, {
        body: { filter: {}, image_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      const images = res._getOkBody().findImages.images;
      expect(images).toHaveLength(2);
      for (const image of images)
        expect(image).toHaveProperty("stashUrl", null);
    });

    it("passes filter parameters to query builder", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = reqFor(findImages, {
        body: {
          filter: { sort: "title", direction: "DESC", page: 2, per_page: 20 },
          image_filter: {
            favorite: true,
            rating100: { modifier: "GREATER_THAN", value: 50 },
          },
        },
        user: defaultUser,
      });
      const res = resFor(findImages);

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

      const req = reqFor(findImages, {
        body: {
          filter: {},
          image_filter: {
            performers: { value: ["p1"], modifier: "INCLUDES" },
            tags: { value: ["t1"], modifier: "INCLUDES" },
            studios: { value: ["s1"] },
            galleries: { value: ["g1"] },
          },
        },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      const callArgs = must(mockImageQueryBuilder.execute.mock.calls[0])[0];
      expect(callArgs.filters?.performers).toEqual({
        value: ["p1"],
        modifier: "INCLUDES",
      });
      expect(callArgs.filters?.tags).toEqual({
        value: ["t1"],
        modifier: "INCLUDES",
      });
      expect(callArgs.filters?.studios).toEqual({
        value: ["s1"],
        modifier: "INCLUDES",
      });
      expect(callArgs.filters?.galleries).toEqual({
        value: ["g1"],
        modifier: "INCLUDES",
      });
    });

    it("supports top-level ids parameter", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = reqFor(findImages, {
        body: { filter: {}, ids: ["img1", "img2"] },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      const callArgs = must(mockImageQueryBuilder.execute.mock.calls[0])[0];
      expect(callArgs.filters?.ids).toEqual({
        value: ["img1", "img2"],
        modifier: "INCLUDES",
      });
    });

    it("parses random_<seed> sort field", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = reqFor(findImages, {
        body: { filter: { sort: "random_12345" }, image_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      const callArgs = must(mockImageQueryBuilder.execute.mock.calls[0])[0];
      expect(callArgs.sort).toBe("random");
      expect(callArgs.randomSeed).toBe(12345);
    });

    it("handles bare 'random' sort field", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = reqFor(findImages, {
        body: { filter: { sort: "random" }, image_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      const callArgs = must(mockImageQueryBuilder.execute.mock.calls[0])[0];
      expect(callArgs.randomSeed).toBeDefined();
      expect(typeof callArgs.randomSeed).toBe("number");
    });

    it("admins apply exclusions too", async () => {
      // Their rows hold only their own hides and cascades (item 13)
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = reqFor(findImages, {
        body: { filter: {}, image_filter: {} },
        user: adminUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      const callArgs = must(mockImageQueryBuilder.execute.mock.calls[0])[0];
      expect(callArgs.applyExclusions).toBe(true);
    });

    it("non-admins apply exclusions", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = reqFor(findImages, {
        body: { filter: {}, image_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      const callArgs = must(mockImageQueryBuilder.execute.mock.calls[0])[0];
      expect(callArgs.applyExclusions).toBe(true);
    });

    it("returns 500 when query builder throws", async () => {
      mockImageQueryBuilder.execute.mockRejectedValue(new Error("DB error"));

      const req = reqFor(findImages, {
        body: { filter: {} },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getErrorBody().error).toBe("Failed to find images");
    });
  });
});
