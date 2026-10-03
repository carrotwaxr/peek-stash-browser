/**
 * Unit tests for ClipQueryBuilder on the base builder (item 74): the
 * statements it records for a parsed clip request. The base owns the
 * instance filter, the clip's exclusion join, the random sort and the
 * joined count; this file pins what the clip adds on top (its scene join,
 * the scene's exclusion join and `deletedAt`, the sort map and its
 * tiebreak, the filter clauses and search), that the base's clauses reach
 * its statements, the row transform, the primary tags and tags loaded for
 * the page (only those the viewer may see), and the scene's clips and the
 * clip by id.
 */
import { CLIP_FIELDS } from "@peek/shared-types/filters/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  CLIP_NAME_SQL,
  clipQueryBuilder,
} from "../../services/ClipQueryBuilder.js";
import type { ClipRow } from "../../types/internal/queryRows.js";
import type {
  ClipListRequest,
  FilterRef,
  RefCriterion,
} from "../../types/parsedFilters.js";
import { pairsJson } from "../../utils/entityRef.js";
import { parsedClipRequest } from "../helpers/fixtures.js";
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

const mockPrisma = vi.mocked(prisma, true);

const ALLOWED = ["inst-a", "inst-b"];
const ref = (id: string, instanceId = "inst-a"): FilterRef => ({
  id,
  instanceId,
});
const bare = (id: string): FilterRef => ({ id, instanceId: undefined });
const criterion = (
  refs: FilterRef[],
  modifier: RefCriterion["modifier"] = "INCLUDES"
): RefCriterion => ({ refs, modifier, depth: 0 });

/** Runs one clip list request for user 7 */
async function run(
  overrides: Partial<ClipListRequest> = {},
  options: { allowedInstanceIds?: string[]; applyExclusions?: boolean } = {}
) {
  return clipQueryBuilder.execute({
    userId: 7,
    allowedInstanceIds: options.allowedInstanceIds ?? ALLOWED,
    ...(options.applyExclusions === undefined
      ? {}
      : { applyExclusions: options.applyExclusions }),
    request: parsedClipRequest(overrides),
  });
}

/** The n-th statement's SQL and parameters (0: the page, 1: the count) */
function statement(n: number): { sql: string; params: unknown[] } {
  const [sql, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[n]);
  return { sql, params };
}

/** The character positions of the pieces, which must rise */
function positions(sql: string, pieces: string[]): void {
  let last = -1;
  for (const piece of pieces) {
    const at = sql.indexOf(piece);
    expect(at, `${piece} in:\n${sql}`).toBeGreaterThan(last);
    last = at;
  }
}

/** A page row as Prisma's raw query returns it from SQLite */
function clipRow(overrides: Partial<ClipRow> = {}): ClipRow {
  return {
    id: "101",
    stashInstanceId: "inst-a",
    sceneId: "42",
    sceneInstanceId: "inst-a",
    title: "Opening",
    seconds: 12.5,
    endSeconds: 40,
    primaryTagId: "5",
    primaryTagInstanceId: "inst-a",
    screenshotPath: "/scene/42/scene_marker/101/screenshot",
    isGenerated: true,
    stashCreatedAt: new Date("2026-01-02T03:04:05.000Z"),
    stashUpdatedAt: null,
    sceneTitle: "The Scene",
    scenePathScreenshot: "/scene/42/screenshot",
    sceneStudioId: "8",
    ...overrides,
  };
}

