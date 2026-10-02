/**
 * Unit tests for TagQueryBuilder on the base builder (item 74): the
 * statements it records for a parsed request. The base owns the instance
 * filter, the exclusion join, the `ids` pairs, the random sort and the
 * joined count; this file pins what the tag adds on top (its per-user joins,
 * sort map and tiebreak, filter clauses, search, parents and children) and
 * that the base's clauses reach its statements.
 */
import { TAG_FIELDS } from "@peek/shared-types/filters/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import type * as nestedRefsModule from "../../services/query/nestedRefs.js";
import {
  TAG_REF,
  loadRefsByKey,
  loadTagChildren,
} from "../../services/query/nestedRefs.js";
import type { TagRef } from "../../types/index.js";
import type { TagQueryRow } from "../../types/internal/queryRows.js";
import type {
  FilterRef,
  ParsedListRequest,
} from "../../types/parsedFilters.js";
import { entityKey } from "../../utils/entityRef.js";
import { expandRefs } from "../../utils/hierarchyUtils.js";
import { jsonListArm } from "../../utils/sqlHelpers.js";
import { jsonListOrEmpty } from "../../utils/sqlJson.js";
import { parsedListRequest } from "../helpers/fixtures.js";
import { arrayContaining, objectContaining } from "../helpers/matchers.js";
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

