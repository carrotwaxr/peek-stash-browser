/**
 * Unit tests for TagQueryBuilder on the base builder (item 74): the
 * statements it records for a parsed request. The base owns the instance
 * filter, the exclusion join, the `ids` pairs, the random sort and the
 * joined count; this file pins what the tag adds on top (its per-user joins,
 * sort map and tiebreak, filter clauses, search and parent names) and that
 * the base's clauses reach its statements.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import type { TagQueryRow } from "../../types/internal/queryRows.js";
import type {
  FilterRef,
  ParsedListRequest,
} from "../../types/parsedFilters.js";
import { parsedListRequest } from "../helpers/fixtures.js";
import { arrayContaining, objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

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
  overrides: Partial<ParsedListRequest<"tag">> = {},
  options: { allowedInstanceIds?: string[]; applyExclusions?: boolean } = {}
) {
  const request = parsedListRequest("tag", overrides);
  return tagQueryBuilder.execute({
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
function tagRow(overrides: Partial<TagQueryRow> = {}): TagQueryRow {
  return {
    id: "1",
    stashInstanceId: "inst-a",
    name: "Beach",
    stashFavorite: false,
    sceneCount: 3,
    imageCount: null,
    galleryCount: 0,
    performerCount: 2,
    studioCount: 1,
    groupCount: null,
    sceneMarkerCount: 0,
    sceneCountViaPerformers: 7,
    description: "",
    aliases: '["Shore"]',
    parentIds: '["10","11"]',
    imagePath: null,
    stashCreatedAt: null,
    stashUpdatedAt: null,
    userRating: 40,
    userFavorite: false,
    userOCounter: null,
    userPlayCount: 5,
    ...overrides,
  };
}

describe("TagQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // page
      .mockResolvedValueOnce([{ total: 0n }]); // count
    mockPrisma.stashTag.findMany.mockResolvedValue([]);
  });

  describe("the statement", () => {
    it("joins the viewer's rating and stats on (id, instance) and binds params in text order", async () => {
      await run();

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "LEFT JOIN TagRating r ON t.id = r.tagId AND t.stashInstanceId = r.instanceId AND r.userId = ?"
      );
      expect(sql).toContain(
        "LEFT JOIN UserTagStats us ON t.id = us.tagId AND t.stashInstanceId = us.instanceId AND us.userId = ?"
      );
      expect(sql).toContain("entityType = 'tag'");
      // Rating, stats and exclusion user ids, the instances, the page
      expect(params).toEqual([1, 1, 1, "inst-a", "inst-b", 10, 0]);
    });

    it("filters to the allowed instances, with no NULL arm", async () => {
      await run();

      const { sql } = pageStatement();
      expect(sql).toContain("t.stashInstanceId IN (?, ?)");
      expect(sql).not.toContain("t.stashInstanceId IS NULL");
    });

    it("an empty allowed list matches nothing", async () => {
      await run({}, { allowedInstanceIds: [] });

      const { sql } = pageStatement();
      expect(sql).toContain("1 = 0");
      expect(sql).not.toContain("t.stashInstanceId IN");
    });

    it("a specific instance narrows the list to it", async () => {
      await run({ specificInstanceId: "instance-abc" });

      const { sql, params } = pageStatement();
      expect(sql).toContain("t.stashInstanceId = ?");
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
      // The larger of the direct and via-performer counts, as the card shows
      expect(byCount).toContain(
        "ORDER BY MAX(COALESCE(t.sceneCount, 0), COALESCE(t.sceneCountViaPerformers, 0)) DESC, t.name COLLATE NOCASE ASC"
      );
      expect(byName).toContain(
        "ORDER BY t.name COLLATE NOCASE ASC, t.id ASC, t.stashInstanceId ASC"
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
        expect(sql).toContain("LEFT JOIN TagRating r");
        expect(sql).toContain("LEFT JOIN UserTagStats us");
      }
      expect(withExclusions).toContain("LEFT JOIN UserExcludedEntity e");
      expect(without).not.toContain("UserExcludedEntity");
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
        "((t.id = ? AND t.stashInstanceId = ?) OR (t.id = ?))"
      );
      expect(sql).not.toContain("t.id IN (");
      expect(params).toEqual(arrayContaining(["5", "inst-a", "6"]));
    });

    it("the parents filter on tags keeps the instance of each ref; a bare ref and a descendant keep the LIKE alone", async () => {
      await run({
        filter: {
          parents: {
            refs: [ref("10"), bare("20")],
            modifier: "INCLUDES",
            depth: 1,
          },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "((t.stashInstanceId = ? AND t.parentIds LIKE ?) OR t.parentIds LIKE ? OR t.parentIds LIKE ?)"
      );
      expect(params).toEqual(
        arrayContaining(["inst-a", '%"10"%', '%"20"%', '%"99"%'])
      );
    });

    it("parents INCLUDES_ALL needs every ref, and EXCLUDES keeps tags with no parents", async () => {
      await run({
        filter: {
          parents: {
            refs: [ref("10"), ref("11", "inst-b")],
            modifier: "INCLUDES_ALL",
            depth: 0,
          },
        },
      });
      await run({
        filter: {
          parents: { refs: [ref("10")], modifier: "EXCLUDES", depth: 0 },
        },
      });

      const [all, excludes] = mockPrisma.$queryRawUnsafe.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.includes("ORDER BY"));
      expect(all).toContain(
        "((t.stashInstanceId = ? AND t.parentIds LIKE ?) AND (t.stashInstanceId = ? AND t.parentIds LIKE ?))"
      );
      expect(excludes).toContain(
        "(t.parentIds IS NULL OR NOT ((t.stashInstanceId = ? AND t.parentIds LIKE ?)))"
      );
    });

    it("performers and studios match their junctions as pairs", async () => {
      await run({
        filter: {
          performers: { refs: [ref("3")], modifier: "INCLUDES", depth: 0 },
          studios: { refs: [bare("4")], modifier: "EXCLUDES", depth: 0 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toMatch(
        /EXISTS \(SELECT 1 FROM PerformerTag (\w+) WHERE \1\.tagId = t\.id AND \1\.tagInstanceId = t\.stashInstanceId AND \(\(\1\.performerId = \? AND \1\.performerInstanceId = \?\)\)\)/
      );
      expect(sql).toMatch(
        /NOT EXISTS \(SELECT 1 FROM StudioTag (\w+) WHERE \1\.tagId = t\.id AND \1\.tagInstanceId = t\.stashInstanceId AND \(\(\1\.studioId = \?\)\)\)/
      );
      expect(params).toEqual(arrayContaining(["3", "inst-a", "4"]));
    });

    it("scenes and groups match through live scenes, as pairs", async () => {
      await run({
        filter: {
          scenes: { refs: [ref("8")], modifier: "INCLUDES", depth: 0 },
          groups: { refs: [ref("9")], modifier: "EXCLUDES", depth: 0 },
        },
      });

      const { sql } = pageStatement();
      expect(sql).toContain(
        "EXISTS (SELECT 1 FROM SceneTag st JOIN StashScene lsc"
      );
      expect(sql).toContain("st.sceneId = ? AND st.sceneInstanceId = ?");
      expect(sql).toContain(
        "NOT EXISTS (SELECT 1 FROM SceneTag st JOIN SceneGroup sg"
      );
      expect(sql).toContain("sg.groupId = ? AND sg.groupInstanceId = ?");
    });

    it("the viewer's numbers, the scene count and the text and date fields each reach SQL", async () => {
      await run({
        filter: {
          favorite: true,
          rating100: { modifier: "LESS_THAN", value: 50 },
          o_counter: { modifier: "GREATER_THAN", value: 1 },
          play_count: { modifier: "EQUALS", value: 2 },
          scene_count: { modifier: "GREATER_THAN", value: 0 },
          name: { modifier: "NOT_EQUALS", value: "Beach" },
          description: { modifier: "NOT_NULL" },
          created_at: { modifier: "EQUALS", value: "2025-05-05" },
          updated_at: { modifier: "GREATER_THAN", value: "2025-01-01" },
        },
      });

      const { sql } = pageStatement();
      for (const fragment of [
        "r.favorite = 1",
        "COALESCE(r.rating, 0) < ?",
        "COALESCE(us.oCounter, 0) > ?",
        "COALESCE(us.playCount, 0) = ?",
        "MAX(COALESCE(t.sceneCount, 0), COALESCE(t.sceneCountViaPerformers, 0)) > ?",
        "(t.name IS NULL OR LOWER(t.name) != LOWER(?))",
        "(t.description IS NOT NULL AND t.description != '')",
        "date(t.stashCreatedAt) = date(?)",
        "t.stashUpdatedAt > ?",
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it("the search matches the name, description and aliases, a _ in it matching itself", async () => {
      await run({ q: "Sea_Side" });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "(LOWER(t.name) LIKE ? ESCAPE '\\' OR LOWER(t.description) LIKE ? ESCAPE '\\' OR LOWER(t.aliases) LIKE ? ESCAPE '\\')"
      );
      expect(params.filter((p) => p === "%sea\\_side%")).toHaveLength(3);
    });
  });

  describe("rows", () => {
    it("a row reads as the viewer's tag, with the larger scene count and its parents named on its own instance", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([tagRow()])
        .mockResolvedValueOnce([{ total: 1n }]);
      mockPrisma.stashTag.findMany.mockResolvedValue([
        partialRow({ id: "10", stashInstanceId: "inst-a", name: "Places" }),
        partialRow({ id: "11", stashInstanceId: "inst-b", name: "Elsewhere" }),
      ]);

      const result = await run();

      expect(result).toMatchObject({ total: 1 });
      const tag = must(result.items[0]);
      expect(tag).toMatchObject({
        id: "1",
        instanceId: "inst-a",
        description: null,
        aliases: ["Shore"],
        scene_count: 7,
        scene_count_direct: 3,
        scene_count_via_performers: 7,
        image_count: 0,
        group_count: 0,
        rating100: 40,
        favorite: false,
        o_counter: 0,
        play_count: 5,
        image_path: null,
        // "11" exists only on inst-b: not this tag's parent
        parents: [
          { id: "10", name: "Places" },
          { id: "11", name: "Unknown" },
        ],
      });
      expect(mockPrisma.stashTag.findMany).toHaveBeenCalledWith(
        objectContaining({
          where: {
            id: { in: ["10", "11"] },
            stashInstanceId: { in: ["inst-a"] },
          },
        })
      );
    });
  });
});
