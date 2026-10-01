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
import type { SceneQueryRow } from "../../types/internal/queryRows.js";
import type {
  ParsedFilter,
  ParsedListRequest,
} from "../../types/parsedFilters.js";
import { must } from "../helpers/must.js";
import { prismaImpl } from "../helpers/prismaMock.js";

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
vi.mock(
  "../../utils/hierarchyUtils.js",
  () => import("../helpers/hierarchyMock.js")
);

// Mock titleUtils
vi.mock("../../utils/titleUtils.js", () => ({
  getSceneFallbackTitle: vi.fn().mockReturnValue("Untitled"),
}));

const mockPrisma = vi.mocked(prisma, true);

const ALLOWED = ["inst-a", "inst-b"];

/** A parsed scene list request with these parts, the rest at their defaults */
function request(
  overrides: Partial<ParsedListRequest<"scene">> = {}
): ParsedListRequest<"scene"> {
  return {
    page: 1,
    perPage: 10,
    q: undefined,
    sort: { field: "created_at", direction: "DESC", seed: undefined },
    filter: {},
    specificInstanceId: undefined,
    ...overrides,
  };
}

/** Runs one list request for user 1 on the allowed instances */
async function run(
  overrides: Partial<ParsedListRequest<"scene">> = {},
  options: { allowedInstanceIds?: string[]; applyExclusions?: boolean } = {}
) {
  return sceneQueryBuilder.execute({
    userId: 1,
    allowedInstanceIds: options.allowedInstanceIds ?? ALLOWED,
    ...(options.applyExclusions === undefined
      ? {}
      : { applyExclusions: options.applyExclusions }),
    request: request(overrides),
  });
}

/** The page statement's SQL and parameters */
function pageStatement(): { sql: string; params: unknown[] } {
  const [sql, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
  return { sql, params };
}

/** The count statement's SQL */
function countSql(): string {
  return must(mockPrisma.$queryRawUnsafe.mock.calls[1])[0];
}

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
    userLastOAt: null,
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

  const result = await run();
  return must(result.items[0], "the scene");
}

