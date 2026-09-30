/**
 * Unit tests for the shared SQL clause helpers (items 34a and 74).
 *
 * Every ref is matched as an (id, instance) pair, and a bare ref matches
 * that id on every instance. A ref set up to PAIR_INLINE_LIMIT is bound
 * inline as OR-ed pairs; above it the refs travel as one JSON parameter into
 * a materialized set that the entity is matched against, never as a
 * `NOT IN (subquery)`.
 */
import { describe, expect, it } from "vitest";
import type { FilterRef } from "../../types/parsedFilters.js";
import {
  type JunctionTarget,
  PAIR_INLINE_LIMIT,
  type ViaSceneSpec,
  anyOf,
  buildDateFilter,
  buildEpochDateFilter,
  buildFavoriteFilter,
  buildNumericFilter,
  buildTextFilter,
  combine,
  countForms,
  exclusionJoin,
  idClause,
  instanceClause,
  instanceColumnClause,
  pairs,
  randomOrder,
  refClause,
  specificInstanceClause,
  viaSceneClause,
} from "../../utils/sqlClauses.js";
import { must } from "../helpers/must.js";

/** Groups holding one of the scenes: SceneGroup, keyed by the group */
const GROUPS_BY_SCENE: ViaSceneSpec = {
  alias: "g",
  junction: { table: "SceneGroup", alias: "sg" },
  entityIdCol: "groupId",
  entityInstanceCol: "groupInstanceId",
  sceneIdCol: "sceneId",
  sceneInstanceCol: "sceneInstanceId",
};

/** Performers in one of the groups' scenes: ScenePerformer, then SceneGroup */
const PERFORMERS_BY_GROUP: ViaSceneSpec = {
  alias: "p",
  junction: { table: "ScenePerformer", alias: "sp" },
  entityIdCol: "performerId",
  entityInstanceCol: "performerInstanceId",
  sceneIdCol: "sceneId",
  sceneInstanceCol: "sceneInstanceId",
  via: {
    table: "SceneGroup",
    alias: "sg",
    sceneIdCol: "sceneId",
    sceneInstanceCol: "sceneInstanceId",
    refIdCol: "groupId",
    refInstanceCol: "groupInstanceId",
  },
};

/** Performers in a scene of one of the studios: the scene row is the via */
const PERFORMERS_BY_STUDIO: ViaSceneSpec = {
  ...PERFORMERS_BY_GROUP,
  via: {
    table: "StashScene",
    alias: "sc",
    sceneIdCol: "id",
    sceneInstanceCol: "stashInstanceId",
    refIdCol: "studioId",
    refInstanceCol: "stashInstanceId",
  },
};

const LIVE_SCENE_OF_SG =
  "JOIN StashScene lsc ON lsc.id = sg.sceneId AND lsc.stashInstanceId = sg.sceneInstanceId";

const GROUP_BY_SCENE_EXISTS = `EXISTS (SELECT 1 FROM SceneGroup sg ${LIVE_SCENE_OF_SG} WHERE sg.groupId = g.id AND sg.groupInstanceId = g.stashInstanceId AND lsc.deletedAt IS NULL AND (`;

const SCENE_TAGS: JunctionTarget = {
  kind: "junction",
  table: "SceneTag",
  alias: "st",
  parentAlias: "s",
  parentIdCol: "sceneId",
  parentInstanceCol: "sceneInstanceId",
  refIdCol: "tagId",
  refInstanceCol: "tagInstanceId",
};

/** A scene's inherited tags, the same columns in their own junction */
const SCENE_INHERITED_TAGS: JunctionTarget = {
  ...SCENE_TAGS,
  table: "SceneInheritedTag",
  alias: "sit",
};

const A = "inst-a";
const B = "inst-b";
const ref = (id: string, instanceId = A): FilterRef => ({ id, instanceId });
/** A legacy id with no instance */
const bare = (id: string): FilterRef => ({ id, instanceId: undefined });
const many = (n: number, from = 1): FilterRef[] =>
  Array.from({ length: n }, (_, i) => ref(String(from + i)));

const OPTS = { name: "tags", allowedInstanceIds: [A, B] };

describe("pairs", () => {
  it("matches a composite ref on both columns and a bare ref on the id alone", () => {
    expect(
      pairs("sg.sceneId", "sg.sceneInstanceId", [ref("1"), bare("2")])
    ).toEqual({
      sql: "(sg.sceneId = ? AND sg.sceneInstanceId = ?) OR (sg.sceneId = ?)",
      params: ["1", "inst-a", "2"],
    });
  });

  it("treats an empty instance as a bare ref", () => {
    expect(
      pairs("sg.sceneId", "sg.sceneInstanceId", [{ id: "1", instanceId: "" }])
    ).toEqual({ sql: "(sg.sceneId = ?)", params: ["1"] });
  });
});