describe("ClipQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([]) // page
      .mockResolvedValueOnce([{ total: 0n }]); // count
  });

  describe("sort", () => {
    it.each([
      ["stashCreatedAt", "c.stashCreatedAt"],
      ["stashUpdatedAt", "c.stashUpdatedAt"],
      ["title", `${CLIP_NAME_SQL} IS NULL, ${CLIP_NAME_SQL} COLLATE NOCASE`],
      ["seconds", "c.seconds"],
      ["sceneTitle", "s.title"],
      ["duration", "(c.endSeconds - c.seconds)"],
    ] as const)(
      "getClips orders by the chosen column and then by the clip's primary key (%s)",
      async (field, column) => {
        await run({ sort: { field, direction: "ASC", seed: undefined } });
        expect(statement(0).sql).toContain(
          `ORDER BY ${column} ASC, c.id ASC, c.stashInstanceId ASC\nLIMIT ? OFFSET ?`
        );

        vi.clearAllMocks();
        await run({ sort: { field, direction: "DESC", seed: undefined } });
        expect(statement(0).sql).toContain(
          `ORDER BY ${column} DESC, c.id DESC, c.stashInstanceId DESC\nLIMIT ? OFFSET ?`
        );
      }
    );

    it("the Title sort orders by the title, else the live primary tag's name, case-insensitive; clips with neither last in both directions", async () => {
      await run({
        sort: { field: "title", direction: "ASC", seed: undefined },
      });
      const page = statement(0);
      expect(page.sql).toContain(
        `ORDER BY ${CLIP_NAME_SQL} IS NULL, ${CLIP_NAME_SQL} COLLATE NOCASE ASC, c.id ASC`
      );
      expect(CLIP_NAME_SQL).toContain("NULLIF(c.title, '')");
      expect(CLIP_NAME_SQL).toContain("pt.deletedAt IS NULL");
      // The clip's own exclusion join and its scene's bind the viewer
      expect(page.params.filter((p) => p === 7)).toHaveLength(2);

      vi.clearAllMocks();
      await run({
        sort: { field: "title", direction: "DESC", seed: undefined },
      });
      expect(statement(0).sql).toContain(
        `ORDER BY ${CLIP_NAME_SQL} IS NULL, ${CLIP_NAME_SQL} COLLATE NOCASE DESC, c.id DESC`
      );
    });

    it("sorts newest first by default", async () => {
      await run();

      expect(statement(0).sql).toContain(
        "ORDER BY c.stashCreatedAt DESC, c.id DESC, c.stashInstanceId DESC"
      );
    });

    it("the random sort binds its seed three times and breaks ties by the clip's primary key", async () => {
      await run({ sort: { field: "random", direction: "ASC", seed: 4242 } });

      const { sql, params } = statement(0);
      expect(sql).not.toContain("4242");
      expect(sql.match(/c\.id \+ \?/g)).toHaveLength(3);
      expect(params.filter((p) => p === 4242)).toHaveLength(3);
      expect(sql).toContain(
        "% 2147483647) ASC, c.id ASC, c.stashInstanceId ASC"
      );
    });

    it("a hostile direction sorts DESC and never reaches the text", async () => {
      await run({
        sort: {
          field: "seconds",
          direction: "asc, (SELECT password FROM User)" as never,
          seed: undefined,
        },
      });

      const { sql } = statement(0);
      expect(sql).toContain(
        "ORDER BY c.seconds DESC, c.id DESC, c.stashInstanceId DESC"
      );
      expect(sql).not.toMatch(/select password/i);
    });
  });

  describe("the statement", () => {
    it("joins the scene and both exclusion joins with the instance, and binds params in text order", async () => {
      await run({ page: 3, perPage: 20 });

      const { sql, params } = statement(0);
      positions(sql, [
        "FROM StashClip c",
        "INNER JOIN StashScene s ON c.sceneId = s.id AND c.sceneInstanceId = s.stashInstanceId",
        "LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'clip' AND e.entityId = c.id AND (e.instanceId = '' OR e.instanceId = c.stashInstanceId)",
        "LEFT JOIN UserExcludedEntity es ON es.userId = ? AND es.entityType = 'scene' AND es.entityId = c.sceneId AND (es.instanceId = '' OR es.instanceId = c.sceneInstanceId)",
        "WHERE c.deletedAt IS NULL AND e.id IS NULL AND +s.deletedAt IS NULL AND es.id IS NULL AND c.stashInstanceId IN (?, ?)",
        "ORDER BY c.stashCreatedAt DESC, c.id DESC, c.stashInstanceId DESC",
        "LIMIT ? OFFSET ?",
      ]);
      expect(sql).not.toContain("IS NULL)");
      // The primary tag loads with the page's relations, not in the list
      expect(sql).not.toContain("StashTag");
      expect(params).toEqual([7, 7, "inst-a", "inst-b", 20, 40]);
    });

    it("counts with the same joins and WHERE", async () => {
      await run({ filter: { is_generated: true } });

      const page = statement(0);
      const count = statement(1);
      expect(count.sql).toContain("SELECT COUNT(*) AS total");
      expect(count.sql).toContain(
        page.sql.slice(
          page.sql.indexOf("FROM StashClip c"),
          page.sql.indexOf("\nORDER BY")
        )
      );
      expect(count.sql).not.toContain("ORDER BY");
      expect(count.params).toEqual([7, 7, "inst-a", "inst-b", 1]);
    });

    it("an empty allowed list matches nothing", async () => {
      const result = await run({}, { allowedInstanceIds: [] });

      expect(result).toEqual({ items: [], total: 0 });
      expect(statement(0).sql).toContain("es.id IS NULL AND 1 = 0");
      expect(statement(0).sql).not.toContain("stashInstanceId IN");
    });

    it("a specific instance narrows the list to it", async () => {
      await run({ specificInstanceId: "inst-b" });

      const { sql, params } = statement(0);
      expect(sql).toContain(
        "c.stashInstanceId IN (?, ?) AND c.stashInstanceId = ?"
      );
      expect(params.slice(2, 5)).toEqual(["inst-a", "inst-b", "inst-b"]);
    });

    it("without exclusions drops both exclusion joins and keeps the scene's deletedAt", async () => {
      await run({}, { applyExclusions: false });

      const { sql, params } = statement(0);
      expect(sql).not.toContain("UserExcludedEntity");
      expect(sql).not.toContain("e.id IS NULL");
      expect(sql).toContain(
        "WHERE c.deletedAt IS NULL AND +s.deletedAt IS NULL AND c.stashInstanceId IN (?, ?)"
      );
      expect(params).toEqual(["inst-a", "inst-b", 24, 0]);
    });
  });

  describe("filters", () => {
    it.each([
      [true, 1],
      [false, 0],
    ])("isGenerated %s matches c.isGenerated = %s", async (value, bound) => {
      await run({ filter: { is_generated: value } });

      const { sql, params } = statement(0);
      expect(sql).toContain("AND c.isGenerated = ?");
      expect(params).toContain(bound);
    });

    it("no isGenerated takes every clip", async () => {
      await run();

      expect(statement(0).sql).not.toContain("c.isGenerated = ?");
    });

    it("the search escapes %, _ and backslash in the title match", async () => {
      await run({ q: "50%_off\\" });

      const { sql, params } = statement(0);
      expect(sql).toContain(`${CLIP_NAME_SQL} LIKE ? ESCAPE '\\'`);
      expect(params).toContain("%50\\%\\_off\\\\%");
    });

    it("two words are two AND-ed matches on the shown name", async () => {
      await run({ q: "sea side" });

      const { sql, params } = statement(0);
      expect(sql.split(`${CLIP_NAME_SQL} LIKE ? ESCAPE`)).toHaveLength(3);
      expect(params).toContain("%sea%");
      expect(params).toContain("%side%");
    });

    it("the search clause sits after the field clauses", async () => {
      await run({ q: "sea", filter: { is_generated: true } });

      const { sql, params } = statement(0);
      positions(sql, ["c.isGenerated = ?", `${CLIP_NAME_SQL} LIKE ? ESCAPE`]);
      expect(params.indexOf(1)).toBeLessThan(params.indexOf("%sea%"));
    });

    it("the scene matches its (id, instance) pair, and a bare id every instance", async () => {
      await run({ filter: { scenes: criterion([ref("42")]) } });
      expect(statement(0).sql).toContain(
        "((c.sceneId = ? AND c.sceneInstanceId = ?))"
      );
      expect(statement(0).params).toEqual(arrayContaining(["42", "inst-a"]));

      vi.clearAllMocks();
      await run({ filter: { scenes: criterion([bare("42")]) } });
      expect(statement(0).sql).toContain("((c.sceneId = ?))");
    });

    it("the tag filter matches the primary tag or a junction tag by (id, instance), the junction's clips read as one list by its tag index", async () => {
      await run({ filter: { tags: criterion([ref("5"), bare("6")]) } });

      const { sql, params } = statement(0);
      expect(sql).toContain(
        "(((c.primaryTagId = ? AND c.primaryTagInstanceId = ?) OR (c.primaryTagId = ?)) OR (c.id, c.stashInstanceId) IN (SELECT ct.clipId, ct.clipInstanceId FROM ClipTag ct WHERE ((ct.tagId = ? AND ct.tagInstanceId = ?) OR (ct.tagId = ?))))"
      );
      expect(params.slice(4, 10)).toEqual([
        "5",
        "inst-a",
        "6",
        "5",
        "inst-a",
        "6",
      ]);
    });

    it("beside a studio or a scene, which drive, the tag, scene tag and performer filters probe each clip", async () => {
      for (const driver of [
        { studios: criterion([ref("8")]) },
        { scenes: criterion([ref("42")]) },
      ]) {
        vi.clearAllMocks();
        await run({
          filter: {
            ...driver,
            tags: criterion([ref("5")]),
            scene_tags: criterion([ref("20")]),
            performers: criterion([ref("10")]),
          },
        });

        const { sql } = statement(0);
        expect(sql).toContain(
          "(((c.primaryTagId = ? AND c.primaryTagInstanceId = ?)) OR EXISTS (SELECT 1 FROM ClipTag ct WHERE ct.clipId = c.id AND ct.clipInstanceId = c.stashInstanceId AND ((ct.tagId = ? AND ct.tagInstanceId = ?))))"
        );
        expect(sql).toContain(
          "(EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = c.sceneId AND st.sceneInstanceId = c.sceneInstanceId AND ((st.tagId = ? AND st.tagInstanceId = ?))) OR EXISTS (SELECT 1 FROM SceneInheritedTag sit WHERE sit.sceneId = c.sceneId AND sit.sceneInstanceId = c.sceneInstanceId AND ((sit.tagId = ? AND sit.tagInstanceId = ?))))"
        );
        expect(sql).toContain(
          "EXISTS (SELECT 1 FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND ((sp.performerId = ? AND sp.performerInstanceId = ?)))"
        );
        expect(sql).not.toContain(" IN (SELECT");
      }
    });

    it("tags Has ALL is one OR of the primary tag and the tag list per ref, AND-ed", async () => {
      await run({
        filter: { tags: criterion([ref("5"), ref("6")], "INCLUDES_ALL") },
      });

      const { sql, params } = statement(0);
      const either =
        "(((c.primaryTagId = ? AND c.primaryTagInstanceId = ?)) OR (c.id, c.stashInstanceId) IN (SELECT ct.clipId, ct.clipInstanceId FROM ClipTag ct WHERE ((ct.tagId = ? AND ct.tagInstanceId = ?))))";
      expect(sql).toContain(`(${either} AND ${either})`);
      expect(params.slice(4, 12)).toEqual([
        "5",
        "inst-a",
        "5",
        "inst-a",
        "6",
        "inst-a",
        "6",
        "inst-a",
      ]);
    });

    it("tags Has NONE holds neither in the primary tag nor the list, keeping a clip with no primary tag", async () => {
      await run({
        filter: { tags: criterion([ref("5"), bare("6")], "EXCLUDES") },
      });

      const { sql, params } = statement(0);
      expect(sql).toContain(
        "((c.primaryTagId IS NULL OR NOT ((c.primaryTagId = ? AND c.primaryTagInstanceId = ?) OR (c.primaryTagId = ?))) AND NOT EXISTS (SELECT 1 FROM ClipTag ct WHERE ct.clipId = c.id AND ct.clipInstanceId = c.stashInstanceId AND ((ct.tagId = ? AND ct.tagInstanceId = ?) OR (ct.tagId = ?))))"
      );
      expect(params.slice(4, 10)).toEqual([
        "5",
        "inst-a",
        "6",
        "5",
        "inst-a",
        "6",
      ]);
    });

    it("tags Has NONE above the negative inline limit probes the refs: the primary tag's key, then the clip's tag rows", async () => {
      const many = Array.from({ length: 65 }, (_, i) => ref(String(i + 1)));
      await run({ filter: { tags: criterion(many, "EXCLUDES") } });

      const { sql, params } = statement(0);
      const refsJson = pairsJson(
        many.map((r) => ({ id: r.id, instanceId: "inst-a" }))
      );
      expect(params.slice(0, 2)).toEqual([refsJson, refsJson]);
      positions(sql, [
        "WITH primary_tag_refs(id, inst) AS MATERIALIZED",
        "clip_tags_refs(id, inst) AS MATERIALIZED",
        "FROM StashClip c",
        "((c.primaryTagId IS NULL OR (c.primaryTagId || ':' || c.primaryTagInstanceId) NOT IN (SELECT id || ':' || inst FROM primary_tag_refs)) AND NOT EXISTS (SELECT 1 FROM ClipTag ct WHERE ct.clipId = c.id AND ct.clipInstanceId = c.stashInstanceId AND (+ct.tagId, ct.tagInstanceId) IN (SELECT id, inst FROM clip_tags_refs)))",
      ]);
      expect(sql).not.toContain("_matched");
    });

    it("scene tags and performers take Has ALL and Has NONE on the clip's scene; Has NONE holds the tag neither directly nor inherited", async () => {
      await run({
        filter: {
          scene_tags: criterion([ref("20")], "EXCLUDES"),
          performers: criterion([ref("10"), ref("11")], "INCLUDES_ALL"),
        },
      });

      const { sql } = statement(0);
      expect(sql).toContain(
        "NOT (EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = c.sceneId AND st.sceneInstanceId = c.sceneInstanceId AND ((st.tagId = ? AND st.tagInstanceId = ?))) OR EXISTS (SELECT 1 FROM SceneInheritedTag sit WHERE sit.sceneId = c.sceneId AND sit.sceneInstanceId = c.sceneInstanceId AND ((sit.tagId = ? AND sit.tagInstanceId = ?))))"
      );
      const performer =
        "(s.id, s.stashInstanceId) IN (SELECT sp.sceneId, sp.sceneInstanceId FROM ScenePerformer sp WHERE ((sp.performerId = ? AND sp.performerInstanceId = ?)))";
      expect(sql).toContain(`(${performer} AND ${performer})`);
    });

    it("scene tags match the clip's scene's own and inherited tags by (id, instance), read as one list by each junction's tag index and matched on the clip's own scene columns", async () => {
      await run({ filter: { scene_tags: criterion([ref("20", "inst-b")]) } });

      const { sql, params } = statement(0);
      expect(sql).toContain(
        "(c.sceneId, c.sceneInstanceId) IN (SELECT st.sceneId, st.sceneInstanceId FROM SceneTag st WHERE ((st.tagId = ? AND st.tagInstanceId = ?)) UNION ALL SELECT sit.sceneId, sit.sceneInstanceId FROM SceneInheritedTag sit WHERE ((sit.tagId = ? AND sit.tagInstanceId = ?)))"
      );
      expect(sql).not.toContain("json_each");
      expect(params.slice(4, 8)).toEqual(["20", "inst-b", "20", "inst-b"]);
    });

    it("scene tags Has ALL is one list per tag, each with its inherited arm, AND-ed", async () => {
      await run({
        filter: {
          scene_tags: criterion([ref("20"), ref("21")], "INCLUDES_ALL"),
        },
      });

      const tag =
        "(c.sceneId, c.sceneInstanceId) IN (SELECT st.sceneId, st.sceneInstanceId FROM SceneTag st WHERE ((st.tagId = ? AND st.tagInstanceId = ?)) UNION ALL SELECT sit.sceneId, sit.sceneInstanceId FROM SceneInheritedTag sit WHERE ((sit.tagId = ? AND sit.tagInstanceId = ?)))";
      expect(statement(0).sql).toContain(`(${tag} AND ${tag})`);
    });

    it("above the inline limit the scene tags' matched set holds the inherited junction's scenes too", async () => {
      const many = Array.from({ length: 65 }, (_, i) => ref(String(i + 1)));
      await run({ filter: { scene_tags: criterion(many) } });

      const { sql, params } = statement(0);
      // One JSON parameter for both junctions' arms
      expect(params[0]).toBe(
        pairsJson(many.map((r) => ({ id: r.id, instanceId: "inst-a" })))
      );
      positions(sql, [
        "WITH scene_tags_refs(id, inst) AS MATERIALIZED",
        "scene_tags_matched(id, inst) AS MATERIALIZED (SELECT st.sceneId, st.sceneInstanceId FROM scene_tags_refs r CROSS JOIN SceneTag st ON st.tagId = r.id AND st.tagInstanceId = r.inst UNION SELECT sit.sceneId, sit.sceneInstanceId FROM scene_tags_refs r CROSS JOIN SceneInheritedTag sit ON sit.tagId = r.id AND sit.tagInstanceId = r.inst)",
        "FROM StashClip c",
        "(c.sceneId, c.sceneInstanceId) IN (SELECT id, inst FROM scene_tags_matched)",
      ]);
    });

    it("the studio matches the clip's scene's studio by (id, instance)", async () => {
      await run({ filter: { studios: criterion([ref("8")]) } });

      expect(statement(0).sql).toContain(
        "((s.studioId = ? AND s.stashInstanceId = ?))"
      );
    });

    it("above the inline limit the tags travel as one JSON parameter into matched sets", async () => {
      const many = Array.from({ length: 65 }, (_, i) => ref(String(i + 1)));
      await run({ filter: { tags: criterion(many) } });

      const { sql, params } = statement(0);
      positions(sql, [
        "WITH primary_tag_refs(id, inst) AS MATERIALIZED",
        "primary_tag_matched(id, inst) AS MATERIALIZED (SELECT DISTINCT x.id, x.stashInstanceId FROM primary_tag_refs r CROSS JOIN StashClip x ON x.primaryTagId = r.id AND x.primaryTagInstanceId = r.inst WHERE x.deletedAt IS NULL)",
        "clip_tags_refs(id, inst) AS MATERIALIZED",
        "clip_tags_matched(id, inst) AS MATERIALIZED (SELECT DISTINCT ct.clipId, ct.clipInstanceId FROM clip_tags_refs r CROSS JOIN ClipTag ct ON ct.tagId = r.id AND ct.tagInstanceId = r.inst)",
        "FROM StashClip c",
        "((c.id, c.stashInstanceId) IN (SELECT id, inst FROM primary_tag_matched) OR (c.id, c.stashInstanceId) IN (SELECT id, inst FROM clip_tags_matched))",
      ]);
      expect(params.slice(0, 2)).toEqual([
        pairsJson(many.map((r) => ({ id: r.id, instanceId: "inst-a" }))),
        pairsJson(many.map((r) => ({ id: r.id, instanceId: "inst-a" }))),
      ]);
    });

    it("the duration is the end less the start: a clip without an end matches no comparison", async () => {
      await run({
        filter: {
          duration: { modifier: "NOT_BETWEEN", value: 10, value2: 20 },
        },
      });

      const { sql, params } = statement(0);
      expect(sql).toContain("(c.endSeconds - c.seconds) NOT BETWEEN ? AND ?");
      expect(params).toEqual(arrayContaining([10, 20]));
    });

    it("created and updated dates read the clip's epoch columns in the viewer's day", async () => {
      await clipQueryBuilder.execute({
        userId: 7,
        allowedInstanceIds: ALLOWED,
        timeZone: "America/Chicago",
        request: parsedClipRequest({
          filter: {
            created_at: { modifier: "EQUALS", value: "2021-10-12" },
            updated_at: { modifier: "IS_NULL" },
          },
        }),
      });

      const { sql, params } = statement(0);
      expect(sql).toContain("(c.stashCreatedAt >= ? AND c.stashCreatedAt < ?)");
      expect(sql).toContain("c.stashUpdatedAt IS NULL");
      // Midnight to midnight in Chicago (UTC-5 in October)
      expect(params).toEqual(
        arrayContaining([Date.UTC(2021, 9, 12, 5), Date.UTC(2021, 9, 13, 5)])
      );
    });

    it("the search and the Title filter's comparisons read the same expression", async () => {
      await run({ filter: { title: { modifier: "EQUALS", value: "Intro" } } });

      expect(statement(0).sql).toContain(`LOWER(${CLIP_NAME_SQL}) = LOWER(?)`);
      expect(statement(0).params).toContain("Intro");

      vi.clearAllMocks();
      await run({ filter: { title: { modifier: "INCLUDES", value: "ana" } } });
      expect(statement(0).sql).toContain(`${CLIP_NAME_SQL} LIKE ? ESCAPE`);
    });

    it("Title is set / not set still reads the clip's own title", async () => {
      await run({ filter: { title: { modifier: "IS_NULL" } } });
      expect(statement(0).sql).toContain("(c.title IS NULL OR c.title = '')");

      vi.clearAllMocks();
      await run({ filter: { title: { modifier: "NOT_NULL" } } });
      expect(statement(0).sql).toContain(
        "(c.title IS NOT NULL AND c.title != '')"
      );
    });

    it("the studio's EXCLUDES keeps a clip whose scene has no studio", async () => {
      await run({ filter: { studios: criterion([ref("8")], "EXCLUDES") } });

      expect(statement(0).sql).toContain(
        "(s.studioId IS NULL OR NOT ((s.studioId = ? AND s.stashInstanceId = ?)))"
      );
    });

    it("a criterion's excludes become a clause of their own beside its values, named apart", async () => {
      const many = Array.from({ length: 9 }, (_, i) => ref(String(i + 100)));
      await run({
        filter: {
          tags: { ...criterion([ref("5")]), excludes: many },
          performers: { ...criterion([ref("10")]), excludes: many },
        },
      });

      const { sql } = statement(0);
      expect(sql).toContain("tags_not_primary_tag_refs(id, inst)");
      expect(sql).toContain("tags_not_clip_tags_refs(id, inst)");
      expect(sql).toContain("performers_not_refs(id, inst)");
      expect(sql).toContain(
        "(((c.primaryTagId = ? AND c.primaryTagInstanceId = ?)) OR (c.id, c.stashInstanceId) IN"
      );
    });

    it("several scenes match any of their (id, instance) pairs", async () => {
      await run({
        filter: { scenes: criterion([ref("42"), ref("43", "inst-b")]) },
      });

      expect(statement(0).sql).toContain(
        "((c.sceneId = ? AND c.sceneInstanceId = ?) OR (c.sceneId = ? AND c.sceneInstanceId = ?))"
      );
    });

    it("above the inline limit a scene filter matches the clip's scene by its key", async () => {
      const many = Array.from({ length: 65 }, (_, i) => ref(String(i + 1)));
      await run({ filter: { performers: criterion(many) } });

      expect(statement(0).sql).toContain(
        "(s.id, s.stashInstanceId) IN (SELECT id, inst FROM performers_matched)"
      );
    });
  });

  describe("rows", () => {
    it("carry the clip's instance, its scene, and the primary tag and tags of their own (id, instance)", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          clipRow(),
          clipRow({
            stashInstanceId: "inst-b",
            sceneInstanceId: "inst-b",
            primaryTagId: null,
            primaryTagInstanceId: null,
          }),
        ])
        .mockResolvedValueOnce([{ total: 2n }])
        // The primary tags, then the tag lists
        .mockResolvedValueOnce([
          {
            pid: "101",
            pinst: "inst-a",
            id: "5",
            stashInstanceId: "inst-a",
            name: "Intro",
            color: "#ff0000",
          },
        ])
        .mockResolvedValueOnce([
          {
            pid: "101",
            pinst: "inst-a",
            id: "9",
            stashInstanceId: "inst-a",
            name: "Tag on A",
            color: null,
          },
          {
            pid: "101",
            pinst: "inst-b",
            id: "9",
            stashInstanceId: "inst-b",
            name: "Tag on B",
            color: "#00ff00",
          },
        ]);

      const { items, total } = await run();

      expect(total).toBe(2);
      expect(items).toEqual([
        {
          id: "101",
          instanceId: "inst-a",
          sceneId: "42",
          title: "Opening",
          seconds: 12.5,
          endSeconds: 40,
          primaryTagId: "5",
          screenshotPath: "/scene/42/scene_marker/101/screenshot",
          isGenerated: true,
          stashCreatedAt: new Date("2026-01-02T03:04:05.000Z"),
          stashUpdatedAt: null,
          primaryTag: { id: "5", name: "Intro", color: "#ff0000" },
          tags: [{ id: "9", name: "Tag on A", color: null }],
          scene: {
            id: "42",
            title: "The Scene",
            pathScreenshot: "/scene/42/screenshot",
            studioId: "8",
            stashInstanceId: "inst-a",
          },
        },
        objectContaining({
          id: "101",
          instanceId: "inst-b",
          primaryTag: null,
          tags: [{ id: "9", name: "Tag on B", color: "#00ff00" }],
          scene: objectContaining({ stashInstanceId: "inst-b" }),
        }),
      ]);
      const page = pairsJson([
        { id: "101", instanceId: "inst-a" },
        { id: "101", instanceId: "inst-b" },
      ]);
      const primary = statement(2);
      expect(primary.sql).toContain(
        "FROM page pg\nCROSS JOIN StashClip j ON j.id = pg.pid AND j.stashInstanceId = pg.pinst\nCROSS JOIN StashTag x ON x.id = j.primaryTagId AND x.stashInstanceId = j.primaryTagInstanceId"
      );
      const tags = statement(3);
      expect(tags.sql).toContain(
        "FROM page pg\nCROSS JOIN ClipTag j ON j.clipId = pg.pid AND j.clipInstanceId = pg.pinst"
      );
      for (const { sql, params } of [primary, tags]) {
        expect(sql).toContain("e.entityType = 'tag'");
        expect(sql).toContain("WHERE x.deletedAt IS NULL AND e.id IS NULL");
        expect(params).toEqual([page, 7]);
      }
    });

    it("a primary tag the viewer cannot see (deleted, hidden) is none, though the clip keeps its id", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([clipRow()])
        .mockResolvedValueOnce([{ total: 1n }])
        .mockResolvedValue([]);

      const { items } = await run();

      expect(must(items[0], "the clip")).toMatchObject({
        primaryTagId: "5",
        primaryTag: null,
        tags: [],
      });
    });

    it("an empty page loads no tags", async () => {
      await run();

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    });
  });

  describe("a scene's clips", () => {
    it("match the scene's (id, instance), generated only, by time then the primary key, every one with no count", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await clipQueryBuilder.getClipsForScene({
        userId: 7,
        allowedInstanceIds: ALLOWED,
        scene: ref("42", "inst-b"),
        includeUngenerated: false,
      });

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      const { sql, params } = statement(0);
      expect(sql).toContain("LEFT JOIN UserExcludedEntity e ON e.userId = ?");
      expect(sql).toContain("LEFT JOIN UserExcludedEntity es ON es.userId = ?");
      expect(sql).toContain(
        "c.stashInstanceId IN (?, ?) AND c.isGenerated = ? AND ((c.sceneId = ? AND c.sceneInstanceId = ?))"
      );
      expect(sql).toMatch(
        /ORDER BY c\.seconds ASC, c\.id ASC, c\.stashInstanceId ASC$/
      );
      expect(sql).not.toContain("LIMIT");
      expect(params).toEqual([7, 7, "inst-a", "inst-b", 1, "42", "inst-b"]);
    });

    it("with ungenerated clips has no isGenerated clause", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await clipQueryBuilder.getClipsForScene({
        userId: 7,
        allowedInstanceIds: ALLOWED,
        scene: bare("42"),
        includeUngenerated: true,
      });

      const { sql } = statement(0);
      expect(sql).not.toContain("c.isGenerated = ?");
      expect(sql).toContain("((c.sceneId = ?))");
    });
  });

  describe("a clip by ref", () => {
    it("a bare id matches every allowed instance, with both exclusion joins, no LIMIT", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const clips = await clipQueryBuilder.getClipById({
        userId: 7,
        allowedInstanceIds: ALLOWED,
        ref: bare("101"),
      });

      expect(clips).toEqual([]);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      const { sql, params } = statement(0);
      expect(sql).toContain("e.entityType = 'clip'");
      expect(sql).toContain("es.entityType = 'scene'");
      expect(sql).toContain(
        "WHERE c.deletedAt IS NULL AND e.id IS NULL AND +s.deletedAt IS NULL AND es.id IS NULL AND c.stashInstanceId IN (?, ?) AND ((c.id = ?))"
      );
      expect(sql).not.toContain("LIMIT");
      expect(params).toEqual([7, 7, "inst-a", "inst-b", "101"]);
    });

    it("id:instanceId matches that instance only", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await clipQueryBuilder.getClipById({
        userId: 7,
        allowedInstanceIds: ALLOWED,
        ref: { id: "101", instanceId: "inst-b" },
      });

      const { sql, params } = statement(0);
      expect(sql).toContain("((c.id = ? AND c.stashInstanceId = ?))");
      expect(params).toEqual([7, 7, "inst-a", "inst-b", "101", "inst-b"]);
    });

    it("returns every matching row with its tags", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([clipRow()])
        // Its primary tag and its tags
        .mockResolvedValue([]);

      const clips = await clipQueryBuilder.getClipById({
        userId: 7,
        allowedInstanceIds: ALLOWED,
        ref: bare("101"),
      });

      expect(clips).toEqual([
        objectContaining({ id: "101", instanceId: "inst-a", tags: [] }),
      ]);
    });
  });
});

