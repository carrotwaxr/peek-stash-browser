/**
 * Unit tests for StudioQueryBuilder on the base builder (item 74): the
 * statements it records for a parsed request. The base owns the instance
 * filter, the exclusion join, the `ids` pairs, the random sort and the
 * joined count; this file pins what the studio adds on top (its per-user
 * joins, sort map and tiebreak, filter clauses, search, parent and
 * children) and that the base's clauses reach its statements.
 */
import { STUDIO_FIELDS } from "@peek/shared-types/filters/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import type * as nestedRefsModule from "../../services/query/nestedRefs.js";
import {
  STUDIO_REF,
  loadNestedRefs,
  loadRefsByKey,
} from "../../services/query/nestedRefs.js";
import type { StudioRef } from "../../types/index.js";
import type { StudioQueryRow } from "../../types/internal/queryRows.js";
import type {
  FilterRef,
  ParsedListRequest,
} from "../../types/parsedFilters.js";
import { entityKey } from "../../utils/entityRef.js";
import { jsonListArm } from "../../utils/sqlHelpers.js";
import {
  alternatesOf,
  filterOf,
  firstMissingBound,
  samplesOf,
  whereOf,
} from "../helpers/fieldSamples.js";
import { parsedListRequest } from "../helpers/fixtures.js";
import { arrayContaining, objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { untrusted } from "../helpers/untrusted.js";

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

vi.mock("../../services/TooltipRelations.js", () => ({
  loadTooltipRelations: vi.fn(() => Promise.resolve(new Map())),
}));

// The parent's and children's loads (their SQL is nestedRefs.test.ts's)
vi.mock("../../services/query/nestedRefs.js", async (importOriginal) => ({
  ...(await importOriginal<typeof nestedRefsModule>()),
  loadRefsByKey: vi.fn(() => Promise.resolve(new Map())),
  loadNestedRefs: vi.fn(() => Promise.resolve(new Map())),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockLoadRefsByKey = vi.mocked(loadRefsByKey);
const mockLoadNestedRefs = vi.mocked(loadNestedRefs);

/** A studio's ref as nestedRefs builds it */
const studioRefOf = (
  id: string,
  instanceId: string,
  name: string
): StudioRef => ({
  id,
  instanceId,
  name,
  image_path: null,
  parent_studio: null,
});

const ALLOWED = ["inst-a", "inst-b"];
const ref = (id: string, instanceId = "inst-a"): FilterRef => ({
  id,
  instanceId,
});
const bare = (id: string): FilterRef => ({ id, instanceId: undefined });

/** Runs one list request for user 1 */
async function run(
  overrides: Partial<ParsedListRequest<"studio">> = {},
  options: { allowedInstanceIds?: string[]; applyExclusions?: boolean } = {}
) {
  const request = parsedListRequest("studio", overrides);
  return studioQueryBuilder.execute({
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

/** The count statement's SQL */
function countSql(): string {
  return must(mockPrisma.$queryRawUnsafe.mock.calls[1])[0];
}

/** A page row as Prisma's raw query returns it from SQLite */
function studioRow(overrides: Partial<StudioQueryRow> = {}): StudioQueryRow {
  return {
    id: "1",
    stashInstanceId: "inst-a",
    name: "Studio One",
    parentId: "9",
    stashIds: null,
    stashFavorite: true,
    stashRating100: 80,
    sceneCount: 4,
    imageCount: null,
    galleryCount: 0,
    performerCount: 2,
    groupCount: 1,
    details: "",
    url: null,
    aliases: null,
    imagePath: "/studio/1/image",
    stashCreatedAt: null,
    stashUpdatedAt: new Date("2026-01-02T03:04:05.000Z"),
    userRating: 60,
    userFavorite: true,
    userOCounter: 1,
    userPlayCount: null,
    ...overrides,
  };
}

describe("StudioQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // page
      .mockResolvedValueOnce([{ total: 0n }]); // count
  });

  describe("the statement", () => {
    it("joins the viewer's rating and stats on (id, instance) and binds params in text order", async () => {
      await run({ page: 3, perPage: 10 });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "LEFT JOIN StudioRating r ON s.id = r.studioId AND s.stashInstanceId = r.instanceId AND r.userId = ?"
      );
      expect(sql).toContain(
        "LEFT JOIN UserStudioStats us ON s.id = us.studioId AND s.stashInstanceId = us.instanceId AND us.userId = ?"
      );
      expect(sql).toContain("entityType = 'studio'");
      // Rating, stats and exclusion user ids, the instances, the page
      // The viewer's excluded links per studio, for the counts (B13b)
      expect(sql).toContain(
        "LEFT JOIN UserExcludedContentCount d ON d.userId = ? AND d.entityType = 'studio' AND d.entityId = s.id AND d.instanceId = s.stashInstanceId"
      );
      expect(params).toEqual([1, 1, 1, 1, "inst-a", "inst-b", 10, 20]);
    });

    it("filters to the allowed instances, with no NULL arm", async () => {
      await run();

      const { sql } = pageStatement();
      expect(sql).toContain("s.stashInstanceId IN (?, ?)");
      expect(sql).not.toContain("s.stashInstanceId IS NULL");
    });

    it("an empty allowed list matches nothing", async () => {
      await run({}, { allowedInstanceIds: [] });

      const { sql } = pageStatement();
      expect(sql).toContain("1 = 0");
      expect(sql).not.toContain("s.stashInstanceId IN");
    });

    it("a specific instance narrows the list to it", async () => {
      await run({ specificInstanceId: "instance-abc" });

      const { sql, params } = pageStatement();
      expect(sql).toContain("s.stashInstanceId = ?");
      expect(params).toContain("instance-abc");
    });
  });

  describe("sort", () => {
    it("sorts by performer_count with the name tiebreak and by name with the id tiebreak", async () => {
      await run({
        sort: { field: "performer_count", direction: "ASC", seed: undefined },
      });
      await run({
        sort: { field: "name", direction: "DESC", seed: undefined },
      });

      const [byCount, byName] = mockPrisma.$queryRawUnsafe.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.includes("ORDER BY"));
      expect(byCount).toContain(
        "ORDER BY MAX(s.performerCount - COALESCE(d.performers, 0), 0) ASC, s.name COLLATE NOCASE ASC"
      );
      expect(byName).toContain(
        "ORDER BY s.name COLLATE NOCASE DESC, s.id DESC, s.stashInstanceId DESC"
      );
    });

    it("the viewer's o_counter sorts through the stats join", async () => {
      await run({
        sort: { field: "o_counter", direction: "DESC", seed: undefined },
      });

      expect(pageStatement().sql).toContain(
        "ORDER BY COALESCE(us.oCounter, 0) DESC, s.name COLLATE NOCASE ASC"
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
      const withExclusions = countSql();
      mockPrisma.$queryRawUnsafe.mockClear();
      await run({}, { applyExclusions: false });
      const without = countSql();

      for (const sql of [withExclusions, without]) {
        expect(sql).toMatch(/SELECT COUNT\(\*\) AS total/i);
        expect(sql).not.toMatch(/COUNT\(DISTINCT/);
        expect(sql).toContain("LEFT JOIN StudioRating r");
        expect(sql).toContain("LEFT JOIN UserStudioStats us");
      }
      expect(withExclusions).toContain("LEFT JOIN UserExcludedEntity e");
      expect(withExclusions).toContain("LEFT JOIN UserExcludedContentCount d");
      expect(without).not.toContain("UserExcludedEntity");
    });
  });

  describe("filters", () => {
    it("ids with composite values match pairs, and a bare id every instance", async () => {
      await run({
        filter: {
          ids: { refs: [ref("5"), bare("6")], modifier: "EXCLUDES", depth: 0 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "NOT ((s.id = ? AND s.stashInstanceId = ?) OR (s.id = ?))"
      );
      expect(sql).not.toContain("s.id NOT IN (");
      expect(params).toEqual(arrayContaining(["5", "inst-a", "6"]));
    });

    it("tags match StudioTag pairs, the selected tag and its descendants on its instance", async () => {
      await run({
        filter: {
          tags: { refs: [ref("284")], modifier: "EXCLUDES", depth: 1 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toMatch(
        /NOT EXISTS \(SELECT 1 FROM StudioTag (\w+) WHERE \1\.studioId = s\.id AND \1\.studioInstanceId = s\.stashInstanceId AND \(\(\1\.tagId = \? AND \1\.tagInstanceId = \?\) OR \(\1\.tagId = \? AND \1\.tagInstanceId = \?\)\)\)/
      );
      expect(params).toEqual(
        arrayContaining(["284", "inst-a", "99", "inst-a"])
      );
      expect(sql).not.toMatch(/\.(tagId|studioId) = \?\)/);
    });

    it("the viewer's numbers, the counts and the text and date fields each reach SQL", async () => {
      await run({
        filter: {
          favorite: false,
          rating100: { modifier: "BETWEEN", value: 20, value2: 80 },
          o_counter: { modifier: "GREATER_THAN", value: 0 },
          play_count: { modifier: "EQUALS", value: 0 },
          scene_count: { modifier: "NOT_EQUALS", value: 5 },
          name: { modifier: "EQUALS", value: "Studio One" },
          details: { modifier: "INCLUDES", value: "beach" },
          aliases: { modifier: "INCLUDES", value: "stu" },
          url: { modifier: "INCLUDES", value: "example" },
          stash_id: { modifier: "EQUALS", value: "AAAA-1" },
          created_at: {
            modifier: "BETWEEN",
            value: "2025-01-01",
            value2: "2025-12-31",
          },
          updated_at: { modifier: "IS_NULL" },
        },
      });

      const { sql } = pageStatement();
      for (const fragment of [
        "(r.favorite = 0 OR r.favorite IS NULL)",
        "r.rating BETWEEN ? AND ?",
        "COALESCE(us.oCounter, 0) > ?",
        "COALESCE(us.playCount, 0) = ?",
        "MAX(s.sceneCount - COALESCE(d.scenes, 0), 0) != ?",
        "LOWER(s.name) = LOWER(?)",
        "(s.details LIKE ? ESCAPE '\\')",
        `(${jsonListArm("s.aliases")})`,
        "(s.url LIKE ? ESCAPE '\\')",
        "json_extract(si.value, '$.stash_id')",
        "(s.stashCreatedAt >= ? AND s.stashCreatedAt < ?)",
        "s.stashUpdatedAt IS NULL",
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it("the search matches the name, details and each alias, a % in it matching itself", async () => {
      await run({ q: '"100% Real"' });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        `(s.name LIKE ? ESCAPE '\\' OR s.details LIKE ? ESCAPE '\\' OR ${jsonListArm("s.aliases")})`
      );
      expect(sql).not.toContain("LOWER(");
      expect(params.filter((p) => p === "%100\\% Real%")).toHaveLength(3);
    });

    it("two words are two AND-ed groups", async () => {
      await run({ q: "sea side" });

      const { params } = pageStatement();
      expect(params.filter((p) => p === "%sea%")).toHaveLength(3);
      expect(params.filter((p) => p === "%side%")).toHaveLength(3);
    });

    it("the search clause sits after the field clauses", async () => {
      await run({
        q: "sea",
        filter: { scene_count: { modifier: "EQUALS", value: 4242 } },
      });

      const { params } = pageStatement();
      expect(params.indexOf(4242)).toBeGreaterThan(-1);
      expect(params.indexOf(4242)).toBeLessThan(params.indexOf("%sea%"));
    });
  });

  describe("rows", () => {
    it("returns aliases: a stored list as a list, a malformed or absent one as none", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          studioRow({ aliases: '["A"]' }),
          studioRow({ id: "2", aliases: "not json" }),
          studioRow({ id: "3", aliases: null }),
        ])
        .mockResolvedValueOnce([{ total: 3n }]);

      const { items } = await run();

      expect(pageStatement().sql).toContain("s.aliases");
      expect(items.map((row) => row.aliases)).toEqual([["A"], [], []]);
    });

    it("a row carries its stash ids as a list; an unreadable stored list reads as none", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          studioRow({
            stashIds: JSON.stringify([
              { endpoint: "https://stashdb.org/graphql", stash_id: "abc" },
              { endpoint: "https://stashdb.org/graphql" },
              "abc",
            ]),
          }),
          studioRow({ id: "2", stashIds: "not json" }),
          studioRow({ id: "3", stashIds: '{"endpoint":"x"}' }),
          studioRow({ id: "4", stashIds: null }),
        ])
        .mockResolvedValueOnce([{ total: 4n }]);

      const { items } = await run();

      expect(pageStatement().sql).toContain("s.stashIds");
      expect(items.map((row) => row.stash_ids)).toEqual([
        [{ endpoint: "https://stashdb.org/graphql", stash_id: "abc" }],
        [],
        [],
        [],
      ]);
    });

    it("a row reads as the viewer's studio: Peek's own rating and counts, absent text as null", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([studioRow()])
        .mockResolvedValueOnce([{ total: 1n }]);

      const result = await run();

      expect(result).toMatchObject({ total: 1 });
      const studio = must(result.items[0]);
      expect(studio).toMatchObject({
        id: "1",
        instanceId: "inst-a",
        details: null,
        url: null,
        scene_count: 4,
        image_count: 0,
        performer_count: 2,
        rating100: 60,
        favorite: true,
        o_counter: 1,
        play_count: 0,
        created_at: null,
        updated_at: "2026-01-02T03:04:05.000Z",
        tags: [],
        child_studios: [],
      });
    });

    it("the parent is the visible one on the studio's own instance, or null; children come by name", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          studioRow(),
          studioRow({ id: "2", parentId: "8" }),
          studioRow({ id: "1", stashInstanceId: "inst-b", parentId: null }),
        ])
        .mockResolvedValueOnce([{ total: 3n }]);
      // "8" is hidden, deleted or missing: nestedRefs leaves it out
      mockLoadRefsByKey.mockResolvedValueOnce(
        new Map([
          [entityKey("9", "inst-a"), studioRefOf("9", "inst-a", "Network")],
        ])
      );
      mockLoadNestedRefs.mockResolvedValueOnce(
        new Map([
          [
            entityKey("1", "inst-b"),
            [
              studioRefOf("12", "inst-b", "zeta"),
              studioRefOf("11", "inst-b", "Alpha"),
            ],
          ],
        ])
      );

      const { items } = await run();

      // One load each for the page, with the viewer; the parents on their
      // studio's instance, the children through the studios' parentId
      expect(mockLoadRefsByKey).toHaveBeenCalledTimes(1);
      expect(mockLoadRefsByKey).toHaveBeenCalledWith(
        STUDIO_REF,
        [
          { id: "9", instanceId: "inst-a" },
          { id: "8", instanceId: "inst-a" },
        ],
        objectContaining({ userId: 1, applyExclusions: true })
      );
      expect(mockLoadNestedRefs).toHaveBeenCalledTimes(1);
      expect(mockLoadNestedRefs).toHaveBeenCalledWith(
        STUDIO_REF,
        {
          table: "StashStudio",
          parentIdCol: "parentId",
          parentInstanceCol: "stashInstanceId",
          refIdCol: "id",
          refInstanceCol: "stashInstanceId",
        },
        [
          objectContaining({ id: "1", instanceId: "inst-a" }),
          objectContaining({ id: "2", instanceId: "inst-a" }),
          objectContaining({ id: "1", instanceId: "inst-b" }),
        ],
        objectContaining({ userId: 1, applyExclusions: true })
      );

      const [first, second, onB] = [
        must(items[0]),
        must(items[1]),
        must(items[2]),
      ];
      expect(first.parent_studio).toEqual(
        studioRefOf("9", "inst-a", "Network")
      );
      expect(first.child_studios).toEqual([]);
      expect(second.parent_studio).toBeNull();
      expect(onB.parent_studio).toBeNull();
      expect(onB.child_studios).toEqual([
        studioRefOf("11", "inst-b", "Alpha"),
        studioRefOf("12", "inst-b", "zeta"),
      ]);
    });

    it("an empty page loads no parent or children", async () => {
      await run();

      expect(mockLoadRefsByKey).not.toHaveBeenCalled();
      expect(mockLoadNestedRefs).not.toHaveBeenCalled();
    });
  });
});

describe("the studio field table", () => {
  it("has a clause for every field but the base's", () => {
    const fields = Object.keys(STUDIO_FIELDS).filter(
      (field) => field !== "ids" && field !== "instance_id"
    );

    expect(Object.keys(studioQueryBuilder["fieldClauses"]).sort()).toEqual(
      fields.sort()
    );
  });
});

/** What each studio field's clause adds to the WHERE, as the shared spec's sample binds it */
const STUDIO_CLAUSES: Record<
  Exclude<keyof typeof STUDIO_FIELDS, "instance_id">,
  string
> = {
  ids: "(s.id = ? AND s.stashInstanceId = ?)",
  name: "s.name LIKE ?",
  details: "s.details LIKE ?",
  aliases: "json_valid(s.aliases)",
  url: "s.url LIKE ?",
  stash_id: "= LOWER(?)",
  tags: "FROM StudioTag stt WHERE stt.studioId = s.id",
  parents: "(s.parentId = ? AND s.stashInstanceId = ?)",
  rating100: "r.rating > ?",
  o_counter: "COALESCE(us.oCounter, 0) > ?",
  play_count: "COALESCE(us.playCount, 0) > ?",
  scene_count: "MAX(s.sceneCount - COALESCE(d.scenes, 0), 0) > ?",
  child_count: "(SELECT COUNT(*) FROM StashStudio scc",
  tag_count: "(SELECT COUNT(*) FROM StudioTag stc",
  image_count: "MAX(s.imageCount - COALESCE(d.images, 0), 0) > ?",
  gallery_count: "MAX(s.galleryCount - COALESCE(d.galleries, 0), 0) > ?",
  performer_count: "MAX(s.performerCount - COALESCE(d.performers, 0), 0) > ?",
  group_count: "MAX(s.groupCount - COALESCE(d.groups, 0), 0) > ?",
  created_at: "s.stashCreatedAt >= ?",
  updated_at: "s.stashUpdatedAt >= ?",
  favorite: "r.favorite = 1",
};

describe("every studio field clause", () => {
  const BOUND = {};

  const SAMPLES = new Map(samplesOf(STUDIO_FIELDS, BOUND));

  /** The page statement for a filter alone, with nothing else answered */
  async function statementFor(
    filter: Record<string, unknown>,
    applyExclusions = true
  ): Promise<{ sql: string; params: unknown[] }> {
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    await run(
      { filter: untrusted<ParsedListRequest<"studio">["filter"]>(filter) },
      { applyExclusions }
    );
    return pageStatement();
  }

  it("has a sample for every field the table carries", () => {
    expect([...SAMPLES.keys()].sort()).toEqual(
      Object.keys(STUDIO_CLAUSES).sort()
    );
  });

  it.each(Object.entries(STUDIO_CLAUSES))(
    "%s adds its clause to the WHERE and binds its sample in order",
    async (field, fragment) => {
      const sample = must(SAMPLES.get(field), `a sample for ${field}`);

      const { sql, params } = await statementFor(filterOf(sample));

      expect(whereOf(sql)).toContain(fragment);
      expect(firstMissingBound(params, sample.bound)).toBeNull();
    }
  );

  it.each(alternatesOf(STUDIO_FIELDS, BOUND))(
    "%s builds a clause of its own and binds its values in order",
    async (_label, sample) => {
      const baseline = whereOf((await statementFor({})).sql);

      const { sql, params } = await statementFor(filterOf(sample));

      expect(whereOf(sql)).not.toBe(baseline);
      expect(firstMissingBound(params, sample.bound)).toBeNull();
    }
  );

  it.each(Object.keys(STUDIO_CLAUSES))(
    "%s takes no exclusion join when the viewer's exclusions do not apply",
    async (field) => {
      const sample = must(SAMPLES.get(field), `a sample for ${field}`);

      const { sql } = await statementFor(filterOf(sample), false);

      expect(whereOf(sql)).not.toContain("UserExcludedEntity");
    }
  );
});
