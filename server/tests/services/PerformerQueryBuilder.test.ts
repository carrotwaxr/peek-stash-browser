/**
 * Unit tests for PerformerQueryBuilder on the base builder (item 74): the
 * statements it records for a parsed request. The base owns the instance
 * filter, the exclusion join, the `ids` pairs, the random sort and the
 * joined count; this file pins what the performer adds on top (its per-user
 * joins, sort map and tiebreak, filter clauses and search) and that the
 * base's clauses reach its statements.
 */
import { PERFORMER_FIELDS } from "@peek/shared-types/filters/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import type { PerformerQueryRow } from "../../types/internal/queryRows.js";
import type {
  FilterRef,
  ParsedListRequest,
} from "../../types/parsedFilters.js";
import {
  ageYearsSql,
  careerYearsSql,
  fullDateSql,
} from "../../utils/sqlClauses.js";
import { jsonListArm } from "../../utils/sqlHelpers.js";
import {
  alternatesOf,
  filterOf,
  firstMissingBound,
  samplesOf,
  whereOf,
} from "../helpers/fieldSamples.js";
import { parsedListRequest } from "../helpers/fixtures.js";
import { arrayContaining, stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";
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
    urls: null,
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

    it("gender takes any of its values or none of them, ignoring case; none of them keeps performers without one", async () => {
      await run({
        filter: {
          gender: { modifier: "INCLUDES", values: ["FEMALE", "MALE"] },
        },
      });
      expect(pageStatement().sql).toContain("UPPER(p.gender) IN (?, ?)");
      expect(pageStatement().params).toEqual(
        arrayContaining(["FEMALE", "MALE"])
      );

      mockPrisma.$queryRawUnsafe.mockClear();
      await run({
        filter: { gender: { modifier: "EXCLUDES", values: ["MALE"] } },
      });
      expect(pageStatement().sql).toContain(
        "(p.gender IS NULL OR UPPER(p.gender) NOT IN (?))"
      );
    });

    it("gender IS_NULL is no gender or an empty one, NOT_NULL a gender", async () => {
      await run({ filter: { gender: { modifier: "IS_NULL" } } });
      expect(pageStatement().sql).toContain(
        "(p.gender IS NULL OR p.gender = '')"
      );

      mockPrisma.$queryRawUnsafe.mockClear();
      await run({ filter: { gender: { modifier: "NOT_NULL" } } });
      expect(pageStatement().sql).toContain(
        "(p.gender IS NOT NULL AND p.gender != '')"
      );
    });

    it("the free-text attributes compare whole, ignoring case; NOT_EQUALS keeps performers without one", async () => {
      await run({
        filter: {
          ethnicity: { modifier: "NOT_EQUALS", value: "Asian" },
          hair_color: { modifier: "EQUALS", value: "Blonde" },
          eye_color: { modifier: "EQUALS", value: "Blue" },
          fake_tits: { modifier: "NOT_EQUALS", value: "Natural" },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "(p.ethnicity IS NULL OR UPPER(p.ethnicity) != UPPER(?))"
      );
      expect(sql).toContain("UPPER(p.hairColor) = UPPER(?)");
      expect(sql).toContain("UPPER(p.eyeColor) = UPPER(?)");
      expect(sql).toContain(
        "(p.fakeTits IS NULL OR UPPER(p.fakeTits) != UPPER(?))"
      );
      expect(params).toEqual(
        arrayContaining(["Asian", "Blonde", "Blue", "Natural"])
      );
    });

    it("birth year, death year and age need the date, NOT_EQUALS included", async () => {
      await run({
        filter: {
          birth_year: { modifier: "BETWEEN", value: 1990, value2: 1995 },
          death_year: { modifier: "NOT_EQUALS", value: 2020 },
          age: { modifier: "LESS_THAN", value: 30 },
        },
      });

      const { sql } = pageStatement();
      expect(sql).toContain(
        `(p.birthdate IS NOT NULL AND CAST(SUBSTR(${fullDateSql("p.birthdate")}, 1, 4) AS INTEGER) BETWEEN ? AND ?)`
      );
      expect(sql).toContain(
        `(p.deathDate IS NOT NULL AND CAST(SUBSTR(${fullDateSql("p.deathDate")}, 1, 4) AS INTEGER) != ?)`
      );
      expect(sql).toContain(
        `(p.birthdate IS NOT NULL AND ${ageYearsSql("COALESCE(p.deathDate, date('now'))", "p.birthdate")} < ?)`
      );
    });

    it("weight has no COALESCE", async () => {
      await run({
        filter: { weight: { modifier: "LESS_THAN", value: 60 } },
      });
      expect(pageStatement().sql).toContain("p.weightKg < ?");
      expect(pageStatement().sql).not.toContain("COALESCE(p.weightKg");

      mockPrisma.$queryRawUnsafe.mockClear();
      await run({
        filter: {
          weight: { modifier: "BETWEEN", value: undefined, value2: 60 },
        },
      });
      const { sql, params } = pageStatement();
      expect(sql).toContain("p.weightKg <= ?");
      expect(sql).not.toContain("COALESCE(p.weightKg");
      expect(params).toContain(60);
    });

    it("age not 30 leaves out performers with no birthdate", async () => {
      await run({ filter: { age: { modifier: "NOT_EQUALS", value: 30 } } });

      const { sql } = pageStatement();
      expect(sql).toContain(
        `(p.birthdate IS NOT NULL AND ${ageYearsSql("COALESCE(p.deathDate, date('now'))", "p.birthdate")} != ?)`
      );
      expect(sql).not.toContain("p.birthdate IS NULL OR");
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
        "r.rating > ?",
        "COALESCE(s.oCounter, 0) = ?",
        "COALESCE(s.playCount, 0) < ?",
        "MAX(p.sceneCount - COALESCE(d.scenes, 0), 0) BETWEEN ? AND ?",
        "p.heightCm > ?",
        "p.weightKg < ?",
        `(p.name LIKE ? ESCAPE '\\' OR ${jsonListArm("p.aliasList")})`,
        "(p.details IS NULL OR p.details = '')",
        "(p.tattoos IS NULL OR p.tattoos NOT LIKE ? ESCAPE '\\')",
        "(p.piercings IS NOT NULL AND p.piercings != '')",
        "LOWER(p.measurements) = LOWER(?)",
        `${careerYearsSql("p.careerLength")} BETWEEN ? AND ?`,
        `substr(${fullDateSql("p.birthdate")}, 1, 10) > ?`,
        "p.deathDate IS NULL",
        "p.stashCreatedAt < ?",
        "p.stashUpdatedAt IS NOT NULL",
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it("the search matches the name and each alias on its own, a % in it matching itself", async () => {
      await run({ q: "100%_Ann" });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        `(p.name LIKE ? ESCAPE '\\' OR ${jsonListArm("p.aliasList")})`
      );
      expect(sql).not.toContain("LOWER(");
      expect(params.filter((p) => p === "%100\\%\\_Ann%")).toHaveLength(2);
    });

    it("the search keeps a non-ASCII capital as typed", async () => {
      await run({ q: "Élodie" });

      expect(pageStatement().params).toContain("%Élodie%");
      expect(pageStatement().params).not.toContain("%élodie%");
    });

    it("two words are two AND-ed groups", async () => {
      await run({ q: "anna blonde" });

      const { sql, params } = pageStatement();
      expect(sql.match(/p\.name LIKE \? ESCAPE/g)).toHaveLength(2);
      expect(sql).toContain(") AND (p.name LIKE ?");
      expect(params.filter((p) => p === "%anna%")).toHaveLength(2);
      expect(params.filter((p) => p === "%blonde%")).toHaveLength(2);
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
    it("returns urls: a stored list as a list, a malformed or absent one as none", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          performerRow({ urls: '["u1","u2"]' }),
          performerRow({ id: "2", urls: "not json" }),
          performerRow({ id: "3", urls: null }),
        ])
        .mockResolvedValueOnce([{ total: 3n }]);

      const { items } = await run();

      expect(pageStatement().sql).toContain("p.urls");
      expect(items.map((row) => row.urls)).toEqual([["u1", "u2"], [], []]);
    });

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

describe("the performer field table", () => {
  it("has a clause for every field but the base's", () => {
    const fields = Object.keys(PERFORMER_FIELDS).filter(
      (field) => field !== "ids" && field !== "instance_id"
    );

    expect(Object.keys(performerQueryBuilder["fieldClauses"]).sort()).toEqual(
      fields.sort()
    );
  });
});

/** What each performer field's clause adds to the WHERE, as the shared spec's sample binds it */
const PERFORMER_CLAUSES: Record<
  Exclude<keyof typeof PERFORMER_FIELDS, "instance_id">,
  string
> = {
  ids: "(p.id = ? AND p.stashInstanceId = ?)",
  name: "p.name LIKE ?",
  details: "p.details LIKE ?",
  tattoos: "p.tattoos LIKE ?",
  piercings: "p.piercings LIKE ?",
  measurements: "p.measurements LIKE ?",
  gender: "UPPER(p.gender) IN (?)",
  ethnicity: "UPPER(p.ethnicity) = UPPER(?)",
  hair_color: "UPPER(p.hairColor) = UPPER(?)",
  eye_color: "UPPER(p.eyeColor) = UPPER(?)",
  fake_tits: "UPPER(p.fakeTits) = UPPER(?)",
  disambiguation: "p.disambiguation LIKE ?",
  country: "p.country LIKE ?",
  circumcised: "p.circumcised IN (?)",
  aliases: "json_valid(p.aliasList)",
  url: "json_valid(p.urls)",
  stash_id: "= LOWER(?)",
  tags: "FROM PerformerTag pt WHERE pt.performerId = p.id",
  studios: "FROM StashScene sc JOIN ScenePerformer sp",
  scenes: "FROM ScenePerformer sp JOIN StashScene lsc",
  groups: "FROM SceneGroup sg JOIN ScenePerformer sp",
  performers: "FROM ScenePerformer spw JOIN ScenePerformer sp",
  rating100: "r.rating > ?",
  o_counter: "COALESCE(s.oCounter, 0) > ?",
  play_count: "COALESCE(s.playCount, 0) > ?",
  scene_count: "MAX(p.sceneCount - COALESCE(d.scenes, 0), 0) > ?",
  tag_count: "(SELECT COUNT(*) FROM PerformerTag ptc",
  image_count: "MAX(p.imageCount - COALESCE(d.images, 0), 0) > ?",
  gallery_count: "MAX(p.galleryCount - COALESCE(d.galleries, 0), 0) > ?",
  marker_count: "(SELECT COUNT(*) FROM ScenePerformer mcp",
  height: "p.heightCm > ?",
  weight: "p.weightKg > ?",
  penis_length: "p.penisLength > ?",
  career_length: "CASE WHEN career_start NOT GLOB",
  age: "strftime('%Y.%m%d'",
  birth_year: "CAST(SUBSTR(CASE length(p.birthdate)",
  death_year: "CAST(SUBSTR(CASE length(p.deathDate)",
  birthdate: "p.birthdate END, 1, 10) > ?",
  death_date: "p.deathDate END, 1, 10) > ?",
  created_at: "p.stashCreatedAt >= ?",
  updated_at: "p.stashUpdatedAt >= ?",
  favorite: "r.favorite = 1",
  tag_favorite: "FROM PerformerTag pt WHERE pt.performerId = p.id",
};

describe("every performer field clause", () => {
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
    tag_favorite: ["8", "inst-a"],
  };

  const SAMPLES = new Map(samplesOf(PERFORMER_FIELDS, BOUND));

  /** The page statement for a filter alone, with nothing else answered */
  async function statementFor(
    filter: Record<string, unknown>,
    applyExclusions = true
  ): Promise<{ sql: string; params: unknown[] }> {
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    seedFavourites();
    await run(
      { filter: untrusted<ParsedListRequest<"performer">["filter"]>(filter) },
      { applyExclusions }
    );
    return pageStatement();
  }

  it("has a sample for every field the table carries", () => {
    expect([...SAMPLES.keys()].sort()).toEqual(
      Object.keys(PERFORMER_CLAUSES).sort()
    );
  });

  it.each(Object.entries(PERFORMER_CLAUSES))(
    "%s adds its clause to the WHERE and binds its sample in order",
    async (field, fragment) => {
      const sample = must(SAMPLES.get(field), `a sample for ${field}`);

      const { sql, params } = await statementFor(filterOf(sample));

      expect(whereOf(sql)).toContain(fragment);
      expect(firstMissingBound(params, sample.bound)).toBeNull();
    }
  );

  it.each(alternatesOf(PERFORMER_FIELDS, BOUND))(
    "%s builds a clause of its own and binds its values in order",
    async (_label, sample) => {
      const baseline = whereOf((await statementFor({})).sql);

      const { sql, params } = await statementFor(filterOf(sample));

      expect(whereOf(sql)).not.toBe(baseline);
      expect(firstMissingBound(params, sample.bound)).toBeNull();
    }
  );

  it.each(Object.keys(PERFORMER_CLAUSES))(
    "%s takes no exclusion join when the viewer's exclusions do not apply",
    async (field) => {
      const sample = must(SAMPLES.get(field), `a sample for ${field}`);

      const { sql } = await statementFor(filterOf(sample), false);

      expect(whereOf(sql)).not.toContain("UserExcludedEntity");
    }
  );
});
