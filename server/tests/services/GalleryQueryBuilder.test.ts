/**
 * Unit tests for GalleryQueryBuilder on the base builder (item 74): the
 * statements it records for a parsed request. The base owns the instance
 * filter, the exclusion join, the `ids` pairs, the random sort and the
 * joined count; this file pins what the gallery adds on top (its rating and
 * cover image joins, sort map and title tiebreak, filter clauses and
 * search), that the base's clauses reach its statements, and each row's
 * count of the scenes the viewer can see.
 */
import { GALLERY_FIELDS } from "@peek/shared-types/filters/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import type { GalleryQueryRow } from "../../types/internal/queryRows.js";
import type {
  FilterRef,
  ParsedListRequest,
} from "../../types/parsedFilters.js";
import { parsedListRequest } from "../helpers/fixtures.js";
import { arrayContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { prismaImpl } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

// Each ref expands to itself and one descendant, "99", on its own instance
vi.mock(
  "../../utils/hierarchyUtils.js",
  () => import("../helpers/hierarchyMock.js")
);

vi.mock("../../utils/titleUtils.js", () => ({
  getGalleryFallbackTitle: vi.fn().mockReturnValue("Untitled Gallery"),
}));

const mockPrisma = vi.mocked(prisma, true);

const ALLOWED = ["inst-a", "inst-b"];
const ref = (id: string, instanceId = "inst-a"): FilterRef => ({
  id,
  instanceId,
});
const bare = (id: string): FilterRef => ({ id, instanceId: undefined });

/** The displayed title's expression, as the title sort and tiebreak read it */
const TITLE =
  "COALESCE(NULLIF(g.title, ''), g.fileBasename, REPLACE(REPLACE(g.folderPath, RTRIM(g.folderPath, REPLACE(g.folderPath, '/', '')), ''), '/', '')) COLLATE NOCASE";

/** Runs one list request for user 1 */
async function run(
  overrides: Partial<ParsedListRequest<"gallery">> = {},
  options: { allowedInstanceIds?: string[]; applyExclusions?: boolean } = {}
) {
  const request = parsedListRequest("gallery", overrides);
  return galleryQueryBuilder.execute({
    userId: 1,
    allowedInstanceIds: options.allowedInstanceIds ?? ALLOWED,
    ...(options.applyExclusions === undefined
      ? {}
      : { applyExclusions: options.applyExclusions }),
    request,
  });
}

/** The page statement's SQL and parameters */
function pageStatement(): { sql: string; params: unknown[] } {
  const [sql, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
  return { sql, params };
}

/** The count statement's SQL and parameters */
function countStatement(): { sql: string; params: unknown[] } {
  const [sql, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[1]);
  return { sql, params };
}

/** A page row as Prisma's raw query returns it from SQLite */
/**
 * Answers the page with these rows, the count, the scene totals, and each
 * nested relation by the entity table it reads
 */
function answerPage(
  rows: GalleryQueryRow[],
  totals: unknown[] = [],
  nested: Partial<Record<string, unknown[]>> = {}
): void {
  mockPrisma.$queryRawUnsafe.mockReset();
  mockPrisma.$queryRawUnsafe.mockImplementation(
    prismaImpl((sql: string) => {
      if (sql.includes("FROM StashGallery g")) {
        return sql.startsWith("SELECT COUNT(*)")
          ? [{ total: BigInt(rows.length) }]
          : rows;
      }
      if (sql.includes("SceneGallery sg")) return totals;
      return nested[/CROSS JOIN (Stash\w+) x/.exec(sql)?.[1] ?? ""] ?? [];
    })
  );
}

/** The statement holding this text, as [sql, ...params] */
function statementWith(text: string): [string, ...unknown[]] {
  return must(
    mockPrisma.$queryRawUnsafe.mock.calls.find(([sql]) => sql.includes(text)),
    `the statement with ${text}`
  );
}

function galleryRow(overrides: Partial<GalleryQueryRow> = {}): GalleryQueryRow {
  return {
    id: "1",
    stashInstanceId: "inst-a",
    title: "",
    date: "",
    studioId: null,
    stashRating100: 80,
    imageCount: null,
    coverImageId: "7",
    details: "Beach day",
    url: null,
    code: "",
    photographer: null,
    urls: '["https://example.test/g/1"]',
    folderPath: "/images/Beach",
    fileBasename: null,
    coverPath: null,
    stashCreatedAt: null,
    stashUpdatedAt: new Date("2026-01-02T03:04:05.000Z"),
    userRating: 60,
    userFavorite: null,
    coverWidth: 0,
    coverHeight: 1080,
    ...overrides,
  };
}

describe("GalleryQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // page
      .mockResolvedValueOnce([{ total: 0n }]); // count
  });

  describe("the statement", () => {
    it("joins the viewer's rating on (id, instance) and the cover image, and binds params in text order", async () => {
      await run({ page: 3, perPage: 10 });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "LEFT JOIN GalleryRating r ON g.id = r.galleryId AND g.stashInstanceId = r.instanceId AND r.userId = ?"
      );
      expect(sql).toContain(
        "LEFT JOIN StashImage ci ON g.coverImageId = ci.id AND g.stashInstanceId = ci.stashInstanceId"
      );
      expect(sql.indexOf("LEFT JOIN StashImage ci")).toBeLessThan(
        sql.indexOf("LEFT JOIN UserExcludedEntity e")
      );
      expect(sql).toContain("entityType = 'gallery'");
      // Rating and exclusion user ids, the instances, the page
      // The viewer's excluded links per gallery, for the image count (B13b)
      expect(sql).toContain(
        "LEFT JOIN UserExcludedContentCount d ON d.userId = ? AND d.entityType = 'gallery' AND d.entityId = g.id AND d.instanceId = g.stashInstanceId"
      );
      expect(params).toEqual([1, 1, 1, "inst-a", "inst-b", 10, 20]);
    });

    it("filters to the allowed instances, with no NULL arm", async () => {
      await run();

      const { sql } = pageStatement();
      expect(sql).toContain("g.stashInstanceId IN (?, ?)");
      expect(sql).not.toContain("g.stashInstanceId IS NULL");
    });

    it("an empty allowed list matches nothing", async () => {
      await run({}, { allowedInstanceIds: [] });

      const { sql } = pageStatement();
      expect(sql).toContain("1 = 0");
      expect(sql).not.toContain("g.stashInstanceId IN");
    });

    it("a specific instance narrows the list to it", async () => {
      await run({ specificInstanceId: "instance-abc" });

      const { sql, params } = pageStatement();
      expect(sql).toContain("g.stashInstanceId = ?");
      expect(params).toContain("instance-abc");
    });
  });

  describe("sort", () => {
    it("the gallery title tiebreak uses the title expression, and the title sort the id", async () => {
      await run({
        sort: { field: "image_count", direction: "DESC", seed: undefined },
      });
      await run({
        sort: { field: "title", direction: "DESC", seed: undefined },
      });

      const [byCount, byTitle] = mockPrisma.$queryRawUnsafe.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.includes("ORDER BY"));
      expect(byCount).toContain(
        `ORDER BY MAX(g.imageCount - COALESCE(d.images, 0), 0) DESC, ${TITLE} ASC`
      );
      expect(byTitle).toContain(
        `ORDER BY ${TITLE} DESC, g.id DESC, g.stashInstanceId DESC`
      );
    });

    it("the viewer's rating sorts through the rating join, the path by the folder", async () => {
      await run({
        sort: { field: "rating100", direction: "ASC", seed: undefined },
      });
      await run({
        sort: { field: "path", direction: "ASC", seed: undefined },
      });

      const [byRating, byPath] = mockPrisma.$queryRawUnsafe.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.includes("ORDER BY"));
      expect(byRating).toContain(
        `ORDER BY COALESCE(r.rating, 0) ASC, ${TITLE} ASC`
      );
      expect(byPath).toContain(
        `ORDER BY g.folderPath COLLATE NOCASE ASC, ${TITLE} ASC`
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

  describe("count", () => {
    it("counts with the joined COUNT(*), with and without the exclusion join", async () => {
      await run();
      const withExclusions = countStatement();
      mockPrisma.$queryRawUnsafe.mockClear();
      await run({}, { applyExclusions: false });
      const without = countStatement();

      for (const { sql } of [withExclusions, without]) {
        expect(sql).toMatch(/SELECT COUNT\(\*\) AS total/i);
        expect(sql).not.toMatch(/COUNT\(DISTINCT/);
        expect(sql).toContain("LEFT JOIN GalleryRating r");
      }
      expect(withExclusions.sql).toContain("LEFT JOIN UserExcludedEntity e");
      expect(withExclusions.sql).toContain(
        "LEFT JOIN UserExcludedContentCount d"
      );
      expect(withExclusions.params).toEqual([1, 1, 1, "inst-a", "inst-b"]);
      expect(without.sql).not.toContain("UserExcludedEntity");
      expect(without.sql).not.toContain("UserExcludedContentCount");
    });
  });

  describe("filters", () => {
    it("ids with composite values match pairs, and a bare id every instance", async () => {
      await run({
        filter: {
          ids: { refs: [ref("5"), bare("6")], modifier: "INCLUDES", depth: 0 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "((g.id = ? AND g.stashInstanceId = ?) OR (g.id = ?))"
      );
      expect(sql).not.toContain("g.id IN (");
      expect(params).toEqual(arrayContaining(["5", "inst-a", "6"]));
    });

    it("studios match the gallery's studio column, the selected studio and its descendants on its instance", async () => {
      await run({
        filter: {
          studios: { refs: [ref("41")], modifier: "EXCLUDES", depth: -1 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "(g.studioId IS NULL OR NOT ((g.studioId = ? AND g.stashInstanceId = ?) OR (g.studioId = ? AND g.stashInstanceId = ?)))"
      );
      expect(params).toEqual(arrayContaining(["41", "inst-a", "99", "inst-a"]));
      expect(sql).not.toMatch(/\.(tagId|studioId) = \?\)/);
    });

    it("tags match GalleryTag pairs, the selected tag and its descendants on its instance", async () => {
      await run({
        filter: {
          tags: { refs: [ref("284")], modifier: "INCLUDES", depth: 1 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toMatch(
        /EXISTS \(SELECT 1 FROM GalleryTag (\w+) WHERE \1\.galleryId = g\.id AND \1\.galleryInstanceId = g\.stashInstanceId AND \(\(\1\.tagId = \? AND \1\.tagInstanceId = \?\) OR \(\1\.tagId = \? AND \1\.tagInstanceId = \?\)\)\)/
      );
      expect(params).toEqual(
        arrayContaining(["284", "inst-a", "99", "inst-a"])
      );
      expect(sql).not.toMatch(/\.(tagId|studioId) = \?\)/);
    });

    it("performers match GalleryPerformer pairs; INCLUDES_ALL needs every one", async () => {
      await run({
        filter: {
          performers: {
            refs: [ref("7"), ref("8", "inst-b")],
            modifier: "INCLUDES_ALL",
            depth: 0,
          },
        },
      });

      const { sql, params } = pageStatement();
      const one =
        "EXISTS \\(SELECT 1 FROM GalleryPerformer (\\w+) WHERE \\1\\.galleryId = g\\.id AND \\1\\.galleryInstanceId = g\\.stashInstanceId AND \\(\\(\\1\\.performerId = \\? AND \\1\\.performerInstanceId = \\?\\)\\)\\)";
      expect(sql).toMatch(new RegExp(`\\(${one} AND ${one}\\)`));
      expect(params).toEqual(arrayContaining(["7", "inst-a", "8", "inst-b"]));
    });

    it("scenes match through SceneGallery with the scene live, as pairs", async () => {
      await run({
        filter: {
          scenes: { refs: [ref("3")], modifier: "INCLUDES", depth: 0 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "EXISTS (SELECT 1 FROM SceneGallery sg JOIN StashScene lsc ON lsc.id = sg.sceneId AND lsc.stashInstanceId = sg.sceneInstanceId WHERE sg.galleryId = g.id AND sg.galleryInstanceId = g.stashInstanceId AND lsc.deletedAt IS NULL AND ((sg.sceneId = ? AND sg.sceneInstanceId = ?)))"
      );
      expect(params).toEqual(arrayContaining(["3", "inst-a"]));
    });

    it("hasFavoriteImage asks for an image the viewer favorited; false is no filter", async () => {
      await run({ filter: { hasFavoriteImage: true } });
      const withFilter = pageStatement();
      mockPrisma.$queryRawUnsafe.mockClear();
      await run({ filter: { hasFavoriteImage: false } });
      const without = pageStatement();

      expect(withFilter.sql).toContain(
        "JOIN ImageRating ir ON ir.imageId = si.id AND ir.instanceId = si.stashInstanceId AND ir.userId = ?"
      );
      expect(withFilter.sql).toContain(
        "WHERE ig.galleryId = g.id AND ig.galleryInstanceId = g.stashInstanceId"
      );
      // The image is live and not excluded for the viewer
      expect(withFilter.sql).toContain(
        "LEFT JOIN UserExcludedEntity ie ON ie.userId = ? AND ie.entityType = 'image' AND ie.entityId = si.id AND (ie.instanceId = '' OR ie.instanceId = si.stashInstanceId)"
      );
      expect(withFilter.sql).toContain(
        "AND ir.favorite = 1 AND si.deletedAt IS NULL AND ie.id IS NULL"
      );
      // Rating, exclusion and count user ids, the instances, the
      // favorite's and the image exclusion's user
      expect(withFilter.params.slice(0, 7)).toEqual([
        1,
        1,
        1,
        "inst-a",
        "inst-b",
        1,
        1,
      ]);
      expect(without.sql).not.toContain("ImageRating");
    });

    it("hasFavoriteImage without exclusions still asks for a live image", async () => {
      await run(
        { filter: { hasFavoriteImage: true } },
        { applyExclusions: false }
      );

      const { sql, params } = pageStatement();
      expect(sql).toContain("AND ir.favorite = 1 AND si.deletedAt IS NULL\n");
      expect(sql).not.toContain("UserExcludedEntity ie");
      expect(params.slice(0, 4)).toEqual([1, "inst-a", "inst-b", 1]);
    });

    it("the viewer's rating and favorite, the counts and the text and date fields each reach SQL", async () => {
      await run({
        filter: {
          favorite: true,
          rating100: { modifier: "GREATER_THAN", value: 60 },
          image_count: { modifier: "BETWEEN", value: 5, value2: 50 },
          title: { modifier: "INCLUDES", value: "beach" },
          date: { modifier: "LESS_THAN", value: "2020-01-01" },
          created_at: { modifier: "GREATER_THAN", value: "2025-01-01" },
          updated_at: { modifier: "NOT_NULL" },
        },
      });

      const { sql } = pageStatement();
      for (const fragment of [
        "r.favorite = 1",
        "r.rating > ?",
        "MAX(g.imageCount - COALESCE(d.images, 0), 0) BETWEEN ? AND ?",
        "(g.title LIKE ? ESCAPE '\\')",
        "g.date < ?",
        "g.stashCreatedAt > ?",
        "g.stashUpdatedAt IS NOT NULL",
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it("tag_count counts the gallery's own tag rows on its instance (Untagged is EQUALS 0)", async () => {
      await run({
        filter: { tag_count: { modifier: "EQUALS", value: 0 } },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "(SELECT COUNT(*) FROM GalleryTag gt WHERE gt.galleryId = g.id AND gt.galleryInstanceId = g.stashInstanceId) = ?"
      );
      expect(params).toContain(0);
    });

    it("the search matches the title, details and photographer, a % in it matching itself", async () => {
      await run({ q: "100% Real" });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "(LOWER(g.title) LIKE ? ESCAPE '\\' OR LOWER(g.details) LIKE ? ESCAPE '\\' OR LOWER(g.photographer) LIKE ? ESCAPE '\\')"
      );
      expect(params.filter((p) => p === "%100\\% real%")).toHaveLength(3);
    });

    it("the search clause sits after the field clauses", async () => {
      await run({
        q: "sea",
        filter: { rating100: { modifier: "EQUALS", value: 4242 } },
      });

      const { params } = pageStatement();
      expect(params.indexOf(4242)).toBeGreaterThan(-1);
      expect(params.indexOf(4242)).toBeLessThan(params.indexOf("%sea%"));
    });
  });

  describe("rows", () => {
    it("a row reads as the viewer's gallery: Peek's own rating, absent text as null, the title's fallback", async () => {
      answerPage([galleryRow()]); // no visible scenes, no relations

      const result = await run();

      expect(result).toMatchObject({ total: 1 });
      const gallery = must(result.items[0]);
      expect(gallery).toMatchObject({
        id: "1",
        instanceId: "inst-a",
        title: "Untitled Gallery",
        date: null,
        code: null,
        details: "Beach day",
        url: null,
        urls: ["https://example.test/g/1"],
        image_count: 0,
        folder: { path: "/images/Beach" },
        cover: null,
        coverWidth: null,
        coverHeight: 1080,
        created_at: null,
        updated_at: "2026-01-02T03:04:05.000Z",
        rating: 60,
        rating100: 60,
        favorite: false,
        studio: null,
        performers: [],
        tags: [],
        relation_totals: { scenes: 0 },
      });
    });

    it("a gallery row carries relation_totals.scenes and no scenes list", async () => {
      answerPage([galleryRow()]);

      const result = await run();

      const gallery = must(result.items[0]);
      expect(gallery.relation_totals).toEqual({ scenes: 0 });
      expect((gallery as { scenes?: unknown }).scenes).toBeUndefined();
    });
  });

  describe("scene totals", () => {
    it("each row counts its live scenes the viewer can see, on its own instance, in one statement for the page", async () => {
      answerPage(
        [
          galleryRow({ id: "1", stashInstanceId: "inst-a" }),
          galleryRow({ id: "1", stashInstanceId: "inst-b" }),
        ],
        [{ pid: "1", pinst: "inst-b", total: 2n }]
      );

      const result = await run();

      const [sql, ...params] = statementWith("SceneGallery sg");
      expect(sql).toContain("FROM json_each(?)");
      expect(sql).toContain(
        "CROSS JOIN SceneGallery sg ON sg.galleryId = pg.pid AND sg.galleryInstanceId = pg.pinst AND sg.sceneInstanceId = pg.pinst"
      );
      expect(sql).toContain(
        "JOIN StashScene s ON s.id = sg.sceneId AND s.stashInstanceId = sg.sceneInstanceId AND s.deletedAt IS NULL"
      );
      expect(sql).toContain(
        "LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = s.id AND (e.instanceId = '' OR e.instanceId = s.stashInstanceId)"
      );
      expect(sql).toContain("WHERE e.id IS NULL");
      expect(params).toEqual([
        JSON.stringify([
          ["1", "inst-a"],
          ["1", "inst-b"],
        ]),
        1,
      ]);
      expect(result.items.map((g) => g.relation_totals)).toEqual([
        { scenes: 0 },
        { scenes: 2 },
      ]);
    });

    it("without exclusions the count leaves out only deleted scenes", async () => {
      answerPage([galleryRow()]);

      await run({}, { applyExclusions: false });

      const [sql, ...params] = statementWith("SceneGallery sg");
      expect(sql).toContain("s.deletedAt IS NULL");
      expect(sql).not.toContain("UserExcludedEntity");
      expect(params).toEqual([JSON.stringify([["1", "inst-a"]])]);
    });

    it("an empty page runs no totals statement", async () => {
      await run();

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    });
  });

  describe("nested refs", () => {
    it("performers and tags load one statement each for the page, live and not excluded, with no favorite or rating of Stash's", async () => {
      answerPage([galleryRow({ studioId: "4" })], [], {
        StashPerformer: [
          {
            pid: "1",
            pinst: "inst-a",
            id: "2",
            stashInstanceId: "inst-a",
            name: "Performer",
            disambiguation: null,
            gender: null,
            imagePath: null,
            favorite: true,
            rating100: 90,
          },
        ],
        StashTag: [
          {
            pid: "1",
            pinst: "inst-a",
            id: "3",
            stashInstanceId: "inst-a",
            name: "Tag",
            imagePath: null,
            favorite: true,
          },
        ],
        StashStudio: [
          {
            id: "4",
            stashInstanceId: "inst-a",
            name: "Studio",
            imagePath: null,
            parentId: null,
            favorite: true,
          },
        ],
      });

      const gallery = must((await run()).items[0], "the gallery");

      expect(gallery.performers).toEqual([
        {
          id: "2",
          instanceId: "inst-a",
          name: "Performer",
          disambiguation: null,
          gender: null,
          image_path: null,
        },
      ]);
      expect(gallery.tags).toEqual([
        { id: "3", instanceId: "inst-a", name: "Tag", image_path: null },
      ]);
      expect(gallery.studio).toEqual({
        id: "4",
        instanceId: "inst-a",
        name: "Studio",
        image_path: null,
        parent_studio: null,
      });
      for (const junction of ["GalleryPerformer j", "GalleryTag j"]) {
        const [sql, ...params] = statementWith(junction);
        expect(sql).toContain("WHERE x.deletedAt IS NULL AND e.id IS NULL");
        expect(params).toEqual([JSON.stringify([["1", "inst-a"]]), 1]);
      }
    });

    it("a studio the viewer cannot see is none, though the row names it", async () => {
      answerPage([galleryRow({ studioId: "4" })]);

      const gallery = must((await run()).items[0], "the gallery");

      expect(gallery.studio).toBeNull();
      expect(statementWith("FROM refs r")[0]).toContain(
        "CROSS JOIN StashStudio x ON x.id = r.rid AND x.stashInstanceId = r.rinst"
      );
    });
  });
});

describe("the gallery field table", () => {
  it("has a clause for every field but the base's", () => {
    const fields = Object.keys(GALLERY_FIELDS).filter(
      (field) => field !== "ids" && field !== "instance_id"
    );

    expect(Object.keys(galleryQueryBuilder["fieldClauses"]).sort()).toEqual(
      fields.sort()
    );
  });
});
