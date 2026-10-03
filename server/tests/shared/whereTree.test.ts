/**
 * Unit tests for the where tree's shared pieces (PR 9b W1): the key grammar
 * of the flat filter state, the same-field merge key, and the pins' defaults.
 */
import {
  LIST_KINDS,
  type ListRequestInput,
  MAX_REF_VALUES,
  PANEL_FIELDS,
  PERFORMER_FIELDS,
  type PanelField,
  SCENE_FIELDS,
} from "@peek/shared-types/filters/index.js";
import {
  DEFAULT_PINNED_FILTERS,
  PIN_LIMIT,
  defaultPinsOf,
} from "@peek/shared-types/filters/pins.js";
import {
  ROOT_MATCH_KEY,
  WHERE_LIMITS,
  type WhereGroup,
  anyMergeCap,
  anyMergeKey,
  groupKeyOf,
  isWhereGroup,
  parseRowKey,
  rowKeyOf,
} from "@peek/shared-types/filters/tree.js";
import { describe, expect, it } from "vitest";

const PARSED = [
  ["tagIds", { group: 0, occurrence: 1, key: "tagIds" }],
  ["2.tagIds", { group: 0, occurrence: 2, key: "tagIds" }],
  ["g3.tagIdsModifier", { group: 3, occurrence: 1, key: "tagIdsModifier" }],
  ["g1.4.rating_min", { group: 1, occurrence: 4, key: "rating_min" }],
] as const;

describe("row keys", () => {
  it("parseRowKey reads root, occurrence and group prefixes", () => {
    for (const [raw, expected] of PARSED) {
      expect(parseRowKey(raw)).toEqual(expected);
    }
    expect(parseRowKey("20.tagIds")).toEqual({
      group: 0,
      occurrence: 20,
      key: "tagIds",
    });
    expect(parseRowKey("g5.tagIds")).toEqual({
      group: 5,
      occurrence: 1,
      key: "tagIds",
    });
  });

  it("parseRowKey refuses what the grammar does not allow", () => {
    for (const raw of [
      "g6.tagIds",
      "21.tagIds",
      "1.tagIds",
      "02.tagIds",
      "g0.x",
      "g01.x",
      "match",
      ROOT_MATCH_KEY,
      "g1",
      "",
      "g1.",
      "2.",
      "g1.1.tagIds",
    ]) {
      expect(parseRowKey(raw), raw).toBeUndefined();
    }
  });

  it("rowKeyOf is the inverse", () => {
    for (const [raw, parsed] of PARSED) {
      expect(rowKeyOf(parsed.group, parsed.occurrence, parsed.key)).toBe(raw);
      const reparsed = parseRowKey(
        rowKeyOf(parsed.group, parsed.occurrence, parsed.key)
      );
      expect(reparsed).toEqual(parsed);
    }
  });

  it("groupKeyOf names a group's match key", () => {
    expect(groupKeyOf(1)).toBe("g1");
    expect(groupKeyOf(5)).toBe("g5");
  });
});

describe("where tree", () => {
  it("limits are the root plus one level of groups", () => {
    expect(WHERE_LIMITS).toEqual({ depth: 2, rows: 20, groups: 5, refs: 2000 });
  });

  it("a request's where types its leaves by field", () => {
    const where: WhereGroup<"scene"> = {
      match: "all",
      rules: [
        { field: "tags", criterion: { value: ["1:a"], modifier: "INCLUDES" } },
        { field: "favorite", criterion: true },
        {
          match: "any",
          rules: [{ field: "title", criterion: { value: "x" } }],
        },
      ],
    };
    const request: ListRequestInput<"scene"> = { where };
    expect(request.where?.rules).toHaveLength(3);
  });

  it("isWhereGroup tells a group from a leaf", () => {
    expect(isWhereGroup({ match: "all", rules: [] })).toBe(true);
    expect(isWhereGroup({ field: "title", criterion: { value: "x" } })).toBe(
      false
    );
    expect(isWhereGroup(null)).toBe(false);
    expect(isWhereGroup("x")).toBe(false);
  });
});

