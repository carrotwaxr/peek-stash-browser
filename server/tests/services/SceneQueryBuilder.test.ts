/**
 * Unit Tests for SceneQueryBuilder
 *
 * Tests the SQL query assembly for scene filtering, sorting, and pagination.
 * Verifies multi-instance support, exclusion filtering, search queries,
 * and allowedInstanceIds filtering by inspecting generated SQL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CriterionModifier } from "../../graphql/generated/graphql.js";
import prisma from "../../prisma/singleton.js";
import {
  buildRefsClause,
  sceneQueryBuilder,
} from "../../services/SceneQueryBuilder.js";
import type { SceneQueryRow } from "../../types/internal/queryRows.js";
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
  expandTagIds: vi.fn((ids: string[]) => Promise.resolve(ids)),
  expandStudioIds: vi.fn((ids: string[]) => Promise.resolve(ids)),
}));

// Mock titleUtils
vi.mock("../../utils/titleUtils.js", () => ({
  getSceneFallbackTitle: vi.fn().mockReturnValue("Untitled"),
}));

const mockPrisma = vi.mocked(prisma, true);

/**
 * A page row as Prisma's raw query returns it from SQLite: BOOLEAN columns
 * as booleans, DATETIME columns as Dates, BIGINT as bigint.
 */
function sceneRow(overrides: Partial<SceneQueryRow> = {}): SceneQueryRow {
  return {
    id: "1",
    stashInstanceId: "inst-a",
    title: "Scene 1",
    code: null,
    date: null,
    studioId: null,
    stashRating100: null,
    duration: 60,
    organized: false,
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
    pathScreenshot: null,
    pathPreview: null,
    pathSprite: null,
    pathVtt: null,
    pathChaptersVtt: null,
    pathStream: null,
    pathCaption: null,
    captions: null,
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
    ...overrides,
  };
}

