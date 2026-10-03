/**
 * The client's filter tree: the flat prefixed state (Contract 3) as a tree of
 * rows and groups, its URL codec, its wire form and the comparisons a View
 * makes. Old links read and write as before (the `url.json` goldens).
 */
import {
  type ListKind,
  PANEL_FIELDS,
  type PanelField,
  type WhereGroup,
  type WhereLeaf,
  isWhereGroup,
} from "@peek/shared-types";
import { must } from "@tests/testUtils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type PanelRow,
  type PanelState,
  codecOf,
  filtersEqual,
  isFilterUrlKey,
  mergeAnyRows,
  prefixedParams,
  readTreeUrl,
  stateOf,
  stateOfWhere,
  treeCounts,
  treeOf,
  viewModified,
  whereOf,
  writeTreeUrl,
} from "@/utils/filterFields";
import { SPECS } from "@/utils/filterFields/options";

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

const rowsOf = (kind: ListKind): readonly PanelField[] => PANEL_FIELDS[kind];

const rowOf = (kind: ListKind, key: string): PanelField =>
  must(
    rowsOf(kind).find((row) => row.key === key),
    `${kind} row ${key}`
  );

const read = (kind: ListKind, query: string): PanelState =>
  readTreeUrl(kind, rowsOf(kind), new URLSearchParams(query));

const write = (kind: ListKind, state: PanelState, base = ""): string => {
  const params = new URLSearchParams(base);
  writeTreeUrl(kind, rowsOf(kind), state, params);
  return params.toString();
};

const goldenOf = (list: ListKind, file: string): unknown =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, `../__golden__/${list}/${file}.json`),
      "utf8"
    )
  );

interface RoundTrip {
  label: string;
  params: string;
  parsed: PanelState;
}
interface ListParams {
  label: string;
  written: string;
  filters: PanelState;
}
interface UrlGolden {
  roundTrip: RoundTrip[];
  imperialRoundTrip: RoundTrip[];
  listParams: ListParams[];
  imperialListParams: ListParams[];
}
interface BuildersGolden {
  samples: { label: string; state: PanelState }[];
}

/** A leaf of the scene list's wire tree, as a codec builds it */
const leafOf = (
  kind: ListKind,
  key: string,
  state: PanelState
): WhereLeaf<ListKind> => {
  const row = rowOf(kind, key);
  return {
    field: row.field,
    criterion: codecOf(row).toCriterion(
      row,
      must(SPECS[kind][row.field], row.field),
      state
    ),
  } as WhereLeaf<ListKind>;
};

const tagRow = (state: PanelState): PanelRow => ({
  field: rowOf("scene", "tagIds"),
  state,
});