// The parents' and children's loads (their SQL is nestedRefs.test.ts's)
vi.mock("../../services/query/nestedRefs.js", async (importOriginal) => ({
  ...(await importOriginal<typeof nestedRefsModule>()),
  loadRefsByKey: vi.fn(() => Promise.resolve(new Map())),
  loadTagChildren: vi.fn(() => Promise.resolve(new Map())),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockLoadRefsByKey = vi.mocked(loadRefsByKey);
const mockLoadTagChildren = vi.mocked(loadTagChildren);

/** A tag's ref as nestedRefs builds it */
const tagRefOf = (id: string, instanceId: string, name: string): TagRef => ({
  id,
  instanceId,
  name,
  image_path: null,
});

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
    sceneCountViaPerformers: 7,
    // Direct or inherited, each scene once: more than either part
    sceneCountAll: 9,
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
      // The viewer's excluded links per tag, for the counts (B13b)
      expect(sql).toContain(
        "LEFT JOIN UserExcludedContentCount d ON d.userId = ? AND d.entityType = 'tag' AND d.entityId = t.id AND d.instanceId = t.stashInstanceId"
      );
      expect(sql).toContain(
        "MAX(t.sceneCountAll - COALESCE(d.scenes, 0), 0) AS sceneCountAll"
      );
      expect(params).toEqual([1, 1, 1, 1, "inst-a", "inst-b", 10, 0]);
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
        "ORDER BY MAX(t.sceneCountAll - COALESCE(d.scenes, 0), 0) DESC, t.name COLLATE NOCASE ASC"
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
      expect(withExclusions).toContain("LEFT JOIN UserExcludedContentCount d");
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

    it("parents match the tag's visible parents through json_each as pairs, each ref keeping its instance through the expansion", async () => {
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
      // The parent is live and the viewer's exclusions (with the
      // every-instance arm) apply to it under its own alias, never `e`
      expect(sql).toContain(
        `EXISTS (SELECT 1 FROM json_each(${jsonListOrEmpty("t.parentIds")}) tpj JOIN StashTag tpp ON tpp.id = tpj.value AND tpp.stashInstanceId = t.stashInstanceId LEFT JOIN UserExcludedEntity tpp_x ON tpp_x.userId = ? AND tpp_x.entityType = 'tag' AND tpp_x.entityId = tpp.id AND (tpp_x.instanceId = '' OR tpp_x.instanceId = tpp.stashInstanceId) WHERE tpp.deletedAt IS NULL AND tpp_x.id IS NULL AND ((tpp.id = ? AND tpp.stashInstanceId = ?) OR (tpp.id = ? AND tpp.stashInstanceId = ?) OR (tpp.id = ? AND tpp.stashInstanceId = ?) OR (tpp.id = ? AND tpp.stashInstanceId = ?) OR (tpp.id = ? AND tpp.stashInstanceId = ?)))`
      );
      expect(sql).not.toContain("LIKE");
      // 10 and its descendant on inst-a; 20 and its descendant on each
      // allowed instance
      const first = params.indexOf("10") - 1;
      expect(params.slice(first, first + 11)).toEqual([
        1,
        "10",
        "inst-a",
        "99",
        "inst-a",
        "20",
        "inst-a",
        "20",
        "inst-b",
        "99",
        "inst-b",
      ]);
    });

    it("parents INCLUDES_ALL is one EXISTS per chosen parent; EXCLUDES is NOT EXISTS, so a tag with no parents stays", async () => {
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
      expect(must(all).match(/EXISTS \(SELECT 1 FROM json_each/g)).toHaveLength(
        2
      );
      expect(all).toContain(
        "AND ((tpp.id = ? AND tpp.stashInstanceId = ?))) AND EXISTS (SELECT 1 FROM json_each"
      );
      expect(excludes).toContain("NOT EXISTS (SELECT 1 FROM json_each");
    });

    it("above 64 refs the parents and children match a refs CTE, never an OR term per ref", async () => {
      const many = Array.from({ length: 65 }, (_, i) => ref(String(1000 + i)));
      await run({
        filter: {
          parents: { refs: many, modifier: "INCLUDES", depth: 0 },
          children: { refs: many, modifier: "EXCLUDES", depth: 0 },
        },
      });

      const { sql, params } = pageStatement();
      expect(sql).toContain("parents_refs(id, inst) AS MATERIALIZED");
      expect(sql).toContain(
        "(tpp.id, tpp.stashInstanceId) IN (SELECT id, inst FROM parents_refs)"
      );
      expect(sql).toContain("children_refs(id, inst) AS MATERIALIZED");
      expect(sql).toContain(
        "(tcc.id, tcc.stashInstanceId) IN (SELECT id, inst FROM children_refs)"
      );
      expect(sql).not.toContain("tpp.id = ?");
      expect(sql).not.toContain("tcc.id = ?");
      expect(params).not.toContain("1000");
    });

    it("children expand upwards and list the parents of the visible children, as pairs", async () => {
      await run({
        filter: {
          children: { refs: [ref("30")], modifier: "INCLUDES", depth: 2 },
        },
      });
      await run({
        filter: {
          children: { refs: [ref("30")], modifier: "EXCLUDES", depth: 0 },
        },
      });

      expect(expandRefs).toHaveBeenCalledWith(
        "tag",
        [ref("30")],
        2,
        ALLOWED,
        "up"
      );
      const [includes, excludes] = mockPrisma.$queryRawUnsafe.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.includes("ORDER BY"));
      const children = `FROM StashTag tcc CROSS JOIN json_each(${jsonListOrEmpty("tcc.parentIds")}) tcj LEFT JOIN UserExcludedEntity tcc_x ON tcc_x.userId = ? AND tcc_x.entityType = 'tag' AND tcc_x.entityId = tcc.id AND (tcc_x.instanceId = '' OR tcc_x.instanceId = tcc.stashInstanceId) WHERE tcc.deletedAt IS NULL AND tcc_x.id IS NULL`;
      expect(includes).toContain(
        `(t.id, t.stashInstanceId) IN (SELECT tcj.value, tcc.stashInstanceId ${children} AND ((tcc.id = ? AND tcc.stashInstanceId = ?) OR (tcc.id = ? AND tcc.stashInstanceId = ?)))`
      );
      // One text key each, never a row-value NOT IN; no NULL in the set
      expect(excludes).toContain(
        `(t.id || ':' || t.stashInstanceId) NOT IN (SELECT tcj.value || ':' || tcc.stashInstanceId ${children} AND tcj.value IS NOT NULL AND ((tcc.id = ? AND tcc.stashInstanceId = ?)))`
      );
    });

    it("the counts are the viewer's: visible parents, children and clips, the stored counts minus the viewer's excluded links", async () => {
      await run({
        filter: {
          parent_count: { modifier: "EQUALS", value: 1 },
          child_count: { modifier: "GREATER_THAN", value: 2 },
          image_count: { modifier: "EQUALS", value: 3 },
          gallery_count: { modifier: "EQUALS", value: 4 },
          performer_count: { modifier: "EQUALS", value: 5 },
          studio_count: { modifier: "EQUALS", value: 6 },
          group_count: { modifier: "EQUALS", value: 7 },
          marker_count: { modifier: "LESS_THAN", value: 8 },
        },
      });

      const { sql } = pageStatement();
      for (const fragment of [
        `(SELECT COUNT(DISTINCT tpp.id) FROM json_each(${jsonListOrEmpty("t.parentIds")}) tpj JOIN StashTag tpp`,
        "child_count_children(pid, inst, n) AS MATERIALIZED (SELECT tcj.value, tcc.stashInstanceId, COUNT(DISTINCT tcc.id) FROM StashTag tcc",
        "GROUP BY tcj.value, tcc.stashInstanceId)",
        "COALESCE((SELECT k.n FROM child_count_children k WHERE k.pid = t.id AND k.inst = t.stashInstanceId), 0) > ?",
        "MAX(t.imageCount - COALESCE(d.images, 0), 0) = ?",
        "MAX(t.galleryCount - COALESCE(d.galleries, 0), 0) = ?",
        "MAX(t.performerCount - COALESCE(d.performers, 0), 0) = ?",
        "MAX(t.studioCount - COALESCE(d.studios, 0), 0) = ?",
        "MAX(t.groupCount - COALESCE(d.groups, 0), 0) = ?",
        "SELECT mk.id AS cid, mk.stashInstanceId AS cinst FROM StashClip mk WHERE mk.primaryTagId = t.id AND mk.primaryTagInstanceId = t.stashInstanceId UNION SELECT ct.clipId, ct.clipInstanceId FROM ClipTag ct WHERE ct.tagId = t.id AND ct.tagInstanceId = t.stashInstanceId",
        "WHERE mc.deletedAt IS NULL AND mc_x.id IS NULL AND ms.deletedAt IS NULL AND ms_x.id IS NULL) < ?",
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it("without the viewer's exclusions the counts and relations read live rows only", async () => {
      await run(
        {
          filter: {
            parent_count: { modifier: "EQUALS", value: 1 },
            children: { refs: [ref("30")], modifier: "INCLUDES", depth: 0 },
          },
        },
        { applyExclusions: false }
      );

      const { sql } = pageStatement();
      expect(sql).not.toContain("UserExcludedEntity");
      expect(sql).toContain("WHERE tpp.deletedAt IS NULL)");
      expect(sql).toContain("WHERE tcc.deletedAt IS NULL AND ((tcc.id = ?");
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
          aliases: { modifier: "EQUALS", value: "bch" },
          stash_id: { modifier: "NOT_NULL" },
          created_at: { modifier: "EQUALS", value: "2025-05-05" },
          updated_at: { modifier: "GREATER_THAN", value: "2025-01-01" },
        },
      });

      const { sql } = pageStatement();
      for (const fragment of [
        "r.favorite = 1",
        "r.rating < ?",
        "COALESCE(us.oCounter, 0) > ?",
        "COALESCE(us.playCount, 0) = ?",
        "MAX(t.sceneCountAll - COALESCE(d.scenes, 0), 0) > ?",
        "(t.name IS NULL OR LOWER(t.name) != LOWER(?))",
        "(t.description IS NOT NULL AND t.description != '')",
        "LOWER(a.value) = LOWER(?)",
        "json_extract(si.value, '$.stash_id')",
        "(t.stashCreatedAt >= ? AND t.stashCreatedAt < ?)",
        "t.stashUpdatedAt >= ?",
      ]) {
        expect(sql).toContain(fragment);
      }
    });

    it("the search matches the name, description and each alias on its own, a _ in it matching itself", async () => {
      await run({ q: "Sea_Side" });

      const { sql, params } = pageStatement();
      expect(sql).toContain(
        `(t.name LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\' OR ${jsonListArm("t.aliases")})`
      );
      expect(sql).not.toContain("LOWER(");
      expect(params.filter((p) => p === "%Sea\\_Side%")).toHaveLength(3);
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
    it("a row reads as the viewer's tag, with its direct-or-inherited scene count", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([tagRow()])
        .mockResolvedValueOnce([{ total: 1n }]);

      const result = await run();

      expect(result).toMatchObject({ total: 1 });
      expect(must(result.items[0])).toMatchObject({
        id: "1",
        instanceId: "inst-a",
        description: null,
        aliases: ["Shore"],
        scene_count: 9,
        scene_count_direct: 3,
        scene_count_via_performers: 7,
        image_count: 0,
        group_count: 0,
        rating100: 40,
        favorite: false,
        o_counter: 0,
        play_count: 5,
        image_path: null,
      });
    });

    it("parents are the visible ones on the tag's own instance, in the tag's order; children come by name", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          tagRow({ parentIds: '["11","10","12"]' }),
          tagRow({ id: "1", stashInstanceId: "inst-b", parentIds: null }),
        ])
        .mockResolvedValueOnce([{ total: 2n }]);
      // "12" is hidden, deleted or missing: nestedRefs leaves it out
      mockLoadRefsByKey.mockResolvedValueOnce(
        new Map([
          [entityKey("10", "inst-a"), tagRefOf("10", "inst-a", "Places")],
          [entityKey("11", "inst-a"), tagRefOf("11", "inst-a", "Beaches")],
        ])
      );
      mockLoadTagChildren.mockResolvedValueOnce(
        new Map([
          [
            entityKey("1", "inst-b"),
            [tagRefOf("7", "inst-b", "sand"), tagRefOf("5", "inst-b", "Dunes")],
          ],
        ])
      );

      const { items } = await run();

      // One load each for the page, with the viewer and the parents on
      // their tag's instance
      expect(mockLoadRefsByKey).toHaveBeenCalledTimes(1);
      expect(mockLoadRefsByKey).toHaveBeenCalledWith(
        TAG_REF,
        [
          { id: "11", instanceId: "inst-a" },
          { id: "10", instanceId: "inst-a" },
          { id: "12", instanceId: "inst-a" },
        ],
        objectContaining({ userId: 1, applyExclusions: true })
      );
      expect(mockLoadTagChildren).toHaveBeenCalledTimes(1);
      expect(mockLoadTagChildren).toHaveBeenCalledWith(
        [
          objectContaining({ id: "1", instanceId: "inst-a" }),
          objectContaining({ id: "1", instanceId: "inst-b" }),
        ],
        objectContaining({ userId: 1, applyExclusions: true })
      );

      const [onA, onB] = [must(items[0]), must(items[1])];
      expect(onA.parents).toEqual([
        tagRefOf("11", "inst-a", "Beaches"),
        tagRefOf("10", "inst-a", "Places"),
      ]);
      expect(onA.children).toEqual([]);
      expect(onB.parents).toEqual([]);
      expect(onB.children).toEqual([
        tagRefOf("5", "inst-b", "Dunes"),
        tagRefOf("7", "inst-b", "sand"),
      ]);
    });

    it("an empty page loads no parents or children", async () => {
      await run();

      expect(mockLoadRefsByKey).not.toHaveBeenCalled();
      expect(mockLoadTagChildren).not.toHaveBeenCalled();
    });
  });
});

describe("the tag field table", () => {
  it("has a clause for every field but the base's", () => {
    const fields = Object.keys(TAG_FIELDS).filter(
      (field) => field !== "ids" && field !== "instance_id"
    );

    // The nested `scenes` and `groups` fields (path scenes_filter) are keyed by
    // their field names, as the parser hands them
    expect(Object.keys(tagQueryBuilder["fieldClauses"]).sort()).toEqual(
      fields.sort()
    );
  });
});
