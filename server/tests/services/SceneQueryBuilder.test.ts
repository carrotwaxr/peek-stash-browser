/**
 * Unit Tests for SceneQueryBuilder
 *
 * Tests the SQL query assembly for scene filtering, sorting, and pagination.
 * Verifies multi-instance support, exclusion filtering, search queries,
 * and allowedInstanceIds filtering by inspecting generated SQL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { must } from "../helpers/must.js";

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

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

const mockPrisma = vi.mocked(prisma, true);

describe("SceneQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.scenePerformer.findMany.mockResolvedValue([]);
    mockPrisma.sceneTag.findMany.mockResolvedValue([]);
    mockPrisma.sceneGroup.findMany.mockResolvedValue([]);
    mockPrisma.sceneGallery.findMany.mockResolvedValue([]);
    mockPrisma.stashPerformer.findMany.mockResolvedValue([]);
    mockPrisma.stashTag.findMany.mockResolvedValue([]);
    mockPrisma.stashStudio.findMany.mockResolvedValue([]);
    mockPrisma.stashGroup.findMany.mockResolvedValue([]);
    mockPrisma.stashGallery.findMany.mockResolvedValue([]);
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

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

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

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

      // Should contain IN clause for allowed instances
      expect(mainQuerySql).toContain("s.stashInstanceId IN (?, ?)");
      // Should include NULL fallback for backward compat
      expect(mainQuerySql).toContain("s.stashInstanceId IS NULL");

      // Params should contain the instance IDs
      const mainQueryParams = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      ).slice(1);
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

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

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

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

      expect(mainQuerySql).toContain("s.stashInstanceId = ?");

      const mainQueryParams = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      ).slice(1);
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

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

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

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

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

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

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

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

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
      const mainQueryParams = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      ).slice(1);
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

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

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

      const mainQueryParams = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      ).slice(1);

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

      const mainQueryParams = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      ).slice(1);

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

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

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

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

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

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

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
      const countQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[1]
      )[0] as string;

      expect(countQuerySql).toContain(
        "COUNT(DISTINCT s.id || ':' || s.stashInstanceId)"
      );
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

      const countQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[1]
      )[0] as string;

      // Fast path: simple COUNT(*) from StashScene only
      expect(countQuerySql).toContain("COUNT(*)");
      expect(countQuerySql).not.toContain("COUNT(DISTINCT");
    });
  });

  describe("stream URLs (PM-02)", () => {
    const executeOptions = {
      userId: 1,
      sort: "created_at",
      sortDirection: "DESC" as const,
      page: 1,
      perPage: 10,
    };

    it("does not select the streams column", async () => {
      await sceneQueryBuilder.execute(executeOptions);

      const mainQuerySql = must(
        mockPrisma.$queryRawUnsafe.mock.calls[0]
      )[0] as string;

      expect(mainQuerySql).not.toMatch(/\bs\.streams\b/);
    });

    it("returns no apikey and no Stash host in any row field", async () => {
      // A row from before the upgrade still holds Stash's list with the key.
      const row = {
        id: "1",
        stashInstanceId: "inst-a",
        title: "Scene 1",
        code: null,
        date: null,
        studioId: null,
        stashRating100: null,
        duration: 60,
        organized: 0,
        details: null,
        director: null,
        urls: null,
        filePath: "/v/scene1.mp4",
        fileBitRate: null,
        fileFrameRate: null,
        fileWidth: 1280,
        fileHeight: 720,
        fileVideoCodec: "h264",
        fileAudioCodec: "aac",
        fileSize: null,
        pathScreenshot: "/scene/1/screenshot?t=1",
        pathPreview: null,
        pathSprite: null,
        pathVtt: null,
        pathChaptersVtt: null,
        pathStream: null,
        pathCaption: null,
        captions: null,
        streams:
          '[{"url":"http://stash.test:9999/scene/1/stream?apikey=SECRET","mime_type":"video/mp4","label":"Direct stream"}]',
        inheritedTagIds: null,
        stashOCounter: 0,
        stashPlayCount: 0,
        stashPlayDuration: 0,
        stashCreatedAt: null,
        stashUpdatedAt: null,
        userRating: null,
        userFavorite: null,
        userPlayCount: null,
        userPlayDuration: null,
        userLastPlayedAt: null,
        userOCount: null,
        userResumeTime: null,
        userOHistory: null,
        userPlayHistory: null,
      };
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([row]) // main query
        .mockResolvedValueOnce([{ total: 1 }]) // count query
        .mockResolvedValue([]);

      const result = await sceneQueryBuilder.execute(executeOptions);

      expect(result.scenes).toHaveLength(1);
      const json = JSON.stringify(result.scenes);
      expect(json).not.toContain("apikey");
      expect(json).not.toContain("stash.test:9999/scene/1/stream");
      expect(must(result.scenes[0]).sceneStreams).toEqual([]);
    });

    it("returns null paths.stream and paths.caption", async () => {
      // Peek serves streams and captions through its own routes; the media
      // proxy's allowlist refuses both Stash routes, so neither is emitted.
      const row = {
        id: "1",
        stashInstanceId: "inst-a",
        title: "Scene 1",
        code: null,
        date: null,
        studioId: null,
        stashRating100: null,
        duration: 60,
        organized: 0,
        details: null,
        director: null,
        urls: null,
        filePath: "/v/scene1.mp4",
        fileBitRate: null,
        fileFrameRate: null,
        fileWidth: 1280,
        fileHeight: 720,
        fileVideoCodec: "h264",
        fileAudioCodec: "aac",
        fileSize: null,
        pathScreenshot: "/scene/1/screenshot?t=1",
        pathPreview: null,
        pathSprite: null,
        pathVtt: null,
        pathChaptersVtt: null,
        pathStream: "/scene/1/stream",
        pathCaption: "/scene/1/caption",
        captions: null,
        streams: null,
        inheritedTagIds: null,
        stashOCounter: 0,
        stashPlayCount: 0,
        stashPlayDuration: 0,
        stashCreatedAt: null,
        stashUpdatedAt: null,
        userRating: null,
        userFavorite: null,
        userPlayCount: null,
        userPlayDuration: null,
        userLastPlayedAt: null,
        userOCount: null,
        userResumeTime: null,
        userOHistory: null,
        userPlayHistory: null,
      };
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([row]) // main query
        .mockResolvedValueOnce([{ total: 1 }]) // count query
        .mockResolvedValue([]);

      const result = await sceneQueryBuilder.execute(executeOptions);

      expect(must(result.scenes[0]).paths.stream).toBeNull();
      expect(must(result.scenes[0]).paths.caption).toBeNull();
      expect(must(result.scenes[0]).paths.screenshot).toContain(
        "/api/proxy/stash"
      );
    });
  });
});