describe("readTreeUrl and writeTreeUrl", () => {
  it.each(LISTS)(
    "every golden URL sample reads and writes as before: %s",
    (list) => {
      const golden = goldenOf(list, "url") as UrlGolden;
      for (const sample of [...golden.roundTrip, ...golden.imperialRoundTrip]) {
        expect(read(list, sample.params), sample.label).toEqual(sample.parsed);
        expect(write(list, sample.parsed), sample.label).toBe(sample.params);
      }
      for (const sample of [
        ...golden.listParams,
        ...golden.imperialListParams,
      ]) {
        expect(read(list, sample.written), sample.label).toEqual(
          sample.filters
        );
        expect(
          write(list, sample.filters, "instance=inst-a&tab=x"),
          sample.label
        ).toBe(
          // A sample with no filter wrote `filters=none` beside them
          sample.written.replace(/&filters=none$/, "")
        );
      }
    }
  );

  it("a group round-trips", () => {
    const query =
      "g1=any&g1.performerFavorite=true&g1.tagFavorite=true&watched=false";
    const state = read("scene", query);
    const tree = treeOf("scene", state);

    expect(tree.match).toBe("all");
    expect(tree.rows.map((row) => [row.field.key, row.state])).toEqual([
      ["watched", { watched: "false" }],
    ]);
    expect(tree.groups).toHaveLength(1);
    const group = must(tree.groups[0], "group 1");
    expect(group.match).toBe("any");
    expect(group.rows.map((row) => [row.field.key, row.state])).toEqual([
      ["performerFavorite", { performerFavorite: "true" }],
      ["tagFavorite", { tagFavorite: "true" }],
    ]);
    expect(write("scene", state)).toBe(query);
  });

  it("item 64 round-trips", () => {
    const query =
      "tagIds=1%3Aa%2C2%3Aa&tagIdsModifier=INCLUDES&2.tagIds=5%3Aa%2C6%3Aa&2.tagIdsModifier=INCLUDES";
    const state = read(
      "scene",
      "tagIds=1:a,2:a&tagIdsModifier=INCLUDES&2.tagIds=5:a,6:a&2.tagIdsModifier=INCLUDES"
    );
    const tree = treeOf("scene", state);

    expect(tree.groups).toEqual([]);
    expect(tree.rows.map((row) => [row.field.key, row.state])).toEqual([
      ["tagIds", { tagIds: ["1:a", "2:a"], tagIdsModifier: "INCLUDES" }],
      ["tagIds", { tagIds: ["5:a", "6:a"], tagIdsModifier: "INCLUDES" }],
    ]);
    expect(write("scene", state)).toBe(query);
  });

  it("a root any", () => {
    const state = read("scene", "match=any&tagIds=1:a&rating_min=60");
    const tree = treeOf("scene", state);

    expect(tree.match).toBe("any");
    expect(tree.rows.map((row) => row.field.key)).toEqual(["tagIds", "rating"]);
    expect(write("scene", state)).toBe("match=any&tagIds=1%3Aa&rating_min=60");
  });

  it("lenient reads", () => {
    // g6 and 21 are out of range, g1=foo reads as all, g1.unknown is no
    // row's key, and g1.2.tagIds without g1.tagIds is the group's only Tags row
    expect(
      read(
        "scene",
        "g6.tagIds=1:a&21.tagIds=2:a&g1=foo&g1.unknown=x&g1.2.tagIds=3:a"
      )
    ).toEqual({ g1: "all", "g1.tagIds": ["3:a"] });
  });

  it("a choice other than its default stays a row, though it sends nothing", () => {
    // Clips show only those with a preview unless the URL says "All clips"
    expect(read("clip", "isGenerated=all")).toEqual({ isGenerated: "all" });
    expect(write("clip", { isGenerated: "all" })).toBe("isGenerated=all");
    expect(treeOf("clip", { isGenerated: "all" }).rows).toHaveLength(1);
    expect(whereOf("clip", { isGenerated: "all" })).toBeUndefined();
    expect(read("scene", "watched=any")).toEqual({});
  });

  it("the singular card-count form is read at the root only", () => {
    expect(read("scene", "tagId=5&instance=abc")).toEqual({
      tagIds: ["5:abc"],
    });
    expect(read("scene", "g1.tagId=5&instance=abc")).toEqual({});
  });

  it("a URL with 22 root rows reads the first 20 in canonical order", () => {
    const repeats = Array.from(
      { length: 20 },
      (_, index) => `${index === 0 ? "" : `${index + 1}.`}tagIds=${index + 1}:a`
    );
    const state = read(
      "scene",
      ["watched=true", ...repeats, "title=x"].join("&")
    );
    const tree = treeOf("scene", state);

    expect(treeCounts(tree)).toEqual({ rows: 20, groups: 0 });
    expect(tree.rows.map((row) => row.field.key)).toEqual([
      "title",
      ...Array.from({ length: 19 }, () => "tagIds"),
    ]);
    expect(must(tree.rows[19], "row 20").state).toEqual({ tagIds: ["19:a"] });
    expect(state).not.toHaveProperty("watched");
    expect(state).not.toHaveProperty("20.tagIds");
  });

  it("a prefixed view reads and writes the prefixed keys", () => {
    const params = new URLSearchParams("g1.2.tagIds=1:a&tagIds=2:a");
    const view = prefixedParams(params, "g1.2.");

    expect(view.get("tagIds")).toBe("1:a");
    expect(view.has("tagIdsModifier")).toBe(false);
    view.set("tagIdsModifier", "INCLUDES");
    expect(params.get("g1.2.tagIdsModifier")).toBe("INCLUDES");
    expect(prefixedParams(params, "").get("tagIds")).toBe("2:a");
  });
});

