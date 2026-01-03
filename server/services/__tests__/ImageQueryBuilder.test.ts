import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { imageQueryBuilder } from "../ImageQueryBuilder.js";
import prisma from "../../prisma/singleton.js";

describe("ImageQueryBuilder", () => {
  const testUserId = 9999;

  beforeEach(async () => {
    // Create test user
    await prisma.user.create({
      data: { id: testUserId, username: "test-iqb", password: "test" },
    });

    // Create test images
    await prisma.stashImage.createMany({
      data: [
        { id: "img-1", title: "Image One", stashCreatedAt: new Date("2024-01-01") },
        { id: "img-2", title: "Image Two", stashCreatedAt: new Date("2024-01-02") },
        { id: "img-3", title: "Image Three", stashCreatedAt: new Date("2024-01-03") },
      ],
    });
  });

  afterEach(async () => {
    await prisma.stashImage.deleteMany({ where: { id: { startsWith: "img-" } } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  describe("execute", () => {
    it("returns paginated images with total count", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 2,
      });

      expect(result.total).toBe(3);
      expect(result.images).toHaveLength(2);
      expect(result.images[0].id).toBe("img-3"); // Most recent first
    });

    it("respects page parameter", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "created_at",
        sortDirection: "DESC",
        page: 2,
        perPage: 2,
      });

      expect(result.total).toBe(3);
      expect(result.images).toHaveLength(1);
      expect(result.images[0].id).toBe("img-1"); // Third image on page 2
    });
  });

  describe("user data filters", () => {
    beforeEach(async () => {
      // Add user ratings
      await prisma.imageRating.createMany({
        data: [
          { userId: testUserId, imageId: "img-1", rating: 80, favorite: true },
          { userId: testUserId, imageId: "img-2", rating: 40, favorite: false },
        ],
      });
      // Add view history
      await prisma.imageViewHistory.createMany({
        data: [
          { userId: testUserId, imageId: "img-1", oCount: 5, viewCount: 10 },
          { userId: testUserId, imageId: "img-3", oCount: 2, viewCount: 3 },
        ],
      });
    });

    afterEach(async () => {
      await prisma.imageRating.deleteMany({ where: { userId: testUserId } });
      await prisma.imageViewHistory.deleteMany({ where: { userId: testUserId } });
    });

    it("filters by favorite", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { favorite: true },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-1");
    });

    it("filters by rating100 GREATER_THAN", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { rating100: { value: 50, modifier: "GREATER_THAN" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-1");
    });

    it("filters by o_counter GREATER_THAN", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { o_counter: { value: 3, modifier: "GREATER_THAN" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-1");
    });
  });

  describe("entity filters", () => {
    beforeEach(async () => {
      // Create performers
      await prisma.stashPerformer.createMany({
        data: [
          { id: "perf-1", name: "Performer One" },
          { id: "perf-2", name: "Performer Two" },
        ],
      });
      // Create tags
      await prisma.stashTag.createMany({
        data: [
          { id: "tag-1", name: "Tag One" },
          { id: "tag-2", name: "Tag Two" },
        ],
      });
      // Create studio
      await prisma.stashStudio.create({
        data: { id: "studio-1", name: "Studio One" },
      });
      // Create gallery
      await prisma.stashGallery.create({
        data: { id: "gallery-1", title: "Gallery One" },
      });

      // Link performers to images
      await prisma.imagePerformer.createMany({
        data: [
          { imageId: "img-1", performerId: "perf-1" },
          { imageId: "img-2", performerId: "perf-2" },
        ],
      });
      // Link tags to images
      await prisma.imageTag.createMany({
        data: [
          { imageId: "img-1", tagId: "tag-1" },
          { imageId: "img-2", tagId: "tag-2" },
        ],
      });
      // Set studio on image
      await prisma.stashImage.update({
        where: { id: "img-1" },
        data: { studioId: "studio-1" },
      });
      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: "img-1", galleryId: "gallery-1" },
      });
    });

    afterEach(async () => {
      await prisma.imageGallery.deleteMany({});
      await prisma.imagePerformer.deleteMany({});
      await prisma.imageTag.deleteMany({});
      await prisma.stashGallery.deleteMany({ where: { id: "gallery-1" } });
      await prisma.stashStudio.deleteMany({ where: { id: "studio-1" } });
      await prisma.stashTag.deleteMany({ where: { id: { startsWith: "tag-" } } });
      await prisma.stashPerformer.deleteMany({ where: { id: { startsWith: "perf-" } } });
    });

    it("filters by performer INCLUDES", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { performers: { value: ["perf-1"], modifier: "INCLUDES" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-1");
    });

    it("filters by tag INCLUDES", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { tags: { value: ["tag-2"], modifier: "INCLUDES" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-2");
    });

    it("filters by studio INCLUDES", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { studios: { value: ["studio-1"], modifier: "INCLUDES" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-1");
    });

    it("filters by gallery INCLUDES", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { galleries: { value: ["gallery-1"], modifier: "INCLUDES" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-1");
    });
  });

  describe("search and ID filters", () => {
    it("filters by search query", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { q: "Two" },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-2");
    });

    it("filters by IDs", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { ids: { value: ["img-1", "img-3"], modifier: "INCLUDES" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(2);
      expect(result.images.map((i: any) => i.id).sort()).toEqual(["img-1", "img-3"].sort());
    });
  });
});