/** Runs a page query whose page statement returns row; the first scene. */
async function executeRow(row: SceneQueryRow) {
  mockPrisma.$queryRawUnsafe.mockReset();
  mockPrisma.$queryRawUnsafe
    .mockResolvedValueOnce([row]) // main query
    .mockResolvedValueOnce([{ total: 1 }]) // count query
    .mockResolvedValue([]);

  const result = await sceneQueryBuilder.execute({
    userId: 1,
    sort: "created_at",
    sortDirection: "DESC",
    page: 1,
    perPage: 10,
  });
  return must(result.scenes[0], "the scene");
}

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

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

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

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

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

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

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

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

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

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

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

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

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

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

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

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

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

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

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
      expect(mainQueryParams.slice(-2)).toEqual([25, 0]);
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

      // Last two params are LIMIT and OFFSET, (3-1) * 10
      expect(mainQueryParams.slice(-2)).toEqual([10, 20]);
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

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

      expect(mainQuerySql).toContain("s.stashCreatedAt DESC");
    });

    it("sorts by title through the stored titleSort column with id as the tiebreak", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "title",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

      // The (deletedAt, titleSort, id) index serves this order as is
      expect(mainQuerySql).toContain("ORDER BY s.titleSort ASC, s.id ASC");
      expect(mainQuerySql).not.toContain("COLLATE NOCASE");
    });

    it("sorts and filters by performer_count and tag_count through the stored columns", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "performer_count",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
        filters: {
          tag_count: {
            value: 1,
            value2: 3,
            modifier: CriterionModifier.Between,
          },
        },
      });
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "tag_count",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        filters: {
          performer_count: {
            value: 2,
            modifier: CriterionModifier.GreaterThan,
          },
        },
      });

      const statements = mockPrisma.$queryRawUnsafe.mock.calls.map(
        ([sql]) => sql
      );
      const [byPerformers, byTags] = statements.filter((sql) =>
        sql.includes("ORDER BY")
      );
      expect(byPerformers).toContain(
        "ORDER BY s.performerCount DESC, s.id DESC"
      );
      expect(byPerformers).toContain("s.tagCount BETWEEN ? AND ?");
      expect(byTags).toContain("ORDER BY s.tagCount ASC, s.id ASC");
      expect(byTags).toContain("s.performerCount > ?");
      // No correlated count of the junction rows, in the lists or the counts
      expect(
        statements.filter((sql) =>
          /COUNT\(\*\)\s+FROM\s+(ScenePerformer|SceneTag)\b/.test(sql)
        )
      ).toEqual([]);
    });

    it("includes secondary sort by id for stable ordering", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "date",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
      });

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

      // ORDER BY should end with secondary id sort
      expect(mainQuerySql).toContain("s.id ASC");
    });
  });

  describe("count query", () => {
    it("the count query with exclusions applied counts rows, not distinct composite ids", async () => {
      await sceneQueryBuilder.execute({
        userId: 1,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      // Second call is the count query. The other LEFT JOINs are on unique
      // keys and e.id IS NULL drops every excluded scene, so each row left
      // is one scene.
      const countQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[1])[0];

      expect(countQuerySql).toMatch(/SELECT COUNT\(\*\) as total/);
      expect(countQuerySql).not.toMatch(/COUNT\(DISTINCT/);
      expect(countQuerySql).toContain("LEFT JOIN UserExcludedEntity e");
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

      const countQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[1])[0];

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

      const mainQuerySql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];

      expect(mainQuerySql).not.toMatch(/\bs\.streams\b/);
    });

    it("returns no apikey and no Stash host in any row field", async () => {
      // A row from before the upgrade still holds Stash's list with the key.
      const row = {
        ...sceneRow({ pathScreenshot: "/scene/1/screenshot?t=1" }),
        streams:
          '[{"url":"http://stash.test:9999/scene/1/stream?apikey=SECRET","mime_type":"video/mp4","label":"Direct stream"}]',
      };

      const scene = await executeRow(row);

      const json = JSON.stringify(scene);
      expect(json).not.toContain("apikey");
      expect(json).not.toContain("stash.test:9999/scene/1/stream");
      expect(scene.sceneStreams).toEqual([]);
    });

    it("returns null paths.stream and paths.caption", async () => {
      // Peek serves streams and captions through its own routes; the media
      // proxy's allowlist refuses both Stash routes, so neither is emitted.
      const scene = await executeRow(
        sceneRow({
          pathScreenshot: "/scene/1/screenshot?t=1",
          pathStream: "/scene/1/stream",
          pathCaption: "/scene/1/caption",
        })
      );

      expect(scene.paths.stream).toBeNull();
      expect(scene.paths.caption).toBeNull();
      expect(scene.paths.screenshot).toContain("/api/proxy/stash");
    });
  });

  describe("user history", () => {
    const O_AT = "2025-10-25T03:50:32.452Z";
    const PLAYED_AT = ["2025-10-25T03:46:27.346Z", "2025-10-26T08:00:00.000Z"];

    // Prisma decodes the JSONB history columns in a raw query: a list stored
    // as an array arrives as the array, one stored by the old updates
    // (JSON.stringify(...) of the list) arrives as that string.
    const executeWith = (
      userOHistory: string[] | string,
      userPlayHistory: string[] | string
    ) =>
      executeRow(
        sceneRow({
          userPlayCount: 2,
          userPlayDuration: 100,
          userOCount: 1,
          userOHistory,
          userPlayHistory,
        })
      );

    it("reads a history stored as an array", async () => {
      const scene = await executeWith([O_AT], PLAYED_AT);

      expect(scene.o_history).toEqual([O_AT]);
      expect(scene.last_o_at).toBe(O_AT);
      expect(scene.play_history).toEqual(PLAYED_AT);
    });

    it("reads a history stored as a JSON-encoded string", async () => {
      const scene = await executeWith(
        JSON.stringify([O_AT]),
        JSON.stringify(PLAYED_AT)
      );

      expect(scene.o_history).toEqual([O_AT]);
      expect(scene.last_o_at).toBe(O_AT);
      expect(scene.play_history).toEqual(PLAYED_AT);
    });

    it("o_history is the stored ISO strings", async () => {
      const scene = await executeWith([O_AT], []);

      // What the JSON carries, and what the API type declares: no Date
      expect(scene.o_history).toEqual([O_AT]);
      expect(scene.o_history.map((at) => typeof at)).toEqual(["string"]);
    });
  });

  describe("raw row types", () => {
    it.each([true, false])(
      "transformRow maps a boolean organized column (%s)",
      async (organized) => {
        const scene = await executeRow(sceneRow({ organized }));

        expect(scene.organized).toBe(organized);
      }
    );

    it("transformRow maps a boolean userFavorite column", async () => {
      const favorite = await executeRow(sceneRow({ userFavorite: true }));
      const unrated = await executeRow(sceneRow({ userFavorite: null }));

      expect(favorite.favorite).toBe(true);
      expect(unrated.favorite).toBe(false);
    });

    it("created_at, updated_at and last_played_at are the ISO strings of the row's Dates", async () => {
      const scene = await executeRow(
        sceneRow({
          stashCreatedAt: new Date("2021-10-12T23:02:42Z"),
          stashUpdatedAt: new Date("2024-03-01T10:00:00.5Z"),
          userLastPlayedAt: new Date(1761398674589),
        })
      );

      expect(scene.created_at).toBe("2021-10-12T23:02:42.000Z");
      expect(scene.updated_at).toBe("2024-03-01T10:00:00.500Z");
      expect(scene.last_played_at).toBe("2025-10-25T13:24:34.589Z");
    });

    it("empty text reads as null, and an empty title as the fallback title", async () => {
      const scene = await executeRow(
        sceneRow({ title: "", code: "", date: "", details: "", director: "" })
      );

      // getSceneFallbackTitle is mocked to "Untitled"
      expect(scene.title).toBe("Untitled");
      expect(scene.code).toBeNull();
      expect(scene.date).toBeNull();
      expect(scene.details).toBeNull();
    });

    it("missing dates stay null", async () => {
      const scene = await executeRow(sceneRow());

      expect(scene.created_at).toBeNull();
      expect(scene.updated_at).toBeNull();
      expect(scene.last_played_at).toBeNull();
    });
  });
});

