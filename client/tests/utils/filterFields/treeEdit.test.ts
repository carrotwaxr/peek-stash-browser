/**
 * The editing tree the row editor works on (Contract 12): rows and groups
 * with ids, kept leaves in their container, the same-field merge of an
 * "any" container (W9's `mergeAnyRows`), and the limits.
 */
import {
  type ListKind,
  type Match,
  WHERE_LIMITS,
  isWhereGroup,
} from "@peek/shared-types";
import { must } from "@tests/testUtils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ContainerId,
  type EditItem,
  type EditTree,
  type PanelState,
  addGroup,
  addRow,
  canAddGroup,
  canAddRow,
  countGroups,
  countRows,
  editTreeOf,
  editTreesEqual,
  mergeNotes,
  moveRow,
  normalizeEditTree,
  panelTreeOf,
  removeGroup,
  removeRow,
  setMatch,
  setRowField,
  stateOf,
  treeOf,
  updateRow,
  whereOf,
} from "@/utils/filterFields";

const LISTS: readonly ListKind[] = [
  "scene",
  "performer",
  "studio",
  "tag",
  "group",
  "gallery",
  "image",
  "clip",
];

interface UrlGolden {
  roundTrip: { label: string; parsed: PanelState }[];
}

const goldenOf = (list: ListKind): UrlGolden =>
  JSON.parse(
    readFileSync(resolve(__dirname, `../__golden__/${list}/url.json`), "utf8")
  ) as UrlGolden;

const A = "1:inst-a";
const B = "2:inst-a";
const C = "3:inst-a";
const D = "4:inst-a";
const X = "9:inst-a";

const empty = (): EditTree => editTreeOf("scene", treeOf("scene", {}));

/** A container's items */
const itemsIn = (tree: EditTree, at: ContainerId): readonly EditItem[] =>
  at === "root"
    ? tree.rows
    : must(
        tree.groups.find((group) => group.id === at),
        `group ${at}`
      ).rows;

const idsOf = (tree: EditTree): string[] => [
  ...tree.rows.map((row) => row.id),
  ...tree.groups.flatMap((group) => [
    group.id,
    ...group.rows.map((row) => row.id),
  ]),
];

/** The last item of a container */
const lastIn = (tree: EditTree, at: ContainerId): EditItem =>
  must(itemsIn(tree, at).at(-1), `last item of ${at}`);

/** Adds a row of `key` with `state` to a container */
const withRow = (
  tree: EditTree,
  at: ContainerId,
  key: string,
  state: PanelState
): EditTree => {
  const added = addRow(tree, at, key, "scene");
  return updateRow(added, lastIn(added, at).id, state);
};

/** The tree's first group's id */
const groupId = (tree: EditTree, at = 0): string =>
  must(tree.groups[at], `group ${at}`).id;

/** A tree with one group of `match` holding a Tags row per state */
const groupOf = (match: Match, states: readonly PanelState[]): EditTree => {
  let tree = addGroup(empty());
  const id = groupId(tree);
  tree = setMatch(tree, id, match);
  for (const state of states) tree = withRow(tree, id, "tagIds", state);
  return tree;
};

/** A tree whose root, of `match`, holds a Tags row per state */
const rootOf = (match: Match, states: readonly PanelState[]): EditTree => {
  let tree = setMatch(empty(), "root", match);
  for (const state of states) tree = withRow(tree, "root", "tagIds", state);
  return tree;
};

const tags = (ids: string[], modifier: string, more: PanelState = {}) => ({
  tagIds: ids,
  tagIdsModifier: modifier,
  ...more,
});

/** Each row of a container as its key and state */
const rowsOf = (tree: EditTree, at: ContainerId) =>
  itemsIn(tree, at).map((item) =>
    item.kind === "row" ? [item.field.key, item.state] : ["kept", item.leaf]
  );