describe("anyMergeKey", () => {
  const ref = (
    modifier: string | undefined,
    valueCount: number,
    extra: { depth?: number | null; excludes?: readonly unknown[] | null } = {}
  ) => ({
    ...(modifier === undefined ? {} : { modifier }),
    valueCount,
    ...extra,
  });

  it("keys INCLUDES and one-value INCLUDES_ALL ref and multi-enum leaves by field and depth", () => {
    const tagsA = anyMergeKey("tags", SCENE_FIELDS.tags, ref("INCLUDES", 1));
    const tagsB = anyMergeKey(
      "tags",
      SCENE_FIELDS.tags,
      ref("INCLUDES_ALL", 1)
    );
    expect(tagsA).toBeDefined();
    expect(tagsB).toBe(tagsA);
    // an absent modifier is the field's default
    expect(anyMergeKey("tags", SCENE_FIELDS.tags, ref(undefined, 2))).toBe(
      SCENE_FIELDS.tags.defaultModifier === "INCLUDES" ? tagsA : undefined
    );

    expect(
      anyMergeKey("tags", SCENE_FIELDS.tags, ref("INCLUDES_ALL", 2))
    ).toBeUndefined();
    expect(
      anyMergeKey("tags", SCENE_FIELDS.tags, ref("EXCLUDES", 1))
    ).toBeUndefined();
    expect(
      anyMergeKey("tags", SCENE_FIELDS.tags, ref("IS_NULL", 0))
    ).toBeUndefined();
    expect(
      anyMergeKey(
        "tags",
        SCENE_FIELDS.tags,
        ref("INCLUDES", 1, { excludes: ["9:a"] })
      )
    ).toBeUndefined();
    expect(
      anyMergeKey(
        "tags",
        SCENE_FIELDS.tags,
        ref("INCLUDES", 1, { excludes: [] })
      )
    ).toBe(tagsA);

    // depth: absent is 0, and 0 and -1 differ
    expect(
      anyMergeKey("tags", SCENE_FIELDS.tags, ref("INCLUDES", 1, { depth: 0 }))
    ).toBe(tagsA);
    expect(
      anyMergeKey(
        "tags",
        SCENE_FIELDS.tags,
        ref("INCLUDES", 1, { depth: null })
      )
    ).toBe(tagsA);
    const deep = anyMergeKey(
      "tags",
      SCENE_FIELDS.tags,
      ref("INCLUDES", 1, { depth: -1 })
    );
    expect(deep).toBeDefined();
    expect(deep).not.toBe(tagsA);

    // another field never shares a key
    expect(
      anyMergeKey("performers", SCENE_FIELDS.performers, ref("INCLUDES", 1))
    ).not.toBe(tagsA);

    // a multi-enum leaf
    expect(
      anyMergeKey("gender", PERFORMER_FIELDS.gender, ref("INCLUDES", 2))
    ).toBeDefined();

    // a number field and a text field never merge
    expect(
      anyMergeKey("rating100", SCENE_FIELDS.rating100, ref("INCLUDES", 1))
    ).toBeUndefined();
    expect(
      anyMergeKey("title", SCENE_FIELDS.title, ref("INCLUDES", 1))
    ).toBeUndefined();

    // playlists merge like refs
    expect(
      anyMergeKey("playlists", SCENE_FIELDS.playlists, ref("INCLUDES", 3))
    ).toBeDefined();
  });

  it("two playlist rows whose union passes 100 stay apart", () => {
    const cap = anyMergeCap(SCENE_FIELDS.playlists);
    expect(cap).toBe(100);
    expect(60 + 60 > cap).toBe(true);
    expect(anyMergeCap(SCENE_FIELDS.tags)).toBe(MAX_REF_VALUES);
  });
});

describe("defaultPinsOf", () => {
  it("seeds the table's pinned fields and the default filters", () => {
    const scene = defaultPinsOf("scene");
    expect(scene.fields).toEqual(["performerIds", "tagIds", "rating"]);
    expect(scene.filters.map((f) => f.state)).toEqual([
      { watched: "false" },
      { favorite: "true" },
    ]);

    const performer = defaultPinsOf("performer");
    expect(performer.fields).toEqual(["tagIds", "gender", "rating"]);
    expect(performer.filters.map((f) => f.state)).toEqual([{ favorite: true }]);

    const clip = defaultPinsOf("clip");
    expect(clip.fields).toEqual(["tagIds"]);
    expect(clip.filters).toEqual([]);
  });

  it("no list exceeds the pin limit and every default field is a pinnable row of its list", () => {
    for (const kind of LIST_KINDS) {
      const pins = defaultPinsOf(kind);
      expect(
        pins.fields.length + pins.filters.length,
        kind
      ).toBeLessThanOrEqual(PIN_LIMIT);
      const rows: readonly PanelField[] = PANEL_FIELDS[kind];
      for (const key of pins.fields) {
        const row = rows.find((r) => r.key === key);
        expect(row, `${kind}.${key}`).toBeDefined();
        expect(row?.pinnable !== false, `${kind}.${key}`).toBe(true);
      }
    }
  });

  it("every default filter turns its list's favorite row on", () => {
    const withFavorite = LIST_KINDS.filter(
      (kind) => DEFAULT_PINNED_FILTERS[kind].length > 0
    );
    // only clips have no default filter
    expect(LIST_KINDS.filter((kind) => !withFavorite.includes(kind))).toEqual([
      "clip",
    ]);
    for (const kind of withFavorite) {
      const rows: readonly PanelField[] = PANEL_FIELDS[kind];
      const favorite = rows.find((r) => r.key === "favorite");
      expect(favorite, kind).toBeDefined();
      const on =
        favorite?.editor === "choice"
          ? favorite.choices.find((c) => c.sends === true)?.value
          : true;
      expect(defaultPinsOf(kind).filters, kind).toContainEqual({
        id: "default-favorites",
        key: "favorite",
        state: { favorite: on },
        label: "Favorites",
      });
    }
    const scene = PANEL_FIELDS.scene.find((r) => r.key === "watched");
    expect(scene?.editor).toBe("choice");
    expect(defaultPinsOf("scene").filters[0]).toEqual({
      id: "default-unwatched",
      key: "watched",
      state: { watched: "false" },
      label: "Unwatched",
    });
  });
});
