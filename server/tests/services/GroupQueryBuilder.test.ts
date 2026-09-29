/**
 * Unit tests for GroupQueryBuilder on the base builder (item 74): the
 * statements it records for a parsed request. The base owns the instance
 * filter, the exclusion join, the `ids` pairs, the random sort and the
 * joined count; this file pins what the group adds on top (its rating join,
 * the sub-group count in the select list with its user id, sort map and
 * tiebreak, filter clauses and search), that the base's clauses reach its
 * statements, and the card's relations.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { loadTooltipRelations } from "../../services/TooltipRelations.js";
import type { GroupQueryRow } from "../../types/internal/queryRows.js";
import type {
  FilterRef,
  ParsedListRequest,
} from "../../types/parsedFilters.js";
import { entityKey, pairsJson } from "../../utils/entityRef.js";
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

// Each tag and studio expands to itself and one descendant, "99"
vi.mock("../../utils/hierarchyUtils.js", () => ({
  expandTagIds: vi.fn((ids: string[]) => Promise.resolve([...ids, "99"])),
  expandStudioIds: vi.fn((ids: string[]) => Promise.resolve([...ids, "99"])),
}));

vi.mock("../../services/TooltipRelations.js", () => ({
  loadTooltipRelations: vi.fn(() => Promise.resolve(new Map())),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockTooltips = vi.mocked(loadTooltipRelations);

const ALLOWED = ["inst-a", "inst-b"];
const ref = (id: string, instanceId = "inst-a"): FilterRef => ({
  id,
  instanceId,
});
const bare = (id: string): FilterRef => ({ id, instanceId: undefined });

/** Runs one list request for user 1 */
async function run(
  overrides: Partial<ParsedListRequest<"group">> = {},
  options: { allowedInstanceIds?: string[]; applyExclusions?: boolean } = {}
) {
  const request = parsedListRequest("group", overrides);
  return groupQueryBuilder.execute({
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
function groupRow(overrides: Partial<GroupQueryRow> = {}): GroupQueryRow {
  return {
    id: "1",
    stashInstanceId: "inst-a",
    name: "Box Set",
    date: "",
    studioId: "41",
    stashRating100: 80,
    duration: null,
    sceneCount: 3,
    performerCount: null,
    director: "",
    synopsis: "Three parts",
    urls: null,
    frontImagePath: "/group/1/frontimage",
    backImagePath: null,
    stashCreatedAt: null,
    stashUpdatedAt: new Date("2026-01-02T03:04:05.000Z"),
    userRating: null,
    userFavorite: true,
    subGroupCount: 2n,
    ...overrides,
  };
}

describe("GroupQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // page
      .mockResolvedValueOnce([{ total: 0n }]); // count
  });

  describe("the statement", () => {
    it("selects the sub-group count with its user id first, joins the viewer's rating on (id, instance), and binds params in text order", async () => {
      await run({ page: 3, perPage: 10 });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "LEFT JOIN UserExcludedEntity se ON se.userId = ? AND se.entityType = 'group' AND se.entityId = sub.id AND (se.instanceId = '' OR se.instanceId = sub.stashInstanceId)"
      );
      expect(sql).toContain(
        "WHERE gr.containingId = g.id AND gr.containingInstanceId = g.stashInstanceId AND gr.subInstanceId = g.stashInstanceId AND se.id IS NULL) AS subGroupCount"
      );
      expect(sql.indexOf("AS subGroupCount")).toBeLessThan(
        sql.indexOf("FROM StashGroup g")
      );
      expect(sql).toContain(
        "LEFT JOIN GroupRating r ON g.id = r.groupId AND g.stashInstanceId = r.instanceId AND r.userId = ?"
      );
      expect(sql).toContain("entityType = 'group' AND e.entityId = g.id");
      // Sub-group exclusion, rating and exclusion user ids, the instances, the page
      expect(params).toEqual([1, 1, 1, "inst-a", "inst-b", 10, 20]);
    });

    it("without exclusions the sub-group count leaves out only deleted sub-groups and binds no user id", async () => {
      await run({}, { applyExclusions: false });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "JOIN StashGroup sub ON sub.id = gr.subId AND sub.stashInstanceId = gr.subInstanceId AND sub.deletedAt IS NULL"
      );
      expect(sql).not.toContain("UserExcludedEntity");
      expect(params).toEqual([1, "inst-a", "inst-b", 10, 0]);
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
    it("sorts by scene_count with the name tiebreak and by name with the id tiebreak", async () => {
      await run({
        sort: { field: "scene_count", direction: "DESC", seed: undefined },
      });
      await run({
        sort: { field: "name", direction: "ASC", seed: undefined },
      });

      const [byCount, byName] = mockPrisma.$queryRawUnsafe.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.includes("ORDER BY"));
      expect(byCount).toContain(
        "ORDER BY g.sceneCount DESC, g.name COLLATE NOCASE ASC"
      );
      expect(byName).toContain(
        "ORDER BY g.name COLLATE NOCASE ASC, g.id ASC, g.stashInstanceId ASC"
      );
    });

    it("the viewer's rating sorts through the rating join", async () => {
      await run({
        sort: { field: "rating", direction: "DESC", seed: undefined },
      });

      expect(pageStatement().sql).toContain(
        "ORDER BY COALESCE(r.rating, 0) DESC, g.name COLLATE NOCASE ASC"
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
    it("counts with the joined COUNT(*), with and without the exclusion join, without the select list's user id", async () => {
      await run();
      const withExclusions = countStatement();
      mockPrisma.$queryRawUnsafe.mockClear();
      await run({}, { applyExclusions: false });
      const without = countStatement();

      for (const { sql } of [withExclusions, without]) {
        expect(sql).toMatch(/SELECT COUNT\(\*\) AS total/i);
        expect(sql).not.toMatch(/COUNT\(DISTINCT/);
        expect(sql).not.toContain("subGroupCount");
        expect(sql).toContain("LEFT JOIN GroupRating r");
      }
      expect(withExclusions.sql).toContain("LEFT JOIN UserExcludedEntity e");
      expect(withExclusions.params).toEqual([1, 1, "inst-a", "inst-b"]);
      expect(without.sql).not.toContain("UserExcludedEntity");
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
        "NOT ((g.id = ? AND g.stashInstanceId = ?) OR (g.id = ?))"
      );
      expect(sql).not.toContain("g.id NOT IN (");
      expect(params).toEqual(arrayContaining(["5", "inst-a", "6"]));
    });

    it("containing_groups match GroupRelation pairs with the group as the sub-group", async () => {
      await run({
        filter: {
          containing_groups: {
            refs: [ref("10"), bare("11")],
            modifier: "INCLUDES",
            depth: 0,
          },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toMatch(
        /EXISTS \(SELECT 1 FROM GroupRelation (\w+) WHERE \1\.subId = g\.id AND \1\.subInstanceId = g\.stashInstanceId AND \(\(\1\.containingId = \? AND \1\.containingInstanceId = \?\) OR \(\1\.containingId = \?\)\)\)/
      );
      expect(params).toEqual(arrayContaining(["10", "inst-a", "11"]));
    });

    it("studios match the group's studio column, the selected studio on its instance and its descendants on every instance", async () => {
      await run({
        filter: {
          studios: { refs: [ref("41")], modifier: "INCLUDES", depth: 1 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "((g.studioId = ? AND g.stashInstanceId = ?) OR (g.studioId = ?))"
      );
      expect(sql).not.toContain("g.studioId IN (");
      expect(params).toEqual(arrayContaining(["41", "inst-a", "99"]));
    });

    it("tags match GroupTag pairs, the selected tag on its instance and its descendants on every instance", async () => {
      await run({
        filter: {
          tags: { refs: [ref("284")], modifier: "EXCLUDES", depth: -1 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toMatch(
        /NOT EXISTS \(SELECT 1 FROM GroupTag (\w+) WHERE \1\.groupId = g\.id AND \1\.groupInstanceId = g\.stashInstanceId AND \(\(\1\.tagId = \? AND \1\.tagInstanceId = \?\) OR \(\1\.tagId = \?\)\)\)/
      );
      expect(params).toEqual(arrayContaining(["284", "inst-a", "99"]));
    });

    it("scenes match through SceneGroup, performers through their scenes, each with the scene live", async () => {
      await run({
        filter: {
          scenes: { refs: [ref("3")], modifier: "EXCLUDES", depth: 0 },
          performers: { refs: [ref("7")], modifier: "INCLUDES", depth: 0 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "NOT EXISTS (SELECT 1 FROM SceneGroup sg JOIN StashScene lsc ON lsc.id = sg.sceneId AND lsc.stashInstanceId = sg.sceneInstanceId WHERE sg.groupId = g.id AND sg.groupInstanceId = g.stashInstanceId AND lsc.deletedAt IS NULL AND ((sg.sceneId = ? AND sg.sceneInstanceId = ?)))"
      );
      expect(sql).toContain(
        "(g.id, g.stashInstanceId) IN (SELECT sg.groupId, sg.groupInstanceId FROM ScenePerformer sp JOIN SceneGroup sg ON sg.sceneId = sp.sceneId AND sg.sceneInstanceId = sp.sceneInstanceId JOIN StashScene lsc ON lsc.id = sp.sceneId AND lsc.stashInstanceId = sp.sceneInstanceId WHERE lsc.deletedAt IS NULL AND ((sp.performerId = ? AND sp.performerInstanceId = ?)))"
      );
      expect(params).toEqual(arrayContaining(["3", "inst-a", "7", "inst-a"]));
    });

    it("the viewer's rating and favorite, the counts and the text and date fields each reach SQL", async () => {
      await run({
        filter: {
          favorite: false,
          rating100: { modifier: "BETWEEN", value: 20, value2: 80 },
          scene_count: { modifier: "GREATER_THAN", value: 2 },
          duration: { modifier: "LESS_THAN", value: 3600 },
          name: { modifier: "EQUALS", value: "Box Set" },
          date: { modifier: "IS_NULL" },
          created_at: { modifier: "EQUALS", value: "2025-01-01" },
          updated_at: {
            modifier: "BETWEEN",
            value: "2025-01-01",
            value2: "2025-12-31",
          },
        },
      });

      const { sql } = pageStatement();
      for (const fragment of [
        "(r.favorite = 0 OR r.favorite IS NULL)",
        "COALESCE(r.rating, 0) BETWEEN ? AND ?",
        "COALESCE(g.sceneCount, 0) > ?",
        "COALESCE(g.duration, 0) < ?",
        "LOWER(g.name) = LOWER(?)",
        "g.date IS NULL",
        "g.stashCreatedAt",
        "g.stashUpdatedAt BETWEEN ? AND ?",
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it("the search matches the name and synopsis, a % in it matching itself", async () => {
      await run({ q: "100% Real" });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        "(LOWER(g.name) LIKE ? ESCAPE '\\' OR LOWER(g.synopsis) LIKE ? ESCAPE '\\')"
      );
      expect(params.filter((p) => p === "%100\\% real%")).toHaveLength(2);
    });
  });

  describe("rows and relations", () => {
    it("a row reads as the viewer's group, with its tooltip relations and its visible studio", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([groupRow()])
        .mockResolvedValueOnce([{ total: 1n }])
        // The studio, live and not excluded for the viewer; Stash's own
        // favorite never reaches the ref
        .mockResolvedValueOnce([
          {
            id: "41",
            stashInstanceId: "inst-a",
            name: "Studio",
            imagePath: null,
            parentId: null,
            favorite: true,
          },
        ]);
      mockTooltips.mockResolvedValueOnce(
        new Map([
          [
            entityKey("1", "inst-a"),
            { tags: [], performers: [], relation_totals: { performers: 4 } },
          ],
        ])
      );
      const result = await run();

      expect(result).toMatchObject({ total: 1 });
      const group = must(result.items[0]);
      expect(group).toMatchObject({
        id: "1",
        instanceId: "inst-a",
        name: "Box Set",
        date: null,
        director: null,
        synopsis: "Three parts",
        urls: [],
        scene_count: 3,
        performer_count: 0,
        sub_group_count: 2,
        duration: 0,
        back_image_path: null,
        created_at: null,
        updated_at: "2026-01-02T03:04:05.000Z",
        rating: null,
        rating100: null,
        favorite: true,
        relation_totals: { performers: 4 },
      });
      expect(group.studio).toEqual({
        id: "41",
        instanceId: "inst-a",
        name: "Studio",
        image_path: null,
        parent_studio: null,
      });
      expect(mockTooltips).toHaveBeenCalledWith("group", result.items, 1);
      const [studioSql, ...studioParams] = must(
        mockPrisma.$queryRawUnsafe.mock.calls[2],
        "the studio statement"
      );
      expect(studioSql).toContain(
        "CROSS JOIN StashStudio x ON x.id = r.rid AND x.stashInstanceId = r.rinst"
      );
      expect(studioSql).toContain("WHERE x.deletedAt IS NULL AND e.id IS NULL");
      expect(studioParams).toEqual([
        pairsJson([{ id: "41", instanceId: "inst-a" }]),
        1,
      ]);
    });

    it("a studio the viewer cannot see is none, though the row names its id", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([groupRow()])
        .mockResolvedValueOnce([{ total: 1n }])
        .mockResolvedValueOnce([]);

      const { items } = await run();

      expect(must(items[0])).toMatchObject({ studioId: "41", studio: null });
    });
  });
});
