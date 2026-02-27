import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    galleryPerformer: { findMany: vi.fn().mockResolvedValue([]) },
    galleryTag: { findMany: vi.fn().mockResolvedValue([]) },
    stashPerformer: { findMany: vi.fn().mockResolvedValue([]) },
    stashTag: { findMany: vi.fn().mockResolvedValue([]) },
    stashStudio: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

// Mock hierarchy utils (expandTagIds)
vi.mock("../../utils/hierarchyUtils.js", () => ({
  expandTagIds: vi.fn().mockResolvedValue([]),
}));

// Mock titleUtils
vi.mock("../../utils/titleUtils.js", () => ({
  getGalleryFallbackTitle: vi.fn().mockReturnValue("Untitled Gallery"),
}));

import prisma from "../../prisma/singleton.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";

const mockPrisma = vi.mocked(prisma);

describe("GalleryQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: main query returns empty, count query returns {total: 0}
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // main query
      .mockResolvedValueOnce([{ total: 0 }]); // count query
  });

  describe("multi-instance support", () => {
    it("filters to a specific instance when specificInstanceId is provided", async () => {
      await galleryQueryBuilder.execute({
        userId: 1,
        sort: "title",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        specificInstanceId: "instance-abc",
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Must contain a WHERE clause pinning to the specific instance
      expect(mainQuerySql).toContain("g.stashInstanceId = ?");

      // The instance ID must be in the params
      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);
      expect(mainQueryParams).toContain("instance-abc");
    });

    it("does not add specific instance filter when specificInstanceId is not provided", async () => {
      await galleryQueryBuilder.execute({
        userId: 1,
        sort: "title",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Should NOT have a bare equality check for stashInstanceId
      expect(mainQuerySql).not.toContain("g.stashInstanceId = ?");
    });

    it("filters to allowed instances when allowedInstanceIds is provided", async () => {
      await galleryQueryBuilder.execute({
        userId: 1,
        sort: "title",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        allowedInstanceIds: ["inst-a", "inst-b"],
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Should contain IN clause for allowed instances
      expect(mainQuerySql).toContain("g.stashInstanceId IN (?, ?)");
      // Should include NULL fallback
      expect(mainQuerySql).toContain("g.stashInstanceId IS NULL");

      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);
      expect(mainQueryParams).toContain("inst-a");
      expect(mainQueryParams).toContain("inst-b");
    });

    it("does not add instance filter when allowedInstanceIds is empty", async () => {
      await galleryQueryBuilder.execute({
        userId: 1,
        sort: "title",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        allowedInstanceIds: [],
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).not.toContain("g.stashInstanceId IN");
    });
  });

  describe("exclusion filtering", () => {
    it("includes exclusion JOIN and WHERE by default", async () => {
      await galleryQueryBuilder.execute({
        userId: 1,
        sort: "title",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("UserExcludedEntity");
      expect(mainQuerySql).toContain("entityType = 'gallery'");
      expect(mainQuerySql).toContain("e.id IS NULL");
    });

    it("skips exclusion JOIN when applyExclusions is false", async () => {
      await galleryQueryBuilder.execute({
        userId: 1,
        sort: "title",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        applyExclusions: false,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).not.toContain("UserExcludedEntity");
      expect(mainQuerySql).not.toContain("e.id IS NULL");
    });
  });

  describe("search query", () => {
    it("searches across title and details fields", async () => {
      await galleryQueryBuilder.execute({
        userId: 1,
        sort: "title",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        searchQuery: "vacation",
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("LOWER(g.title) LIKE");
      expect(mainQuerySql).toContain("LOWER(g.details) LIKE");
    });
  });
});
