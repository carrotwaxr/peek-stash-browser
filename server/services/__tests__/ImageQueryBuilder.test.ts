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
});
