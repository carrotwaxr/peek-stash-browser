/**
 * Unit tests for the shared SQL clause helpers (items 34a and 74).
 *
 * Every ref is matched as an (id, instance) pair, and a bare ref matches
 * that id on every instance. A ref set up to PAIR_INLINE_LIMIT is bound
 * inline as OR-ed pairs; above it the refs travel as one JSON parameter into
 * a materialized set that the entity is matched against, never as a
 * `NOT IN (subquery)`.
 */
import type { Resolution } from "@peek/shared-types/filters/index.js";
import { RESOLUTIONS } from "@peek/shared-types/filters/index.js";
import { afterAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import type { DateCriterion, FilterRef } from "../../types/parsedFilters.js";
import {
  type JunctionTarget,
  PAIR_INLINE_LIMIT,
  RESOLUTION_RANGES,
  type ViaSceneSpec,
  ageYearsSql,
  anyOf,
  buildDayFilter,
  buildFavoriteFilter,
  buildInstantFilter,
  buildNumericFilter,
  buildTextFilter,
  combine,
  countForms,
  exclusionJoin,
  fullDateSql,
  galleryNameSql,
  idClause,
  imageNameSql,
  instanceClause,
  instanceColumnClause,
  orientationClause,
  pairs,
  performerAgeExists,
  performerCountClause,
  performerTagsClause,
  performerTagsFieldClause,
  randomOrder,
  refClause,
  refPresenceClause,
  resolutionClause,
  searchAll,
  specificInstanceClause,
  viaSceneClause,
} from "../../utils/sqlClauses.js";
import { jsonListOrEmpty } from "../../utils/sqlJson.js";
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

/** A viewer whose exclusions apply, and a read that applies none */
const VIEWER = { userId: 7, applyExclusions: true };
const NO_EXCLUSIONS = { userId: 7, applyExclusions: false };

/** Performers sharing a scene with one of the performers ("appears with") */
const PERFORMERS_BY_PERFORMER: ViaSceneSpec = {
  ...PERFORMERS_BY_GROUP,
  via: {
    table: "ScenePerformer",
    alias: "spw",
    sceneIdCol: "sceneId",
    sceneInstanceCol: "sceneInstanceId",
    refIdCol: "performerId",
    refInstanceCol: "performerInstanceId",
    related: { table: "StashPerformer", entityType: "performer" },
  },
  where:
    "NOT (spw.performerId = sp.performerId AND spw.performerInstanceId = sp.performerInstanceId)",
};

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
      "INCLUDES",
      NO_EXCLUSIONS
    );

    expect(clause).toEqual({
      sql: `${GROUP_BY_SCENE_EXISTS}(sg.sceneId = ? AND sg.sceneInstanceId = ?) OR (sg.sceneId = ?) OR (sg.sceneId = ? AND sg.sceneInstanceId = ?)))`,
      params: ["5", "inst-a", "7", "9", "inst-b"],
    });
  });

  it("EXCLUDES emits NOT EXISTS", () => {
    const clause = viaSceneClause(
      GROUPS_BY_SCENE,
      [ref("5")],
      "EXCLUDES",
      NO_EXCLUSIONS
    );

    expect(clause).toEqual({
      sql: `NOT ${GROUP_BY_SCENE_EXISTS}(sg.sceneId = ? AND sg.sceneInstanceId = ?)))`,
      params: ["5", "inst-a"],
    });
  });

  it("INCLUDES_ALL emits one EXISTS per ref, AND-ed", () => {
    const clause = viaSceneClause(
      GROUPS_BY_SCENE,
      [ref("5"), bare("7")],
      "INCLUDES_ALL",
      NO_EXCLUSIONS
    );

    expect(clause).toEqual({
      sql: `(${GROUP_BY_SCENE_EXISTS}(sg.sceneId = ? AND sg.sceneInstanceId = ?))) AND ${GROUP_BY_SCENE_EXISTS}(sg.sceneId = ?))))`,
      params: ["5", "inst-a", "7"],
    });
  });

  it("the via form's INCLUDES is a row-value IN driven from the ref: the via table, the junction on the scene, the live scene", () => {
    const clause = viaSceneClause(
      PERFORMERS_BY_GROUP,
      [ref("3")],
      "INCLUDES",
      NO_EXCLUSIONS
    );

    expect(clause).toEqual({
      sql: `(p.id, p.stashInstanceId) IN (SELECT sp.performerId, sp.performerInstanceId FROM SceneGroup sg JOIN ScenePerformer sp ON sp.sceneId = sg.sceneId AND sp.sceneInstanceId = sg.sceneInstanceId ${LIVE_SCENE_OF_SG} WHERE lsc.deletedAt IS NULL AND ((sg.groupId = ? AND sg.groupInstanceId = ?)))`,
      params: ["3", "inst-a"],
    });
  });

  it("the via form's INCLUDES_ALL is one row-value IN per ref, AND-ed", () => {
    const clause = viaSceneClause(
      PERFORMERS_BY_GROUP,
      [ref("3"), ref("4")],
      "INCLUDES_ALL",
      NO_EXCLUSIONS
    );

    expect(
      clause.sql.match(/\(p\.id, p\.stashInstanceId\) IN \(/g)
    ).toHaveLength(2);
    expect(clause.sql).toMatch(/^\(.* AND .*\)$/s);
    expect(clause.sql).not.toContain("EXISTS");
    expect(clause.params).toEqual(["3", "inst-a", "4", "inst-a"]);
  });

  it("the via form's EXCLUDES stays a keyed NOT EXISTS, never NOT IN, on live scenes", () => {
    const clause = viaSceneClause(
      PERFORMERS_BY_GROUP,
      [ref("3")],
      "EXCLUDES",
      NO_EXCLUSIONS
    );

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
      "INCLUDES",
      NO_EXCLUSIONS
    );

    expect(clause.sql).toBe(
      "(p.id, p.stashInstanceId) IN (SELECT sp.performerId, sp.performerInstanceId FROM StashScene sc JOIN ScenePerformer sp ON sp.sceneId = sc.id AND sp.sceneInstanceId = sc.stashInstanceId WHERE sc.deletedAt IS NULL AND sc.organized = 1 AND ((sc.studioId = ? AND sc.stashInstanceId = ?)))"
    );
    expect(clause.sql.match(/StashScene/g)).toHaveLength(1);
  });

  it("is empty with no refs or an unknown modifier", () => {
    expect(viaSceneClause(GROUPS_BY_SCENE, [], "INCLUDES", VIEWER)).toEqual({
      sql: "",
      params: [],
    });
    expect(
      viaSceneClause(GROUPS_BY_SCENE, [ref("5")], "EQUALS", VIEWER)
    ).toEqual({
      sql: "",
      params: [],
    });
  });
});