describe("the clip field table", () => {
  it("has a clause for every field but the base's", () => {
    const fields = Object.keys(CLIP_FIELDS).filter(
      (field) => field !== "instance_id"
    );

    expect(Object.keys(clipQueryBuilder["fieldClauses"]).sort()).toEqual(
      fields.sort()
    );
  });
});

describe("the where tree on clips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  const studio = {
    field: "studios",
    criterion: criterion([ref("8")]),
  } as const;
  const generated = { field: "is_generated", criterion: true } as const;
  /** The clip tags filter as a probe per clip (a studio drives) */
  const PROBE =
    "EXISTS (SELECT 1 FROM ClipTag ct WHERE ct.clipId = c.id AND ct.clipInstanceId = c.stashInstanceId";
  /** The clip tags filter as one list from the junction's tag index */
  const LIST =
    "(c.id, c.stashInstanceId) IN (SELECT ct.clipId, ct.clipInstanceId FROM ClipTag ct WHERE";

  it("lists reads the top level: a studio row at the root of an all where drives, one inside an any group does not", async () => {
    await run({
      filter: { tags: criterion([ref("5")]) },
      where: { match: "all", rules: [studio] },
    });
    expect(statement(0).sql).toContain(PROBE);
    expect(statement(0).sql).not.toContain(LIST);

    vi.clearAllMocks();
    await run({
      filter: { tags: criterion([ref("5")]) },
      where: {
        match: "all",
        rules: [{ match: "any", rules: [studio, generated] }],
      },
    });
    expect(statement(0).sql).toContain(LIST);
    expect(statement(0).sql).not.toContain(PROBE);
  });

  it("two scene_tags rows and the filter's scene_tags name three CTE sets", async () => {
    const many = (from: number) =>
      Array.from({ length: 70 }, (_, i) => ref(String(from + i)));
    await run({
      filter: { scene_tags: criterion(many(1)) },
      where: {
        match: "all",
        rules: [
          { field: "scene_tags", criterion: criterion(many(101)) },
          { field: "scene_tags", criterion: criterion(many(201)) },
        ],
      },
    });

    const { sql } = statement(0);
    for (const name of ["scene_tags", "w0_scene_tags", "w1_scene_tags"]) {
      expect(sql).toContain(`${name}_refs(id, inst) AS MATERIALIZED`);
      expect(sql).toContain(`${name}_matched(id, inst) AS MATERIALIZED`);
    }
  });
});
