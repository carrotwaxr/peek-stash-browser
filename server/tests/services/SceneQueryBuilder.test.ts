/**
 * Unit Tests for SceneQueryBuilder
 *
 * Tests the SQL query assembly for scene filtering, sorting, and pagination.
 * Verifies multi-instance support, exclusion filtering, search queries,
 * and allowedInstanceIds filtering by inspecting generated SQL.
 */
import { SCENE_FIELDS } from "@peek/shared-types/filters/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import type { LeafContext } from "../../services/query/EntityQueryBuilder.js";
import type { SceneQueryRow } from "../../types/internal/queryRows.js";
import type {
  ParsedFilter,
  ParsedListRequest,
} from "../../types/parsedFilters.js";
import { viewablePlaylistSql } from "../../utils/playlistAccessSql.js";
import {
  COMPLETED_SQL,
  IN_PROGRESS_SQL,
  watchStateClause,
} from "../../utils/watchStateSql.js";
import {
  alternatesOf,
  filterOf,
  firstMissingBound,
  samplesOf,
  whereOf,
} from "../helpers/fieldSamples.js";
import { expandRefsEach } from "../helpers/hierarchyMock.js";
import { arrayContaining, objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";
import { untrusted } from "../helpers/untrusted.js";

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
    // The viewer has no favorites unless a test gives some
    mockPrisma.tagRating.findMany.mockResolvedValue([]);
    mockPrisma.studioRating.findMany.mockResolvedValue([]);
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.findMany.mockResolvedValue([]);
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
      await run({ q: "test" });

      const { sql, params } = pageStatement();
      // Should search across multiple fields
      expect(sql).toContain("s.title LIKE ? ESCAPE '\\'");
      expect(sql).toContain("s.details LIKE ? ESCAPE '\\'");
      expect(sql).toContain("s.filePath LIKE ? ESCAPE '\\'");
      // Should have performer subquery
      expect(sql).toContain("StashPerformer");
      expect(sql).toContain("p.name LIKE ? ESCAPE '\\'");
      // Should have studio subquery
      expect(sql).toContain("StashStudio");
      // Should have tag subquery
      expect(sql).toContain("StashTag");

      // Search param should be wrapped in wildcards
      expect(params).toContain("%test%");
    });

    it("never lower-cases in SQL or in JavaScript: a non-ASCII capital matches as typed", async () => {
      await run({ q: "Élodie" });

      const { sql, params } = pageStatement();
      expect(sql).not.toContain("LOWER(");
      expect(params).toContain("%Élodie%");
      expect(params).not.toContain("%élodie%");
    });

    it("binds likeContains(q) with ESCAPE, so a % or _ in the search matches itself", async () => {
      await run({ q: "100%_x" });

      const { sql, params } = pageStatement();
      expect(sql).toContain("s.title LIKE ? ESCAPE '\\'");
      expect(sql).toContain("t.name LIKE ? ESCAPE '\\'");
      expect(sql).not.toMatch(/LIKE \?(?! ESCAPE)/);
      expect(params.filter((p) => p === "%100\\%\\_x%")).toHaveLength(6);
    });

    it("two words are two AND-ed groups of the six arms", async () => {
      await run({ q: "anna blonde" }, { applyExclusions: false });

      const { sql, params } = pageStatement();
      expect(sql.match(/s\.title LIKE \? ESCAPE/g)).toHaveLength(2);
      expect(sql.match(/\bt\.name LIKE \? ESCAPE/g)).toHaveLength(2);
      const at = params.indexOf("%anna%");
      expect(params.slice(at, at + 12)).toEqual([
        ...Array<string>(6).fill("%anna%"),
        ...Array<string>(6).fill("%blonde%"),
      ]);
      // The groups sit side by side: the first group closes, AND, the next opens
      expect(sql).toMatch(/\) AND \(\s*s\.title LIKE/);
    });

    it("a quoted phrase is one group", async () => {
      await run({ q: '"anna blonde" pov' }, { applyExclusions: false });

      const { params } = pageStatement();
      expect(params.filter((p) => p === "%anna blonde%")).toHaveLength(6);
      expect(params.filter((p) => p === "%pov%")).toHaveLength(6);
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

    it("watched and in_progress read the shared rules over the viewer's history row; false is the negation", async () => {
      await run({ filter: { watched: true } });
      await run({ filter: { watched: false } });
      await run({ filter: { in_progress: true } });
      await run({ filter: { in_progress: false } });

      const pages = mockPrisma.$queryRawUnsafe.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.includes("ORDER BY"));
      expect(pages).toHaveLength(4);
      expect(pages[0]).toContain(
        `AND ${watchStateClause(COMPLETED_SQL, true)}`
      );
      expect(pages[1]).toContain(
        `AND ${watchStateClause(COMPLETED_SQL, false)}`
      );
      expect(pages[2]).toContain(
        `AND ${watchStateClause(IN_PROGRESS_SQL, true)}`
      );
      expect(pages[3]).toContain(
        `AND ${watchStateClause(IN_PROGRESS_SQL, false)}`
      );
      expect(pages[0]).toContain("LEFT JOIN WatchHistory w ON");
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

    it.each([
      ["resolution", "MIN(s.fileWidth, s.fileHeight) ASC, s.id ASC"],
      ["code", "s.code ASC, s.id ASC"],
      ["organized", "s.organized ASC, s.id ASC"],
    ] as const)(
      "the %s sort reads the column, without a join",
      async (field, order) => {
        await run({ sort: { field, direction: "ASC", seed: undefined } });

        expect(pageStatement().sql).toContain(`ORDER BY ${order}`);
        expect(pageStatement().sql).not.toContain("StashStudio");
      }
    );

    it("the studio sort is a scalar subquery on the studio's key that leaves out a deleted or hidden studio, scenes without one last, and no join reaches the count", async () => {
      await run({
        sort: { field: "studio", direction: "DESC", seed: undefined },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "ORDER BY (SELECT sso.name FROM StashStudio sso WHERE sso.id = s.studioId AND sso.stashInstanceId = s.stashInstanceId AND sso.deletedAt IS NULL AND NOT EXISTS (SELECT 1 FROM UserExcludedEntity ssx WHERE ssx.userId = ? AND ssx.entityType = 'studio' AND ssx.entityId = sso.id AND (ssx.instanceId = '' OR ssx.instanceId = sso.stashInstanceId))) COLLATE NOCASE DESC NULLS LAST, s.id DESC"
      );
      // The viewer binds in the order, before the page's limit and offset
      expect(params.slice(-3)).toEqual([1, 10, 0]);
      expect(countSql()).not.toContain("StashStudio");
    });

    it("the performer_age sort is the youngest performer's age ascending and the oldest's descending, undated or performer-less scenes last", async () => {
      await run({
        sort: { field: "performer_age", direction: "ASC", seed: undefined },
      });
      await run({
        sort: { field: "performer_age", direction: "DESC", seed: undefined },
      });

      const [asc, desc] = mockPrisma.$queryRawUnsafe.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.includes("ORDER BY"));
      expect(asc).toContain("- MAX(pa.day) AS INTEGER)");
      expect(asc).toContain("NULLS LAST, s.id ASC, s.stashInstanceId ASC");
      expect(desc).toContain("- MIN(pa.day) AS INTEGER)");
      expect(desc).toContain("NULLS LAST, s.id DESC, s.stashInstanceId DESC");
      expect(asc).toContain("FROM ScenePerformer sp JOIN pa ON");
      expect(asc).toContain("pax.id IS NULL");
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

    it("tags match the junction and the inherited list, one id list per instance", async () => {
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
        "EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND ((st.tagInstanceId = ? AND st.tagId IN (?, ?))))"
      );
      expect(sql).toContain(
        "EXISTS (SELECT 1 FROM SceneInheritedTag sit WHERE sit.sceneId = s.id AND sit.sceneInstanceId = s.stashInstanceId AND ((sit.tagInstanceId = ? AND sit.tagId IN (?, ?))))"
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
      expect(sql).toContain("s.fileVideoCodec LIKE ? ESCAPE '\\'");
      expect(sql).toContain("LOWER(s.fileAudioCodec) = LOWER(?)");
      expect(sql).toContain("(s.director LIKE ? ESCAPE '\\')");
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

    it("resolution compares the shorter side; orientation matches any of its values", async () => {
      await run({
        filter: {
          resolution: { modifier: "GREATER_THAN", value: "FULL_HD" },
          orientation: { modifier: "INCLUDES", values: ["PORTRAIT", "SQUARE"] },
        },
      });

      const { sql } = pageStatement();
      expect(sql).toContain("MIN(s.fileWidth, s.fileHeight) > 1439");
      expect(sql).toContain(
        "((s.fileWidth < s.fileHeight) OR (s.fileWidth = s.fileHeight AND s.fileWidth > 0))"
      );
    });

    it.each([
      ["SEVEN_K", "BETWEEN 3584 AND 3839"],
      ["HUGE", "BETWEEN 6144 AND 9999"],
    ] as const)(
      "%s is Stash's range on the shorter side",
      async (value, range) => {
        await run({ filter: { resolution: { modifier: "EQUALS", value } } });

        const { sql } = pageStatement();
        expect(sql).toContain(`MIN(s.fileWidth, s.fileHeight) ${range}`);
      }
    );

    it("the viewer's favorites, ratings and history filters read the per-user joins", async () => {
      mockPrisma.performerRating.findMany.mockResolvedValue([
        partialRow({ performerId: "7", instanceId: "inst-a" }),
      ]);
      mockPrisma.studioRating.findMany.mockResolvedValue([
        partialRow({ studioId: "8", instanceId: "inst-b" }),
      ]);
      mockPrisma.tagRating.findMany.mockResolvedValue([
        partialRow({ tagId: "9", instanceId: "inst-a" }),
      ]);
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
      expect(sql).toContain("r.rating > ?");
      expect(sql).toContain("COALESCE(w.playCount, 0) = ?");
      expect(sql).toContain("COALESCE(w.oCount, 0) BETWEEN ? AND ?");
      expect(sql).toContain("w.lastPlayedAt IS NULL");
      // The favorites are read as the viewer's own rows, then matched as
      // (id, instance) pairs through the filters' own junctions and column
      for (const model of [
        mockPrisma.performerRating,
        mockPrisma.studioRating,
        mockPrisma.tagRating,
      ]) {
        expect(model.findMany).toHaveBeenCalledWith(
          objectContaining({
            where: {
              userId: 1,
              favorite: true,
              instanceId: { in: ALLOWED },
            },
          })
        );
      }
      expect(sql).not.toContain("Rating pr");
      expect(sql).toContain("FROM ScenePerformer");
      expect(sql).toContain("FROM SceneTag");
      expect(sql).toContain("FROM SceneInheritedTag");
      expect(sql).toContain("s.studioId IN (?, ?)");
      expect(sql).toContain("strftime('%Y.%m%d', ");
      expect(sql).not.toContain("julianday");
      expect(sql).toContain("s.date IS NOT NULL AND EXISTS");
      // The favorites are read once each, the clauses bind pairs, and the
      // age clause's exclusion arm binds the viewer
      expect(params).toEqual(
        arrayContaining(["7", "inst-a", "8", "inst-b", "9", "inst-a"])
      );
    });

    it("tag_favorite and studio_favorite expand to sub-tags and sub-studios, and false is the negation", async () => {
      mockPrisma.tagRating.findMany.mockResolvedValue([
        partialRow({ tagId: "9", instanceId: "inst-a" }),
      ]);
      mockPrisma.studioRating.findMany.mockResolvedValue([
        partialRow({ studioId: "8", instanceId: "inst-a" }),
      ]);
      mockPrisma.performerRating.findMany.mockResolvedValue([
        partialRow({ performerId: "7", instanceId: "inst-a" }),
      ]);
      expandRefsEach.mockClear();
      await run({
        filter: {
          tag_favorite: false,
          studio_favorite: false,
          performer_favorite: false,
        },
      });

      expect(expandRefsEach).toHaveBeenCalledWith(
        "tag",
        [{ id: "9", instanceId: "inst-a" }],
        -1,
        ALLOWED,
        "down"
      );
      expect(expandRefsEach).toHaveBeenCalledWith(
        "studio",
        [{ id: "8", instanceId: "inst-a" }],
        -1,
        ALLOWED,
        "down"
      );
      const { sql } = pageStatement();
      expect(sql).toContain("NOT EXISTS");
      expect(sql).toContain("s.studioId IS NULL OR NOT");
    });

    it("a favorite the viewer excluded is dropped, with the exclusions applied only", async () => {
      mockPrisma.tagRating.findMany.mockResolvedValue([
        partialRow({ tagId: "9", instanceId: "inst-a" }),
        partialRow({ tagId: "10", instanceId: "inst-a" }),
        partialRow({ tagId: "11", instanceId: "inst-b" }),
      ]);
      mockPrisma.userExcludedEntity.findMany.mockResolvedValue([
        partialRow({ entityId: "9", instanceId: "inst-a" }),
        partialRow({ entityId: "11", instanceId: "" }),
        partialRow({ entityId: "10", instanceId: "inst-b" }),
      ]);
      expandRefsEach.mockClear();
      await run({ filter: { tag_favorite: true } });

      expect(mockPrisma.userExcludedEntity.findMany).toHaveBeenCalledWith(
        objectContaining({
          where: {
            userId: 1,
            entityType: "tag",
            entityId: { in: ["9", "10", "11"] },
          },
        })
      );
      // 9 is hidden on its instance and 11 on every instance; 10 is hidden
      // on the other instance only
      expect(expandRefsEach).toHaveBeenCalledWith(
        "tag",
        [{ id: "10", instanceId: "inst-a" }],
        -1,
        ALLOWED,
        "down"
      );

      mockPrisma.userExcludedEntity.findMany.mockClear();
      expandRefsEach.mockClear();
      await run({ filter: { tag_favorite: true } }, { applyExclusions: false });
      expect(mockPrisma.userExcludedEntity.findMany).not.toHaveBeenCalled();
      expect(expandRefsEach).toHaveBeenCalledWith(
        "tag",
        arrayContaining([{ id: "9", instanceId: "inst-a" }]),
        -1,
        ALLOWED,
        "down"
      );
    });

    it("with no favorites, true matches nothing and false adds no clause", async () => {
      for (const model of [
        mockPrisma.performerRating,
        mockPrisma.studioRating,
        mockPrisma.tagRating,
      ]) {
        model.findMany.mockResolvedValue([]);
      }
      await run({ filter: { tag_favorite: true } });
      expect(pageStatement().sql).toContain("1 = 0");

      mockPrisma.$queryRawUnsafe.mockClear();
      await run({
        filter: {
          tag_favorite: false,
          studio_favorite: false,
          performer_favorite: false,
        },
      });
      expect(pageStatement().sql).toContain(
        "WHERE s.deletedAt IS NULL AND e.id IS NULL AND s.stashInstanceId IN (?, ?)\nORDER BY"
      );
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

  it("binds each ref's id beside its instance, so B's same id stays out", async () => {
    await sceneQueryBuilder.getByRefs({
      userId: 1,
      refs: [
        { id: "7", instanceId: "inst-a" },
        { id: "8", instanceId: "inst-a" },
      ],
      allowedInstanceIds: ["inst-a", "inst-b"],
    });

    const { sql, params } = pageStatement();
    expect(sql).toContain("((s.stashInstanceId = ? AND s.id IN (?, ?)))");
    // The ids never match without their instance
    expect(sql).not.toContain("(s.id IN (");
    // The instance is bound once, ahead of its ids
    const at = params.indexOf("7");
    expect(params.slice(at - 1, at + 2)).toEqual(["inst-a", "7", "8"]);
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

describe("sortTerms", () => {
  /** The two user joins, as the list statement writes them */
  const USER_JOINS = [
    {
      sql: "LEFT JOIN SceneRating r ON s.id = r.sceneId AND s.stashInstanceId = r.instanceId AND r.userId = ?",
      params: [5],
    },
    {
      sql: "LEFT JOIN WatchHistory w ON s.id = w.sceneId AND s.stashInstanceId = w.instanceId AND w.userId = ?",
      params: [5],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("joins the viewer's rating and history and orders by the list's expression", () => {
    expect(
      sceneQueryBuilder.sortTerms(5, {
        field: "title",
        direction: "ASC",
        seed: undefined,
      })
    ).toEqual({
      joins: USER_JOINS,
      order: { sql: "s.titleSort ASC", params: [] },
    });
    expect(
      sceneQueryBuilder.sortTerms(5, {
        field: "rating",
        direction: "DESC",
        seed: undefined,
      }).order
    ).toEqual({ sql: "COALESCE(r.rating, 0) DESC", params: [] });
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("orders the list's way: the same expression a Scenes page sorts by", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    await sceneQueryBuilder.execute({
      userId: 5,
      allowedInstanceIds: ALLOWED,
      request: request({
        sort: { field: "last_o_at", direction: "ASC", seed: undefined },
      }),
    });
    const { order } = sceneQueryBuilder.sortTerms(5, {
      field: "last_o_at",
      direction: "ASC",
      seed: undefined,
    });
    expect(pageStatement().sql).toContain(`ORDER BY ${order.sql}, s.id ASC`);
  });

  it("binds a random sort's seed through the list's random order", () => {
    const { joins, order } = sceneQueryBuilder.sortTerms(5, {
      field: "random",
      direction: "ASC",
      seed: 7,
    });
    expect(joins).toEqual(USER_JOINS);
    expect(order.sql).toMatch(/^\(\(\(\(\(s\.id \+ \?\).* ASC$/);
    expect(order.sql).not.toMatch(/\b7\b/);
    expect(order.params).toEqual([7, 7, 7]);
  });
});

describe("the scene field table", () => {
  it("has a clause for every scene field but the base's", () => {
    const fields = Object.keys(SCENE_FIELDS).filter(
      (field) => field !== "ids" && field !== "instance_id"
    );

    // The table is in the statement's clause order, the fields in the
    // contract's: the same set
    expect(Object.keys(sceneQueryBuilder["fieldClauses"]).sort()).toEqual(
      fields.sort()
    );
  });

  it("a tags leaf under an any group takes the read-once shape under an indexed sort", async () => {
    const leaf = {
      field: "tags",
      criterion: {
        refs: [{ id: "284", instanceId: "inst-a" }],
        modifier: "INCLUDES",
        depth: 0,
      },
    } as const;
    const ctx = (underAny: boolean): LeafContext => ({
      userId: 1,
      applyExclusions: true,
      allowedInstanceIds: ALLOWED,
      specificInstanceId: undefined,
      sortField: "created_at",
      ranked: false,
      timeZone: "UTC",
      hasExclusionsOf: () => Promise.resolve(false),
      name: "tags",
      underAny,
    });

    const anyGroup = await sceneQueryBuilder.clauseFor(leaf, ctx(true));
    const own = await sceneQueryBuilder.clauseFor(leaf, ctx(false));

    // junctionInList: the matches read once from the junctions' tag index
    expect(anyGroup.sql).toMatch(
      /^\(s\.id, s\.stashInstanceId\) IN \(SELECT st\.sceneId, st\.sceneInstanceId FROM SceneTag st WHERE /
    );
    expect(anyGroup.sql).not.toContain("EXISTS");
    // The per-row EXISTS, walking the sort's index
    expect(own.sql).toContain(
      "EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND ((st.tagId = ? AND st.tagInstanceId = ?)))"
    );
    expect(own.sql).not.toContain("IN (SELECT");
  });
});

describe("the playlist filters and Playlist order", () => {
  const ctx = (name: string): LeafContext => ({
    userId: 9,
    applyExclusions: true,
    allowedInstanceIds: ALLOWED,
    specificInstanceId: undefined,
    sortField: "created_at",
    ranked: false,
    timeZone: "UTC",
    hasExclusionsOf: () => Promise.resolve(false),
    name,
    underAny: false,
  });
  /** The viewable-playlist check on `p`, as `viewablePlaylistSql` writes it */
  const VIEWABLE = "(p.userId = ? OR (EXISTS (SELECT 1 FROM PlaylistShare ps";
  const INCLUDES_ONE =
    "(s.id, s.stashInstanceId) IN (SELECT pi.sceneId, pi.instanceId FROM PlaylistItem pi JOIN Playlist p ON p.id = pi.playlistId WHERE pi.playlistId IN (?) AND ";

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  it("INCLUDES reads the playlists' items by PlaylistItem's key, viewable playlists only", async () => {
    const clause = await sceneQueryBuilder.clauseFor(
      {
        field: "playlists",
        criterion: { ids: [12, 15], modifier: "INCLUDES" },
      },
      ctx("playlists")
    );

    expect(clause.sql).toBe(
      `(s.id, s.stashInstanceId) IN (SELECT pi.sceneId, pi.instanceId FROM PlaylistItem pi JOIN Playlist p ON p.id = pi.playlistId WHERE pi.playlistId IN (?, ?) AND ${viewablePlaylistSql("p", 9).sql})`
    );
    expect(clause.sql).toContain(VIEWABLE);
    expect(clause.params).toEqual([12, 15, 9, 9]);
    expect(clause.ctes ?? []).toEqual([]);
  });

  it("INCLUDES_ALL is one INCLUDES per playlist, AND-ed", async () => {
    const clause = await sceneQueryBuilder.clauseFor(
      {
        field: "playlists",
        criterion: { ids: [12, 15], modifier: "INCLUDES_ALL" },
      },
      ctx("playlists")
    );

    expect(clause.sql.split(INCLUDES_ONE)).toHaveLength(3);
    expect(clause.sql).toContain(") AND (");
    expect(clause.params).toEqual([12, 9, 9, 15, 9, 9]);
  });

  it("EXCLUDES and in_any_playlist false take the matched-set shape: a materialized CTE and a keyed anti-join", async () => {
    const excludes = await sceneQueryBuilder.clauseFor(
      { field: "playlists", criterion: { ids: [12], modifier: "EXCLUDES" } },
      ctx("playlists")
    );
    const none = await sceneQueryBuilder.clauseFor(
      { field: "in_any_playlist", criterion: false },
      ctx("in_any_playlist")
    );

    for (const [clause, name] of [
      [excludes, "playlists_set"],
      [none, "in_any_playlist_set"],
    ] as const) {
      const cte = must(clause.ctes?.[0], `${name} CTE`);
      expect(cte.name).toBe(name);
      expect(cte.sql).toMatch(
        new RegExp(
          `^${name}\\(id, inst\\) AS MATERIALIZED \\(SELECT DISTINCT pi\\.sceneId, pi\\.instanceId FROM PlaylistItem pi JOIN Playlist p ON p\\.id = pi\\.playlistId WHERE `
        )
      );
      expect(clause.sql).toBe(
        `(s.id || ':' || s.stashInstanceId) NOT IN (SELECT id || ':' || inst FROM ${name})`
      );
      expect(clause.sql).not.toContain("NOT EXISTS");
      expect(clause.sql).not.toContain("(s.id, s.stashInstanceId) NOT IN");
      expect(cte.sql).not.toContain("s.id");
    }
    // The playlists the viewer may read; "any of my playlists" their own only
    expect(must(excludes.ctes?.[0], "set").sql).toContain(VIEWABLE);
    expect(must(excludes.ctes?.[0], "set").params).toEqual([12, 9, 9]);
    expect(must(none.ctes?.[0], "set").sql).toContain("WHERE p.userId = ?)");
    expect(must(none.ctes?.[0], "set").sql).not.toContain("PlaylistShare");
    expect(must(none.ctes?.[0], "set").params).toEqual([9]);
  });

  it("in_any_playlist true lists the scenes of the viewer's own playlists only", async () => {
    const clause = await sceneQueryBuilder.clauseFor(
      { field: "in_any_playlist", criterion: true },
      ctx("in_any_playlist")
    );

    expect(clause.sql).toBe(
      "(s.id, s.stashInstanceId) IN (SELECT pi.sceneId, pi.instanceId FROM PlaylistItem pi JOIN Playlist p ON p.id = pi.playlistId WHERE p.userId = ?)"
    );
    expect(clause.params).toEqual([9]);
  });

  it("the EXCLUDES set reaches the statement's WITH, its parameters first", async () => {
    await sceneQueryBuilder.execute({
      userId: 9,
      allowedInstanceIds: ALLOWED,
      request: request({
        filter: { playlists: { ids: [12], modifier: "EXCLUDES" } },
      }),
    });

    const { sql, params } = pageStatement();
    expect(sql).toMatch(
      /^WITH playlists_set\(id, inst\) AS MATERIALIZED \(SELECT DISTINCT pi\.sceneId/
    );
    expect(params.slice(0, 3)).toEqual([12, 9, 9]);
  });

  it("Playlist order joins the one playlist's item and orders by its position, then the key", async () => {
    await sceneQueryBuilder.execute({
      userId: 9,
      allowedInstanceIds: ALLOWED,
      request: request({
        sort: {
          field: "playlist_position",
          direction: "DESC",
          seed: undefined,
        },
        filter: { playlists: { ids: [12], modifier: "INCLUDES" } },
      }),
    });

    const { sql, params } = pageStatement();
    expect(sql).toContain(
      "JOIN PlaylistItem pip ON pip.playlistId = ? AND pip.sceneId = s.id AND pip.instanceId = s.stashInstanceId"
    );
    expect(sql).not.toContain("LEFT JOIN PlaylistItem pip");
    expect(sql).toContain(
      "ORDER BY pip.position DESC, s.id DESC, s.stashInstanceId DESC"
    );
    expect(params).toContain(12);
  });

  it("without one included playlist Playlist order has no expression and the default sort applies", async () => {
    await sceneQueryBuilder.execute({
      userId: 9,
      allowedInstanceIds: ALLOWED,
      request: request({
        sort: {
          field: "playlist_position",
          direction: "ASC",
          seed: undefined,
        },
        filter: { playlists: { ids: [12], modifier: "EXCLUDES" } },
      }),
    });

    expect(pageStatement().sql).not.toContain("pip.");
  });
});

describe("the path, URL, code, caption, marker and duplicate filters", () => {
  const ctx = (name: string, applyExclusions = true): LeafContext => ({
    userId: 9,
    applyExclusions,
    allowedInstanceIds: ALLOWED,
    specificInstanceId: undefined,
    sortField: "created_at",
    ranked: false,
    timeZone: "UTC",
    hasExclusionsOf: () => Promise.resolve(false),
    name,
    underAny: false,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  it("path reads the primary file's path; STARTS_WITH is an escaped prefix", async () => {
    const starts = await sceneQueryBuilder.clauseFor(
      { field: "path", criterion: { modifier: "STARTS_WITH", value: "/a_b/" } },
      ctx("path")
    );
    expect(starts.sql).toBe("(s.filePath LIKE ? ESCAPE '\\')");
    expect(starts.params).toEqual(["/a\\_b/%"]);

    const includes = await sceneQueryBuilder.clauseFor(
      { field: "path", criterion: { modifier: "INCLUDES", value: "50%" } },
      ctx("path")
    );
    expect(includes.params).toEqual(["%50\\%%"]);
  });

  it("url reads the elements of the URL list, never its JSON text", async () => {
    const clause = await sceneQueryBuilder.clauseFor(
      { field: "url", criterion: { modifier: "INCLUDES", value: '"' } },
      ctx("url")
    );
    expect(clause.sql).toBe(
      "(EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(s.urls) THEN s.urls ELSE '[]' END) a WHERE a.value LIKE ? ESCAPE '\\'))"
    );
    expect(clause.params).toEqual(['%"%']);
    expect(clause.sql).not.toContain("LOWER");

    const none = await sceneQueryBuilder.clauseFor(
      { field: "url", criterion: { modifier: "IS_NULL" } },
      ctx("url")
    );
    expect(none.sql).toBe("((s.urls IS NULL OR s.urls = '' OR s.urls = '[]'))");
  });

  it("code reads the code column", async () => {
    const clause = await sceneQueryBuilder.clauseFor(
      { field: "code", criterion: { modifier: "EQUALS", value: "AB-1" } },
      ctx("code")
    );
    expect(clause.sql).toBe("LOWER(s.code) = LOWER(?)");
    expect(clause.params).toEqual(["AB-1"]);
  });

  it("captions compare each caption's language code, through a list that cannot fail the statement", async () => {
    const equals = await sceneQueryBuilder.clauseFor(
      { field: "captions", criterion: { modifier: "EQUALS", value: "en" } },
      ctx("captions")
    );
    expect(equals.sql).toBe(
      "EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(s.captions) THEN s.captions ELSE '[]' END) j WHERE CASE WHEN j.type = 'object' THEN json_extract(j.value, '$.language_code') END = ?)"
    );
    expect(equals.params).toEqual(["en"]);

    const not = await sceneQueryBuilder.clauseFor(
      { field: "captions", criterion: { modifier: "NOT_EQUALS", value: "en" } },
      ctx("captions")
    );
    expect(not.sql).toMatch(/^NOT EXISTS \(SELECT 1 FROM json_each\(/);

    const isNull = await sceneQueryBuilder.clauseFor(
      { field: "captions", criterion: { modifier: "IS_NULL" } },
      ctx("captions")
    );
    const notNull = await sceneQueryBuilder.clauseFor(
      { field: "captions", criterion: { modifier: "NOT_NULL" } },
      ctx("captions")
    );
    expect(isNull.sql).toMatch(/^NOT EXISTS \(SELECT 1 FROM json_each\(/);
    expect(notNull.sql).toMatch(/^EXISTS \(SELECT 1 FROM json_each\(/);
    expect(isNull.params).toEqual([]);
  });

  it("has_markers anti-joins the viewer's clip exclusions with the instance and its every-instance arm", async () => {
    const yes = await sceneQueryBuilder.clauseFor(
      { field: "has_markers", criterion: true },
      ctx("has_markers")
    );
    expect(yes.sql).toBe(
      "EXISTS (SELECT 1 FROM StashClip c LEFT JOIN UserExcludedEntity ce ON ce.userId = ? AND ce.entityType = 'clip' AND ce.entityId = c.id AND (ce.instanceId = '' OR ce.instanceId = c.stashInstanceId) WHERE c.sceneId = s.id AND c.sceneInstanceId = s.stashInstanceId AND c.deletedAt IS NULL AND ce.id IS NULL)"
    );
    expect(yes.params).toEqual([9]);

    const no = await sceneQueryBuilder.clauseFor(
      { field: "has_markers", criterion: false },
      ctx("has_markers")
    );
    expect(no.sql).toBe(`NOT ${yes.sql}`);

    const bypassed = await sceneQueryBuilder.clauseFor(
      { field: "has_markers", criterion: true },
      ctx("has_markers", false)
    );
    expect(bypassed.sql).not.toContain("UserExcludedEntity");
    expect(bypassed.params).toEqual([]);
  });

  it("duplicated needs a visible live twin on the scene's own instance with the same non-empty phash", async () => {
    const yes = await sceneQueryBuilder.clauseFor(
      { field: "duplicated", criterion: true },
      ctx("duplicated")
    );
    expect(yes.sql).toBe(
      "(s.phash IS NOT NULL AND s.phash != '' AND EXISTS (SELECT 1 FROM StashScene d LEFT JOIN UserExcludedEntity de ON de.userId = ? AND de.entityType = 'scene' AND de.entityId = d.id AND (de.instanceId = '' OR de.instanceId = d.stashInstanceId) WHERE d.phash = s.phash AND d.deletedAt IS NULL AND d.stashInstanceId IN (?, ?) AND d.stashInstanceId = s.stashInstanceId AND NOT (d.id = s.id AND d.stashInstanceId = s.stashInstanceId) AND de.id IS NULL))"
    );
    expect(yes.params).toEqual([9, "inst-a", "inst-b"]);

    // false is the negation: a scene without a phash is listed
    const no = await sceneQueryBuilder.clauseFor(
      { field: "duplicated", criterion: false },
      ctx("duplicated")
    );
    expect(no.sql).toBe(`NOT ${yes.sql}`);
    expect(no.params).toEqual(yes.params);
  });

  it("groups take a depth: sub-collections through the group hierarchy, presence unchanged", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    await sceneQueryBuilder.clauseFor(
      {
        field: "groups",
        criterion: {
          refs: [{ id: "10", instanceId: "inst-a" }],
          modifier: "INCLUDES",
          depth: -1,
        },
      },
      ctx("groups")
    );
    expect(expandRefsEach).toHaveBeenCalledWith(
      "group",
      [{ id: "10", instanceId: "inst-a" }],
      -1,
      ALLOWED,
      "down"
    );

    const some = await sceneQueryBuilder.clauseFor(
      {
        field: "groups",
        criterion: { modifier: "NOT_NULL", refs: [], depth: 0 },
      },
      ctx("groups")
    );
    expect(some.sql).toContain("SceneGroup");
  });
});

/** What each scene field's clause adds to the WHERE, as the shared spec's sample binds it */
const SCENE_CLAUSES: Record<
  Exclude<keyof typeof SCENE_FIELDS, "instance_id">,
  string
> = {
  ids: "(s.id = ? AND s.stashInstanceId = ?)",
  title: "s.title LIKE ?",
  details: "s.details LIKE ?",
  director: "s.director LIKE ?",
  video_codec: "s.fileVideoCodec LIKE ?",
  audio_codec: "s.fileAudioCodec LIKE ?",
  path: "s.filePath LIKE ?",
  url: "json_valid(s.urls)",
  code: "s.code LIKE ?",
  captions: "json_extract(j.value, '$.language_code') END = ?",
  has_markers: "FROM StashClip c LEFT JOIN UserExcludedEntity ce",
  duplicated: "s.phash IS NOT NULL AND s.phash != ''",
  performers: "FROM ScenePerformer sp WHERE sp.sceneId = s.id",
  tags: "FROM SceneInheritedTag sit",
  studios: "(s.stashInstanceId = ? AND s.studioId IN (?, ?))",
  groups: "FROM SceneGroup sg WHERE sg.sceneId = s.id",
  galleries: "FROM SceneGallery sg WHERE sg.sceneId = s.id",
  performer_tags: "FROM ScenePerformer sp CROSS JOIN PerformerTag pt",
  playlists:
    "FROM PlaylistItem pi JOIN Playlist p ON p.id = pi.playlistId WHERE pi.playlistId IN (?)",
  in_any_playlist:
    "FROM PlaylistItem pi JOIN Playlist p ON p.id = pi.playlistId WHERE p.userId = ?",
  rating100: "r.rating > ?",
  o_counter: "COALESCE(w.oCount, 0) > ?",
  play_count: "COALESCE(w.playCount, 0) > ?",
  play_duration: "COALESCE(w.playDuration, 0) > ?",
  watched: "w.playCount > 0 AND (COALESCE(w.resumeTime, 0) = 0",
  in_progress: "w.resumeTime > 0 AND (s.duration IS NULL",
  duration: "s.duration > ?",
  bitrate: "s.fileBitRate > ?",
  framerate: "s.fileFrameRate > ?",
  performer_count: "s.performerCount > ?",
  tag_count: "s.tagCount > ?",
  tagged: "NOT (s.tagCount = 0 AND NOT EXISTS",
  performer_age:
    "p.birthdate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM UserExcludedEntity x",
  resolution: "MIN(s.fileWidth, s.fileHeight) BETWEEN 144 AND 239",
  orientation: "s.fileWidth > s.fileHeight",
  date: "END, 1, 10) > ?",
  created_at: "s.stashCreatedAt >= ?",
  updated_at: "s.stashUpdatedAt >= ?",
  last_played_at: "w.lastPlayedAt >= ?",
  favorite: "r.favorite = 1",
  performer_favorite: "FROM ScenePerformer sp WHERE sp.sceneId = s.id",
  studio_favorite: "(s.stashInstanceId = ? AND s.studioId IN (?, ?))",
  tag_favorite: "FROM SceneInheritedTag sit",
  organized: "s.organized = ?",
};

describe("every scene field clause", () => {
  /** The viewer's one favourite of each kind, on the instance the samples allow */
  function seedFavourites(): void {
    mockPrisma.tagRating.findMany.mockResolvedValue([
      partialRow({ tagId: "8", instanceId: "inst-a" }),
    ]);
    mockPrisma.studioRating.findMany.mockResolvedValue([
      partialRow({ studioId: "8", instanceId: "inst-a" }),
    ]);
    mockPrisma.performerRating.findMany.mockResolvedValue([
      partialRow({ performerId: "8", instanceId: "inst-a" }),
    ]);
    mockPrisma.userExcludedEntity.findMany.mockResolvedValue([]);
  }

  const BOUND = {
    performer_favorite: ["8", "inst-a"],
    studio_favorite: ["inst-a", "8"],
    tag_favorite: ["inst-a", "8"],
    resolution: [],
    orientation: [],
  };

  const SAMPLES = new Map(samplesOf(SCENE_FIELDS, BOUND));

  /** The page statement for a filter alone, with nothing else answered */
  async function statementFor(
    filter: Record<string, unknown>,
    applyExclusions = true
  ): Promise<{ sql: string; params: unknown[] }> {
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    seedFavourites();
    await run(
      { filter: untrusted<ParsedListRequest<"scene">["filter"]>(filter) },
      { applyExclusions }
    );
    return pageStatement();
  }

  it("has a sample for every field the table carries", () => {
    expect([...SAMPLES.keys()].sort()).toEqual(
      Object.keys(SCENE_CLAUSES).sort()
    );
  });

  it.each(Object.entries(SCENE_CLAUSES))(
    "%s adds its clause to the WHERE and binds its sample in order",
    async (field, fragment) => {
      const sample = must(SAMPLES.get(field), `a sample for ${field}`);

      const { sql, params } = await statementFor(filterOf(sample));

      expect(whereOf(sql)).toContain(fragment);
      expect(firstMissingBound(params, sample.bound)).toBeNull();
    }
  );

  it.each(alternatesOf(SCENE_FIELDS, BOUND))(
    "%s builds a clause of its own and binds its values in order",
    async (_label, sample) => {
      const baseline = whereOf((await statementFor({})).sql);

      const { sql, params } = await statementFor(filterOf(sample));

      expect(whereOf(sql)).not.toBe(baseline);
      expect(firstMissingBound(params, sample.bound)).toBeNull();
    }
  );

  it.each(Object.keys(SCENE_CLAUSES))(
    "%s takes no exclusion join when the viewer's exclusions do not apply",
    async (field) => {
      const sample = must(SAMPLES.get(field), `a sample for ${field}`);

      const { sql } = await statementFor(filterOf(sample), false);

      expect(whereOf(sql)).not.toContain("UserExcludedEntity");
    }
  );
});

describe("the where tree on scenes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  it("Scene Number sorts by a collection row at the root of an all where", async () => {
    await run({
      sort: { field: "scene_index", direction: "ASC", seed: undefined },
      where: {
        match: "all",
        rules: [
          {
            field: "groups",
            criterion: {
              refs: [{ id: "33", instanceId: "inst-a" }],
              modifier: "INCLUDES",
              depth: 0,
            },
          },
        ],
      },
    });

    const { sql, params } = pageStatement();
    expect(sql).toContain(
      "JOIN SceneGroup sgi ON sgi.sceneId = s.id AND sgi.sceneInstanceId = s.stashInstanceId AND sgi.groupId = ? AND sgi.groupInstanceId = ?"
    );
    expect(sql).toContain(
      "ORDER BY sgi.sceneIndex IS NULL, sgi.sceneIndex ASC"
    );
    const at = params.indexOf("33");
    expect(params.slice(at, at + 2)).toEqual(["33", "inst-a"]);
  });
});