describe("isFilterUrlKey", () => {
  it("names today's keys, prefixed keys, match and the group keys", () => {
    for (const key of [
      "tagIds",
      "tagId",
      "tagIdsModifier",
      "rating_min",
      "g1.tagIds",
      "2.tagIds",
      "g5.20.rating_min",
      "match",
      "g1",
      "g5",
    ]) {
      expect(isFilterUrlKey("scene", key), key).toBe(true);
    }
  });

  it("never names savedView, the page's keys or out-of-range prefixes", () => {
    for (const key of [
      "savedView",
      "tab",
      "instance",
      "image",
      "q",
      "sort",
      "g6",
      "g6.tagIds",
      "21.tagIds",
      "g1.unknown",
      "g1.tagId",
    ]) {
      expect(isFilterUrlKey("scene", key), key).toBe(false);
    }
  });
});

describe("stateOf is canonical", () => {
  it("removing group 1 of 2 renumbers g2. to g1.", () => {
    const tree = treeOf("scene", {
      g1: "any",
      "g1.watched": "true",
      "g1.favorite": "true",
      g2: "any",
      "g2.tagIds": ["5:a"],
      "g2.2.tagIds": ["6:a"],
    });
    expect(stateOf("scene", { ...tree, groups: tree.groups.slice(1) })).toEqual(
      { g1: "any", "g1.tagIds": ["5:a"], "g1.2.tagIds": ["6:a"] }
    );
  });

  it("removing the first of two Tags rows moves 2.tagIds to tagIds", () => {
    const tree = treeOf("scene", {
      tagIds: ["1:a"],
      "2.tagIds": ["5:a", "6:a"],
      "2.tagIdsModifier": "INCLUDES",
    });
    expect(stateOf("scene", { ...tree, rows: tree.rows.slice(1) })).toEqual({
      tagIds: ["5:a", "6:a"],
      tagIdsModifier: "INCLUDES",
    });
  });

  it("a group with no active row is dropped", () => {
    const tree = treeOf("scene", {
      g1: "any",
      "g1.watched": "any",
      g2: "any",
      "g2.favorite": "true",
    });
    expect(tree.groups).toHaveLength(1);
    expect(stateOf("scene", tree)).toEqual({
      g1: "any",
      "g1.favorite": "true",
    });
  });

  it("rows are ordered by the panel table within a container", () => {
    const tree = treeOf("scene", {
      "g1.watched": "true",
      "g1.title": "x",
      watched: "false",
      "2.tagIds": ["2:a"],
      title: "y",
      tagIds: ["1:a"],
    });
    expect(tree.rows.map((row) => row.field.key)).toEqual([
      "title",
      "tagIds",
      "tagIds",
      "watched",
    ]);
    expect(tree.rows.map((row) => row.state)).toContainEqual({
      tagIds: ["1:a"],
    });
    expect(must(tree.rows[1], "first Tags").state).toEqual({
      tagIds: ["1:a"],
    });
    expect(
      must(tree.groups[0], "group 1").rows.map((row) => row.field.key)
    ).toEqual(["title", "watched"]);
    expect(Object.keys(stateOf("scene", tree))).toEqual([
      "title",
      "tagIds",
      "2.tagIds",
      "watched",
      "g1",
      "g1.title",
      "g1.watched",
    ]);
  });

  it("keeps a page's permanent criteria at the root, never as rows", () => {
    const permanent = { performers: { value: ["9:a"], modifier: "INCLUDES" } };
    const tree = treeOf("scene", { ...permanent, title: "x" });
    expect(tree.permanent).toEqual(permanent);
    expect(tree.rows.map((row) => row.field.key)).toEqual(["title"]);
    expect(stateOf("scene", tree)).toEqual({ ...permanent, title: "x" });
  });
});

