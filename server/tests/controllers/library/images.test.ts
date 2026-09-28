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
import {
  type ImageListRow,
  imageQueryBuilder,
} from "../../../services/ImageQueryBuilder.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../../helpers/controllerTestUtils.js";
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

/** A row as the query builder's execute returns it, which the controller reads. */
function createQueryBuilderImage(
  overrides: Partial<ImageListRow> = {}
): ImageListRow {
  return {
    id: "img1",
    stashInstanceId: "default",
    instanceId: "default",
    title: "Test Image",
    code: null,
    details: null,
    photographer: null,
    urls: null,
    date: null,
    studioId: null,
    stashRating100: null,
    stashOCounter: 0,
    organized: false,
    filePath: null,
    width: null,
    height: null,
    fileSize: null,
    pathThumbnail: "/api/proxy/image/img1/thumbnail",
    pathPreview: "/api/proxy/image/img1/preview",
    pathImage: "/api/proxy/image/img1/image",
    stashCreatedAt: null,
    stashUpdatedAt: null,
    userRating: null,
    userFavorite: null,
    userViewCount: null,
    userOCount: null,
    userLastViewedAt: null,
    performers: [],
    tags: [],
    galleries: [],
    studio: null,
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
            performers: { value: ["11"], modifier: "INCLUDES" },
            tags: { value: ["12:inst-a"], modifier: "INCLUDES", depth: -1 },
            studios: { value: ["13"] },
            galleries: { value: ["14"] },
          },
        },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      const callArgs = must(mockImageQueryBuilder.execute.mock.calls[0])[0];
      expect(callArgs.filters?.performers).toEqual({
        value: ["11"],
        modifier: "INCLUDES",
      });
      expect(callArgs.filters?.tags).toEqual({
        value: ["12:inst-a"],
        modifier: "INCLUDES",
        depth: -1,
      });
      expect(callArgs.filters?.studios).toEqual({
        value: ["13"],
        modifier: "INCLUDES",
        depth: 0,
      });
      expect(callArgs.filters?.galleries).toEqual({
        value: ["14"],
        modifier: "INCLUDES",
      });
    });

    it("passes image_filter.instance_id as the specific instance", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = reqFor(findImages, {
        body: { ids: ["201"], image_filter: { instance_id: "inst-b" } },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      const callArgs = must(mockImageQueryBuilder.execute.mock.calls[0])[0];
      expect(callArgs.specificInstanceId).toBe("inst-b");
      expect(callArgs.filters?.ids).toEqual({
        value: ["201"],
        modifier: "INCLUDES",
      });
    });

    it("answers the ambiguous lookup for one bare id found on two instances", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [
          createQueryBuilderImage({ id: "201", instanceId: "inst-a" }),
          createQueryBuilderImage({ id: "201", instanceId: "inst-b" }),
        ],
        total: 2,
      });

      const req = reqFor(findImages, {
        body: { ids: ["201"] },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      expect(res._getStatus()).toBe(400);
      expect(res._getBody()).toMatchObject({
        error: "Ambiguous lookup",
        matches: [
          { id: "201", instanceId: "inst-a" },
          { id: "201", instanceId: "inst-b" },
        ],
      });
    });

    it("an unknown image_filter key answers 400 before any query", async () => {
      const req = reqFor(findImages, {
        body: malformed({ image_filter: { not_a_field: true } }),
        user: defaultUser,
      });
      const res = resFor(findImages);

      await expect(findImages(req, res)).rejects.toMatchObject({
        statusCode: 400,
        issues: [{ path: "image_filter.not_a_field" }],
      });
      expect(mockImageQueryBuilder.execute).not.toHaveBeenCalled();
    });

    it("supports top-level ids parameter", async () => {
      mockImageQueryBuilder.execute.mockResolvedValue({
        images: [],
        total: 0,
      });

      const req = reqFor(findImages, {
        body: { filter: {}, ids: ["201", "202:inst-b"] },
        user: defaultUser,
      });
      const res = resFor(findImages);

      await findImages(req, res);

      const callArgs = must(mockImageQueryBuilder.execute.mock.calls[0])[0];
      expect(callArgs.filters?.ids).toEqual({
        value: ["201", "202:inst-b"],
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