describe("SceneQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    // Default: main query returns empty, count query returns {total: 0}
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // main query
      .mockResolvedValueOnce([{ total: 0 }]); // count query
  });

  describe("multi-instance support", () => {
    it("includes instanceId in Rating and WatchHistory JOINs", async () => {
      await run();

      const { sql } = pageStatement();
      // Rating JOIN must match on instanceId
      expect(sql).toContain("s.stashInstanceId = r.instanceId");
      // WatchHistory JOIN must match on instanceId
      expect(sql).toContain("s.stashInstanceId = w.instanceId");
    });

    it("filters to the allowed instances, with no NULL arm", async () => {
      await run();

      const { sql, params } = pageStatement();
      expect(sql).toContain("s.stashInstanceId IN (?, ?)");
      expect(sql).not.toContain("s.stashInstanceId IS NULL");
      expect(params).toContain("inst-a");
      expect(params).toContain("inst-b");
    });

    it("an empty allowed list matches nothing", async () => {
      await run({}, { allowedInstanceIds: [] });

      const { sql } = pageStatement();
      expect(sql).not.toContain("s.stashInstanceId IN");
      expect(sql).toContain("AND 1 = 0");
    });

    it("filters to a specific instance when specificInstanceId is provided", async () => {
      await run({ specificInstanceId: "instance-abc" });

      const { sql, params } = pageStatement();
      expect(sql).toContain("s.stashInstanceId = ?");
      expect(params).toContain("instance-abc");
    });

    it("does not add specific instance filter when not provided", async () => {
      await run();

      const { sql } = pageStatement();
      // Should NOT have a bare equality check
      expect(sql).not.toContain("s.stashInstanceId = ?");
    });
  });

  describe("exclusion filtering", () => {
    it("includes exclusion JOIN and WHERE by default", async () => {
      await run();

      const { sql } = pageStatement();
      // Should JOIN UserExcludedEntity
      expect(sql).toContain("UserExcludedEntity");
      expect(sql).toContain("entityType = 'scene'");
      // Should filter out excluded entities
      expect(sql).toContain("e.id IS NULL");
    });

    it("skips exclusion JOIN when applyExclusions is false", async () => {
      await run({}, { applyExclusions: false });

      const { sql } = pageStatement();
      // Should NOT JOIN UserExcludedEntity
      expect(sql).not.toContain("UserExcludedEntity");
      expect(sql).not.toContain("e.id IS NULL");
    });
  });

  describe("search query", () => {
    it("searches across title, details, path, performers, studio, and tags", async () => {
      await run({ q: "test search" });

      const { sql, params } = pageStatement();
      // Should search across multiple fields
      expect(sql).toContain("LOWER(s.title) LIKE LOWER(?)");
      expect(sql).toContain("LOWER(s.details) LIKE LOWER(?)");
      expect(sql).toContain("LOWER(s.filePath) LIKE LOWER(?)");
      // Should have performer subquery
      expect(sql).toContain("StashPerformer");
      expect(sql).toContain("LOWER(p.name) LIKE LOWER(?)");
      // Should have studio subquery
      expect(sql).toContain("StashStudio");
      // Should have tag subquery
      expect(sql).toContain("StashTag");

      // Search param should be wrapped in wildcards
      expect(params).toContain("%test search%");
    });

    it("binds likeContains(q) with ESCAPE, so a % or _ in the search matches itself", async () => {
      await run({ q: "100%_x" });

      const { sql, params } = pageStatement();
      expect(sql).toContain("LOWER(s.title) LIKE LOWER(?) ESCAPE '\\'");
      expect(sql).toContain("LOWER(t.name) LIKE LOWER(?) ESCAPE '\\'");
      expect(sql).not.toMatch(/LIKE LOWER\(\?\)(?! ESCAPE)/);
      expect(params.filter((p) => p === "%100\\%\\_x%")).toHaveLength(6);
    });

    it("matches performer, studio and tag names only for live entities the viewer can see", async () => {
      await run({ q: "abc" }, { applyExclusions: true });

      const { sql, params } = pageStatement();
      for (const [alias, type, excl] of [
        ["p", "performer", "xp"],
        ["st", "studio", "xs"],
        ["t", "tag", "xt"],
      ] as const) {
        expect(sql).toContain(`${alias}.deletedAt IS NULL`);
        expect(sql).toContain(
          `NOT EXISTS (SELECT 1 FROM UserExcludedEntity ${excl} WHERE ${excl}.userId = ? AND ${excl}.entityType = '${type}' AND ${excl}.entityId = ${alias}.id AND (${excl}.instanceId = '' OR ${excl}.instanceId = ${alias}.stashInstanceId))`
        );
      }
      // The user id binds where each exclusion check sits: after the three
      // scene columns, then one per relation arm, each before its pattern
      const at = params.indexOf("%abc%");
      const search = params.slice(at, at + 9);
      expect(search).toEqual([
        "%abc%",
        "%abc%",
        "%abc%",
        1,
        "%abc%",
        1,
        "%abc%",
        1,
        "%abc%",
      ]);
    });

    it("still skips soft-deleted names when exclusions are off", async () => {
      await run({ q: "abc" }, { applyExclusions: false });

      const { sql, params } = pageStatement();
      expect(sql).toContain("p.deletedAt IS NULL");
      expect(sql).toContain("st.deletedAt IS NULL");
      expect(sql).toContain("t.deletedAt IS NULL");
      expect(sql).not.toContain("xp.userId");
      const at = params.indexOf("%abc%");
      expect(params.slice(at, at + 6)).toEqual(Array(6).fill("%abc%"));
    });

    it("does not add search filter without a search query", async () => {
      await run({ q: undefined });

      const { sql } = pageStatement();
      // Should not contain search-specific LIKE patterns on s.filePath
      expect(sql).not.toContain("LOWER(s.filePath) LIKE LOWER(?)");
    });
  });

  describe("pagination", () => {
    it("passes correct LIMIT and OFFSET for page 1", async () => {
      await run({ page: 1, perPage: 25 });

      // Last two params are LIMIT and OFFSET
      expect(pageStatement().params.slice(-2)).toEqual([25, 0]);
    });

    it("passes correct OFFSET for page 3", async () => {
      await run({ page: 3, perPage: 10 });

      // Last two params are LIMIT and OFFSET, (3-1) * 10
      expect(pageStatement().params.slice(-2)).toEqual([10, 20]);
    });
  });

  describe("sort", () => {
    it("applies ORDER BY for created_at sort", async () => {
      await run();

      expect(pageStatement().sql).toContain("s.stashCreatedAt DESC");
    });

    it("sorts by title through the stored titleSort column, then the primary key", async () => {
      await run({
        sort: { field: "title", direction: "ASC", seed: undefined },
      });

      const { sql } = pageStatement();
      // The (deletedAt, titleSort, id, stashInstanceId) index serves this order
      expect(sql).toContain(
        "ORDER BY s.titleSort ASC, s.id ASC, s.stashInstanceId ASC"
      );
      expect(sql).not.toContain("COLLATE NOCASE");
    });

    it("tagged false is a scene with no tag, own or inherited; true is its negation", async () => {
      const untagged =
        "(s.tagCount = 0 AND NOT EXISTS (SELECT 1 FROM SceneInheritedTag sut WHERE sut.sceneId = s.id AND sut.sceneInstanceId = s.stashInstanceId))";

      await run({ filter: { tagged: false } });
      await run({ filter: { tagged: true } });

      const pages = mockPrisma.$queryRawUnsafe.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.includes("ORDER BY"));
      expect(pages).toHaveLength(2);
      expect(pages[0]).toContain(`AND ${untagged}`);
      expect(pages[0]).not.toContain(`NOT ${untagged}`);
      expect(pages[1]).toContain(`NOT ${untagged}`);
    });

    it("sorts and filters by performer_count and tag_count through the stored columns", async () => {
      await run({
        sort: { field: "performer_count", direction: "DESC", seed: undefined },
        filter: { tag_count: { value: 1, value2: 3, modifier: "BETWEEN" } },
      });
      await run({
        sort: { field: "tag_count", direction: "ASC", seed: undefined },
        filter: { performer_count: { value: 2, modifier: "GREATER_THAN" } },
      });

      const statements = mockPrisma.$queryRawUnsafe.mock.calls.map(
        ([sql]) => sql
      );
      const [byPerformers, byTags] = statements.filter((sql) =>
        sql.includes("ORDER BY")
      );
      expect(byPerformers).toContain(
        "ORDER BY s.performerCount DESC, s.id DESC, s.stashInstanceId DESC"
      );
      expect(byPerformers).toContain("s.tagCount BETWEEN ? AND ?");
      expect(byTags).toContain(
        "ORDER BY s.tagCount ASC, s.id ASC, s.stashInstanceId ASC"
      );
      expect(byTags).toContain("s.performerCount > ?");
      // No correlated count of the junction rows, in the lists or the counts
      expect(
        statements.filter((sql) =>
          /COUNT\(\*\)\s+FROM\s+(ScenePerformer|SceneTag)\b/.test(sql)
        )
      ).toEqual([]);
    });

    it("ends the order with the primary key for stable paging", async () => {
      await run({ sort: { field: "date", direction: "ASC", seed: undefined } });

      expect(pageStatement().sql).toContain(
        "ORDER BY s.date ASC, s.id ASC, s.stashInstanceId ASC\nLIMIT ? OFFSET ?"
      );
    });

    it("binds a random sort's seed and never interpolates it", async () => {
      await run({
        sort: { field: "random", direction: "DESC", seed: 87654321 },
      });

      const { sql, params } = pageStatement();
      expect(sql).not.toContain("87654321");
      expect(params.filter((p) => p === 87654321)).toHaveLength(3);
    });
  });

  describe("count query", () => {
    it("the count query is the joined COUNT(*), never the unjoined fast path", async () => {
      await run({}, { applyExclusions: false });

      // Second call is the count query. The other LEFT JOINs are on unique
      // keys, so each row left is one scene.
      const sql = countSql();
      expect(sql).toMatch(/SELECT COUNT\(\*\) AS total/);
      expect(sql).not.toMatch(/COUNT\(DISTINCT/);
      expect(sql).toContain("LEFT JOIN SceneRating r");
      expect(sql).toContain("LEFT JOIN WatchHistory w");
    });

    it("counts with the exclusion join when exclusions apply", async () => {
      await run();

      expect(countSql()).toContain("LEFT JOIN UserExcludedEntity e");
      expect(countSql()).toContain("e.id IS NULL");
    });
  });

  describe("filters", () => {
    const ref = (id: string, instanceId = "inst-a") => ({ id, instanceId });
    const bare = (id: string) => ({ id, instanceId: undefined });

    it("ids match (id, instance) pairs, and a bare id every instance", async () => {
      await run({
        filter: {
          ids: {
            refs: [ref("5"), bare("6")],
            modifier: "INCLUDES",
            depth: 0,
          },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "((s.id = ? AND s.stashInstanceId = ?) OR (s.id = ?))"
      );
      expect(sql).not.toContain("s.id IN (");
      expect(params.slice(-5, -2)).toEqual(["5", "inst-a", "6"]);
    });

    it("performers, groups and galleries match pairs through their junctions", async () => {
      await run({
        filter: {
          performers: { refs: [ref("1")], modifier: "INCLUDES", depth: 0 },
          groups: { refs: [ref("2")], modifier: "EXCLUDES", depth: 0 },
          galleries: { refs: [ref("3")], modifier: "INCLUDES_ALL", depth: 0 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "EXISTS (SELECT 1 FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND ((sp.performerId = ? AND sp.performerInstanceId = ?)))"
      );
      expect(sql).toContain(
        "NOT EXISTS (SELECT 1 FROM SceneGroup sg WHERE sg.sceneId = s.id AND sg.sceneInstanceId = s.stashInstanceId AND ((sg.groupId = ? AND sg.groupInstanceId = ?)))"
      );
      expect(sql).toContain("sg.galleryId = ? AND sg.galleryInstanceId = ?");
      expect(params).toContain("1");
      expect(params).toContain("2");
      expect(params).toContain("3");
    });

    it("tags match the junction and the inherited list, each as pairs", async () => {
      await run({
        filter: {
          tags: {
            refs: [ref("284"), ref("313")],
            modifier: "INCLUDES",
            depth: 0,
          },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND ((st.tagId = ? AND st.tagInstanceId = ?) OR (st.tagId = ? AND st.tagInstanceId = ?)))"
      );
      expect(sql).toContain(
        "EXISTS (SELECT 1 FROM SceneInheritedTag sit WHERE sit.sceneId = s.id AND sit.sceneInstanceId = s.stashInstanceId AND ((sit.tagId = ? AND sit.tagInstanceId = ?) OR (sit.tagId = ? AND sit.tagInstanceId = ?)))"
      );
      expect(params.filter((p) => p === "284")).toHaveLength(2);
      expect(params).not.toContain("284:inst-a");
    });

    it("studios match the scene's own studio column as pairs; EXCLUDES keeps scenes with no studio", async () => {
      await run({
        filter: {
          studios: { refs: [ref("7")], modifier: "EXCLUDES", depth: 0 },
        },
      });

      const { sql } = pageStatement();
      expect(sql).toContain(
        "(s.studioId IS NULL OR NOT ((s.studioId = ? AND s.stashInstanceId = ?)))"
      );
      expect(sql).not.toContain("NOT IN");
    });

    it("text filters use the shared clause, so IS_NULL and NOT_NULL match", async () => {
      await run({
        filter: {
          title: { modifier: "IS_NULL" },
          details: { modifier: "NOT_NULL" },
          video_codec: { modifier: "INCLUDES", value: "h264" },
          audio_codec: { modifier: "EQUALS", value: "aac" },
          director: { modifier: "INCLUDES", value: "Smith" },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain("(s.title IS NULL OR s.title = '')");
      expect(sql).toContain("(s.details IS NOT NULL AND s.details != '')");
      expect(sql).toContain("LOWER(s.fileVideoCodec) LIKE LOWER(?)");
      expect(sql).toContain("LOWER(s.fileAudioCodec) = LOWER(?)");
      expect(sql).toContain("(LOWER(s.director) LIKE LOWER(?))");
      expect(params).toContain("%h264%");
      expect(params).toContain("aac");
      expect(params).toContain("%Smith%");
    });

    it.each([
      [true, 1],
      [false, 0],
    ])("organized %s matches the boolean column", async (organized, bound) => {
      await run({ filter: { organized } });

      const { sql, params } = pageStatement();
      expect(sql).toContain("AND s.organized = ?\nORDER BY");
      // The viewer's three joins, the allowed instances, the flag, the page
      expect(params).toEqual([1, 1, 1, ...ALLOWED, bound, 10, 0]);
    });

    it("resolution compares the file height; orientation matches any of its values", async () => {
      await run({
        filter: {
          resolution: { modifier: "GREATER_THAN", value: "FULL_HD" },
          orientation: { modifier: "INCLUDES", values: ["PORTRAIT", "SQUARE"] },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain("COALESCE(s.fileHeight, 0) > ?");
      expect(params).toContain(1080);
      expect(sql).toContain(
        "((s.fileWidth < s.fileHeight) OR (s.fileWidth = s.fileHeight AND s.fileWidth > 0))"
      );
    });

    it.each([
      ["SEVEN_K", 3584],
      ["HUGE", 6144],
    ] as const)(
      "%s compares with Stash's range minimum, %i",
      async (value, height) => {
        await run({ filter: { resolution: { modifier: "EQUALS", value } } });

        const { sql, params } = pageStatement();
        expect(sql).toContain("COALESCE(s.fileHeight, 0) = ?");
        expect(params).toContain(height);
      }
    );

    it("the viewer's favorites, ratings and history filters read the per-user joins", async () => {
      await run({
        filter: {
          favorite: false,
          rating100: { modifier: "GREATER_THAN", value: 80 },
          play_count: { modifier: "EQUALS", value: 0 },
          o_counter: { modifier: "BETWEEN", value: 2, value2: 5 },
          last_played_at: { modifier: "IS_NULL" },
          performer_favorite: true,
          studio_favorite: true,
          tag_favorite: true,
          performer_age: { modifier: "LESS_THAN", value: 30 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain("(r.favorite = 0 OR r.favorite IS NULL)");
      expect(sql).toContain("COALESCE(r.rating, 0) > ?");
      expect(sql).toContain("COALESCE(w.playCount, 0) = ?");
      expect(sql).toContain("COALESCE(w.oCount, 0) BETWEEN ? AND ?");
      expect(sql).toContain("w.lastPlayedAt IS NULL");
      expect(sql).toContain("PerformerRating pr");
      expect(sql).toContain("StudioRating sr");
      expect(sql).toContain("TagRating tr");
      expect(sql).toContain("julianday(p.birthdate)");
      // The three favorite clauses bind the viewer
      expect(params.filter((p) => p === 1)).toHaveLength(6);
    });

    it("a filter with nothing in it adds no clause", async () => {
      const filter: ParsedFilter<"scene"> = {};
      await run({ filter });

      const { sql } = pageStatement();
      expect(sql).toContain(
        "WHERE s.deletedAt IS NULL AND e.id IS NULL AND s.stashInstanceId IN (?, ?)\nORDER BY"
      );
    });
  });

  describe("stream URLs (PM-02)", () => {
    it("does not select the streams column", async () => {
      await run();

      expect(pageStatement().sql).not.toMatch(/\bs\.streams\b/);
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

    it("each row's nested refs load one statement per relation for the page, and carry no favorite or rating of Stash's", async () => {
      const parent = { pid: "1", pinst: "inst-a" };
      const key = (id: string) => ({ id, stashInstanceId: "inst-a" });
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe.mockImplementation(
        prismaImpl((sql: string) => {
          if (sql.includes("FROM StashScene s")) {
            return sql.startsWith("SELECT COUNT(*)")
              ? [{ total: 1n }]
              : [sceneRow({ studioId: "8", inheritedTagIds: '["3"]' })];
          }
          const byTable: Partial<Record<string, unknown[]>> = {
            StashPerformer: [
              {
                ...parent,
                ...key("5"),
                name: "Performer",
                disambiguation: "",
                gender: "FEMALE",
                imagePath: null,
                favorite: true,
                rating100: 90,
              },
            ],
            StashTag: sql.includes("FROM refs r")
              ? [{ ...key("3"), name: "Inherited", imagePath: null }]
              : [{ ...parent, ...key("4"), name: "Own", imagePath: null }],
            StashGroup: [
              {
                ...parent,
                ...key("6"),
                name: "Collection",
                frontImagePath: null,
                backImagePath: null,
                sceneIndex: 2,
              },
            ],
            StashGallery: [
              {
                ...parent,
                ...key("7"),
                title: "Gallery",
                folderPath: null,
                fileBasename: null,
                coverPath: null,
              },
            ],
            StashStudio: [
              {
                ...key("8"),
                name: "Studio",
                imagePath: null,
                parentId: null,
                favorite: true,
                rating100: 80,
              },
            ],
          };
          return byTable[/CROSS JOIN (Stash\w+) x/.exec(sql)?.[1] ?? ""] ?? [];
        })
      );

      const scene = must((await run()).items[0], "the scene");

      const ref = { instanceId: "inst-a", image_path: null };
      expect(scene.performers).toEqual([
        {
          ...ref,
          id: "5",
          name: "Performer",
          disambiguation: null,
          gender: "FEMALE",
        },
      ]);
      expect(scene.tags).toEqual([{ ...ref, id: "4", name: "Own" }]);
      expect(scene.inheritedTags).toEqual([
        { ...ref, id: "3", name: "Inherited" },
      ]);
      expect(scene.groups).toEqual([
        {
          id: "6",
          instanceId: "inst-a",
          name: "Collection",
          front_image_path: null,
          back_image_path: null,
          scene_index: 2,
        },
      ]);
      expect(scene.galleries).toEqual([
        { id: "7", instanceId: "inst-a", title: "Gallery", cover: null },
      ]);
      expect(scene.studio).toEqual({
        ...ref,
        id: "8",
        name: "Studio",
        parent_studio: null,
      });
      // The page, the count, then performers, tags, collections, galleries,
      // the studio and the inherited tags, each binding the viewer
      const calls = mockPrisma.$queryRawUnsafe.mock.calls;
      expect(calls).toHaveLength(8);
      for (const [sql, ...params] of calls.slice(2)) {
        expect(sql).toContain("FROM json_each(?)");
        expect(params[params.length - 1]).toBe(1);
      }
    });

    it("a studio or inherited tag the viewer cannot see is left out, though the row names its id", async () => {
      const scene = await executeRow(
        sceneRow({ studioId: "8", inheritedTagIds: '["3"]' })
      );

      expect(scene.studioId).toBe("8");
      expect(scene.studio).toBeNull();
      expect(scene.inheritedTagIds).toEqual(["3"]);
      expect(scene.inheritedTags).toEqual([]);
    });
  });

  describe("user history", () => {
    const O_AT = "2025-10-26T03:50:32.452Z";

    it("a list row carries last_o_at from userLastOAt and no play_history or o_history keys", async () => {
      const scene = await executeRow(
        sceneRow({ userOCount: 2, userLastOAt: O_AT })
      );

      expect(scene.last_o_at).toBe(O_AT);
      expect(scene).not.toHaveProperty("play_history");
      expect(scene).not.toHaveProperty("o_history");
    });

    it("last_o_at is null for a scene with no O", async () => {
      const scene = await executeRow(sceneRow());

      expect(scene.last_o_at).toBeNull();
    });

    it("the select list has no `w.oHistory AS` or `w.playHistory`", async () => {
      await run();

      const { sql } = pageStatement();
      expect(sql).not.toContain("w.oHistory AS");
      expect(sql).not.toContain("w.playHistory");
      // The newest O is computed in SQL, from the same column the sort reads
      expect(sql).toContain(
        "(SELECT MAX(j.value) FROM json_each(w.oHistory) j) AS userLastOAt"
      );
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

describe("getByRefs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
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

    const { sql, params } = pageStatement();
    expect(sql).toContain(
      "((s.id = ? AND s.stashInstanceId = ?) OR (s.id = ? AND s.stashInstanceId = ?))"
    );
    expect(sql).not.toContain("s.id IN (");
    // The pairs appear in order, each id beside its instance
    const at = params.indexOf("7");
    expect(params.slice(at, at + 4)).toEqual(["7", "inst-a", "8", "inst-a"]);
  });

  it("applies the user's exclusions by default and runs no count", async () => {
    await sceneQueryBuilder.getByRefs({
      userId: 1,
      refs: [{ id: "7", instanceId: "inst-a" }],
      allowedInstanceIds: ["inst-a"],
    });

    const { sql } = pageStatement();
    expect(sql).toContain("LEFT JOIN UserExcludedEntity e");
    expect(sql).toContain("e.id IS NULL");
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("runs no query for no refs", async () => {
    const result = await sceneQueryBuilder.getByRefs({
      userId: 1,
      refs: [],
      allowedInstanceIds: ["inst-a"],
    });

    expect(result).toEqual([]);
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