describe("whereOf builds the wire", () => {
  it("root rows become leaves with each codec's toCriterion", () => {
    expect(
      whereOf("scene", {
        tagIds: ["1:a"],
        tagIdsModifier: "INCLUDES",
        watched: "false",
      })
    ).toEqual({
      match: "all",
      rules: [
        { field: "tags", criterion: { value: ["1:a"], modifier: "INCLUDES" } },
        { field: "watched", criterion: false },
      ],
    });
    expect(whereOf("scene", { rating: { min: "60" }, match: "any" })).toEqual({
      match: "any",
      rules: [leafOf("scene", "rating", { rating: { min: "60" } })],
    });
  });

  it("a nested-path field is a leaf named by its table key", () => {
    // The tag list's Collections row fills `groups`, which the request
    // nests under `scenes_filter`; the leaf names the table key
    expect(whereOf("tag", { groupIds: ["3:a"] })).toEqual({
      match: "all",
      rules: [leafOf("tag", "groupIds", { groupIds: ["3:a"] })],
    });
    expect(
      must(whereOf("tag", { groupIds: ["3:a"] })?.rules[0], "leaf")
    ).toHaveProperty("field", "groups");
  });

  it("groups become groups, and inactive rows are left out", () => {
    expect(
      whereOf("scene", {
        title: "x",
        watched: "any",
        g1: "any",
        "g1.favorite": "true",
        "g1.watched": "any",
        g2: "all",
        "g2.watched": "any",
      })
    ).toEqual({
      match: "all",
      rules: [
        leafOf("scene", "title", { title: "x" }),
        {
          match: "any",
          rules: [leafOf("scene", "favorite", { favorite: "true" })],
        },
      ],
    });
  });

  it("no rows gives undefined", () => {
    expect(whereOf("scene", {})).toBeUndefined();
    expect(whereOf("scene", { watched: "any", g1: "any" })).toBeUndefined();
  });

  it("permanent keys are never leaves", () => {
    expect(
      whereOf("scene", {
        performers: { value: ["9:a"], modifier: "INCLUDES" },
        title: "x",
      })
    ).toEqual({
      match: "all",
      rules: [leafOf("scene", "title", { title: "x" })],
    });
  });

  it("two one-tag rows in an any group go on the wire as one leaf", () => {
    // Scene Tags default to Has ALL, which with one tag reads "any of"
    expect(
      whereOf("scene", {
        g1: "any",
        "g1.tagIds": ["1:a"],
        "g1.2.tagIds": ["2:a"],
        "g1.favorite": "true",
      })
    ).toEqual({
      match: "all",
      rules: [
        {
          match: "any",
          rules: [
            {
              field: "tags",
              criterion: { value: ["1:a", "2:a"], modifier: "INCLUDES" },
            },
            leafOf("scene", "favorite", { favorite: "true" }),
          ],
        },
      ],
    });
  });

  it("an all container never merges", () => {
    const where = whereOf("scene", {
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES",
      "2.tagIds": ["2:a"],
      "2.tagIdsModifier": "INCLUDES",
    });
    expect(where?.rules).toHaveLength(2);
  });
});

