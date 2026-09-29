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
  combine,
  idClause,
  instanceClause,
  pairs,
  randomOrder,
  refClause,
  specificInstanceClause,
  viaSceneClause,
} from "../../utils/sqlClauses.js";

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

  it("an inherited JSON list adds one json_each arm for all the refs, each bound with the parent's instance", () => {
    const clause = refClause(SCENE_TAGS, [ref("1"), bare("2")], "INCLUDES", {
      ...OPTS,
      inheritedJson: "inheritedTagIds",
    });

    expect(clause.sql).toBe(
      `(${TAG_EXISTS}(st.tagId = ? AND st.tagInstanceId = ?) OR (st.tagId = ?))) OR EXISTS (SELECT 1 FROM json_each(s.inheritedTagIds) je WHERE (je.value = ? AND s.stashInstanceId = ?) OR (je.value = ?)))`
    );
    expect(clause.params).toEqual(["1", "inst-a", "2", "1", "inst-a", "2"]);
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
      inheritedJson: "inheritedTagIds",
    });
    expect(inline.ctes).toBeUndefined();
    // Each ref binds its id and instance in the direct arm and the inherited arm
    expect(inline.params).toHaveLength(PAIR_INLINE_LIMIT * 4);

    const refs = many(PAIR_INLINE_LIMIT + 1);
    const large = refClause(SCENE_TAGS, refs, "INCLUDES", {
      ...OPTS,
      inheritedJson: "inheritedTagIds",
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
        sql: "tags_matched(id, inst) AS MATERIALIZED (SELECT st.sceneId, st.sceneInstanceId FROM tags_refs r CROSS JOIN SceneTag st ON st.tagId = r.id AND st.tagInstanceId = r.inst UNION SELECT x.id, x.stashInstanceId FROM StashScene x, json_each(x.inheritedTagIds) je WHERE x.deletedAt IS NULL AND (je.value, x.stashInstanceId) IN (SELECT id, inst FROM tags_refs))",
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
