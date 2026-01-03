import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { imageQueryBuilder } from "../ImageQueryBuilder.js";
import prisma from "../../prisma/singleton.js";

describe("ImageQueryBuilder", () => {
  const testUserId = 9999;

  // Use numeric string IDs to match real Stash IDs (which are numeric)
  const testImageIds = ["999001", "999002", "999003"];

  beforeEach(async () => {
    // Create test user
    await prisma.user.create({
      data: { id: testUserId, username: "test-iqb", password: "test" },
    });

    // Create test images with numeric string IDs (matching Stash's ID format)
    await prisma.stashImage.createMany({
      data: [
        { id: testImageIds[0], title: "Image One", stashCreatedAt: new Date("2024-01-01") },
        { id: testImageIds[1], title: "Image Two", stashCreatedAt: new Date("2024-01-02") },
        { id: testImageIds[2], title: "Image Three", stashCreatedAt: new Date("2024-01-03") },
      ],
    });
  });

  afterEach(async () => {
    await prisma.stashImage.deleteMany({ where: { id: { in: testImageIds } } });
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
      expect(result.images[0].id).toBe(testImageIds[2]); // Most recent first
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
      expect(result.images[0].id).toBe(testImageIds[0]); // Third image on page 2
    });
  });

  describe("user data filters", () => {
    beforeEach(async () => {
      // Add user ratings
      await prisma.imageRating.createMany({
        data: [
          { userId: testUserId, imageId: testImageIds[0], rating: 80, favorite: true },
          { userId: testUserId, imageId: testImageIds[1], rating: 40, favorite: false },
        ],
      });
      // Add view history
      await prisma.imageViewHistory.createMany({
        data: [
          { userId: testUserId, imageId: testImageIds[0], oCount: 5, viewCount: 10 },
          { userId: testUserId, imageId: testImageIds[2], oCount: 2, viewCount: 3 },
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
      expect(result.images[0].id).toBe(testImageIds[0]);
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
      expect(result.images[0].id).toBe(testImageIds[0]);
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
      expect(result.images[0].id).toBe(testImageIds[0]);
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
          { imageId: testImageIds[0], performerId: "perf-1" },
          { imageId: testImageIds[1], performerId: "perf-2" },
        ],
      });
      // Link tags to images
      await prisma.imageTag.createMany({
        data: [
          { imageId: testImageIds[0], tagId: "tag-1" },
          { imageId: testImageIds[1], tagId: "tag-2" },
        ],
      });
      // Set studio on image
      await prisma.stashImage.update({
        where: { id: testImageIds[0] },
        data: { studioId: "studio-1" },
      });
      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: testImageIds[0], galleryId: "gallery-1" },
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
      expect(result.images[0].id).toBe(testImageIds[0]);
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
      expect(result.images[0].id).toBe(testImageIds[1]);
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
      expect(result.images[0].id).toBe(testImageIds[0]);
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
      expect(result.images[0].id).toBe(testImageIds[0]);
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
      expect(result.images[0].id).toBe(testImageIds[1]);
    });

    it("filters by IDs", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { ids: { value: [testImageIds[0], testImageIds[2]], modifier: "INCLUDES" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(2);
      expect(result.images.map((i: any) => i.id).sort()).toEqual([testImageIds[0], testImageIds[2]].sort());
    });
  });

  describe("exclusion filtering", () => {
    beforeEach(async () => {
      // Exclude 999002 for the test user
      await prisma.userExcludedEntity.create({
        data: {
          userId: testUserId,
          entityType: "image",
          entityId: "999002",
          reason: "hidden",
        },
      });
    });

    afterEach(async () => {
      await prisma.userExcludedEntity.deleteMany({ where: { userId: testUserId } });
    });

    it("excludes images when applyExclusions is true (default)", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(2);
      expect(result.images.map((i: any) => i.id)).not.toContain("999002");
    });

    it("includes all images when applyExclusions is false", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        applyExclusions: false,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(3);
      expect(result.images.map((i: any) => i.id)).toContain("999002");
    });
  });

  describe("getByIds", () => {
    it("returns images by IDs with user data", async () => {
      await prisma.imageRating.create({
        data: { userId: testUserId, imageId: "999001", rating: 90, favorite: true },
      });

      const result = await imageQueryBuilder.getByIds({
        userId: testUserId,
        ids: ["999001", "999003"],
      });

      expect(result.images).toHaveLength(2);

      const img1 = result.images.find((i: any) => i.id === "999001");
      expect(img1.userRating).toBe(90);
      expect(img1.userFavorite).toBeTruthy(); // SQLite may return 1 or true
    });

    afterEach(async () => {
      await prisma.imageRating.deleteMany({ where: { userId: testUserId } });
    });
  });

  describe("random sort", () => {
    it("returns stable ordering with same seed", async () => {
      const seed = 12345;

      const result1 = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "random",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        randomSeed: seed,
      });

      const result2 = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "random",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        randomSeed: seed,
      });

      // Same seed should produce same order
      expect(result1.images.map((i: any) => i.id)).toEqual(
        result2.images.map((i: any) => i.id)
      );
    });

    it("returns different ordering with different seeds", async () => {
      const seed1 = 11111111;
      const seed2 = 99999999;

      const result1 = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "random",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        randomSeed: seed1,
      });

      const result2 = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "random",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        randomSeed: seed2,
      });

      // Different seeds should produce different orders (with enough images)
      if (result1.images.length >= 2 && result2.images.length >= 2) {
        const order1 = result1.images.map((i: any) => i.id).join(",");
        const order2 = result2.images.map((i: any) => i.id).join(",");
        expect(order1).not.toEqual(order2);
      }
    });

    it("reverses order when direction changes with same seed", async () => {
      const seed = 12345678;

      const ascResult = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "random",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        randomSeed: seed,
      });

      const descResult = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "random",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
        randomSeed: seed,
      });

      // Same seed with opposite directions should give reversed order
      if (ascResult.images.length >= 2 && descResult.images.length >= 2) {
        const ascIds = ascResult.images.map((i: any) => i.id);
        const descIds = descResult.images.map((i: any) => i.id);
        expect(ascIds).toEqual(descIds.reverse());
      }
    });
  });
});
