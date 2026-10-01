/**
 * Unit tests for PerformerQueryBuilder on the base builder (item 74): the
 * statements it records for a parsed request. The base owns the instance
 * filter, the exclusion join, the `ids` pairs, the random sort and the
 * joined count; this file pins what the performer adds on top (its per-user
 * joins, sort map and tiebreak, filter clauses and search) and that the
 * base's clauses reach its statements.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import type { PerformerQueryRow } from "../../types/internal/queryRows.js";
import type {
  FilterRef,
  ParsedListRequest,
} from "../../types/parsedFilters.js";
import { careerYearsSql } from "../../utils/sqlClauses.js";
import { parsedListRequest } from "../helpers/fixtures.js";
import { arrayContaining, stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";

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

const mockPrisma = vi.mocked(prisma, true);

const ALLOWED = ["inst-a", "inst-b"];
const ref = (id: string, instanceId = "inst-a"): FilterRef => ({
  id,
  instanceId,
});
const bare = (id: string): FilterRef => ({ id, instanceId: undefined });

/** Runs one list request for user 1 */
async function run(
  overrides: Partial<ParsedListRequest<"performer">> = {},
  options: { allowedInstanceIds?: string[]; applyExclusions?: boolean } = {}
) {
  const request = parsedListRequest("performer", overrides);
  return performerQueryBuilder.execute({
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
function performerRow(
  overrides: Partial<PerformerQueryRow> = {}
): PerformerQueryRow {
  return {
    id: "1",
    stashInstanceId: "inst-a",
    name: "Ann",
    disambiguation: "",
    gender: "FEMALE",
    birthdate: null,
    stashFavorite: true,
    stashRating100: 80,
    sceneCount: 3,
    imageCount: null,
    galleryCount: 0,
    groupCount: 1,
    details: "",
    aliasList: '["Annie"]',
    stashIds: null,
    country: null,
    ethnicity: null,
    hairColor: null,
    eyeColor: null,
    heightCm: 0,
    weightKg: 55,
    measurements: null,
    fakeTits: null,
    penisLength: null,
    circumcised: null,
    tattoos: null,
    piercings: null,
    careerLength: null,
    deathDate: null,
    url: null,
    imagePath: "/performer/1/image",
    stashCreatedAt: new Date("2026-01-02T03:04:05.000Z"),
    stashUpdatedAt: null,
    userRating: null,
    userFavorite: null,
    userOCounter: null,
    userPlayCount: 2,
    userLastPlayedAt: null,
    userLastOAt: null,
    ...overrides,
  };
}

describe("PerformerQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // page
      .mockResolvedValueOnce([{ total: 0n }]); // count
  });

  describe("the statement", () => {
    it("joins the viewer's rating and stats on (id, instance) and binds params in text order", async () => {
      await run({ page: 2, perPage: 25 });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "LEFT JOIN PerformerRating r ON p.id = r.performerId AND p.stashInstanceId = r.instanceId AND r.userId = ?"
      );
      expect(sql).toContain(
        "LEFT JOIN UserPerformerStats s ON p.id = s.performerId AND p.stashInstanceId = s.instanceId AND s.userId = ?"
      );
      expect(sql).toContain("entityType = 'performer'");
      // The viewer's excluded links per performer, for the counts (B13b)
      expect(sql).toContain(
        "LEFT JOIN UserExcludedContentCount d ON d.userId = ? AND d.entityType = 'performer' AND d.entityId = p.id AND d.instanceId = p.stashInstanceId"
      );
      expect(sql).toContain(
        "MAX(p.sceneCount - COALESCE(d.scenes, 0), 0) AS sceneCount"
      );
      // Rating, stats, exclusion and count user ids, the instances, the page
      expect(params).toEqual([1, 1, 1, 1, "inst-a", "inst-b", 25, 25]);
    });

    it("filters to the allowed instances, with no NULL arm", async () => {
      await run();

      const { sql } = pageStatement();
      expect(sql).toContain("p.stashInstanceId IN (?, ?)");
      expect(sql).not.toContain("p.stashInstanceId IS NULL");
    });

    it("an empty allowed list matches nothing", async () => {
      await run({}, { allowedInstanceIds: [] });

      const { sql } = pageStatement();
      expect(sql).toContain("1 = 0");
      expect(sql).not.toContain("p.stashInstanceId IN");
    });

    it("a specific instance narrows the list to it", async () => {
      await run({ specificInstanceId: "instance-abc" });

      const { sql, params } = pageStatement();
      expect(sql).toContain("p.stashInstanceId = ?");
      expect(params).toContain("instance-abc");
    });
  });

  describe("sort", () => {
    it("sorts by scene_count with the name tiebreak and by name with the id tiebreak", async () => {
      await run({
        sort: { field: "scene_count", direction: "DESC", seed: undefined },
      });
      await run({ sort: { field: "name", direction: "ASC", seed: undefined } });

      const [byCount, byName] = mockPrisma.$queryRawUnsafe.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.includes("ORDER BY"));
      expect(byCount).toContain(
        "ORDER BY MAX(p.sceneCount - COALESCE(d.scenes, 0), 0) DESC, p.name COLLATE NOCASE ASC"
      );
      expect(byName).toContain(
        "ORDER BY p.name COLLATE NOCASE ASC, p.id ASC, p.stashInstanceId ASC"
      );
    });

    it("sorts by penis_length", async () => {
      await run({
        sort: { field: "penis_length", direction: "DESC", seed: undefined },
      });

      expect(pageStatement().sql).toMatch(/ORDER BY\s+p\.penisLength DESC,/);
    });

    it.each([
      ["weight", "p.weightKg ASC"],
      ["measurements", "p.measurements COLLATE NOCASE ASC"],
      ["career_length", `${careerYearsSql("p.careerLength")} ASC NULLS LAST`],
    ] as const)("sorts by %s, then by name", async (field, expr) => {
      await run({ sort: { field, direction: "ASC", seed: undefined } });

      expect(pageStatement().sql).toContain(
        `ORDER BY ${expr}, p.name COLLATE NOCASE ASC, p.id ASC, p.stashInstanceId ASC`
      );
    });

    it("career_length DESC lists performers without a value last too", async () => {
      await run({
        sort: { field: "career_length", direction: "DESC", seed: undefined },
      });

      expect(pageStatement().sql).toContain(
        `ORDER BY ${careerYearsSql("p.careerLength")} DESC NULLS LAST, p.name`
      );
    });

    it("binds a random sort's seed and never interpolates it", async () => {
      await run({
        sort: { field: "random", direction: "ASC", seed: 87654321 },
      });

      const { sql, params } = pageStatement();
      expect(sql).not.toContain("87654321");
      expect(params.filter((p) => p === 87654321)).toHaveLength(3);
      expect(sql).toContain("% 2147483647) ASC, p.name COLLATE NOCASE ASC");
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
        expect(sql).toContain("LEFT JOIN PerformerRating r");
        expect(sql).toContain("LEFT JOIN UserPerformerStats s");
      }
      expect(withExclusions).toContain("LEFT JOIN UserExcludedEntity e");
      expect(withExclusions).toContain("e.id IS NULL");
      expect(withExclusions).toContain("LEFT JOIN UserExcludedContentCount d");
      expect(without).not.toContain("UserExcludedEntity");
      // Without the viewer's exclusions the counts are the live columns
      expect(without).not.toContain("UserExcludedContentCount");
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
        "((p.id = ? AND p.stashInstanceId = ?) OR (p.id = ?))"
      );
      expect(sql).not.toContain("p.id IN (");
      expect(params).toEqual(arrayContaining(["5", "inst-a", "6"]));
      expect(params).not.toContain("5:inst-a");
    });

    it("tags match PerformerTag pairs, the selected tag and its descendants on its instance", async () => {
      await run({
        filter: {
          tags: { refs: [ref("284")], modifier: "INCLUDES", depth: -1 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toMatch(
        /EXISTS \(SELECT 1 FROM PerformerTag (\w+) WHERE \1\.performerId = p\.id AND \1\.performerInstanceId = p\.stashInstanceId AND \(\(\1\.tagId = \? AND \1\.tagInstanceId = \?\) OR \(\1\.tagId = \? AND \1\.tagInstanceId = \?\)\)\)/
      );
      expect(params).toEqual(
        arrayContaining(["284", "inst-a", "99", "inst-a"])
      );
      expect(sql).not.toMatch(/\.(tagId|studioId) = \?\)/);
      expect(params).not.toContain("284:inst-a");
    });

    it("studios, scenes and groups match through live scenes, as pairs", async () => {
      await run({
        filter: {
          studios: { refs: [ref("7")], modifier: "INCLUDES", depth: 0 },
          scenes: { refs: [ref("8")], modifier: "EXCLUDES", depth: 0 },
          groups: { refs: [ref("9")], modifier: "INCLUDES_ALL", depth: 0 },
        },
      });

      const { sql } = pageStatement();
      expect(sql).toContain("sc.studioId = ? AND sc.stashInstanceId = ?");
      expect(sql).toContain(
        "NOT EXISTS (SELECT 1 FROM ScenePerformer sp JOIN StashScene lsc"
      );
      expect(sql).toContain("sp.sceneId = ? AND sp.sceneInstanceId = ?");
      expect(sql).toContain("sg.groupId = ? AND sg.groupInstanceId = ?");
    });

    it("penis_length compares p.penisLength, so a performer without one never matches", async () => {
      await run({
        filter: { penis_length: { value: 14, modifier: "GREATER_THAN" } },
      });

      const { sql } = pageStatement();
      expect(sql).toContain("p.penisLength > ?");
      expect(sql).not.toContain("COALESCE(p.penisLength");
    });

    it("gender and the free-text attributes compare whole, ignoring case; NOT_EQUALS keeps performers without one", async () => {
      await run({
        filter: {
          gender: { modifier: "EQUALS", value: "FEMALE" },
          ethnicity: { modifier: "NOT_EQUALS", value: "Asian" },
          hair_color: { modifier: "EQUALS", value: "Blonde" },
          eye_color: { modifier: "EQUALS", value: "Blue" },
          fake_tits: { modifier: "NOT_EQUALS", value: "Natural" },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain("UPPER(p.gender) = UPPER(?)");
      expect(sql).toContain(
        "(p.ethnicity IS NULL OR UPPER(p.ethnicity) != UPPER(?))"
      );
      expect(sql).toContain("UPPER(p.hairColor) = UPPER(?)");
      expect(sql).toContain("UPPER(p.eyeColor) = UPPER(?)");
      expect(sql).toContain(
        "(p.fakeTits IS NULL OR UPPER(p.fakeTits) != UPPER(?))"
      );
      expect(params).toEqual(
        arrayContaining(["FEMALE", "Asian", "Blonde", "Blue", "Natural"])
      );
    });

    it("birth year, death year and age need the date, and NOT_EQUALS keeps performers without one", async () => {
      await run({
        filter: {
          birth_year: { modifier: "BETWEEN", value: 1990, value2: 1995 },
          death_year: { modifier: "NOT_EQUALS", value: 2020 },
          age: { modifier: "LESS_THAN", value: 30 },
        },
      });

      const { sql } = pageStatement();
      expect(sql).toContain(
        "(p.birthdate IS NOT NULL AND CAST(SUBSTR(p.birthdate, 1, 4) AS INTEGER) BETWEEN ? AND ?)"
      );
      expect(sql).toContain(
        "(p.deathDate IS NULL OR CAST(SUBSTR(p.deathDate, 1, 4) AS INTEGER) != ?)"
      );
      expect(sql).toContain(
        "(p.birthdate IS NOT NULL AND CAST((julianday(date('now')) - julianday(p.birthdate)) / 365.25 AS INTEGER) < ?)"
      );
    });

    it("the viewer's numbers, the counts and the text and date fields each reach SQL", async () => {
      await run({
        filter: {
          favorite: true,
          rating100: { modifier: "GREATER_THAN", value: 60 },
          o_counter: { modifier: "EQUALS", value: 0 },
          play_count: { modifier: "LESS_THAN", value: 3 },
          scene_count: { modifier: "BETWEEN", value: 1, value2: 9 },
          height: { modifier: "GREATER_THAN", value: 170 },
          weight: { modifier: "LESS_THAN", value: 60 },
          name: { modifier: "INCLUDES", value: "ann" },
          details: { modifier: "IS_NULL" },
          tattoos: { modifier: "EXCLUDES", value: "rose" },
          piercings: { modifier: "NOT_NULL" },
          measurements: { modifier: "EQUALS", value: "34C" },
          career_length: { modifier: "BETWEEN", value: 8, value2: 10 },
          birthdate: { modifier: "GREATER_THAN", value: "1990-01-01" },
          death_date: { modifier: "IS_NULL" },
          created_at: { modifier: "LESS_THAN", value: "2026-01-01" },
          updated_at: { modifier: "NOT_NULL" },
        },
      });

      const { sql } = pageStatement();
      for (const fragment of [
        "r.favorite = 1",
        "COALESCE(r.rating, 0) > ?",
        "COALESCE(s.oCounter, 0) = ?",
        "COALESCE(s.playCount, 0) < ?",
        "MAX(p.sceneCount - COALESCE(d.scenes, 0), 0) BETWEEN ? AND ?",
        "COALESCE(p.heightCm, 0) > ?",
        "COALESCE(p.weightKg, 0) < ?",
        "(LOWER(p.name) LIKE LOWER(?) OR LOWER(p.aliasList) LIKE LOWER(?))",
        "(p.details IS NULL OR p.details = '')",
        "(p.tattoos IS NULL OR LOWER(p.tattoos) NOT LIKE LOWER(?))",
        "(p.piercings IS NOT NULL AND p.piercings != '')",
        "LOWER(p.measurements) = LOWER(?)",
        `${careerYearsSql("p.careerLength")} BETWEEN ? AND ?`,
        "p.birthdate > ?",
        "p.deathDate IS NULL",
        "p.stashCreatedAt < ?",
        "p.stashUpdatedAt IS NOT NULL",
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it("the search matches the name and aliases, a % in it matching itself", async () => {
      await run({ q: "100%_Ann" });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "(LOWER(p.name) LIKE ? ESCAPE '\\' OR LOWER(p.aliasList) LIKE ? ESCAPE '\\')"
      );
      expect(params.filter((p) => p === "%100\\%\\_ann%")).toHaveLength(2);
    });
  });

  describe("rows", () => {
    it("a row carries its stash ids as a list; an unreadable stored list reads as none", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          performerRow({
            stashIds: JSON.stringify([
              { endpoint: "https://stashdb.org/graphql", stash_id: "abc" },
              { endpoint: "https://stashdb.org/graphql" },
              "abc",
            ]),
          }),
          performerRow({ id: "2", stashIds: "not json" }),
          performerRow({ id: "3", stashIds: '{"endpoint":"x"}' }),
          performerRow({ id: "4", stashIds: null }),
        ])
        .mockResolvedValueOnce([{ total: 4n }]);

      const { items } = await run();

      expect(pageStatement().sql).toContain("p.stashIds");
      expect(items.map((row) => row.stash_ids)).toEqual([
        [{ endpoint: "https://stashdb.org/graphql", stash_id: "abc" }],
        [],
        [],
        [],
      ]);
    });

    it("a row reads as the viewer's performer: Peek's own rating and counts, absent text as null", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([performerRow()])
        .mockResolvedValueOnce([{ total: 1n }]);

      const result = await run();

      expect(result).toMatchObject({ total: 1 });
      const performer = must(result.items[0]);
      expect(performer).toMatchObject({
        id: "1",
        instanceId: "inst-a",
        disambiguation: null,
        details: null,
        alias_list: ["Annie"],
        height_cm: null,
        weight: 55,
        scene_count: 3,
        image_count: 0,
        rating100: null,
        favorite: false,
        o_counter: 0,
        play_count: 2,
        created_at: "2026-01-02T03:04:05.000Z",
        updated_at: null,
        image_path: stringContaining("instanceId=inst-a"),
      });
    });
  });
});