describe("viaSceneClause with the viewer's exclusions", () => {
  const SCENE_HIDDEN_LSC = exclusionJoin(
    "vse",
    "scene",
    "lsc.id",
    "lsc.stashInstanceId"
  );

  it("the scene-keyed EXISTS anti-joins the scene's exclusion rows under vse, the every-instance ('') arm included, binding the viewer first", () => {
    const clause = viaSceneClause(
      GROUPS_BY_SCENE,
      [ref("5")],
      "INCLUDES",
      VIEWER
    );

    expect(clause).toEqual({
      sql: `EXISTS (SELECT 1 FROM SceneGroup sg ${LIVE_SCENE_OF_SG} ${SCENE_HIDDEN_LSC} WHERE sg.groupId = g.id AND sg.groupInstanceId = g.stashInstanceId AND lsc.deletedAt IS NULL AND vse.id IS NULL AND ((sg.sceneId = ? AND sg.sceneInstanceId = ?)))`,
      params: [7, "5", "inst-a"],
    });
    expect(clause.sql).toContain("vse.instanceId = ''");
  });

  it("EXCLUDES keeps the anti-join inside its NOT EXISTS, so a hidden scene excludes nothing", () => {
    const clause = viaSceneClause(
      GROUPS_BY_SCENE,
      [ref("5")],
      "EXCLUDES",
      VIEWER
    );

    expect(clause.sql).toBe(
      `NOT EXISTS (SELECT 1 FROM SceneGroup sg ${LIVE_SCENE_OF_SG} ${SCENE_HIDDEN_LSC} WHERE sg.groupId = g.id AND sg.groupInstanceId = g.stashInstanceId AND lsc.deletedAt IS NULL AND vse.id IS NULL AND ((sg.sceneId = ? AND sg.sceneInstanceId = ?)))`
    );
    expect(clause.params).toEqual([7, "5", "inst-a"]);
  });

  it("the via form's row-value IN anti-joins the live scene", () => {
    const clause = viaSceneClause(
      PERFORMERS_BY_GROUP,
      [ref("3")],
      "INCLUDES",
      VIEWER
    );

    expect(clause).toEqual({
      sql: `(p.id, p.stashInstanceId) IN (SELECT sp.performerId, sp.performerInstanceId FROM SceneGroup sg JOIN ScenePerformer sp ON sp.sceneId = sg.sceneId AND sp.sceneInstanceId = sg.sceneInstanceId ${LIVE_SCENE_OF_SG} ${SCENE_HIDDEN_LSC} WHERE lsc.deletedAt IS NULL AND vse.id IS NULL AND ((sg.groupId = ? AND sg.groupInstanceId = ?)))`,
      params: [7, "3", "inst-a"],
    });
  });

  it("a via that is the scene table anti-joins that row", () => {
    const clause = viaSceneClause(
      PERFORMERS_BY_STUDIO,
      [ref("4")],
      "INCLUDES",
      VIEWER
    );

    expect(clause.sql).toBe(
      `(p.id, p.stashInstanceId) IN (SELECT sp.performerId, sp.performerInstanceId FROM StashScene sc JOIN ScenePerformer sp ON sp.sceneId = sc.id AND sp.sceneInstanceId = sc.stashInstanceId ${exclusionJoin("vse", "scene", "sc.id", "sc.stashInstanceId")} WHERE sc.deletedAt IS NULL AND vse.id IS NULL AND ((sc.studioId = ? AND sc.stashInstanceId = ?)))`
    );
    expect(clause.params).toEqual([7, "4", "inst-a"]);
  });

  it("INCLUDES_ALL binds the viewer once per ref's clause", () => {
    const clause = viaSceneClause(
      PERFORMERS_BY_GROUP,
      [ref("3"), ref("4")],
      "INCLUDES_ALL",
      VIEWER
    );

    expect(clause.sql.match(/vse\.id IS NULL/g)).toHaveLength(2);
    expect(clause.params).toEqual([7, "3", "inst-a", 7, "4", "inst-a"]);
  });

  it("never names the outer statement's exclusion alias `e`", () => {
    for (const modifier of ["INCLUDES", "EXCLUDES", "INCLUDES_ALL"]) {
      for (const spec of [
        GROUPS_BY_SCENE,
        PERFORMERS_BY_GROUP,
        PERFORMERS_BY_STUDIO,
      ]) {
        const { sql } = viaSceneClause(
          spec,
          [ref("3"), ref("4")],
          modifier,
          VIEWER
        );
        expect(sql).not.toMatch(/UserExcludedEntity e\b/);
        expect(sql).not.toMatch(/\be\.id IS NULL/);
      }
    }
  });

  it("a via with a related table counts its row only when the ref is live and not excluded, after the scene's guard", () => {
    const clause = viaSceneClause(
      PERFORMERS_BY_PERFORMER,
      [ref("3")],
      "INCLUDES",
      VIEWER
    );

    expect(clause).toEqual({
      sql: `(p.id, p.stashInstanceId) IN (SELECT sp.performerId, sp.performerInstanceId FROM ScenePerformer spw JOIN ScenePerformer sp ON sp.sceneId = spw.sceneId AND sp.sceneInstanceId = spw.sceneInstanceId JOIN StashScene lsc ON lsc.id = spw.sceneId AND lsc.stashInstanceId = spw.sceneInstanceId ${SCENE_HIDDEN_LSC} JOIN StashPerformer vr ON vr.id = spw.performerId AND vr.stashInstanceId = spw.performerInstanceId ${exclusionJoin("vre", "performer", "vr.id", "vr.stashInstanceId")} WHERE lsc.deletedAt IS NULL AND vse.id IS NULL AND vr.deletedAt IS NULL AND vre.id IS NULL AND NOT (spw.performerId = sp.performerId AND spw.performerInstanceId = sp.performerInstanceId) AND ((spw.performerId = ? AND spw.performerInstanceId = ?)))`,
      params: [7, 7, "3", "inst-a"],
    });
  });

  it("without the viewer's exclusions a related ref still has to be live, and nothing is bound", () => {
    const clause = viaSceneClause(
      PERFORMERS_BY_PERFORMER,
      [ref("3")],
      "EXCLUDES",
      NO_EXCLUSIONS
    );

    expect(clause.sql).toContain(
      "JOIN StashPerformer vr ON vr.id = spw.performerId AND vr.stashInstanceId = spw.performerInstanceId WHERE"
    );
    expect(clause.sql).toContain("vr.deletedAt IS NULL");
    expect(clause.sql).not.toContain("UserExcludedEntity");
    expect(clause.params).toEqual(["3", "inst-a"]);
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

  describe("a junction whose parent key is another row's columns (parentKey)", () => {
    // A clip's scene: the junction rows are matched on the clip's own
    // (sceneId, sceneInstanceId), so no shape needs the scene row first
    const KEY = { parentKey: ["c.sceneId", "c.sceneInstanceId"] } as const;
    const TAGS: JunctionTarget = { ...SCENE_TAGS, ...KEY };
    const INHERITED: JunctionTarget = { ...SCENE_INHERITED_TAGS, ...KEY };
    const opts = { ...OPTS, inheritedJunction: INHERITED };

    it("the EXISTS and NOT EXISTS match the key's columns", () => {
      const includes = refClause(TAGS, [ref("5")], "INCLUDES", opts);
      expect(includes.sql).toBe(
        "(EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = c.sceneId AND st.sceneInstanceId = c.sceneInstanceId AND ((st.tagId = ? AND st.tagInstanceId = ?))) OR EXISTS (SELECT 1 FROM SceneInheritedTag sit WHERE sit.sceneId = c.sceneId AND sit.sceneInstanceId = c.sceneInstanceId AND ((sit.tagId = ? AND sit.tagInstanceId = ?))))"
      );
      expect(refClause(TAGS, [ref("5")], "EXCLUDES", opts).sql).toBe(
        `NOT ${includes.sql}`
      );
    });

    it("the list read whole matches the key as a row value", () => {
      expect(
        refClause(TAGS, [ref("5")], "INCLUDES", {
          ...opts,
          sortedByIndex: false,
        }).sql
      ).toBe(
        "(c.sceneId, c.sceneInstanceId) IN (SELECT st.sceneId, st.sceneInstanceId FROM SceneTag st WHERE ((st.tagId = ? AND st.tagInstanceId = ?)) UNION ALL SELECT sit.sceneId, sit.sceneInstanceId FROM SceneInheritedTag sit WHERE ((sit.tagId = ? AND sit.tagInstanceId = ?)))"
      );
    });

    it("above the inline limit the refs list and the matched set match the key", () => {
      expect(
        refClause(TAGS, many(65), "INCLUDES", { ...opts, sortedByIndex: true })
          .sql
      ).toBe(
        "(c.sceneId, c.sceneInstanceId) IN (SELECT st.sceneId, st.sceneInstanceId FROM tags_refs r CROSS JOIN SceneTag st ON st.tagId = r.id AND st.tagInstanceId = r.inst UNION ALL SELECT sit.sceneId, sit.sceneInstanceId FROM tags_refs r CROSS JOIN SceneInheritedTag sit ON sit.tagId = r.id AND sit.tagInstanceId = r.inst)"
      );
      expect(refClause(TAGS, many(65), "INCLUDES", opts).sql).toBe(
        "(c.sceneId, c.sceneInstanceId) IN (SELECT id, inst FROM tags_matched)"
      );
      expect(refClause(TAGS, many(65), "EXCLUDES", opts).sql).toBe(
        "(c.sceneId || ':' || c.sceneInstanceId) NOT IN (SELECT id || ':' || inst FROM tags_matched)"
      );
    });
  });

  it("is empty with no refs", () => {
    expect(refClause(SCENE_TAGS, [], "INCLUDES", OPTS)).toEqual({
      sql: "",
      params: [],
    });
  });
});

describe("refPresenceClause", () => {
  const SCENE_PERFORMERS: JunctionTarget = {
    kind: "junction",
    table: "ScenePerformer",
    alias: "sp",
    parentAlias: "s",
    parentIdCol: "sceneId",
    parentInstanceCol: "sceneInstanceId",
    refIdCol: "performerId",
    refInstanceCol: "performerInstanceId",
  };
  const SP_KEYED =
    "sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId";

  it("presence on a junction: IS_NULL is a keyed NOT EXISTS, NOT_NULL its EXISTS", () => {
    const exists = `EXISTS (SELECT 1 FROM ScenePerformer sp WHERE ${SP_KEYED})`;

    expect(refPresenceClause(SCENE_PERFORMERS, false)).toEqual({
      sql: `NOT ${exists}`,
      params: [],
    });
    expect(refPresenceClause(SCENE_PERFORMERS, true)).toEqual({
      sql: exists,
      params: [],
    });
  });

  it("presence on a column is the column's IS NULL or IS NOT NULL", () => {
    const studio = {
      kind: "column",
      parentTable: "StashScene",
      parentAlias: "s",
      idCol: "studioId",
      instanceCol: "stashInstanceId",
    } as const;

    expect(refPresenceClause(studio, false)).toEqual({
      sql: "(s.studioId IS NULL)",
      params: [],
    });
    expect(refPresenceClause(studio, true)).toEqual({
      sql: "(s.studioId IS NOT NULL)",
      params: [],
    });
  });

  it("with an inherited junction both arms: none in either, or any in one", () => {
    const own =
      "EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId)";
    const inherited =
      "EXISTS (SELECT 1 FROM SceneInheritedTag sit WHERE sit.sceneId = s.id AND sit.sceneInstanceId = s.stashInstanceId)";
    const opts = { inheritedJunction: SCENE_INHERITED_TAGS };

    expect(refPresenceClause(SCENE_TAGS, false, opts)).toEqual({
      sql: `(NOT ${own} AND NOT ${inherited})`,
      params: [],
    });
    expect(refPresenceClause(SCENE_TAGS, true, opts)).toEqual({
      sql: `(${own} OR ${inherited})`,
      params: [],
    });
  });

  it("a live ref counts only live related rows the viewer has not excluded, on the row's instance or every one", () => {
    const clause = refPresenceClause(SCENE_PERFORMERS, true, {
      liveRef: { table: "StashPerformer", entityType: "performer", userId: 9 },
    });

    expect(clause).toEqual({
      sql: `EXISTS (SELECT 1 FROM ScenePerformer sp JOIN StashPerformer sp_ref ON sp_ref.id = sp.performerId AND sp_ref.stashInstanceId = sp.performerInstanceId ${exclusionJoin("sp_x", "performer", "sp.performerId", "sp.performerInstanceId")} WHERE ${SP_KEYED} AND sp_ref.deletedAt IS NULL AND sp_x.id IS NULL)`,
      params: [9],
    });
    expect(clause.sql).toContain("sp_x.instanceId = ''");
    expect(clause.sql).not.toMatch(/\be\./);
  });

  it("a live ref without exclusions (null user) checks only deletedAt", () => {
    expect(
      refPresenceClause(SCENE_PERFORMERS, false, {
        liveRef: {
          table: "StashPerformer",
          entityType: "performer",
          userId: null,
        },
      })
    ).toEqual({
      sql: `NOT EXISTS (SELECT 1 FROM ScenePerformer sp JOIN StashPerformer sp_ref ON sp_ref.id = sp.performerId AND sp_ref.stashInstanceId = sp.performerInstanceId WHERE ${SP_KEYED} AND sp_ref.deletedAt IS NULL)`,
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

  it("combine refuses two CTEs with one name", () => {
    const cte = {
      name: "tags_refs",
      sql: "tags_refs(id) AS (SELECT ?)",
      params: ["x"],
    };

    expect(() =>
      combine([
        { sql: "a = 1", params: [], ctes: [cte] },
        { sql: "b = 1", params: [], ctes: [cte] },
      ])
    ).toThrow("Duplicate CTE name tags_refs");
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

// The per-field clauses

describe("buildNumericFilter", () => {
  const col = "r.rating";

  it("handles EQUALS", () => {
    const result = buildNumericFilter({ value: 80, modifier: "EQUALS" }, col);
    expect(result.sql).toBe("r.rating = ?");
    expect(result.params).toEqual([80]);
  });

  it("NOT_EQUALS leaves out a row without a value (NULL != ? is not true)", () => {
    const result = buildNumericFilter(
      { value: 80, modifier: "NOT_EQUALS" },
      col
    );
    expect(result.sql).toBe("r.rating != ?");
    expect(result.params).toEqual([80]);
  });

  it("handles GREATER_THAN", () => {
    const result = buildNumericFilter(
      { value: 50, modifier: "GREATER_THAN" },
      col
    );
    expect(result.sql).toBe("r.rating > ?");
    expect(result.params).toEqual([50]);
  });

  it("handles LESS_THAN", () => {
    const result = buildNumericFilter(
      { value: 50, modifier: "LESS_THAN" },
      col
    );
    expect(result.sql).toBe("r.rating < ?");
    expect(result.params).toEqual([50]);
  });

  it("handles BETWEEN with both sides", () => {
    const result = buildNumericFilter(
      { value: 20, value2: 80, modifier: "BETWEEN" },
      col
    );
    expect(result.sql).toBe("r.rating BETWEEN ? AND ?");
    expect(result.params).toEqual([20, 80]);
  });

  it("NOT_BETWEEN is NOT BETWEEN, which leaves out a row without a value", () => {
    const result = buildNumericFilter(
      { value: 20, value2: 80, modifier: "NOT_BETWEEN" },
      col
    );
    expect(result.sql).toBe("r.rating NOT BETWEEN ? AND ?");
    expect(result.params).toEqual([20, 80]);
  });

  it("BETWEEN with neither side filters nothing", () => {
    expect(
      buildNumericFilter(
        { modifier: "BETWEEN", value: undefined, value2: undefined },
        col
      )
    ).toEqual({ sql: "", params: [] });
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
    expect(result.sql).toBe("r.rating = ?");
    expect(result.params).toEqual([0]);
  });

  it("IS_NULL and NOT_NULL need no value", () => {
    expect(buildNumericFilter({ modifier: "IS_NULL" }, "r.rating")).toEqual({
      sql: "r.rating IS NULL",
      params: [],
    });
    expect(buildNumericFilter({ modifier: "NOT_NULL" }, "r.rating")).toEqual({
      sql: "r.rating IS NOT NULL",
      params: [],
    });
  });

  it("BETWEEN with only value is at least it", () => {
    expect(
      buildNumericFilter(
        { modifier: "BETWEEN", value: 20, value2: undefined },
        "r.rating"
      )
    ).toEqual({ sql: "r.rating >= ?", params: [20] });
  });

  it("BETWEEN with only value2 is at most it", () => {
    expect(
      buildNumericFilter(
        { modifier: "BETWEEN", value: undefined, value2: 40 },
        "r.rating"
      )
    ).toEqual({ sql: "r.rating <= ?", params: [40] });
  });
});

describe("buildDayFilter", () => {
  const col = "s.date";
  const d = `substr(${fullDateSql(col)}, 1, 10)`;

  it("IS_NULL and NOT_NULL read the column and bind nothing", () => {
    expect(buildDayFilter({ modifier: "IS_NULL" }, col)).toEqual({
      sql: "s.date IS NULL",
      params: [],
    });
    expect(buildDayFilter({ modifier: "NOT_NULL" }, col)).toEqual({
      sql: "s.date IS NOT NULL",
      params: [],
    });
  });

  it("EQUALS is the day, GREATER_THAN after it, LESS_THAN before it", () => {
    expect(
      buildDayFilter({ modifier: "EQUALS", value: "2024-01-15" }, col)
    ).toEqual({ sql: `${d} = ?`, params: ["2024-01-15"] });
    expect(
      buildDayFilter({ modifier: "GREATER_THAN", value: "2024-01-15" }, col)
    ).toEqual({ sql: `${d} > ?`, params: ["2024-01-15"] });
    expect(
      buildDayFilter({ modifier: "LESS_THAN", value: "2024-01-15" }, col)
    ).toEqual({ sql: `${d} < ?`, params: ["2024-01-15"] });
  });

  it("NOT_EQUALS has no IS NULL arm: a row without a date never matches", () => {
    const clause = buildDayFilter(
      { modifier: "NOT_EQUALS", value: "2024-01-15" },
      col
    );
    expect(clause).toEqual({ sql: `${d} != ?`, params: ["2024-01-15"] });
    expect(clause.sql).not.toContain("IS NULL");
  });

  it("BETWEEN includes both days, and either side alone is open-ended", () => {
    expect(
      buildDayFilter(
        { modifier: "BETWEEN", value: "2024-01-01", value2: "2024-12-31" },
        col
      )
    ).toEqual({
      sql: `(${d} >= ? AND ${d} <= ?)`,
      params: ["2024-01-01", "2024-12-31"],
    });
    expect(
      buildDayFilter(
        { modifier: "BETWEEN", value: "2024-01-01", value2: undefined },
        col
      )
    ).toEqual({ sql: `${d} >= ?`, params: ["2024-01-01"] });
    expect(
      buildDayFilter(
        { modifier: "BETWEEN", value: undefined, value2: "2024-12-31" },
        col
      )
    ).toEqual({ sql: `${d} <= ?`, params: ["2024-12-31"] });
  });

  it("NOT_BETWEEN is outside both days, with no IS NULL arm", () => {
    expect(
      buildDayFilter(
        { modifier: "NOT_BETWEEN", value: "2024-01-01", value2: "2024-12-31" },
        col
      )
    ).toEqual({
      sql: `(${d} < ? OR ${d} > ?)`,
      params: ["2024-01-01", "2024-12-31"],
    });
  });

  it("a date-time value is its day as written", () => {
    expect(
      buildDayFilter(
        { modifier: "EQUALS", value: "2024-01-15T23:30:00-06:00" },
        col
      ).params
    ).toEqual(["2024-01-15"]);
  });
});

/** Whether a text date column holding `date` matches the criterion, on SQLite */
async function dayFilterMatches(
  criterion: DateCriterion,
  date: string | null
): Promise<boolean> {
  const clause = buildDayFilter(criterion, "x.date");
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM (SELECT ? AS date) x WHERE ${clause.sql}`,
    date,
    ...clause.params
  );
  return Number(must(rows[0]).n) === 1;
}

describe("buildDayFilter on partial dates, run on SQLite", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("a `YYYY` or `YYYY-MM` date is its first day", async () => {
    const jan1: DateCriterion = {
      modifier: "BETWEEN",
      value: "1995-01-01",
      value2: "1995-01-01",
    };
    expect(await dayFilterMatches(jan1, "1995")).toBe(true);
    expect(await dayFilterMatches(jan1, "1995-06")).toBe(false);
    expect(
      await dayFilterMatches(
        { modifier: "EQUALS", value: "1995-06-01" },
        "1995-06"
      )
    ).toBe(true);
    expect(
      await dayFilterMatches(
        { modifier: "GREATER_THAN", value: "1994-12-31" },
        "1995"
      )
    ).toBe(true);
  });

  it("a range includes its last day; a row without a date matches no comparison", async () => {
    const range: DateCriterion = {
      modifier: "BETWEEN",
      value: "2024-01-01",
      value2: "2024-01-31",
    };
    expect(await dayFilterMatches(range, "2024-01-31")).toBe(true);
    expect(await dayFilterMatches(range, "2024-02-01")).toBe(false);
    expect(await dayFilterMatches(range, null)).toBe(false);
    expect(
      await dayFilterMatches(
        { modifier: "NOT_EQUALS", value: "2024-01-01" },
        null
      )
    ).toBe(false);
    expect(
      await dayFilterMatches(
        { modifier: "NOT_BETWEEN", value: "2024-01-01", value2: "2024-01-31" },
        null
      )
    ).toBe(false);
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
    expect(result.sql).toBe("(p.name LIKE ? ESCAPE '\\')");
    expect(result.params).toEqual(["%test%"]);
  });

  it("INCLUDES of `50%` matches the text 50%, not 50 followed by anything", () => {
    const result = buildTextFilter({ value: "50%", modifier: "INCLUDES" }, col);
    expect(result.sql).toBe("(p.name LIKE ? ESCAPE '\\')");
    expect(result.params).toEqual(["%50\\%%"]);
  });

  it("escapes _ and the backslash too", () => {
    const result = buildTextFilter({ value: "a_b\\c" }, col);
    expect(result.params).toEqual(["%a\\_b\\\\c%"]);
  });

  it("does not wrap the column or the pattern in LOWER()", () => {
    const result = buildTextFilter({ value: "Test" }, col, {
      also: ["p.details"],
      lists: ["p.aliasList"],
    });
    expect(result.sql).not.toContain("LOWER");
  });

  it("handles EXCLUDES (single column)", () => {
    const result = buildTextFilter(
      { value: "test", modifier: "EXCLUDES" },
      col
    );
    expect(result.sql).toBe(
      "((p.name IS NULL OR p.name NOT LIKE ? ESCAPE '\\'))"
    );
    expect(result.params).toEqual(["%test%"]);
  });

  it("EXCLUDES escapes too", () => {
    const result = buildTextFilter(
      { value: "50%_", modifier: "EXCLUDES" },
      col
    );
    expect(result.params).toEqual(["%50\\%\\_%"]);
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
    expect(result.sql).toBe("(p.name LIKE ? ESCAPE '\\')");
    expect(result.params).toEqual(["%test%"]);
  });

  it("returns empty for unknown modifier", () => {
    const result = buildTextFilter({ value: "test", modifier: "UNKNOWN" }, col);
    expect(result).toEqual({ sql: "", params: [] });
  });

  // Further plain columns (also)
  it("handles INCLUDES with also columns", () => {
    const result = buildTextFilter(
      { value: "test", modifier: "INCLUDES" },
      "p.name",
      { also: ["p.disambiguation", "p.details"] }
    );
    expect(result.sql).toBe(
      "(p.name LIKE ? ESCAPE '\\' OR p.disambiguation LIKE ? ESCAPE '\\' OR p.details LIKE ? ESCAPE '\\')"
    );
    expect(result.params).toEqual(["%test%", "%test%", "%test%"]);
  });

  it("handles EXCLUDES with also columns, keeping NULL", () => {
    const result = buildTextFilter(
      { value: "test", modifier: "EXCLUDES" },
      "p.name",
      { also: ["p.details"] }
    );
    expect(result.sql).toBe(
      "((p.name IS NULL OR p.name NOT LIKE ? ESCAPE '\\') AND (p.details IS NULL OR p.details NOT LIKE ? ESCAPE '\\'))"
    );
    expect(result.params).toEqual(["%test%", "%test%"]);
  });

  // JSON list columns (lists)
  const ARM = (column: string) =>
    `EXISTS (SELECT 1 FROM json_each(${jsonListOrEmpty(column)}) a WHERE a.value LIKE ? ESCAPE '\\')`;

  it("an alias list column matches per alias", () => {
    const result = buildTextFilter({ value: "zed" }, "p.name", {
      lists: ["p.aliasList"],
    });
    expect(result.sql).toBe(
      `(p.name LIKE ? ESCAPE '\\' OR ${ARM("p.aliasList")})`
    );
    expect(result.params).toEqual(["%zed%", "%zed%"]);
  });

  it("EXCLUDES of an alias list column is no alias matching", () => {
    const result = buildTextFilter(
      { value: "zed", modifier: "EXCLUDES" },
      "p.name",
      {
        lists: ["p.aliasList"],
      }
    );
    expect(result.sql).toBe(
      `((p.name IS NULL OR p.name NOT LIKE ? ESCAPE '\\') AND NOT ${ARM("p.aliasList")})`
    );
    expect(result.params).toEqual(["%zed%", "%zed%"]);
  });

  it("EQUALS only uses the primary column even with also and lists", () => {
    const result = buildTextFilter(
      { value: "exact", modifier: "EQUALS" },
      "p.name",
      { also: ["p.details"], lists: ["p.aliasList"] }
    );
    expect(result.sql).toBe("LOWER(p.name) = LOWER(?)");
    expect(result.params).toEqual(["exact"]);
  });

  it("IS_NULL only checks the primary column when there is one", () => {
    const result = buildTextFilter({ modifier: "IS_NULL" }, "p.name", {
      lists: ["p.aliasList"],
    });
    expect(result.sql).toBe("(p.name IS NULL OR p.name = '')");
    expect(result.params).toEqual([]);
  });

  it("a list-only filter has no column arm and returns empty without lists", () => {
    expect(buildTextFilter({ value: "x" }, null)).toEqual({
      sql: "",
      params: [],
    });
    expect(buildTextFilter({ modifier: "IS_NULL" }, null)).toEqual({
      sql: "",
      params: [],
    });
  });

  it("a list-only filter binds one pattern per list", () => {
    const result = buildTextFilter({ value: "a_b" }, null, {
      lists: ["s.urls", "s.other"],
    });
    expect(result.sql).toBe(`(${ARM("s.urls")} OR ${ARM("s.other")})`);
    expect(result.params).toEqual(["%a\\_b%", "%a\\_b%"]);
  });
});

/** SQLite's answer to a text filter over one row of { name, list } */
async function textFilterMatches(
  filter: { value?: string; modifier?: string },
  options: { column: boolean },
  row: { name: string | null; list: string | null }
): Promise<boolean> {
  const clause = buildTextFilter(filter, options.column ? "x.name" : null, {
    lists: ["x.list"],
  });
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM (SELECT ? AS name, ? AS list) x WHERE ${clause.sql}`,
    row.name,
    row.list,
    ...clause.params
  );
  return Number(must(rows[0]).n) === 1;
}

describe("buildTextFilter over JSON lists, run on SQLite", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("a list-only filter matches any element", async () => {
    const list = JSON.stringify(["https://a.example/x", "https://b.example/y"]);
    const run = (value: string, row = list) =>
      textFilterMatches(
        { value },
        { column: false },
        { name: null, list: row }
      );
    expect(await run("b.example")).toBe(true);
    expect(await run("A.EXAMPLE")).toBe(true);
    expect(await run("c.example")).toBe(false);
    // An element's text, not the list's JSON, is what is matched
    expect(await run('a.example/x",')).toBe(false);
    // A damaged or missing list holds no element
    expect(await run("a", "not json")).toBe(false);
    expect(
      await textFilterMatches(
        { value: "a" },
        { column: false },
        { name: null, list: null }
      )
    ).toBe(false);
    // EXCLUDES keeps a row with no list
    expect(
      await textFilterMatches(
        { value: "b.example", modifier: "EXCLUDES" },
        { column: false },
        { name: null, list }
      )
    ).toBe(false);
    expect(
      await textFilterMatches(
        { value: "b.example", modifier: "EXCLUDES" },
        { column: false },
        { name: null, list: null }
      )
    ).toBe(true);
  });

  it("IS_NULL on a list-only filter matches NULL, empty text and an empty list", async () => {
    const isNull = (list: string | null) =>
      textFilterMatches(
        { modifier: "IS_NULL" },
        { column: false },
        { name: null, list }
      );
    const notNull = (list: string | null) =>
      textFilterMatches(
        { modifier: "NOT_NULL" },
        { column: false },
        { name: null, list }
      );
    for (const empty of [null, "", "[]"]) {
      expect(await isNull(empty)).toBe(true);
      expect(await notNull(empty)).toBe(false);
    }
    expect(await isNull('["a"]')).toBe(false);
    expect(await notNull('["a"]')).toBe(true);
  });

  it("a list-only EQUALS and NOT_EQUALS read an element, case folded", async () => {
    const list = '["Alpha","Beta"]';
    const run = (modifier: string, value: string, row: string | null = list) =>
      textFilterMatches(
        { value, modifier },
        { column: false },
        { name: null, list: row }
      );
    expect(await run("EQUALS", "beta")).toBe(true);
    expect(await run("EQUALS", "bet")).toBe(false);
    expect(await run("NOT_EQUALS", "beta")).toBe(false);
    expect(await run("NOT_EQUALS", "gamma")).toBe(true);
    expect(await run("NOT_EQUALS", "gamma", null)).toBe(true);
  });

  it("INCLUDES of a double quote matches no list's JSON punctuation", async () => {
    for (const value of ['"', "[", "]", ","]) {
      expect(
        await textFilterMatches(
          { value },
          { column: true },
          { name: "plain", list: '["one","two"]' }
        )
      ).toBe(false);
    }
    // ... and still finds the character inside an element
    expect(
      await textFilterMatches(
        { value: "[" },
        { column: true },
        { name: "plain", list: '["a [b]"]' }
      )
    ).toBe(true);
  });

  it("% and _ are literal in the name and in an element", async () => {
    const row = { name: "100% real", list: '["snakeXcase"]' };
    const run = (value: string) =>
      textFilterMatches({ value }, { column: true }, row);
    expect(await run("100%")).toBe(true);
    expect(await run("0% r")).toBe(true);
    expect(await run("%")).toBe(true);
    expect(await run("snake_case")).toBe(false);
    expect(await run("%real%x")).toBe(false);
    expect(
      await textFilterMatches(
        { value: "e_c" },
        { column: true },
        { name: "plain", list: '["snake_case"]' }
      )
    ).toBe(true);
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

describe("buildInstantFilter", () => {
  const col = "s.stashCreatedAt";
  const CHICAGO = "America/Chicago";
  // 2021-10-12 in Chicago (UTC-5): [05:00Z, the next day's 05:00Z)
  const start = 1634014800000;
  const end = 1634101200000;

  it("a same-day BETWEEN is that local day, both ends included", () => {
    expect(
      buildInstantFilter(
        { modifier: "BETWEEN", value: "2021-10-12", value2: "2021-10-12" },
        col,
        CHICAGO
      )
    ).toEqual({ sql: `(${col} >= ? AND ${col} < ?)`, params: [start, end] });
  });

  it("BETWEEN with one side is from its day on, or up to the end of its day", () => {
    expect(
      buildInstantFilter(
        { modifier: "BETWEEN", value: "2021-10-12", value2: undefined },
        col,
        CHICAGO
      )
    ).toEqual({ sql: `${col} >= ?`, params: [start] });
    expect(
      buildInstantFilter(
        { modifier: "BETWEEN", value: undefined, value2: "2021-10-12" },
        col,
        CHICAGO
      )
    ).toEqual({ sql: `${col} < ?`, params: [end] });
  });

  it("GREATER_THAN binds the next day's start with >=, LESS_THAN the day's start", () => {
    expect(
      buildInstantFilter(
        { modifier: "GREATER_THAN", value: "2021-10-12" },
        col,
        CHICAGO
      )
    ).toEqual({ sql: `${col} >= ?`, params: [end] });
    expect(
      buildInstantFilter(
        { modifier: "LESS_THAN", value: "2021-10-12" },
        col,
        CHICAGO
      )
    ).toEqual({ sql: `${col} < ?`, params: [start] });
  });

  it("EQUALS is the day; NOT_EQUALS outside it, with no IS NULL arm", () => {
    expect(
      buildInstantFilter(
        { modifier: "EQUALS", value: "2021-10-12" },
        col,
        CHICAGO
      )
    ).toEqual({ sql: `(${col} >= ? AND ${col} < ?)`, params: [start, end] });
    const not = buildInstantFilter(
      { modifier: "NOT_EQUALS", value: "2021-10-12" },
      col,
      CHICAGO
    );
    expect(not).toEqual({
      sql: `(${col} < ? OR ${col} >= ?)`,
      params: [start, end],
    });
    expect(not.sql).not.toContain("IS NULL");
  });

  it("NOT_BETWEEN is outside the range, with no IS NULL arm", () => {
    expect(
      buildInstantFilter(
        { modifier: "NOT_BETWEEN", value: "2021-10-12", value2: "2021-10-12" },
        col,
        CHICAGO
      )
    ).toEqual({ sql: `(${col} < ? OR ${col} >= ?)`, params: [start, end] });
  });

  it("UTC, the zone of a request without one, reads the calendar day", () => {
    expect(
      buildInstantFilter(
        { modifier: "EQUALS", value: "2026-09-25" },
        "w.lastPlayedAt",
        "UTC"
      ).params
    ).toEqual([Date.UTC(2026, 8, 25), Date.UTC(2026, 8, 26)]);
  });

  it("a date-time value is its instant", () => {
    const at = Date.parse("2026-03-01T10:00:00Z");
    expect(
      buildInstantFilter(
        { modifier: "EQUALS", value: "2026-03-01T10:00:00Z" },
        col,
        CHICAGO
      ).params
    ).toEqual([at, at + 1]);
    expect(
      buildInstantFilter(
        { modifier: "GREATER_THAN", value: "2026-03-01T10:00:00Z" },
        col,
        CHICAGO
      ).params
    ).toEqual([at + 1]);
  });

  it("IS_NULL and NOT_NULL bind nothing", () => {
    expect(buildInstantFilter({ modifier: "IS_NULL" }, col, CHICAGO)).toEqual({
      sql: `${col} IS NULL`,
      params: [],
    });
    expect(buildInstantFilter({ modifier: "NOT_NULL" }, col, CHICAGO)).toEqual({
      sql: `${col} IS NOT NULL`,
      params: [],
    });
  });
});

describe("fullDateSql", () => {
  it("reads a year as its 1 January and a year and month as its first day", () => {
    expect(fullDateSql("p.birthdate")).toBe(
      "CASE length(p.birthdate) WHEN 4 THEN p.birthdate || '-01-01' WHEN 7 THEN p.birthdate || '-01' ELSE p.birthdate END"
    );
  });
});

describe("ageYearsSql", () => {
  it("wraps both dates in fullDateSql, with Stash's arithmetic", () => {
    expect(ageYearsSql("s.date", "p.birthdate")).toBe(
      `CAST(strftime('%Y.%m%d', ${fullDateSql("s.date")}) - strftime('%Y.%m%d', ${fullDateSql("p.birthdate")}) AS INTEGER)`
    );
  });
});

describe("performerAgeExists", () => {
  const source = {
    junction: {
      table: "ScenePerformer",
      itemId: "sceneId",
      itemInstance: "sceneInstanceId",
      performerId: "performerId",
      performerInstance: "performerInstanceId",
    },
    item: { id: "s.id", instance: "s.stashInstanceId", date: "s.date" },
  };

  it("needs the item's date and a live, visible performer with a birthdate, on the item's instance", () => {
    const result = performerAgeExists(
      { modifier: "LESS_THAN", value: 26 },
      source,
      7
    );
    expect(result.sql).toContain("s.date IS NOT NULL AND EXISTS");
    expect(result.sql).toContain(
      "sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId"
    );
    expect(result.sql).toContain("p.deletedAt IS NULL");
    expect(result.sql).toContain("p.birthdate IS NOT NULL");
    expect(result.sql).toContain(
      "x.entityType = 'performer' AND x.entityId = p.id AND (x.instanceId = '' OR x.instanceId = p.stashInstanceId)"
    );
    expect(result.sql).toContain(`${ageYearsSql("s.date", "p.birthdate")} < ?`);
    // The viewer first (the exclusion sits before the comparison)
    expect(result.params).toEqual([7, 26]);
  });

  it("without a viewer reads every performer", () => {
    const result = performerAgeExists(
      { modifier: "BETWEEN", value: 20, value2: 30 },
      source,
      null
    );
    expect(result.sql).not.toContain("UserExcludedEntity");
    expect(result.params).toEqual([20, 30]);
  });

  it("IS_NULL and NOT_NULL filter nothing, and a criterion without bounds none", () => {
    expect(performerAgeExists({ modifier: "IS_NULL" }, source, 1).sql).toBe("");
    expect(performerAgeExists({ modifier: "NOT_NULL" }, source, 1).sql).toBe(
      ""
    );
    expect(
      performerAgeExists(
        { modifier: "BETWEEN", value: undefined, value2: undefined },
        source,
        1
      ).sql
    ).toBe("");
  });
});

describe("performerCountClause", () => {
  const IMAGE_PERFORMERS: JunctionTarget = {
    kind: "junction",
    table: "ImagePerformer",
    alias: "ip",
    parentAlias: "i",
    parentIdCol: "imageId",
    parentInstanceCol: "imageInstanceId",
    refIdCol: "performerId",
    refInstanceCol: "performerInstanceId",
  };

  it("counts the item's live performers the viewer can see, keyed on the item", () => {
    const result = performerCountClause(
      { modifier: "BETWEEN", value: 1, value2: 3 },
      IMAGE_PERFORMERS,
      7
    );
    expect(result.sql).toContain(
      "FROM ImagePerformer pc CROSS JOIN StashPerformer pcp ON pcp.id = pc.performerId AND pcp.stashInstanceId = pc.performerInstanceId"
    );
    expect(result.sql).toContain(
      exclusionJoin("pce", "performer", "pcp.id", "pcp.stashInstanceId")
    );
    expect(result.sql).toContain(
      "pc.imageId = i.id AND pc.imageInstanceId = i.stashInstanceId AND pcp.deletedAt IS NULL AND pce.id IS NULL) BETWEEN ? AND ?"
    );
    // The viewer first (the count sits before the comparison)
    expect(result.params).toEqual([7, 1, 3]);
  });

  it("without a viewer counts every live performer", () => {
    const result = performerCountClause(
      { modifier: "EQUALS", value: 0 },
      IMAGE_PERFORMERS,
      null
    );
    expect(result.sql).not.toContain("UserExcludedEntity");
    expect(result.sql).toContain("pcp.deletedAt IS NULL) = ?");
    expect(result.params).toEqual([0]);
  });

  it("a criterion without bounds filters nothing", () => {
    expect(
      performerCountClause(
        { modifier: "BETWEEN", value: undefined, value2: undefined },
        IMAGE_PERFORMERS,
        7
      )
    ).toEqual({ sql: "", params: [] });
  });
});

describe("performerTagsFieldClause", () => {
  const GALLERY_PERFORMERS: JunctionTarget = {
    kind: "junction",
    table: "GalleryPerformer",
    alias: "gp",
    parentAlias: "g",
    parentIdCol: "galleryId",
    parentInstanceCol: "galleryInstanceId",
    refIdCol: "performerId",
    refInstanceCol: "performerInstanceId",
  };
  const opts = {
    name: "performer_tags",
    allowedInstanceIds: ["a"],
    viewerId: null,
  };
  const refs = [
    { id: "5", instanceId: "a" },
    { id: "6", instanceId: "a" },
  ];

  it("INCLUDES and EXCLUDES at depth 0 are performerTagsClause over the junction", async () => {
    for (const modifier of ["INCLUDES", "EXCLUDES"] as const) {
      expect(
        await performerTagsFieldClause(
          GALLERY_PERFORMERS,
          { refs, modifier, depth: 0 },
          opts
        )
      ).toEqual(performerTagsClause(GALLERY_PERFORMERS, refs, modifier, opts));
    }
  });

  it("INCLUDES_ALL is one INCLUDES per tag, AND-ed, each named apart", async () => {
    const clause = await performerTagsFieldClause(
      GALLERY_PERFORMERS,
      { refs, modifier: "INCLUDES_ALL", depth: 0 },
      opts
    );
    const each = refs.map((ref, i) =>
      performerTagsClause(GALLERY_PERFORMERS, [ref], "INCLUDES", {
        ...opts,
        name: `performer_tags_${i}`,
      })
    );
    expect(clause.sql).toBe(`(${each.map((c) => c.sql).join(" AND ")})`);
    expect(clause.count).toBeUndefined();
  });

  it("INCLUDES_ALL under an index sort takes each clause's count form for the count", async () => {
    const sorted = { ...opts, sortedByIndex: true };
    const clause = await performerTagsFieldClause(
      GALLERY_PERFORMERS,
      { refs, modifier: "INCLUDES_ALL", depth: 0 },
      sorted
    );
    const each = refs.map((ref, i) =>
      performerTagsClause(GALLERY_PERFORMERS, [ref], "INCLUDES", {
        ...sorted,
        name: `performer_tags_${i}`,
      })
    );
    expect(clause.sql).toContain("EXISTS (SELECT 1 FROM GalleryPerformer gp");
    expect(must(clause.count, "the count form").sql).toBe(
      `(${each.map((c) => must(c.count, "a count form").sql).join(" AND ")})`
    );
  });

  it("no refs is no filter", async () => {
    expect(
      (
        await performerTagsFieldClause(
          GALLERY_PERFORMERS,
          { refs: [], modifier: "INCLUDES_ALL", depth: 0 },
          opts
        )
      ).sql
    ).toBe("");
  });
});

describe("performerTagsClause", () => {
  const SCENE_PERFORMERS: JunctionTarget = {
    kind: "junction",
    table: "ScenePerformer",
    alias: "sp",
    parentAlias: "s",
    parentIdCol: "sceneId",
    parentInstanceCol: "sceneInstanceId",
    refIdCol: "performerId",
    refInstanceCol: "performerInstanceId",
  };
  const opts = {
    name: "performer_tags",
    allowedInstanceIds: ["a", "b"],
    viewerId: 7,
  };
  const tag = { id: "5", instanceId: "a" };

  it("no refs is no filter", () => {
    expect(
      performerTagsClause(SCENE_PERFORMERS, [], "INCLUDES", opts).sql
    ).toBe("");
  });

  it("INCLUDES read in no order is an IN list driven from the tags, live and visible performers and tags only", () => {
    const clause = performerTagsClause(
      SCENE_PERFORMERS,
      [tag, { id: "6", instanceId: undefined }],
      "INCLUDES",
      opts
    );
    expect(clause.sql).toMatch(
      /^\(s\.id, s\.stashInstanceId\) IN \(SELECT sp\.sceneId, sp\.sceneInstanceId FROM PerformerTag pt CROSS JOIN StashPerformer p /
    );
    expect(clause.sql).toContain("pte.entityType = 'performer'");
    expect(clause.sql).toContain("ptte.entityType = 'tag'");
    expect(clause.sql).toContain(
      "p.deletedAt IS NULL AND pte.id IS NULL AND ptte.id IS NULL"
    );
    expect(clause.sql).toContain(
      "((pt.tagId = ? AND pt.tagInstanceId = ?) OR (pt.tagId = ?))"
    );
    // The viewer twice (both anti-joins), then the pairs
    expect(clause.params).toEqual([7, 7, "5", "a", "6"]);
    expect(clause.count).toBeUndefined();
  });

  it("without a viewer reads every live performer and tag", () => {
    const clause = performerTagsClause(SCENE_PERFORMERS, [tag], "INCLUDES", {
      ...opts,
      viewerId: null,
    });
    expect(clause.sql).not.toContain("UserExcludedEntity");
    expect(clause.sql).toContain("p.deletedAt IS NULL");
    expect(clause.params).toEqual(["5", "a"]);
  });

  it("a page walking a sort index takes the keyed EXISTS, its count the IN list", () => {
    const clause = performerTagsClause(SCENE_PERFORMERS, [tag], "INCLUDES", {
      ...opts,
      sortedByIndex: true,
    });
    expect(clause.sql).toMatch(
      /^EXISTS \(SELECT 1 FROM ScenePerformer sp CROSS JOIN PerformerTag pt ON pt\.performerId = sp\.performerId /
    );
    expect(clause.sql).toContain(
      "sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId"
    );
    expect(clause.params).toEqual([7, 7, "5", "a"]);
    expect(clause.count?.sql).toMatch(/^\(s\.id, s\.stashInstanceId\) IN /);
  });

  it("EXCLUDES reads a matched set, and a page walking an index the keyed NOT EXISTS", () => {
    const set = performerTagsClause(SCENE_PERFORMERS, [tag], "EXCLUDES", opts);
    expect(set.sql).toBe(
      "(s.id || ':' || s.stashInstanceId) NOT IN (SELECT id || ':' || inst FROM performer_tags_matched)"
    );
    expect(set.params).toEqual([]);
    expect(set.ctes?.map((c) => c.name)).toEqual(["performer_tags_matched"]);
    expect(set.ctes?.[0]?.sql).toContain("SELECT DISTINCT sp.sceneId");
    expect(set.ctes?.[0]?.params).toEqual([7, 7, "5", "a"]);

    const walk = performerTagsClause(SCENE_PERFORMERS, [tag], "EXCLUDES", {
      ...opts,
      sortedByIndex: true,
    });
    expect(walk.sql).toMatch(/^NOT EXISTS \(SELECT 1 FROM ScenePerformer sp /);
    expect(walk.count).toEqual(set);
  });

  it("above the inline limit the refs travel as one JSON parameter, a bare ref once per allowed instance", () => {
    const refs: FilterRef[] = [
      { id: "1", instanceId: undefined },
      ...Array.from({ length: PAIR_INLINE_LIMIT }, (_, i) => ({
        id: String(100 + i),
        instanceId: "a",
      })),
    ];
    const includes = performerTagsClause(
      SCENE_PERFORMERS,
      refs,
      "INCLUDES",
      opts
    );
    expect(includes.sql).toContain(
      "FROM performer_tags_refs r CROSS JOIN PerformerTag pt ON pt.tagId = r.id AND pt.tagInstanceId = r.inst"
    );
    expect(includes.params).toEqual([7, 7]);
    const refsCte = must(includes.ctes?.[0]);
    expect(refsCte.name).toBe("performer_tags_refs");
    const pairs: unknown = JSON.parse(String(must(refsCte.params[0])));
    expect(pairs).toEqual([
      ["1", "a"],
      ["1", "b"],
      ...refs.slice(1).map((r) => [r.id, "a"]),
    ]);

    const walk = performerTagsClause(SCENE_PERFORMERS, refs, "EXCLUDES", {
      ...opts,
      sortedByIndex: true,
    });
    // Each of the item's performers' tags checked against the list, not
    // the key probed once per ref
    expect(walk.sql).toContain(
      "(+pt.tagId, pt.tagInstanceId) IN (SELECT id, inst FROM performer_tags_refs)"
    );
    expect(walk.ctes?.map((c) => c.name)).toEqual(["performer_tags_refs"]);
    expect(walk.count?.ctes?.map((c) => c.name)).toEqual([
      "performer_tags_refs",
      "performer_tags_matched",
    ]);
  });
});

describe("resolutionClause", () => {
  const clause = (
    modifier: "EQUALS" | "NOT_EQUALS" | "GREATER_THAN" | "LESS_THAN",
    value: Resolution
  ) => resolutionClause({ modifier, value }, "w", "h");

  it("EQUALS is the range on the shorter side, with nothing bound", () => {
    expect(clause("EQUALS", "FULL_HD")).toEqual({
      sql: "MIN(w, h) BETWEEN 1080 AND 1439",
      params: [],
    });
  });

  it("NOT_EQUALS is the same range negated", () => {
    expect(clause("NOT_EQUALS", "FULL_HD").sql).toBe(
      "MIN(w, h) NOT BETWEEN 1080 AND 1439"
    );
  });

  it("GREATER_THAN is past the range's top, LESS_THAN under its bottom", () => {
    expect(clause("GREATER_THAN", "STANDARD_HD").sql).toBe("MIN(w, h) > 1079");
    expect(clause("LESS_THAN", "STANDARD").sql).toBe("MIN(w, h) < 480");
  });

  it("copies Stash's overlapping ranges as they are", () => {
    expect(RESOLUTION_RANGES.VR_HD).toEqual({ min: 1920, max: 2159 });
    expect(RESOLUTION_RANGES.FOUR_K).toEqual({ min: 1920, max: 2559 });
    expect(RESOLUTION_RANGES.HUGE).toEqual({ min: 6144, max: 9999 });
    expect(Object.keys(RESOLUTION_RANGES)).toEqual([...RESOLUTIONS]);
  });

  it("has no COALESCE: a file with no size never matches", () => {
    for (const modifier of ["EQUALS", "NOT_EQUALS"] as const) {
      expect(clause(modifier, "LOW").sql).not.toContain("COALESCE");
    }
  });
});

describe("searchAll", () => {
  const termClause = (pattern: string) => ({
    sql: "(a LIKE ? ESCAPE '\\' OR b LIKE ? ESCAPE '\\')",
    params: [pattern, pattern],
  });

  it("is no clause without terms", () => {
    expect(searchAll([], termClause)).toEqual({ sql: "", params: [] });
  });

  it("ANDs one clause per term, each bound to the term's likeContains pattern", () => {
    const clause = searchAll(["anna", "100%"], termClause);

    expect(clause.sql).toBe(
      "((a LIKE ? ESCAPE '\\' OR b LIKE ? ESCAPE '\\') AND (a LIKE ? ESCAPE '\\' OR b LIKE ? ESCAPE '\\'))"
    );
    expect(clause.params).toEqual(["%anna%", "%anna%", "%100\\%%", "%100\\%%"]);
  });
});

describe("galleryNameSql", () => {
  it("is the title, else the file's name without its extension, else the folder's own name", () => {
    const sql = galleryNameSql("g");

    expect(sql.startsWith("COALESCE(NULLIF(g.title, ''),")).toBe(true);
    expect(sql).toContain("g.fileBasename");
    expect(sql).toContain("g.folderPath");
    expect(sql).not.toContain("x.");
  });

  it("reads the alias it is given", () => {
    expect(galleryNameSql("x")).toContain("NULLIF(x.title, '')");
  });
});

describe("imageNameSql", () => {
  it("is the stored, lower-cased name of the image's alias", () => {
    expect(imageNameSql("i")).toBe("i.titleSort");
    expect(imageNameSql("x")).toBe("x.titleSort");
  });
});

describe("buildTextFilter STARTS_WITH", () => {
  it("matches the start of the column, the text's % and _ literal", () => {
    expect(
      buildTextFilter({ modifier: "STARTS_WITH", value: "/a_b/" }, "s.filePath")
    ).toEqual({
      sql: "(s.filePath LIKE ? ESCAPE '\\')",
      params: ["/a\\_b/%"],
    });
    expect(
      buildTextFilter({ modifier: "STARTS_WITH", value: "50%\\" }, "s.filePath")
        .params
    ).toEqual(["50\\%\\\\%"]);
  });

  it("without a value it filters nothing", () => {
    expect(buildTextFilter({ modifier: "STARTS_WITH" }, "s.filePath")).toEqual({
      sql: "",
      params: [],
    });
  });

  it("reads each extra column and list too", () => {
    const result = buildTextFilter(
      { modifier: "STARTS_WITH", value: "ab" },
      "p.name",
      { also: ["p.details"], lists: ["p.aliasList"] }
    );
    expect(result.sql).toBe(
      "(p.name LIKE ? ESCAPE '\\' OR p.details LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(p.aliasList) THEN p.aliasList ELSE '[]' END) a WHERE a.value LIKE ? ESCAPE '\\'))"
    );
    expect(result.params).toEqual(["ab%", "ab%", "ab%"]);
  });
});

describe("orientationClause", () => {
  it("compares the two columns, any of several values", () => {
    expect(
      orientationClause(
        { modifier: "INCLUDES", values: ["PORTRAIT"] },
        "w",
        "h"
      )
    ).toEqual({
      sql: "((w < h))",
      params: [],
    });
    expect(
      orientationClause(
        { modifier: "INCLUDES", values: ["SQUARE", "LANDSCAPE"] },
        "i.w",
        "i.h"
      )
    ).toEqual({
      sql: "((i.w = i.h AND i.w > 0) OR (i.w > i.h))",
      params: [],
    });
  });
});