describe("editTreeOf and panelTreeOf", () => {
  it.each(LISTS)("editTreeOf and panelTreeOf round-trip: %s", (list) => {
    for (const sample of goldenOf(list).roundTrip) {
      const tree = treeOf(list, sample.parsed);
      const edit = editTreeOf(list, tree);
      expect(panelTreeOf(edit).tree, sample.label).toEqual(tree);
      expect(panelTreeOf(edit).kept, sample.label).toEqual([]);
      const ids = idsOf(edit);
      expect(new Set(ids).size, sample.label).toBe(ids.length);
    }
  });

  it("a tree with groups round-trips with unique ids", () => {
    const tree = treeOf("scene", {
      g1: "any",
      "g1.performerFavorite": "true",
      "g1.tagFavorite": "true",
      "g2.tagIds": [A],
      watched: "false",
      match: "any",
    });
    const edit = editTreeOf("scene", tree);

    expect(edit.match).toBe("any");
    expect(edit.groups.map((group) => group.match)).toEqual(["any", "all"]);
    expect(panelTreeOf(edit).tree).toEqual(tree);
    const ids = idsOf(edit);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("kept leaves land in their container and come back with it", () => {
    const tree = treeOf("scene", {
      "g1.tagIds": [A],
      "g2.performerFavorite": "true",
      watched: "false",
    });
    const kept = [
      { group: 0, leaf: { field: "unknown_root", criterion: {} } },
      { group: 2, leaf: { field: "unknown_group", criterion: {} } },
    ];
    const edit = editTreeOf("scene", tree, kept);

    expect(rowsOf(edit, "root")).toEqual([
      ["watched", { watched: "false" }],
      ["kept", { field: "unknown_root", criterion: {} }],
    ]);
    expect(rowsOf(edit, groupId(edit, 0))).toEqual([
      ["tagIds", { tagIds: [A] }],
    ]);
    expect(rowsOf(edit, groupId(edit, 1))).toEqual([
      ["performerFavorite", { performerFavorite: "true" }],
      ["kept", { field: "unknown_group", criterion: {} }],
    ]);
    expect(panelTreeOf(edit)).toEqual({ tree, kept });
  });
});

describe("rows", () => {
  it("addRow appends an empty row of a field to the root or a group, with a fresh id", () => {
    let tree = withRow(empty(), "root", "performerIds", {
      performerIds: [A],
    });
    tree = addRow(tree, "root", "tagIds", "scene");
    tree = addGroup(tree);
    const group = groupId(tree);
    tree = addRow(tree, group, "studioId", "scene");

    expect(rowsOf(tree, "root")).toEqual([
      ["performerIds", { performerIds: [A] }],
      ["tagIds", { tagIdsModifier: "INCLUDES_ALL" }],
    ]);
    expect(rowsOf(tree, group)).toEqual([
      ["studioId", { studioIdModifier: "INCLUDES" }],
    ]);
    for (const id of idsOf(tree)) expect(id).toMatch(/^(row|group)-\d+$/);
    expect(new Set(idsOf(tree)).size).toBe(idsOf(tree).length);
  });

  it("setRowField replaces the row's field and resets its state to the field's defaults (its default modifier)", () => {
    const tree = withRow(empty(), "root", "tagIds", tags([A], "INCLUDES"));
    const id = lastIn(tree, "root").id;

    const performers = setRowField(tree, id, "performerIds", "scene");
    expect(rowsOf(performers, "root")).toEqual([
      ["performerIds", { performerIdsModifier: "INCLUDES" }],
    ]);
    expect(lastIn(performers, "root").id).toBe(id);
    expect(rowsOf(setRowField(tree, id, "tagIds", "scene"), "root")).toEqual([
      ["tagIds", { tagIdsModifier: "INCLUDES_ALL" }],
    ]);
  });

  it("updateRow replaces only that row's state", () => {
    let tree = withRow(empty(), "root", "tagIds", tags([A], "INCLUDES"));
    tree = withRow(tree, "root", "performerIds", { performerIds: [B] });
    const [first, second] = tree.rows;

    const updated = updateRow(tree, must(second, "second").id, {
      performerIds: [C],
    });
    expect(updated.rows[0]).toBe(first);
    expect(rowsOf(updated, "root")).toEqual([
      ["tagIds", tags([A], "INCLUDES")],
      ["performerIds", { performerIds: [C] }],
    ]);
  });

  it("removeRow removes it wherever it is", () => {
    let tree = withRow(empty(), "root", "tagIds", { tagIds: [A] });
    tree = addGroup(tree);
    const group = groupId(tree);
    tree = withRow(tree, group, "performerIds", { performerIds: [B] });
    tree = withRow(tree, group, "studioId", { studioId: [C] });

    const fromRoot = removeRow(tree, lastIn(tree, "root").id);
    expect(fromRoot.rows).toEqual([]);
    expect(itemsIn(fromRoot, group)).toHaveLength(2);
    const fromGroup = removeRow(tree, lastIn(tree, group).id);
    expect(rowsOf(fromGroup, group)).toEqual([
      ["performerIds", { performerIds: [B] }],
    ]);
    expect(fromGroup.rows).toHaveLength(1);
  });

  it("moveRow moves a row between the root and a group and keeps its state", () => {
    let tree = withRow(empty(), "root", "tagIds", tags([A], "INCLUDES"));
    tree = addGroup(tree);
    const group = groupId(tree);
    tree = withRow(tree, group, "performerIds", { performerIds: [B] });
    const tagRow = lastIn(tree, "root");

    const moved = moveRow(tree, tagRow.id, group);
    expect(moved.rows).toEqual([]);
    expect(itemsIn(moved, group).map((row) => row.id)).toContain(tagRow.id);
    expect(rowsOf(moved, group)).toEqual([
      ["performerIds", { performerIds: [B] }],
      ["tagIds", tags([A], "INCLUDES")],
    ]);
    const back = moveRow(moved, tagRow.id, "root");
    expect(rowsOf(back, "root")).toEqual([["tagIds", tags([A], "INCLUDES")]]);
    expect(lastIn(back, "root").id).toBe(tagRow.id);
  });
});

describe("groups", () => {
  it("addGroup adds an empty `all` group; setMatch flips a container", () => {
    const tree = addGroup(empty());
    const group = must(tree.groups[0], "group");
    expect(group).toEqual({ id: group.id, match: "all", rows: [] });
    expect(group.id).toMatch(/^group-\d+$/);

    const flipped = setMatch(tree, group.id, "any");
    expect(must(flipped.groups[0], "group").match).toBe("any");
    expect(flipped.match).toBe("all");
    expect(setMatch(tree, "root", "any").match).toBe("any");
  });

  it("removeGroup removes it with its rows", () => {
    let tree = addGroup(addGroup(empty()));
    const first = groupId(tree, 0);
    const second = groupId(tree, 1);
    tree = withRow(tree, first, "tagIds", { tagIds: [A] });

    const removed = removeGroup(tree, first);
    expect(removed.groups.map((group) => group.id)).toEqual([second]);
    expect(idsOf(removed)).toEqual([second]);
  });

  it("canAddGroup is false inside a group", () => {
    const tree = addGroup(empty());
    expect(canAddGroup(tree)).toBe(true);
    expect(canAddGroup(tree, "root")).toBe(true);
    expect(canAddGroup(tree, groupId(tree))).toBe(false);
  });
});

describe("counts", () => {
  it("countRows counts filtering rows and kept rows after the merge, never the waiting rows", () => {
    let tree = editTreeOf("scene", treeOf("scene", {}), [
      { group: 0, leaf: { field: "unknown", criterion: {} } },
    ]);
    tree = withRow(tree, "root", "performerIds", { performerIds: [A] });
    tree = addRow(tree, "root", "tagIds", "scene");
    tree = addGroup(tree);
    const group = groupId(tree);
    tree = setMatch(tree, group, "any");
    tree = withRow(tree, group, "tagIds", tags([A], "INCLUDES"));
    tree = withRow(tree, group, "tagIds", tags([B], "INCLUDES"));
    tree = addRow(tree, group, "studioId", "scene");
    tree = addGroup(tree);

    expect(countRows(tree, "scene")).toBe(3);
    expect(countGroups(tree)).toBe(2);
  });

  it("canAddRow and canAddGroup follow WHERE_LIMITS", () => {
    let tree = empty();
    for (let at = 0; at < WHERE_LIMITS.rows - 1; at += 1) {
      tree = withRow(tree, "root", "tagIds", { tagIds: [`${at}:inst-a`] });
    }
    expect(canAddRow(tree, "scene")).toBe(true);
    tree = addRow(tree, "root", "tagIds", "scene");
    expect(canAddRow(tree, "scene")).toBe(true);
    tree = withRow(tree, "root", "tagIds", { tagIds: [X] });
    expect(countRows(tree, "scene")).toBe(WHERE_LIMITS.rows);
    expect(canAddRow(tree, "scene")).toBe(false);

    let groups = empty();
    for (let at = 0; at < WHERE_LIMITS.groups - 1; at += 1) {
      groups = addGroup(groups);
    }
    expect(canAddGroup(groups)).toBe(true);
    groups = addGroup(groups);
    expect(countGroups(groups)).toBe(WHERE_LIMITS.groups);
    expect(canAddGroup(groups)).toBe(false);
  });
});

describe("the merge", () => {
  const firstGroup = (tree: EditTree) => groupId(tree);

  it("same-field rows in an any group merge on normalize", () => {
    const anyOf = groupOf("any", [
      tags([A], "INCLUDES"),
      tags([B, C], "INCLUDES"),
    ]);
    const firstId = must(itemsIn(anyOf, firstGroup(anyOf))[0], "first").id;
    const merged = normalizeEditTree(anyOf, "scene");
    expect(rowsOf(merged, firstGroup(merged))).toEqual([
      ["tagIds", tags([A, B, C], "INCLUDES")],
    ]);
    expect(must(itemsIn(merged, firstGroup(merged))[0], "row").id).toBe(
      firstId
    );

    const allOfOne = normalizeEditTree(
      groupOf("any", [tags([A], "INCLUDES_ALL"), tags([B], "INCLUDES_ALL")]),
      "scene"
    );
    expect(rowsOf(allOfOne, firstGroup(allOfOne))).toEqual([
      ["tagIds", tags([A, B], "INCLUDES")],
    ]);

    const apart: PanelState[][] = [
      [tags([A, B], "INCLUDES_ALL"), tags([C], "INCLUDES")],
      [tags([A], "INCLUDES", { tagIdsExclude: [X] }), tags([B], "INCLUDES")],
      [tags([A], "INCLUDES", { tagIdsDepth: -1 }), tags([B], "INCLUDES")],
    ];
    for (const states of apart) {
      const tree = normalizeEditTree(groupOf("any", states), "scene");
      expect(itemsIn(tree, firstGroup(tree))).toHaveLength(2);
    }

    const allGroup = normalizeEditTree(
      groupOf("all", [tags([A], "INCLUDES"), tags([B], "INCLUDES")]),
      "scene"
    );
    expect(itemsIn(allGroup, firstGroup(allGroup))).toHaveLength(2);

    const root = normalizeEditTree(
      rootOf("any", [tags([A], "INCLUDES"), tags([B, C], "INCLUDES")]),
      "scene"
    );
    expect(rowsOf(root, "root")).toEqual([
      ["tagIds", tags([A, B, C], "INCLUDES")],
    ]);
    const rootApart = normalizeEditTree(
      rootOf("any", [tags([A, B], "INCLUDES_ALL"), tags([C], "INCLUDES")]),
      "scene"
    );
    expect(rootApart.rows).toHaveLength(2);
    const rootAll = normalizeEditTree(
      rootOf("all", [tags([A], "INCLUDES"), tags([B], "INCLUDES")]),
      "scene"
    );
    expect(rootAll.rows).toHaveLength(2);
  });

  it("mergeNotes names what will merge", () => {
    let tree = groupOf("any", [tags([A], "INCLUDES"), tags([B], "INCLUDES")]);
    const group = firstGroup(tree);
    tree = withRow(tree, group, "performerIds", { performerIds: [C] });
    tree = withRow(tree, "root", "tagIds", tags([C], "INCLUDES"));
    tree = withRow(tree, "root", "tagIds", tags([D], "INCLUDES"));
    const [first, second] = itemsIn(tree, group);

    expect(mergeNotes(tree, "scene")).toEqual([
      {
        containerId: group,
        key: "tagIds",
        rowIds: [must(first, "first").id, must(second, "second").id],
      },
    ]);
    const rootAny = setMatch(tree, "root", "any");
    expect(mergeNotes(rootAny, "scene")).toEqual([
      {
        containerId: "root",
        key: "tagIds",
        rowIds: rootAny.rows.map((row) => row.id),
      },
      {
        containerId: group,
        key: "tagIds",
        rowIds: [must(first, "first").id, must(second, "second").id],
      },
    ]);
  });

  it("normalizeEditTree agrees with the wire", () => {
    const pairs: [string, PanelState, PanelState][] = [
      [
        "any of one and any of two",
        tags([A], "INCLUDES"),
        tags([B, C], "INCLUDES"),
      ],
      [
        "all of one, twice",
        tags([A], "INCLUDES_ALL"),
        tags([B], "INCLUDES_ALL"),
      ],
      [
        "all of two and any of one",
        tags([A, B], "INCLUDES_ALL"),
        tags([C], "INCLUDES"),
      ],
      [
        "none of one and any of one",
        tags([A], "EXCLUDES"),
        tags([B], "INCLUDES"),
      ],
      [
        "an excluded pick",
        tags([A], "INCLUDES", { tagIdsExclude: [X] }),
        tags([B], "INCLUDES"),
      ],
      [
        "two depths",
        tags([A], "INCLUDES", { tagIdsDepth: -1 }),
        tags([B], "INCLUDES"),
      ],
      [
        "one depth",
        tags([A], "INCLUDES", { tagIdsDepth: -1 }),
        tags([B], "INCLUDES", { tagIdsDepth: -1 }),
      ],
      ["the same tag", tags([A], "INCLUDES"), tags([A], "INCLUDES")],
      ["has any tag", { tagIdsModifier: "NOT_NULL" }, tags([B], "INCLUDES")],
    ];
    for (const [label, first, second] of pairs) {
      const tree = groupOf("any", [first, second]);
      const normalized = normalizeEditTree(tree, "scene");
      const where = whereOf("scene", stateOf("scene", panelTreeOf(tree).tree));
      const group = must(where?.rules[0], `${label}: the wire's group`);
      expect(isWhereGroup(group), label).toBe(true);
      expect(itemsIn(normalized, firstGroup(normalized)).length, label).toBe(
        isWhereGroup(group) ? group.rules.length : -1
      );
    }
  });

  it("normalizeEditTree drops rows that do not filter and empty groups, and orders rows by the panel table in every container, as `stateOf` writes them", () => {
    let tree = editTreeOf("scene", treeOf("scene", {}), [
      { group: 0, leaf: { field: "unknown", criterion: {} } },
    ]);
    tree = withRow(tree, "root", "tagIds", tags([A], "INCLUDES"));
    tree = addRow(tree, "root", "studioId", "scene");
    tree = withRow(tree, "root", "performerIds", { performerIds: [B] });
    tree = addGroup(tree);
    const waiting = groupId(tree, 0);
    tree = addRow(tree, waiting, "tagIds", "scene");
    tree = addGroup(tree);
    tree = addGroup(tree);
    const kept = groupId(tree, 2);
    tree = withRow(tree, kept, "tagIds", tags([C], "INCLUDES"));
    tree = withRow(tree, kept, "performerIds", { performerIds: [D] });

    const normalized = normalizeEditTree(tree, "scene");
    expect(rowsOf(normalized, "root")).toEqual([
      ["performerIds", { performerIds: [B] }],
      ["tagIds", tags([A], "INCLUDES")],
      ["kept", { field: "unknown", criterion: {} }],
    ]);
    expect(normalized.groups.map((group) => group.id)).toEqual([kept]);
    expect(rowsOf(normalized, kept)).toEqual([
      ["performerIds", { performerIds: [D] }],
      ["tagIds", tags([C], "INCLUDES")],
    ]);

    const canonical = treeOf("scene", stateOf("scene", panelTreeOf(tree).tree));
    expect(panelTreeOf(normalized).tree).toEqual(canonical);
  });

  it("editTreesEqual compares through `filtersEqual` of their states and ignores ids", () => {
    const one = withRow(
      withRow(empty(), "root", "tagIds", tags([A, B], "INCLUDES")),
      "root",
      "performerIds",
      { performerIds: [C] }
    );
    const other = withRow(
      withRow(empty(), "root", "performerIds", { performerIds: [C] }),
      "root",
      "tagIds",
      tags([B, A], "INCLUDES")
    );
    expect(idsOf(one)).not.toEqual(idsOf(other));
    expect(editTreesEqual(one, other, "scene")).toBe(true);
    expect(
      editTreesEqual(
        one,
        updateRow(other, lastIn(other, "root").id, tags([A], "INCLUDES")),
        "scene"
      )
    ).toBe(false);
    expect(editTreesEqual(one, setMatch(one, "root", "any"), "scene")).toBe(
      false
    );
  });

  it("item 64 shape", () => {
    const shape = [tags([A, B], "INCLUDES_ALL"), tags([C, D], "INCLUDES")];
    const group = groupOf("all", shape);
    expect(normalizeEditTree(group, "scene")).toEqual(group);
    const root = rootOf("all", shape);
    expect(normalizeEditTree(root, "scene")).toEqual(root);
  });
});