describe("viaSceneClause", () => {
  it("INCLUDES for groups by scene emits an EXISTS on SceneGroup keyed by the group's (id, stashInstanceId), joined to the live scene, with one (sceneId, sceneInstanceId) pair per composite ref and a bare `sceneId = ?` per bare ref", () => {
    const clause = viaSceneClause(
      GROUPS_BY_SCENE,
      [ref("5"), bare("7"), ref("9", B)],
      "INCLUDES"
    );

    expect(clause).toEqual({
      sql: `${GROUP_BY_SCENE_EXISTS}(sg.sceneId = ? AND sg.sceneInstanceId = ?) OR (sg.sceneId = ?) OR (sg.sceneId = ? AND sg.sceneInstanceId = ?)))`,
      params: ["5", "inst-a", "7", "9", "inst-b"],
    });
  });

  it("EXCLUDES emits NOT EXISTS", () => {
    const clause = viaSceneClause(GROUPS_BY_SCENE, [ref("5")], "EXCLUDES");

    expect(clause).toEqual({
      sql: `NOT ${GROUP_BY_SCENE_EXISTS}(sg.sceneId = ? AND sg.sceneInstanceId = ?)))`,
      params: ["5", "inst-a"],
    });
  });

  it("INCLUDES_ALL emits one EXISTS per ref, AND-ed", () => {
    const clause = viaSceneClause(
      GROUPS_BY_SCENE,
      [ref("5"), bare("7")],
      "INCLUDES_ALL"
    );

    expect(clause).toEqual({
      sql: `(${GROUP_BY_SCENE_EXISTS}(sg.sceneId = ? AND sg.sceneInstanceId = ?))) AND ${GROUP_BY_SCENE_EXISTS}(sg.sceneId = ?))))`,
      params: ["5", "inst-a", "7"],
    });
  });

  it("the via form's INCLUDES is a row-value IN driven from the ref: the via table, the junction on the scene, the live scene", () => {
    const clause = viaSceneClause(PERFORMERS_BY_GROUP, [ref("3")], "INCLUDES");

    expect(clause).toEqual({
      sql: `(p.id, p.stashInstanceId) IN (SELECT sp.performerId, sp.performerInstanceId FROM SceneGroup sg JOIN ScenePerformer sp ON sp.sceneId = sg.sceneId AND sp.sceneInstanceId = sg.sceneInstanceId ${LIVE_SCENE_OF_SG} WHERE lsc.deletedAt IS NULL AND ((sg.groupId = ? AND sg.groupInstanceId = ?)))`,
      params: ["3", "inst-a"],
    });
  });

  it("the via form's INCLUDES_ALL is one row-value IN per ref, AND-ed", () => {
    const clause = viaSceneClause(
      PERFORMERS_BY_GROUP,
      [ref("3"), ref("4")],
      "INCLUDES_ALL"
    );

    expect(
      clause.sql.match(/\(p\.id, p\.stashInstanceId\) IN \(/g)
    ).toHaveLength(2);
    expect(clause.sql).toMatch(/^\(.* AND .*\)$/s);
    expect(clause.sql).not.toContain("EXISTS");
    expect(clause.params).toEqual(["3", "inst-a", "4", "inst-a"]);
  });

  it("the via form's EXCLUDES stays a keyed NOT EXISTS, never NOT IN, on live scenes", () => {
    const clause = viaSceneClause(PERFORMERS_BY_GROUP, [ref("3")], "EXCLUDES");

    expect(clause).toEqual({
      sql: `NOT EXISTS (SELECT 1 FROM ScenePerformer sp JOIN SceneGroup sg ON sg.sceneId = sp.sceneId AND sg.sceneInstanceId = sp.sceneInstanceId JOIN StashScene lsc ON lsc.id = sp.sceneId AND lsc.stashInstanceId = sp.sceneInstanceId WHERE sp.performerId = p.id AND sp.performerInstanceId = p.stashInstanceId AND lsc.deletedAt IS NULL AND ((sg.groupId = ? AND sg.groupInstanceId = ?)))`,
      params: ["3", "inst-a"],
    });
    expect(clause.sql).not.toContain("NOT IN");
  });

  it("a via that is the scene table itself checks deletedAt on it and joins no second scene row, and adds the spec's own condition", () => {
    const clause = viaSceneClause(
      { ...PERFORMERS_BY_STUDIO, where: "sc.organized = 1" },
      [ref("4")],
      "INCLUDES"
    );

    expect(clause.sql).toBe(
      "(p.id, p.stashInstanceId) IN (SELECT sp.performerId, sp.performerInstanceId FROM StashScene sc JOIN ScenePerformer sp ON sp.sceneId = sc.id AND sp.sceneInstanceId = sc.stashInstanceId WHERE sc.deletedAt IS NULL AND sc.organized = 1 AND ((sc.studioId = ? AND sc.stashInstanceId = ?)))"
    );
    expect(clause.sql.match(/StashScene/g)).toHaveLength(1);
  });

  it("is empty with no refs or an unknown modifier", () => {
    expect(viaSceneClause(GROUPS_BY_SCENE, [], "INCLUDES")).toEqual({
      sql: "",
      params: [],
    });
    expect(viaSceneClause(GROUPS_BY_SCENE, [ref("5")], "EQUALS")).toEqual({
      sql: "",
      params: [],
    });
  });
});

describe("idClause", () => {
  it("matches (id, instance) pairs and a bare id on every instance", () => {
    expect(idClause("s", [ref("1"), bare("2")], "INCLUDES", OPTS)).toEqual({
      sql: "((s.id = ? AND s.stashInstanceId = ?) OR (s.id = ?))",
      params: ["1", "inst-a", "2"],
    });
  });

  it("EXCLUDES negates the pairs", () => {
    expect(idClause("s", [ref("1")], "EXCLUDES", OPTS)).toEqual({
      sql: "NOT ((s.id = ? AND s.stashInstanceId = ?))",
      params: ["1", "inst-a"],
    });
  });

  it("no refs matches nothing for INCLUDES and is no filter for EXCLUDES", () => {
    expect(idClause("s", [], "INCLUDES", OPTS)).toEqual({
      sql: "0",
      params: [],
    });
    expect(idClause("s", [], "EXCLUDES", OPTS)).toEqual({
      sql: "",
      params: [],
    });
  });

  it("above PAIR_INLINE_LIMIT the refs travel as one JSON parameter into a materialized set the entity is matched against by primary key", () => {
    const refs = many(PAIR_INLINE_LIMIT + 1);

    const includes = idClause("s", refs, "INCLUDES", { ...OPTS, name: "ids" });
    expect(includes.sql).toBe(
      "(s.id, s.stashInstanceId) IN (SELECT id, inst FROM ids_refs)"
    );
    expect(includes.params).toEqual([]);
    expect(includes.joins).toBeUndefined();
    expect(includes.ctes).toEqual([
      {
        name: "ids_refs",
        sql: "ids_refs(id, inst) AS MATERIALIZED (SELECT DISTINCT json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]') FROM json_each(?) j)",
        params: [JSON.stringify(refs.map((r) => [r.id, r.instanceId]))],
      },
    ]);

    // EXCLUDES is a single-column key NOT IN over the set, which SQLite
    // probes through an ephemeral index; never a row-value NOT IN
    const excludes = idClause("s", refs, "EXCLUDES", { ...OPTS, name: "ids" });
    expect(excludes.sql).toBe(
      "(s.id || ':' || s.stashInstanceId) NOT IN (SELECT id || ':' || inst FROM ids_refs)"
    );
    expect(excludes.joins).toBeUndefined();
    expect(excludes.ctes).toEqual(includes.ctes);
    expect(excludes.sql).not.toMatch(/\(s\.id, s\.stashInstanceId\) NOT IN/);
  });

  it("in the large shape a bare ref becomes one pair per allowed instance", () => {
    const refs = [...many(PAIR_INLINE_LIMIT), bare("bare")];

    const clause = idClause("s", refs, "INCLUDES", {
      name: "ids",
      allowedInstanceIds: [A, B],
    });

    const bound = JSON.parse(String(clause.ctes?.[0]?.params[0])) as string[][];
    expect(bound.filter(([id]) => id === "bare")).toEqual([
      ["bare", A],
      ["bare", B],
    ]);
    expect(bound).toHaveLength(PAIR_INLINE_LIMIT + 2);
  });
});

describe("instanceClause", () => {
  it("binds the allowed instances and has no `IS NULL` arm", () => {
    expect(instanceClause("s", [A, B])).toEqual({
      sql: "s.stashInstanceId IN (?, ?)",
      params: ["inst-a", "inst-b"],
    });
  });

  it("an empty allowed list matches nothing", () => {
    expect(instanceClause("s", [])).toEqual({ sql: "1 = 0", params: [] });
  });
});

describe("instanceColumnClause", () => {
  it("an empty list is `1 = 0`", () => {
    expect(instanceColumnClause("s.stashInstanceId", [])).toEqual({
      sql: "1 = 0",
      params: [],
    });
  });

  it("one id is an IN on the column as given", () => {
    expect(instanceColumnClause("x.stashInstanceId", [A])).toEqual({
      sql: "x.stashInstanceId IN (?)",
      params: ["inst-a"],
    });
  });

  it("several ids are one IN with a placeholder each, in order", () => {
    expect(instanceColumnClause("s.stashInstanceId", [A, B, "inst-c"])).toEqual(
      {
        sql: "s.stashInstanceId IN (?, ?, ?)",
        params: ["inst-a", "inst-b", "inst-c"],
      }
    );
  });

  it("takes any column expression", () => {
    expect(instanceColumnClause("p.instanceId", [A]).sql).toBe(
      "p.instanceId IN (?)"
    );
  });

  it("instanceClause is the alias's stashInstanceId column", () => {
    expect(instanceClause("g", [A, B])).toEqual(
      instanceColumnClause("g.stashInstanceId", [A, B])
    );
  });
});

describe("specificInstanceClause", () => {
  it("binds the one instance, or is no filter without one", () => {
    expect(specificInstanceClause("s", "inst-b")).toEqual({
      sql: "s.stashInstanceId = ?",
      params: ["inst-b"],
    });
    expect(specificInstanceClause("s", undefined)).toEqual({
      sql: "",
      params: [],
    });
  });
});

describe("randomOrder", () => {
  it("binds the seed three times and interpolates nothing", () => {
    const order = randomOrder("s", 42424242);

    expect(order.params).toEqual([42424242, 42424242, 42424242]);
    expect(order.sql).not.toContain("42424242");
    expect(order.sql.match(/\(s\.id \+ \?\)/g)).toHaveLength(3);
    expect(order.sql).toContain("% 2147483647");
  });
});

describe("refClause", () => {
  const TAG_EXISTS =
    "EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND (";

  it("INCLUDES on a junction is one EXISTS over all the pairs", () => {
    expect(
      refClause(SCENE_TAGS, [ref("1"), bare("2")], "INCLUDES", OPTS)
    ).toEqual({
      sql: `${TAG_EXISTS}(st.tagId = ? AND st.tagInstanceId = ?) OR (st.tagId = ?)))`,
      params: ["1", "inst-a", "2"],
    });
  });

  it("EXCLUDES is its NOT", () => {
    const clause = refClause(SCENE_TAGS, [ref("1")], "EXCLUDES", OPTS);

    expect(clause.sql).toBe(
      `NOT ${TAG_EXISTS}(st.tagId = ? AND st.tagInstanceId = ?)))`
    );
    expect(clause.params).toEqual(["1", "inst-a"]);
  });

  it("INCLUDES_ALL is one INCLUDES per ref, AND-ed", () => {
    const clause = refClause(
      SCENE_TAGS,
      [ref("1"), ref("2")],
      "INCLUDES_ALL",
      OPTS
    );

    expect(clause.sql).toBe(
      `(${TAG_EXISTS}(st.tagId = ? AND st.tagInstanceId = ?))) AND ${TAG_EXISTS}(st.tagId = ? AND st.tagInstanceId = ?))))`
    );
    expect(clause.params).toEqual(["1", "inst-a", "2", "inst-a"]);
  });

  it("an inherited junction adds its own EXISTS arm for all the refs, read by its key, never json_each", () => {
    const clause = refClause(SCENE_TAGS, [ref("1"), bare("2")], "INCLUDES", {
      ...OPTS,
      inheritedJunction: SCENE_INHERITED_TAGS,
    });

    expect(clause.sql).toBe(
      `(${TAG_EXISTS}(st.tagId = ? AND st.tagInstanceId = ?) OR (st.tagId = ?))) OR EXISTS (SELECT 1 FROM SceneInheritedTag sit WHERE sit.sceneId = s.id AND sit.sceneInstanceId = s.stashInstanceId AND ((sit.tagId = ? AND sit.tagInstanceId = ?) OR (sit.tagId = ?))))`
    );
    expect(clause.sql).not.toContain("json_each");
    expect(clause.params).toEqual(["1", "inst-a", "2", "1", "inst-a", "2"]);
  });

  describe("a list read whole and sorted (sortedByIndex false, L8)", () => {
    const SORTED = {
      ...OPTS,
      inheritedJunction: SCENE_INHERITED_TAGS,
      sortedByIndex: false,
    };
    const TAG_IN =
      "(s.id, s.stashInstanceId) IN (SELECT st.sceneId, st.sceneInstanceId FROM SceneTag st WHERE (";

    it("a small INCLUDES reads both junctions by their ref columns as one row-value IN", () => {
      const clause = refClause(
        SCENE_TAGS,
        [ref("1"), bare("2")],
        "INCLUDES",
        SORTED
      );

      expect(clause.sql).toBe(
        `${TAG_IN}(st.tagId = ? AND st.tagInstanceId = ?) OR (st.tagId = ?)) UNION ALL SELECT sit.sceneId, sit.sceneInstanceId FROM SceneInheritedTag sit WHERE ((sit.tagId = ? AND sit.tagInstanceId = ?) OR (sit.tagId = ?)))`
      );
      expect(clause.params).toEqual(["1", "inst-a", "2", "1", "inst-a", "2"]);
      expect(clause.ctes).toBeUndefined();
    });

    it("without an inherited list it is the row-value IN alone", () => {
      const clause = refClause(SCENE_TAGS, [ref("1")], "INCLUDES", {
        ...OPTS,
        sortedByIndex: false,
      });

      expect(clause).toEqual({
        sql: `${TAG_IN}(st.tagId = ? AND st.tagInstanceId = ?)))`,
        params: ["1", "inst-a"],
      });
    });

    it("INCLUDES_ALL is one row-value IN per ref, AND-ed", () => {
      const clause = refClause(
        SCENE_TAGS,
        [ref("1"), ref("2")],
        "INCLUDES_ALL",
        { ...OPTS, sortedByIndex: false }
      );

      expect(clause.sql).toBe(
        `(${TAG_IN}(st.tagId = ? AND st.tagInstanceId = ?))) AND ${TAG_IN}(st.tagId = ? AND st.tagInstanceId = ?))))`
      );
      expect(clause.params).toEqual(["1", "inst-a", "2", "inst-a"]);
    });

    it("EXCLUDES keeps the correlated NOT EXISTS", () => {
      expect(refClause(SCENE_TAGS, [ref("1")], "EXCLUDES", SORTED)).toEqual(
        refClause(SCENE_TAGS, [ref("1")], "EXCLUDES", {
          ...SORTED,
          sortedByIndex: true,
        })
      );
    });

    it("above the inline limit it is the matched set, as when the sort is not said", () => {
      const refs = many(PAIR_INLINE_LIMIT + 1);
      const matched = refClause(SCENE_TAGS, refs, "INCLUDES", SORTED);

      expect(matched.sql).toBe(
        "(s.id, s.stashInstanceId) IN (SELECT id, inst FROM tags_matched)"
      );
      expect(matched).toEqual(
        refClause(SCENE_TAGS, refs, "INCLUDES", {
          ...OPTS,
          inheritedJunction: SCENE_INHERITED_TAGS,
        })
      );
    });

    it("an indexed sort (or none said) keeps the correlated EXISTS", () => {
      const refs = [ref("1")];
      const walked = refClause(SCENE_TAGS, refs, "INCLUDES", {
        ...SORTED,
        sortedByIndex: true,
      });

      expect(walked.sql).toContain("EXISTS (SELECT 1 FROM SceneTag st WHERE");
      expect(walked.sql).not.toContain(" IN (SELECT");
      expect(
        refClause(SCENE_TAGS, refs, "INCLUDES", {
          ...OPTS,
          inheritedJunction: SCENE_INHERITED_TAGS,
        })
      ).toEqual(walked);
    });
  });

  describe("a large set under an indexed sort (sortedByIndex true, L9)", () => {
    const WALKED = {
      ...OPTS,
      inheritedJunction: SCENE_INHERITED_TAGS,
      sortedByIndex: true,
    };

    it("reads both junctions' rows of the refs list by their ref indexes as one row-value IN", () => {
      const refs = [...many(PAIR_INLINE_LIMIT), bare("bare")];
      const clause = refClause(SCENE_TAGS, refs, "INCLUDES", WALKED);

      expect(clause.sql).toBe(
        "(s.id, s.stashInstanceId) IN (SELECT st.sceneId, st.sceneInstanceId FROM tags_refs r CROSS JOIN SceneTag st ON st.tagId = r.id AND st.tagInstanceId = r.inst UNION ALL SELECT sit.sceneId, sit.sceneInstanceId FROM tags_refs r CROSS JOIN SceneInheritedTag sit ON sit.tagId = r.id AND sit.tagInstanceId = r.inst)"
      );
      expect(clause.params).toEqual([]);
      // Only the refs: no matched set is built, and a bare ref is one pair per allowed instance
      expect(clause.ctes).toHaveLength(1);
      const refsCte = must(clause.ctes?.[0]);
      expect(refsCte.name).toBe("tags_refs");
      const bound = JSON.parse(String(refsCte.params[0])) as string[][];
      expect(bound.filter(([id]) => id === "bare")).toEqual([
        ["bare", A],
        ["bare", B],
      ]);
    });

    it("without an inherited list it is the row-value IN alone", () => {
      const clause = refClause(
        SCENE_TAGS,
        many(PAIR_INLINE_LIMIT + 1),
        "INCLUDES",
        { ...OPTS, sortedByIndex: true }
      );

      expect(clause.sql).toBe(
        "(s.id, s.stashInstanceId) IN (SELECT st.sceneId, st.sceneInstanceId FROM tags_refs r CROSS JOIN SceneTag st ON st.tagId = r.id AND st.tagInstanceId = r.inst)"
      );
    });

    it("EXCLUDES keeps the matched set's NOT IN", () => {
      const refs = many(PAIR_INLINE_LIMIT + 1);

      expect(refClause(SCENE_TAGS, refs, "EXCLUDES", WALKED)).toEqual(
        refClause(SCENE_TAGS, refs, "EXCLUDES", {
          ...WALKED,
          sortedByIndex: false,
        })
      );
    });

    it("up to the inline limit it keeps the correlated EXISTS", () => {
      const refs = many(PAIR_INLINE_LIMIT);

      expect(refClause(SCENE_TAGS, refs, "INCLUDES", WALKED).sql).toMatch(
        /^\(EXISTS \(SELECT 1 FROM SceneTag st WHERE/
      );
    });
  });

  it("a column target matches the pairs on the row itself, and EXCLUDES keeps rows with no value", () => {
    const target = {
      kind: "column" as const,
      parentTable: "StashScene",
      parentAlias: "s",
      idCol: "studioId",
      instanceCol: "stashInstanceId",
    };

    expect(refClause(target, [ref("1"), ref("2")], "INCLUDES", OPTS)).toEqual({
      sql: "((s.studioId = ? AND s.stashInstanceId = ?) OR (s.studioId = ? AND s.stashInstanceId = ?))",
      params: ["1", "inst-a", "2", "inst-a"],
    });
    expect(refClause(target, [ref("1")], "EXCLUDES", OPTS)).toEqual({
      sql: "(s.studioId IS NULL OR NOT ((s.studioId = ? AND s.stashInstanceId = ?)))",
      params: ["1", "inst-a"],
    });
  });

  it("switches from inline pairs to the matched CTE above PAIR_INLINE_LIMIT and never emits a row-value NOT IN", () => {
    const inline = refClause(SCENE_TAGS, many(PAIR_INLINE_LIMIT), "INCLUDES", {
      ...OPTS,
      inheritedJunction: SCENE_INHERITED_TAGS,
    });
    expect(inline.ctes).toBeUndefined();
    // Each ref binds its id and instance in the direct arm and the inherited arm
    expect(inline.params).toHaveLength(PAIR_INLINE_LIMIT * 4);

    const refs = many(PAIR_INLINE_LIMIT + 1);
    const large = refClause(SCENE_TAGS, refs, "INCLUDES", {
      ...OPTS,
      inheritedJunction: SCENE_INHERITED_TAGS,
    });
    expect(large.sql).toBe(
      "(s.id, s.stashInstanceId) IN (SELECT id, inst FROM tags_matched)"
    );
    expect(large.params).toEqual([]);
    expect(large.ctes).toEqual([
      {
        name: "tags_refs",
        sql: "tags_refs(id, inst) AS MATERIALIZED (SELECT DISTINCT json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]') FROM json_each(?) j)",
        params: [JSON.stringify(refs.map((r) => [r.id, r.instanceId]))],
      },
      {
        name: "tags_matched",
        sql: "tags_matched(id, inst) AS MATERIALIZED (SELECT st.sceneId, st.sceneInstanceId FROM tags_refs r CROSS JOIN SceneTag st ON st.tagId = r.id AND st.tagInstanceId = r.inst UNION SELECT sit.sceneId, sit.sceneInstanceId FROM tags_refs r CROSS JOIN SceneInheritedTag sit ON sit.tagId = r.id AND sit.tagInstanceId = r.inst)",
        params: [],
      },
    ]);

    const excludes = refClause(SCENE_TAGS, refs, "EXCLUDES", OPTS);
    expect(excludes.sql).toBe(
      "(s.id || ':' || s.stashInstanceId) NOT IN (SELECT id || ':' || inst FROM tags_matched)"
    );
    expect(excludes.joins).toBeUndefined();
    // Without an inherited list the matched set is the junction's rows only
    expect(excludes.ctes?.[1]?.sql).toBe(
      "tags_matched(id, inst) AS MATERIALIZED (SELECT DISTINCT st.sceneId, st.sceneInstanceId FROM tags_refs r CROSS JOIN SceneTag st ON st.tagId = r.id AND st.tagInstanceId = r.inst)"
    );
  });

  it("a large column target is matched through the parent table by the column", () => {
    const clause = refClause(
      {
        kind: "column",
        parentTable: "StashScene",
        parentAlias: "s",
        idCol: "studioId",
        instanceCol: "stashInstanceId",
      },
      many(PAIR_INLINE_LIMIT + 1),
      "INCLUDES",
      { ...OPTS, name: "studios" }
    );

    expect(clause.sql).toBe(
      "(s.id, s.stashInstanceId) IN (SELECT id, inst FROM studios_matched)"
    );
    expect(clause.ctes?.[1]?.sql).toBe(
      "studios_matched(id, inst) AS MATERIALIZED (SELECT DISTINCT x.id, x.stashInstanceId FROM studios_refs r CROSS JOIN StashScene x ON x.studioId = r.id AND x.stashInstanceId = r.inst WHERE x.deletedAt IS NULL)"
    );
  });

  it("a large set with a bare ref matches it on the allowed instances only", () => {
    const clause = refClause(
      SCENE_TAGS,
      [...many(PAIR_INLINE_LIMIT), bare("bare")],
      "INCLUDES",
      { ...OPTS, allowedInstanceIds: [B] }
    );

    const bound = JSON.parse(String(clause.ctes?.[0]?.params[0])) as string[][];
    expect(bound.filter(([id]) => id === "bare")).toEqual([["bare", B]]);
  });

  it("an infinite inline limit keeps every set inline (the legacy wrappers)", () => {
    const clause = refClause(SCENE_TAGS, many(200), "INCLUDES", {
      ...OPTS,
      inlineLimit: Number.POSITIVE_INFINITY,
    });

    expect(clause.ctes).toBeUndefined();
    expect(clause.params).toHaveLength(400);
  });

  it("is empty with no refs", () => {
    expect(refClause(SCENE_TAGS, [], "INCLUDES", OPTS)).toEqual({
      sql: "",
      params: [],
    });
  });
});

describe("combine", () => {
  it("joins the non-empty clauses with AND and gathers their ctes, joins and params in order", () => {
    const combined = combine([
      { sql: "", params: [] },
      {
        sql: "a = ?",
        params: [1],
        ctes: [{ name: "c1", sql: "c1(id) AS (SELECT ?)", params: ["x"] }],
        joins: [{ sql: "JOIN c1 ON c1.id = s.id", params: [] }],
      },
      { sql: "b = ?", params: [2] },
      {
        sql: "",
        params: [],
        joins: [{ sql: "JOIN d ON d.id = s.id AND d.k = ?", params: ["k"] }],
      },
    ]);

    expect(combined).toEqual({
      where: "a = ? AND b = ?",
      params: [1, 2],
      ctes: [{ name: "c1", sql: "c1(id) AS (SELECT ?)", params: ["x"] }],
      joins: [
        { sql: "JOIN c1 ON c1.id = s.id", params: [] },
        { sql: "JOIN d ON d.id = s.id AND d.k = ?", params: ["k"] },
      ],
    });
  });
});

describe("countForms", () => {
  it("takes each clause's count form, or the clause itself when it has none", () => {
    const counted = {
      sql: "c = ?",
      params: [3],
      ctes: [{ name: "c3", sql: "c3(id) AS (SELECT ?)", params: ["y"] }],
    };

    expect(
      countForms([
        { sql: "a = ?", params: [1], count: counted },
        { sql: "b = ?", params: [2] },
      ])
    ).toEqual([counted, { sql: "b = ?", params: [2] }]);
  });
});

describe("anyOf", () => {
  it("ORs the clauses in parentheses and gathers their params and ctes in order", () => {
    const clause = anyOf([
      {
        sql: "a = ?",
        params: [1],
        ctes: [{ name: "c1", sql: "c1(id) AS (SELECT ?)", params: ["x"] }],
      },
      { sql: "b = ?", params: [2] },
    ]);

    expect(clause).toEqual({
      sql: "(a = ? OR b = ?)",
      params: [1, 2],
      ctes: [{ name: "c1", sql: "c1(id) AS (SELECT ?)", params: ["x"] }],
    });
  });

  it("refuses a clause that joins, which an OR cannot hold", () => {
    expect(() =>
      anyOf([
        { sql: "a = ?", params: [1] },
        {
          sql: "",
          params: [],
          joins: [{ sql: "JOIN m ON m.id = s.id", params: [] }],
        },
      ])
    ).toThrow("anyOf cannot OR a clause that joins");
  });
});

describe("exclusionJoin", () => {
  it("joins the viewer's rows of the type on the entity's id and instance, or a global row", () => {
    expect(exclusionJoin("es", "scene", "c.sceneId", "c.sceneInstanceId")).toBe(
      "LEFT JOIN UserExcludedEntity es ON es.userId = ? AND es.entityType = 'scene' AND es.entityId = c.sceneId AND (es.instanceId = '' OR es.instanceId = c.sceneInstanceId)"
    );
  });
});

// The per-field clauses, moved from utils/sqlFilterBuilders.ts unchanged

describe("buildNumericFilter", () => {
  const col = "COALESCE(r.rating, 0)";

  it("returns empty for undefined filter", () => {
    expect(buildNumericFilter(undefined, col)).toEqual({ sql: "", params: [] });
  });

  it("returns empty for null filter", () => {
    expect(buildNumericFilter(null, col)).toEqual({ sql: "", params: [] });
  });

  it("returns empty for filter with null value", () => {
    expect(buildNumericFilter({ value: null }, col)).toEqual({
      sql: "",
      params: [],
    });
  });

  it("returns empty for filter with undefined value", () => {
    expect(buildNumericFilter({ value: undefined }, col)).toEqual({
      sql: "",
      params: [],
    });
  });

  it("handles EQUALS", () => {
    const result = buildNumericFilter({ value: 80, modifier: "EQUALS" }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) = ?");
    expect(result.params).toEqual([80]);
  });

  it("handles NOT_EQUALS", () => {
    const result = buildNumericFilter(
      { value: 80, modifier: "NOT_EQUALS" },
      col
    );
    expect(result.sql).toBe("COALESCE(r.rating, 0) != ?");
    expect(result.params).toEqual([80]);
  });

  it("handles GREATER_THAN", () => {
    const result = buildNumericFilter(
      { value: 50, modifier: "GREATER_THAN" },
      col
    );
    expect(result.sql).toBe("COALESCE(r.rating, 0) > ?");
    expect(result.params).toEqual([50]);
  });

  it("handles LESS_THAN", () => {
    const result = buildNumericFilter(
      { value: 50, modifier: "LESS_THAN" },
      col
    );
    expect(result.sql).toBe("COALESCE(r.rating, 0) < ?");
    expect(result.params).toEqual([50]);
  });

  it("handles BETWEEN with value2", () => {
    const result = buildNumericFilter(
      { value: 20, value2: 80, modifier: "BETWEEN" },
      col
    );
    expect(result.sql).toBe("COALESCE(r.rating, 0) BETWEEN ? AND ?");
    expect(result.params).toEqual([20, 80]);
  });

  it("handles BETWEEN without value2 (fallback to >=)", () => {
    const result = buildNumericFilter({ value: 20, modifier: "BETWEEN" }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) >= ?");
    expect(result.params).toEqual([20]);
  });

  it("handles NOT_BETWEEN with value2", () => {
    const result = buildNumericFilter(
      { value: 20, value2: 80, modifier: "NOT_BETWEEN" },
      col
    );
    expect(result.sql).toBe(
      "(COALESCE(r.rating, 0) < ? OR COALESCE(r.rating, 0) > ?)"
    );
    expect(result.params).toEqual([20, 80]);
  });

  it("handles NOT_BETWEEN without value2 (fallback to <)", () => {
    const result = buildNumericFilter(
      { value: 20, modifier: "NOT_BETWEEN" },
      col
    );
    expect(result.sql).toBe("COALESCE(r.rating, 0) < ?");
    expect(result.params).toEqual([20]);
  });

  it("defaults to GREATER_THAN when no modifier", () => {
    const result = buildNumericFilter({ value: 50 }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) > ?");
    expect(result.params).toEqual([50]);
  });

  it("returns empty for unknown modifier", () => {
    const result = buildNumericFilter({ value: 50, modifier: "UNKNOWN" }, col);
    expect(result).toEqual({ sql: "", params: [] });
  });

  it("works with subquery expressions", () => {
    const subquery =
      "(SELECT COUNT(*) FROM ScenePerformer sp WHERE sp.sceneId = s.id)";
    const result = buildNumericFilter(
      { value: 2, modifier: "EQUALS" },
      subquery
    );
    expect(result.sql).toBe(`${subquery} = ?`);
    expect(result.params).toEqual([2]);
  });

  it("handles value of 0", () => {
    const result = buildNumericFilter({ value: 0, modifier: "EQUALS" }, col);
    expect(result.sql).toBe("COALESCE(r.rating, 0) = ?");
    expect(result.params).toEqual([0]);
  });
});

describe("buildDateFilter", () => {
  const col = "s.date";

  it("returns empty for undefined filter", () => {
    expect(buildDateFilter(undefined, col)).toEqual({ sql: "", params: [] });
  });

  it("returns empty for null filter", () => {
    expect(buildDateFilter(null, col)).toEqual({ sql: "", params: [] });
  });

  it("handles IS_NULL (no value needed)", () => {
    const result = buildDateFilter({ modifier: "IS_NULL" }, col);
    expect(result.sql).toBe("s.date IS NULL");
    expect(result.params).toEqual([]);
  });

  it("handles NOT_NULL (no value needed)", () => {
    const result = buildDateFilter({ modifier: "NOT_NULL" }, col);
    expect(result.sql).toBe("s.date IS NOT NULL");
    expect(result.params).toEqual([]);
  });

  it("handles IS_NULL even when value is null", () => {
    const result = buildDateFilter({ value: null, modifier: "IS_NULL" }, col);
    expect(result.sql).toBe("s.date IS NULL");
    expect(result.params).toEqual([]);
  });

  it("returns empty for non-null modifier without value", () => {
    const result = buildDateFilter({ modifier: "EQUALS" }, col);
    expect(result).toEqual({ sql: "", params: [] });
  });

  it("handles EQUALS", () => {
    const result = buildDateFilter(
      { value: "2024-01-15", modifier: "EQUALS" },
      col
    );
    expect(result.sql).toBe("date(s.date) = date(?)");
    expect(result.params).toEqual(["2024-01-15"]);
  });

  it("handles NOT_EQUALS", () => {
    const result = buildDateFilter(
      { value: "2024-01-15", modifier: "NOT_EQUALS" },
      col
    );
    expect(result.sql).toBe("(s.date IS NULL OR date(s.date) != date(?))");
    expect(result.params).toEqual(["2024-01-15"]);
  });

  it("handles GREATER_THAN", () => {
    const result = buildDateFilter(
      { value: "2024-01-15", modifier: "GREATER_THAN" },
      col
    );
    expect(result.sql).toBe("s.date > ?");
    expect(result.params).toEqual(["2024-01-15"]);
  });

  it("handles LESS_THAN", () => {
    const result = buildDateFilter(
      { value: "2024-01-15", modifier: "LESS_THAN" },
      col
    );
    expect(result.sql).toBe("s.date < ?");
    expect(result.params).toEqual(["2024-01-15"]);
  });

  it("handles BETWEEN with value2", () => {
    const result = buildDateFilter(
      { value: "2024-01-01", value2: "2024-12-31", modifier: "BETWEEN" },
      col
    );
    expect(result.sql).toBe("s.date BETWEEN ? AND ?");
    expect(result.params).toEqual(["2024-01-01", "2024-12-31"]);
  });

  it("handles BETWEEN without value2 (fallback to >=)", () => {
    const result = buildDateFilter(
      { value: "2024-01-01", modifier: "BETWEEN" },
      col
    );
    expect(result.sql).toBe("s.date >= ?");
    expect(result.params).toEqual(["2024-01-01"]);
  });

  it("handles NOT_BETWEEN with value2", () => {
    const result = buildDateFilter(
      { value: "2024-01-01", value2: "2024-12-31", modifier: "NOT_BETWEEN" },
      col
    );
    expect(result.sql).toBe("(s.date IS NULL OR s.date < ? OR s.date > ?)");
    expect(result.params).toEqual(["2024-01-01", "2024-12-31"]);
  });

  it("handles NOT_BETWEEN without value2 (fallback to <)", () => {
    const result = buildDateFilter(
      { value: "2024-01-01", modifier: "NOT_BETWEEN" },
      col
    );
    expect(result.sql).toBe("s.date < ?");
    expect(result.params).toEqual(["2024-01-01"]);
  });

  it("defaults to GREATER_THAN when no modifier", () => {
    const result = buildDateFilter({ value: "2024-01-15" }, col);
    expect(result.sql).toBe("s.date > ?");
    expect(result.params).toEqual(["2024-01-15"]);
  });

  it("returns empty for unknown modifier", () => {
    const result = buildDateFilter(
      { value: "2024-01-15", modifier: "UNKNOWN" },
      col
    );
    expect(result).toEqual({ sql: "", params: [] });
  });
});

describe("buildTextFilter", () => {
  const col = "p.name";

  it("returns empty for undefined filter", () => {
    expect(buildTextFilter(undefined, col)).toEqual({ sql: "", params: [] });
  });

  it("returns empty for null filter", () => {
    expect(buildTextFilter(null, col)).toEqual({ sql: "", params: [] });
  });

  it("handles IS_NULL (no value needed)", () => {
    const result = buildTextFilter({ modifier: "IS_NULL" }, col);
    expect(result.sql).toBe("(p.name IS NULL OR p.name = '')");
    expect(result.params).toEqual([]);
  });

  it("handles NOT_NULL (no value needed)", () => {
    const result = buildTextFilter({ modifier: "NOT_NULL" }, col);
    expect(result.sql).toBe("(p.name IS NOT NULL AND p.name != '')");
    expect(result.params).toEqual([]);
  });

  it("returns empty for non-null modifier without value", () => {
    const result = buildTextFilter({ modifier: "INCLUDES" }, col);
    expect(result).toEqual({ sql: "", params: [] });
  });

  it("handles INCLUDES (single column)", () => {
    const result = buildTextFilter(
      { value: "test", modifier: "INCLUDES" },
      col
    );
    expect(result.sql).toBe("(LOWER(p.name) LIKE LOWER(?))");
    expect(result.params).toEqual(["%test%"]);
  });

  it("handles EXCLUDES (single column)", () => {
    const result = buildTextFilter(
      { value: "test", modifier: "EXCLUDES" },
      col
    );
    expect(result.sql).toBe(
      "((p.name IS NULL OR LOWER(p.name) NOT LIKE LOWER(?)))"
    );
    expect(result.params).toEqual(["%test%"]);
  });

  it("handles EQUALS", () => {
    const result = buildTextFilter({ value: "exact", modifier: "EQUALS" }, col);
    expect(result.sql).toBe("LOWER(p.name) = LOWER(?)");
    expect(result.params).toEqual(["exact"]);
  });

  it("handles NOT_EQUALS", () => {
    const result = buildTextFilter(
      { value: "exact", modifier: "NOT_EQUALS" },
      col
    );
    expect(result.sql).toBe("(p.name IS NULL OR LOWER(p.name) != LOWER(?))");
    expect(result.params).toEqual(["exact"]);
  });

  it("defaults to INCLUDES when no modifier", () => {
    const result = buildTextFilter({ value: "test" }, col);
    expect(result.sql).toBe("(LOWER(p.name) LIKE LOWER(?))");
    expect(result.params).toEqual(["%test%"]);
  });

  it("returns empty for unknown modifier", () => {
    const result = buildTextFilter({ value: "test", modifier: "UNKNOWN" }, col);
    expect(result).toEqual({ sql: "", params: [] });
  });

  // Multi-column tests (additionalColumns parameter)
  it("handles INCLUDES with additionalColumns", () => {
    const result = buildTextFilter(
      { value: "test", modifier: "INCLUDES" },
      "p.name",
      ["p.disambiguation", "p.aliasList"]
    );
    expect(result.sql).toBe(
      "(LOWER(p.name) LIKE LOWER(?) OR LOWER(p.disambiguation) LIKE LOWER(?) OR LOWER(p.aliasList) LIKE LOWER(?))"
    );
    expect(result.params).toEqual(["%test%", "%test%", "%test%"]);
  });

  it("handles EXCLUDES with additionalColumns", () => {
    const result = buildTextFilter(
      { value: "test", modifier: "EXCLUDES" },
      "p.name",
      ["p.aliasList"]
    );
    expect(result.sql).toBe(
      "((p.name IS NULL OR LOWER(p.name) NOT LIKE LOWER(?)) AND (p.aliasList IS NULL OR LOWER(p.aliasList) NOT LIKE LOWER(?)))"
    );
    expect(result.params).toEqual(["%test%", "%test%"]);
  });

  it("EQUALS only uses primary column even with additionalColumns", () => {
    const result = buildTextFilter(
      { value: "exact", modifier: "EQUALS" },
      "p.name",
      ["p.aliasList"]
    );
    expect(result.sql).toBe("LOWER(p.name) = LOWER(?)");
    expect(result.params).toEqual(["exact"]);
  });

  it("IS_NULL only checks primary column", () => {
    const result = buildTextFilter({ modifier: "IS_NULL" }, "p.name", [
      "p.aliasList",
    ]);
    expect(result.sql).toBe("(p.name IS NULL OR p.name = '')");
    expect(result.params).toEqual([]);
  });
});

describe("buildFavoriteFilter", () => {
  it("returns empty for undefined", () => {
    expect(buildFavoriteFilter(undefined)).toEqual({ sql: "", params: [] });
  });

  it("handles true (favorites only)", () => {
    const result = buildFavoriteFilter(true);
    expect(result.sql).toBe("r.favorite = 1");
    expect(result.params).toEqual([]);
  });

  it("handles false (non-favorites)", () => {
    const result = buildFavoriteFilter(false);
    expect(result.sql).toBe("(r.favorite = 0 OR r.favorite IS NULL)");
    expect(result.params).toEqual([]);
  });
});

describe("buildEpochDateFilter", () => {
  const col = "w.lastPlayedAt";
  const day = Date.UTC(2026, 8, 25);
  const next = day + 86_400_000;

  it("binds GREATER_THAN and LESS_THAN as epoch milliseconds", () => {
    expect(
      buildEpochDateFilter(
        { modifier: "GREATER_THAN", value: "2026-09-25" },
        col
      )
    ).toEqual({ sql: "w.lastPlayedAt > ?", params: [day] });
    expect(
      buildEpochDateFilter({ modifier: "LESS_THAN", value: "2026-09-25" }, col)
    ).toEqual({ sql: "w.lastPlayedAt < ?", params: [day] });
  });

  it("EQUALS is the UTC day, NOT_EQUALS its complement", () => {
    expect(
      buildEpochDateFilter({ modifier: "EQUALS", value: "2026-09-25" }, col)
        .params
    ).toEqual([day, next]);
    const not = buildEpochDateFilter(
      { modifier: "NOT_EQUALS", value: "2026-09-25" },
      col
    );
    expect(not.sql).toContain("IS NULL");
    expect(not.params).toEqual([day, next]);
  });

  it("BETWEEN includes the last day", () => {
    expect(
      buildEpochDateFilter(
        { modifier: "BETWEEN", value: "2026-09-20", value2: "2026-09-25" },
        col
      ).params
    ).toEqual([Date.UTC(2026, 8, 20), next]);
    expect(
      buildEpochDateFilter(
        { modifier: "NOT_BETWEEN", value: "2026-09-20", value2: "2026-09-25" },
        col
      ).params
    ).toEqual([Date.UTC(2026, 8, 20), next]);
  });

  it("an ISO date-time is the instant", () => {
    const at = Date.parse("2026-09-25T12:00:00Z");
    expect(
      buildEpochDateFilter(
        { modifier: "GREATER_THAN", value: "2026-09-25T12:00:00Z" },
        col
      ).params
    ).toEqual([at]);
  });

  it("IS_NULL and NOT_NULL bind nothing; an unparsable value is no clause", () => {
    expect(buildEpochDateFilter({ modifier: "IS_NULL" }, col)).toEqual({
      sql: "w.lastPlayedAt IS NULL",
      params: [],
    });
    expect(buildEpochDateFilter({ modifier: "NOT_NULL" }, col).params).toEqual(
      []
    );
    expect(
      buildEpochDateFilter({ modifier: "EQUALS", value: "nope" }, col)
    ).toEqual({ sql: "", params: [] });
  });
});

describe("buildEpochDateFilter edge values", () => {
  const COL = "w.lastPlayedAt";
  const DAY = 86_400_000;
  const day1 = Date.parse("2026-03-01");
  const day2 = Date.parse("2026-03-05");

  it("an EQUALS date-only value binds its whole UTC day as epoch milliseconds", () => {
    expect(
      buildEpochDateFilter({ value: "2026-03-01", modifier: "EQUALS" }, COL)
    ).toEqual({
      sql: `(${COL} >= ? AND ${COL} < ?)`,
      params: [day1, day1 + DAY],
    });
  });

  it("a NOT_EQUALS date-only value keeps unplayed rows and rows outside the day", () => {
    expect(
      buildEpochDateFilter({ value: "2026-03-01", modifier: "NOT_EQUALS" }, COL)
    ).toEqual({
      sql: `(${COL} IS NULL OR ${COL} < ? OR ${COL} >= ?)`,
      params: [day1, day1 + DAY],
    });
  });

  it("a BETWEEN last-played filter binds both bounds as epoch milliseconds, the end day included", () => {
    expect(
      buildEpochDateFilter(
        { value: "2026-03-01", value2: "2026-03-05", modifier: "BETWEEN" },
        COL
      )
    ).toEqual({
      sql: `(${COL} >= ? AND ${COL} < ?)`,
      params: [day1, day2 + DAY],
    });
  });

  it("a BETWEEN without a second date is a lower bound only", () => {
    expect(
      buildEpochDateFilter({ value: "2026-03-01", modifier: "BETWEEN" }, COL)
    ).toEqual({ sql: `${COL} >= ?`, params: [day1] });
  });

  it("a NOT_BETWEEN filter keeps unplayed rows and rows outside both bounds", () => {
    expect(
      buildEpochDateFilter(
        { value: "2026-03-01", value2: "2026-03-05", modifier: "NOT_BETWEEN" },
        COL
      )
    ).toEqual({
      sql: `(${COL} IS NULL OR ${COL} < ? OR ${COL} >= ?)`,
      params: [day1, day2 + DAY],
    });
  });

  it("a NOT_BETWEEN without a second date is an upper bound only", () => {
    expect(
      buildEpochDateFilter(
        { value: "2026-03-01", modifier: "NOT_BETWEEN" },
        COL
      )
    ).toEqual({ sql: `${COL} < ?`, params: [day1] });
  });

  it("an ISO date-time is the instant, not a day", () => {
    const at = Date.parse("2026-03-01T10:00:00Z");
    expect(
      buildEpochDateFilter(
        { value: "2026-03-01T10:00:00Z", modifier: "EQUALS" },
        COL
      ).params
    ).toEqual([at, at + 1]);
  });

  it("an unparsable date, an unknown modifier or a null modifier adds no clause", () => {
    expect(
      buildEpochDateFilter({ value: "not a date", modifier: "EQUALS" }, COL)
    ).toEqual({ sql: "", params: [] });
    expect(
      buildEpochDateFilter({ value: "2026-03-01", modifier: "WHATEVER" }, COL)
    ).toEqual({ sql: "", params: [] });
    expect(
      buildEpochDateFilter({ value: "2026-03-01", modifier: null }, COL)
    ).toEqual({ sql: "", params: [] });
  });

  it("no filter adds no clause, and a filter without a modifier is a GREATER_THAN", () => {
    expect(buildEpochDateFilter(undefined, COL)).toEqual({
      sql: "",
      params: [],
    });
    expect(buildEpochDateFilter(null, COL)).toEqual({ sql: "", params: [] });
    expect(buildEpochDateFilter({ value: "2026-03-01" }, COL)).toEqual({
      sql: `${COL} > ?`,
      params: [day1],
    });
  });

  it("a LESS_THAN date binds the start of its day", () => {
    expect(
      buildEpochDateFilter({ value: "2026-03-01", modifier: "LESS_THAN" }, COL)
    ).toEqual({ sql: `${COL} < ?`, params: [day1] });
  });

  it("an IS_NULL or NOT_NULL modifier needs no date", () => {
    expect(buildEpochDateFilter({ modifier: "IS_NULL" }, COL).sql).toBe(
      `${COL} IS NULL`
    );
    expect(buildEpochDateFilter({ modifier: "NOT_NULL" }, COL).sql).toBe(
      `${COL} IS NOT NULL`
    );
  });
});
