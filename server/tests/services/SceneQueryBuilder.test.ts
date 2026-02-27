/**
 * Unit Tests for SceneQueryBuilder
 *
 * Tests the SQL query assembly for scene filtering, sorting, and pagination.
 * Verifies multi-instance support, exclusion filtering, search queries,
 * and allowedInstanceIds filtering by inspecting generated SQL.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    scenePerformer: { findMany: vi.fn().mockResolvedValue([]) },
    sceneTag: { findMany: vi.fn().mockResolvedValue([]) },
    sceneGroup: { findMany: vi.fn().mockResolvedValue([]) },
    sceneGallery: { findMany: vi.fn().mockResolvedValue([]) },
    stashPerformer: { findMany: vi.fn().mockResolvedValue([]) },
    stashTag: { findMany: vi.fn().mockResolvedValue([]) },
    stashStudio: { findMany: vi.fn().mockResolvedValue([]) },
    stashGroup: { findMany: vi.fn().mockResolvedValue([]) },
    stashGallery: { findMany: vi.fn().mockResolvedValue([]) },
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

// Mock hierarchy utils
vi.mock("../../utils/hierarchyUtils.js", () => ({
  expandTagIds: vi.fn(async (ids: string[]) => ids),
  expandStudioIds: vi.fn(async (ids: string[]) => ids),
}));

// Mock titleUtils
vi.mock("../../utils/titleUtils.js", () => ({
  getSceneFallbackTitle: vi.fn().mockReturnValue("Untitled"),
}));

import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";

const mockPrisma = vi.mocked(prisma);

describe("SceneQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: main query returns empty, count query returns {total: 0}
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // main query
      .mockResolvedValueOnce([{ total: 0 }]); // count query
  });

  describe("multi-instance support", () => {
    it("includes instanceId in Rating and WatchHistory JOINs", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Rating JOIN must match on instanceId
      expect(mainQuerySql).toContain("s.stashInstanceId = r.instanceId");
      // WatchHistory JOIN must match on instanceId
      expect(mainQuerySql).toContain("s.stashInstanceId = w.instanceId");
    });

    it("filters to allowed instances when allowedInstanceIds is provided", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
        allowedInstanceIds: ["inst-a", "inst-b"],
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Should contain IN clause for allowed instances
      expect(mainQuerySql).toContain("s.stashInstanceId IN (?, ?)");
      // Should include NULL fallback for backward compat
      expect(mainQuerySql).toContain("s.stashInstanceId IS NULL");

      // Params should contain the instance IDs
      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);
      expect(mainQueryParams).toContain("inst-a");
      expect(mainQueryParams).toContain("inst-b");
    });

    it("does not add instance filter when allowedInstanceIds is empty", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
        allowedInstanceIds: [],
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Should NOT contain the IN clause
      expect(mainQuerySql).not.toContain("s.stashInstanceId IN");
    });

    it("filters to a specific instance when specificInstanceId is provided", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
        specificInstanceId: "instance-abc",
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("s.stashInstanceId = ?");

      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);
      expect(mainQueryParams).toContain("instance-abc");
    });

    it("does not add specific instance filter when not provided", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Should NOT have a bare equality check
      expect(mainQuerySql).not.toContain("s.stashInstanceId = ?");
    });
  });

  describe("exclusion filtering", () => {
    it("includes exclusion JOIN and WHERE by default", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Should JOIN UserExcludedEntity
      expect(mainQuerySql).toContain("UserExcludedEntity");
      expect(mainQuerySql).toContain("entityType = 'scene'");
      // Should filter out excluded entities
      expect(mainQuerySql).toContain("e.id IS NULL");
    });

    it("skips exclusion JOIN when applyExclusions is false", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
        applyExclusions: false,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Should NOT JOIN UserExcludedEntity
      expect(mainQuerySql).not.toContain("UserExcludedEntity");
      expect(mainQuerySql).not.toContain("e.id IS NULL");
    });
  });

  describe("search query", () => {
    it("searches across title, details, path, performers, studio, and tags", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
        searchQuery: "test search",
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Should search across multiple fields
      expect(mainQuerySql).toContain("LOWER(s.title) LIKE LOWER(?)");
      expect(mainQuerySql).toContain("LOWER(s.details) LIKE LOWER(?)");
      expect(mainQuerySql).toContain("LOWER(s.filePath) LIKE LOWER(?)");
      // Should have performer subquery
      expect(mainQuerySql).toContain("StashPerformer");
      expect(mainQuerySql).toContain("LOWER(p.name) LIKE LOWER(?)");
      // Should have studio subquery
      expect(mainQuerySql).toContain("StashStudio");
      // Should have tag subquery
      expect(mainQuerySql).toContain("StashTag");

      // Search param should be wrapped in wildcards
      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);
      expect(mainQueryParams).toContain("%test search%");
    });

    it("does not add search filter for empty search query", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
        searchQuery: "",
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Should not contain search-specific LIKE patterns on s.filePath
      expect(mainQuerySql).not.toContain("LOWER(s.filePath) LIKE LOWER(?)");
    });
  });

  describe("pagination", () => {
    it("passes correct LIMIT and OFFSET for page 1", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 25,
      });

      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);

      // Last two params are LIMIT and OFFSET
      const limit = mainQueryParams[mainQueryParams.length - 2];
      const offset = mainQueryParams[mainQueryParams.length - 1];
      expect(limit).toBe(25);
      expect(offset).toBe(0);
    });

    it("passes correct OFFSET for page 3", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 3,
        perPage: 10,
      });

      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);

      const limit = mainQueryParams[mainQueryParams.length - 2];
      const offset = mainQueryParams[mainQueryParams.length - 1];
      expect(limit).toBe(10);
      expect(offset).toBe(20); // (3-1) * 10
    });
  });

  describe("sort", () => {
    it("applies ORDER BY for created_at sort", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("s.stashCreatedAt DESC");
    });

    it("applies COLLATE NOCASE for title sort", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "title",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("COLLATE NOCASE ASC");
    });

    it("includes secondary sort by id for stable ordering", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "date",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // ORDER BY should end with secondary id sort
      expect(mainQuerySql).toContain("s.id ASC");
    });
  });

  describe("count query", () => {
    it("uses COUNT(DISTINCT) with composite key for count when exclusions are applied", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      // Second call is the count query
      const countQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[1][0] as string;

      expect(countQuerySql).toContain("COUNT(DISTINCT s.id || ':' || s.stashInstanceId)");
    });

    it("uses fast path COUNT(*) when exclusions are disabled and no user data filters", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
        applyExclusions: false,
      });

      const countQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[1][0] as string;

      // Fast path: simple COUNT(*) from StashScene only
      expect(countQuerySql).toContain("COUNT(*)");
      expect(countQuerySql).not.toContain("COUNT(DISTINCT");
    });
  });
});