describe("stateOfWhere", () => {
  it.each(LISTS)(
    "is whereOf's inverse on every builders.json sample: %s",
    (list) => {
      const { samples } = goldenOf(list, "builders") as BuildersGolden;
      for (const sample of samples) {
        const where = whereOf(list, sample.state);
        if (where === undefined) continue;
        const back = stateOfWhere(list, where);
        expect(back.kept, sample.label).toEqual([]);
        expect(whereOf(list, back.state), sample.label).toEqual(where);
      }
    }
  );

  it("reads groups, repeats and the root's match", () => {
    const state = {
      match: "any",
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES",
      // Has ALL of two tags: never merged with the first row
      "2.tagIds": ["2:a", "3:a"],
      "2.tagIdsModifier": "INCLUDES_ALL",
      g1: "any",
      "g1.favorite": "true",
      "g1.watched": "false",
    };
    const where = must(whereOf("scene", state), "where");
    expect(stateOfWhere("scene", where)).toEqual({
      state: stateOf("scene", treeOf("scene", state)),
      kept: [],
    });
  });

  it("a leaf no row can read is kept whole", () => {
    const unknown = { field: "nope", criterion: { value: 1 } };
    const tags = {
      field: "tags",
      criterion: { value: ["1:a"], modifier: "INCLUDES" },
    };
    expect(
      stateOfWhere("scene", { match: "all", rules: [unknown, tags] })
    ).toEqual({
      state: { tagIds: ["1:a"], tagIdsModifier: "INCLUDES" },
      kept: [{ group: 0, leaf: unknown }],
    });
    expect(stateOfWhere("scene", "nonsense")).toEqual({ state: {}, kept: [] });
  });

  it("a kept leaf from group 1 goes back into group 1", () => {
    const unknown = { field: "nope", criterion: { value: 1 } };
    const where: WhereGroup<"scene"> = {
      match: "all",
      rules: [
        { field: "title", criterion: { value: "x", modifier: "INCLUDES" } },
        {
          match: "any",
          rules: [
            { field: "favorite", criterion: true },
            unknown as unknown as WhereLeaf<"scene">,
          ],
        },
        {
          match: "any",
          rules: [{ field: "watched", criterion: false }],
        },
      ],
    };
    const { state, kept } = stateOfWhere("scene", where);
    expect(kept).toEqual([{ group: 1, leaf: unknown }]);
    expect(whereOf("scene", state, kept)).toEqual(where);
  });

  it("a group of kept leaves alone keeps its place", () => {
    const unknown = { field: "nope", criterion: { value: 1 } };
    const where = {
      match: "all",
      rules: [
        { match: "any", rules: [unknown] },
        { match: "any", rules: [{ field: "watched", criterion: false }] },
      ],
    };
    const { state, kept } = stateOfWhere("scene", where);
    expect(kept).toEqual([{ group: 1, leaf: unknown }]);
    expect(whereOf("scene", state, kept)).toEqual(where);
    expect(must(whereOf("scene", state, kept)?.rules[0], "group 1")).toSatisfy(
      isWhereGroup
    );
  });
});

describe("mergeAnyRows", () => {
  const tags = (
    ids: string[],
    modifier: string | undefined,
    extra: PanelState = {}
  ): PanelRow =>
    tagRow({
      tagIds: ids,
      ...(modifier === undefined ? {} : { tagIdsModifier: modifier }),
      ...extra,
    });

  it("two Tags INCLUDES rows with equal depth merge", () => {
    expect(
      mergeAnyRows("scene", [
        tags(["1:a", "2:a"], "INCLUDES", { tagIdsDepth: -1 }),
        tags(["2:a", "3:a"], "INCLUDES", { tagIdsDepth: -1 }),
      ])
    ).toEqual([tags(["1:a", "2:a", "3:a"], "INCLUDES", { tagIdsDepth: -1 })]);
  });

  it("one-value Has ALL rows merge", () => {
    expect(
      mergeAnyRows("scene", [
        tags(["1:a"], undefined),
        tags(["2:a"], "INCLUDES_ALL"),
      ])
    ).toEqual([tags(["1:a", "2:a"], "INCLUDES")]);
  });

  it("a row with excludes, a Has ALL row or different depths do not", () => {
    const excluding = [
      tags(["1:a"], "INCLUDES", { tagIdsExclude: ["9:a"] }),
      tags(["2:a"], "INCLUDES"),
    ];
    expect(mergeAnyRows("scene", excluding)).toEqual(excluding);
    const hasAll = [
      tags(["1:a", "3:a"], "INCLUDES_ALL"),
      tags(["2:a"], "INCLUDES"),
    ];
    expect(mergeAnyRows("scene", hasAll)).toEqual(hasAll);
    const depths = [
      tags(["1:a"], "INCLUDES", { tagIdsDepth: -1 }),
      tags(["2:a"], "INCLUDES"),
    ];
    expect(mergeAnyRows("scene", depths)).toEqual(depths);
  });

  it("the merged row is where the first was", () => {
    const title: PanelRow = {
      field: rowOf("scene", "title"),
      state: { title: "x" },
    };
    expect(
      mergeAnyRows("scene", [
        title,
        tags(["1:a"], "INCLUDES"),
        { field: rowOf("scene", "watched"), state: { watched: "true" } },
        tags(["2:a"], "INCLUDES"),
      ])
    ).toEqual([
      title,
      tags(["1:a", "2:a"], "INCLUDES"),
      { field: rowOf("scene", "watched"), state: { watched: "true" } },
    ]);
  });
});

