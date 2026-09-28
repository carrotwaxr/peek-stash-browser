/**
 * Unit tests for the shared SQL clause helpers (item 34a).
 *
 * The via-scene clauses list an entity through its scenes: groups holding a
 * scene, performers in a group's scenes. Each ref is matched as an
 * (id, instance) pair, and a bare ref matches that id on every instance.
 */
import { describe, expect, it } from "vitest";
import {
  type ViaSceneSpec,
  pairs,
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

const GROUP_BY_SCENE_EXISTS =
  "EXISTS (SELECT 1 FROM SceneGroup sg WHERE sg.groupId = g.id AND sg.groupInstanceId = g.stashInstanceId AND (";

describe("pairs", () => {
  it("matches a composite ref on both columns and a bare ref on the id alone", () => {
    expect(
      pairs("sg.sceneId", "sg.sceneInstanceId", [
        { id: "1", instanceId: "inst-a" },
        { id: "2", instanceId: undefined },
      ])
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
  it("INCLUDES for groups by scene emits an EXISTS on SceneGroup keyed by the group's (id, stashInstanceId) with one (sceneId, sceneInstanceId) pair per composite ref and a bare `sceneId = ?` per bare ref", () => {
    const clause = viaSceneClause(
      GROUPS_BY_SCENE,
      [
        { id: "5", instanceId: "inst-a" },
        { id: "7", instanceId: undefined },
        { id: "9", instanceId: "inst-b" },
      ],
      "INCLUDES"
    );

    expect(clause).toEqual({
      sql: `${GROUP_BY_SCENE_EXISTS}(sg.sceneId = ? AND sg.sceneInstanceId = ?) OR (sg.sceneId = ?) OR (sg.sceneId = ? AND sg.sceneInstanceId = ?)))`,
      params: ["5", "inst-a", "7", "9", "inst-b"],
    });
  });

  it("EXCLUDES emits NOT EXISTS", () => {
    const clause = viaSceneClause(
      GROUPS_BY_SCENE,
      [{ id: "5", instanceId: "inst-a" }],
      "EXCLUDES"
    );

    expect(clause).toEqual({
      sql: `NOT ${GROUP_BY_SCENE_EXISTS}(sg.sceneId = ? AND sg.sceneInstanceId = ?)))`,
      params: ["5", "inst-a"],
    });
  });

  it("INCLUDES_ALL emits one EXISTS per ref, AND-ed", () => {
    const clause = viaSceneClause(
      GROUPS_BY_SCENE,
      [
        { id: "5", instanceId: "inst-a" },
        { id: "7", instanceId: undefined },
      ],
      "INCLUDES_ALL"
    );

    expect(clause).toEqual({
      sql: `(${GROUP_BY_SCENE_EXISTS}(sg.sceneId = ? AND sg.sceneInstanceId = ?))) AND ${GROUP_BY_SCENE_EXISTS}(sg.sceneId = ?))))`,
      params: ["5", "inst-a", "7"],
    });
  });

  it("the via form joins the second junction on the scene and matches the refs there", () => {
    const clause = viaSceneClause(
      PERFORMERS_BY_GROUP,
      [{ id: "3", instanceId: "inst-a" }],
      "INCLUDES"
    );

    expect(clause).toEqual({
      sql: "EXISTS (SELECT 1 FROM ScenePerformer sp JOIN SceneGroup sg ON sg.sceneId = sp.sceneId AND sg.sceneInstanceId = sp.sceneInstanceId WHERE sp.performerId = p.id AND sp.performerInstanceId = p.stashInstanceId AND ((sg.groupId = ? AND sg.groupInstanceId = ?)))",
      params: ["3", "inst-a"],
    });
  });

  it("adds the spec's own condition inside the subquery", () => {
    const clause = viaSceneClause(
      {
        ...PERFORMERS_BY_GROUP,
        via: {
          table: "StashScene",
          alias: "sc",
          sceneIdCol: "id",
          sceneInstanceCol: "stashInstanceId",
          refIdCol: "studioId",
          refInstanceCol: "stashInstanceId",
        },
        where: "sc.deletedAt IS NULL",
      },
      [{ id: "4", instanceId: "inst-a" }],
      "INCLUDES"
    );

    expect(clause.sql).toBe(
      "EXISTS (SELECT 1 FROM ScenePerformer sp JOIN StashScene sc ON sc.id = sp.sceneId AND sc.stashInstanceId = sp.sceneInstanceId WHERE sp.performerId = p.id AND sp.performerInstanceId = p.stashInstanceId AND sc.deletedAt IS NULL AND ((sc.studioId = ? AND sc.stashInstanceId = ?)))"
    );
  });

  it("is empty with no refs or an unknown modifier", () => {
    expect(viaSceneClause(GROUPS_BY_SCENE, [], "INCLUDES")).toEqual({
      sql: "",
      params: [],
    });
    expect(
      viaSceneClause(
        GROUPS_BY_SCENE,
        [{ id: "5", instanceId: "inst-a" }],
        "EQUALS"
      )
    ).toEqual({ sql: "", params: [] });
  });
});