describe("buildRefsClause", () => {
  it("binds one (id, instance) pair per ref", () => {
    expect(
      buildRefsClause([
        { id: "1", instanceId: "inst-a" },
        { id: "1", instanceId: "inst-b" },
      ])
    ).toEqual({
      sql: "((s.id = ? AND s.stashInstanceId = ?) OR (s.id = ? AND s.stashInstanceId = ?))",
      params: ["1", "inst-a", "1", "inst-b"],
    });
  });

  it("matches nothing for no refs", () => {
    expect(buildRefsClause([])).toEqual({ sql: "0", params: [] });
  });
});

describe("getByRefs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // main query
      .mockResolvedValueOnce([{ total: 0 }]); // count query
  });

  it("binds one (id, instance) pair per ref, so B's same id stays out", async () => {
    await sceneQueryBuilder.getByRefs({
      userId: 1,
      refs: [
        { id: "7", instanceId: "inst-a" },
        { id: "8", instanceId: "inst-a" },
      ],
      allowedInstanceIds: ["inst-a", "inst-b"],
    });

    const call = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
    const sql = call[0];
    const params = call.slice(1);
    expect(sql).toContain(
      "((s.id = ? AND s.stashInstanceId = ?) OR (s.id = ? AND s.stashInstanceId = ?))"
    );
    expect(sql).not.toContain("s.id IN (");
    // The pairs appear in order, each id beside its instance
    const at = params.indexOf("7");
    expect(params.slice(at, at + 4)).toEqual(["7", "inst-a", "8", "inst-a"]);
  });

  it("applies the user's exclusions by default", async () => {
    await sceneQueryBuilder.getByRefs({
      userId: 1,
      refs: [{ id: "7", instanceId: "inst-a" }],
    });

    const sql = must(mockPrisma.$queryRawUnsafe.mock.calls[0])[0];
    expect(sql).toContain("LEFT JOIN UserExcludedEntity e");
    expect(sql).toContain("e.id IS NULL");
  });

  it("runs no query for no refs", async () => {
    const result = await sceneQueryBuilder.getByRefs({ userId: 1, refs: [] });

    expect(result).toEqual({ scenes: [], total: 0 });
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
