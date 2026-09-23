/**
 * Unit Tests for ClipQueryBuilder
 *
 * Tests the SQL query assembly for clip filtering, sorting, and pagination.
 * Verifies multi-instance support, exclusion filtering, scene/tag/performer
 * filters, and search by inspecting generated SQL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
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

const mockPrisma = vi.mocked(prisma);

describe("ClipQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: main query returns empty, count query returns {total: 0}
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // main query
      .mockResolvedValueOnce([{ total: 0 }]); // count query
  });

  describe("multi-instance support", () => {
    it("filters to allowed instances when allowedInstanceIds is provided", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        allowedInstanceIds: ["inst-a", "inst-b"],
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("c.stashInstanceId IN (?, ?)");
      expect(mainQuerySql).toContain("c.stashInstanceId IS NULL");

      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);
      expect(mainQueryParams).toContain("inst-a");
      expect(mainQueryParams).toContain("inst-b");
    });

    it("does not add instance filter when allowedInstanceIds is empty", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        allowedInstanceIds: [],
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).not.toContain("c.stashInstanceId IN");
    });
  });

  describe("exclusion filtering", () => {
    it("always joins UserExcludedEntity for scene-based exclusions", async () => {
      await clipQueryBuilder.getClips({ userId: 1 });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("UserExcludedEntity");
      expect(mainQuerySql).toContain("entityType = 'scene'");
      expect(mainQuerySql).toContain("e.id IS NULL");
      // A clip also has rows of its own (its tags cascade to it, item 13)
      expect(mainQuerySql).toContain("entityType = 'clip'");
      expect(mainQuerySql).toContain("ec.id IS NULL");
    });

    it("binds the user id for both exclusion joins in the list and count queries", async () => {
      await clipQueryBuilder.getClips({ userId: 7 });

      const [listSql, ...listParams] = mockPrisma.$queryRawUnsafe.mock
        .calls[0] as [string, ...unknown[]];
      const [countSql, ...countParams] = mockPrisma.$queryRawUnsafe.mock
        .calls[1] as [string, ...unknown[]];
      expect(listParams.slice(0, 2)).toEqual([7, 7]);
      expect(countParams.slice(0, 2)).toEqual([7, 7]);
      expect(
        (listSql.match(/e\.userId = \?|ec\.userId = \?/g) || []).length
      ).toBe(2);
      expect(
        (countSql.match(/e\.userId = \?|ec\.userId = \?/g) || []).length
      ).toBe(2);
    });

    it("getClipById applies both joins", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await clipQueryBuilder.getClipById("c1", 1);

      const sql = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain("entityType = 'scene'");
      expect(sql).toContain("entityType = 'clip'");
      expect(sql).toContain("e.id IS NULL");
      expect(sql).toContain("ec.id IS NULL");
    });

    it("filters both clip and scene deletedAt", async () => {
      await clipQueryBuilder.getClips({ userId: 1 });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("c.deletedAt IS NULL");
      expect(mainQuerySql).toContain("s.deletedAt IS NULL");
    });
  });

  describe("filters", () => {
    it("filters by sceneId", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        sceneId: "42",
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;
      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);

      expect(mainQuerySql).toContain("c.sceneId = ?");
      expect(mainQueryParams).toContain("42");
    });

    it("filters by isGenerated", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        isGenerated: true,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;
      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);

      expect(mainQuerySql).toContain("c.isGenerated = ?");
      expect(mainQueryParams).toContain(1);
    });

    it("filters by search query", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        q: "test clip",
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;
      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);

      expect(mainQuerySql).toContain("c.title LIKE ?");
      expect(mainQueryParams).toContain("%test clip%");
    });

    it("filters by tag IDs with composite key support", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        tagIds: ["5:inst-a"],
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      // Should check both primaryTagId and ClipTag junction
      expect(mainQuerySql).toContain("c.primaryTagId");
      expect(mainQuerySql).toContain("ClipTag");
    });

    it("filters by performer IDs", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        performerIds: ["10"],
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("ScenePerformer");
      expect(mainQuerySql).toContain("sp.performerId IN (?)");
    });

    it("filters by studio ID", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        studioId: "studio-1",
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("s.studioId");
    });

    it("filters by scene tag IDs", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        sceneTagIds: ["20"],
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("SceneTag");
      expect(mainQuerySql).toContain("st.tagId IN (?)");
    });
  });

  describe("sort", () => {
    it("sorts by stashCreatedAt by default", async () => {
      await clipQueryBuilder.getClips({ userId: 1 });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("ORDER BY c.stashCreatedAt");
    });

    it("sorts by seconds when specified", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        sortBy: "seconds",
        sortDir: "asc",
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("ORDER BY c.seconds ASC");
    });

    it("coerces a hostile sortDir to DESC instead of splicing it into ORDER BY", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        sortDir: "asc, (SELECT password FROM User)" as never,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("ORDER BY c.stashCreatedAt DESC");
      expect(mainQuerySql).not.toMatch(/select password/i);
    });

    it("treats a repeated sortDir query param (array) as DESC instead of throwing", async () => {
      await expect(
        clipQueryBuilder.getClips({
          userId: 1,
          sortDir: ["asc", "desc"] as never,
        })
      ).resolves.toBeDefined();

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("ORDER BY c.stashCreatedAt DESC");
    });

    it("accepts asc in any case", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        sortBy: "seconds",
        sortDir: "ASC" as never,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;

      expect(mainQuerySql).toContain("ORDER BY c.seconds ASC");
    });
  });

  describe("pagination", () => {
    it("applies correct LIMIT and OFFSET", async () => {
      await clipQueryBuilder.getClips({
        userId: 1,
        page: 2,
        perPage: 20,
      });

      const mainQuerySql = mockPrisma.$queryRawUnsafe.mock
        .calls[0][0] as string;
      const mainQueryParams = mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1);

      expect(mainQuerySql).toContain("LIMIT ? OFFSET ?");

      // Last two params are LIMIT and OFFSET
      const limit = mainQueryParams[mainQueryParams.length - 2];
      const offset = mainQueryParams[mainQueryParams.length - 1];
      expect(limit).toBe(20);
      expect(offset).toBe(20); // (2-1) * 20
    });
  });
});
