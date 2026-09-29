/**
 * Unit tests for StudioQueryBuilder on the base builder (item 74): the
 * statements it records for a parsed request. The base owns the instance
 * filter, the exclusion join, the `ids` pairs, the random sort and the
 * joined count; this file pins what the studio adds on top (its per-user
 * joins, sort map and tiebreak, filter clauses and search) and that the
 * base's clauses reach its statements.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import type { StudioQueryRow } from "../../types/internal/queryRows.js";
import type {
  FilterRef,
  ParsedListRequest,
} from "../../types/parsedFilters.js";
import { parsedListRequest } from "../helpers/fixtures.js";
import { arrayContaining } from "../helpers/matchers.js";
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

// Each tag expands to itself and one descendant, "99"
vi.mock("../../utils/hierarchyUtils.js", () => ({
  expandTagIds: vi.fn((ids: string[]) => Promise.resolve([...ids, "99"])),
}));

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
    stashFavorite: true,
    stashRating100: 80,
    sceneCount: 4,
    imageCount: null,
    galleryCount: 0,
    performerCount: 2,
    groupCount: 1,
    details: "",
    url: null,
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
      expect(params).toEqual([1, 1, 1, "inst-a", "inst-b", 10, 20]);
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
        "ORDER BY s.performerCount ASC, s.name COLLATE NOCASE ASC"
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

    it("tags match StudioTag pairs, the selected tag on its instance and its descendants on every instance", async () => {
      await run({
        filter: {
          tags: { refs: [ref("284")], modifier: "EXCLUDES", depth: 1 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toMatch(
        /NOT EXISTS \(SELECT 1 FROM StudioTag (\w+) WHERE \1\.studioId = s\.id AND \1\.studioInstanceId = s\.stashInstanceId AND \(\(\1\.tagId = \? AND \1\.tagInstanceId = \?\) OR \(\1\.tagId = \?\)\)\)/
      );
      expect(params).toEqual(arrayContaining(["284", "inst-a", "99"]));
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
        "COALESCE(r.rating, 0) BETWEEN ? AND ?",
        "COALESCE(us.oCounter, 0) > ?",
        "COALESCE(us.playCount, 0) = ?",
        "COALESCE(s.sceneCount, 0) != ?",
        "LOWER(s.name) = LOWER(?)",
        "(LOWER(s.details) LIKE LOWER(?))",
        "s.stashCreatedAt BETWEEN ? AND ?",
        "s.stashUpdatedAt IS NULL",
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it("the search matches the name and details, a % in it matching itself", async () => {
      await run({ q: "100% Real" });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "(LOWER(s.name) LIKE ? ESCAPE '\\' OR LOWER(s.details) LIKE ? ESCAPE '\\')"
      );
      expect(params.filter((p) => p === "%100\\% real%")).toHaveLength(2);
    });
  });

  describe("rows", () => {
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
        parent_studio: { id: "9", name: "" },
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
  });
});