describe("filtersEqual", () => {
  it("ignores id order, inactive rows and prefixes' numbering, and sees a changed modifier", () => {
    expect(
      filtersEqual(
        "scene",
        { tagIds: ["1:a", "2:a"], tagIdsModifier: "INCLUDES", watched: "any" },
        { tagIdsModifier: "INCLUDES", tagIds: ["2:a", "1:a"] }
      )
    ).toBe(true);
    expect(
      filtersEqual(
        "scene",
        { g2: "any", "g2.title": "x", "g2.favorite": "true" },
        { g1: "any", "g1.favorite": "true", "g1.title": "x" }
      )
    ).toBe(true);
    expect(
      filtersEqual(
        "scene",
        { tagIds: ["1:a"], tagIdsModifier: "INCLUDES" },
        { tagIds: ["1:a"], tagIdsModifier: "EXCLUDES" }
      )
    ).toBe(false);
    expect(
      filtersEqual(
        "scene",
        { g1: "any", "g1.title": "x" },
        { g1: "all", "g1.title": "x" }
      )
    ).toBe(false);
    expect(filtersEqual("scene", { title: "x" }, { title: "y" })).toBe(false);
  });

  it("a number an editor wrote equals the string the URL reads back", () => {
    expect(
      filtersEqual(
        "scene",
        { rating: { min: 60, max: 90 } },
        { rating: { min: "60", max: "90" } }
      )
    ).toBe(true);
    expect(
      filtersEqual(
        "scene",
        { rating: { min: 60, max: 90 } },
        { rating: { min: "65", max: "90" } }
      )
    ).toBe(false);
  });
});

describe("viewModified", () => {
  const view = {
    filters: { tagIds: ["1:a", "2:a"] },
    sort: "date",
    direction: "DESC",
    viewMode: "wall",
    gridDensity: "small",
  };

  it("sees a changed filter or sort, not a changed view mode or density", () => {
    const same = {
      filters: { tagIds: ["2:a", "1:a"] },
      sort: "date",
      direction: "DESC",
    };
    expect(viewModified("scene", view, same)).toBe(false);
    expect(
      viewModified("scene", view, { ...same, filters: { tagIds: ["1:a"] } })
    ).toBe(true);
    expect(viewModified("scene", view, { ...same, sort: "title" })).toBe(true);
    expect(viewModified("scene", view, { ...same, direction: "ASC" })).toBe(
      true
    );
  });

  it("reads a stored View leniently", () => {
    const current = { filters: {}, sort: "random_123", direction: "ASC" };
    // A lower-case direction, a random sort's seed, filters stored as null
    expect(
      viewModified(
        "scene",
        { filters: null, sort: "random_456", direction: "asc" },
        current
      )
    ).toBe(false);
    // A View with no sort or direction names none to differ from
    expect(viewModified("scene", { filters: {} }, current)).toBe(false);
  });
});
