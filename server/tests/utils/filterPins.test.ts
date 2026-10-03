/**
 * Pins validation and reading (W8): what a user may store as a list's pinned
 * fields and filters, and the defaults a list without a stored entry shows.
 */
import {
  LIST_KINDS,
  type ListKind,
  PANEL_FIELDS,
  PIN_LIMIT,
  type PanelField,
  defaultPinsOf,
} from "@peek/shared-types/filters/index.js";
import { describe, expect, it } from "vitest";
import {
  PINS_MAX_BYTES,
  pinsOf,
  validateListPins,
} from "../../utils/filterPins.js";
import { stringContaining } from "../helpers/matchers.js";

/** The problems a body has, as `path: message` lines (empty when it is valid) */
function problemsOf(kind: ListKind, body: unknown, rows?: PanelField[]) {
  const result = validateListPins(kind, body, rows);
  return "issues" in result ? result.issues : [];
}

const pathsOf = (kind: ListKind, body: unknown, rows?: PanelField[]) =>
  problemsOf(kind, body, rows).map((issue) => issue.path);

const FAVORITE = {
  id: "0123456789abcdef0123456789abcdef",
  key: "favorite",
  state: { favorite: "true" },
};

describe("validateListPins", () => {
  it.each(LIST_KINDS)("accepts the defaults of every list (%s)", (kind) => {
    const defaults = defaultPinsOf(kind);
    const result = validateListPins(kind, defaults);
    expect(result).toEqual({ pins: defaults });
  });

  it("keeps only the declared members of a valid body", () => {
    const result = validateListPins("scene", {
      fields: ["tagIds"],
      filters: [{ ...FAVORITE, label: "Faves", extra: 1 }],
      other: true,
    });
    expect(result).toEqual({
      pins: {
        fields: ["tagIds"],
        filters: [{ ...FAVORITE, label: "Faves" }],
      },
    });
  });

  it("accepts a newClientToken id and a seed id", () => {
    expect(
      problemsOf("scene", {
        fields: [],
        filters: [
          FAVORITE,
          { ...FAVORITE, id: "default-favorites" },
          { ...FAVORITE, id: "a_B-9" },
        ],
      })
    ).toEqual([]);
  });

  it("refuses a body that is no object, and fields or filters that are no lists", () => {
    expect(pathsOf("scene", null)).toEqual([""]);
    expect(pathsOf("scene", { fields: "tagIds", filters: [] })).toEqual([
      "fields",
    ]);
    expect(pathsOf("scene", { fields: [], filters: {} })).toEqual(["filters"]);
    expect(pathsOf("scene", { fields: [1], filters: [] })).toEqual([
      "fields[0]",
    ]);
  });

  it("refuses an unknown field key", () => {
    expect(
      pathsOf("scene", { fields: ["tagIds", "nope"], filters: [] })
    ).toEqual(["fields[1]"]);
    expect(pathsOf("scene", { fields: ["nope"], filters: [] })).toEqual([
      "fields[0]",
    ]);
  });

  it("refuses a field of another list", () => {
    // `performerIds` is no key of the studio panel
    expect(
      pathsOf("studio", { fields: ["performerIds"], filters: [] })
    ).toEqual(["fields[0]"]);
  });

  it("refuses a row with pinnable false", () => {
    const rows = PANEL_FIELDS.scene.map((row) =>
      row.key === "tagIds" ? { ...row, pinnable: false } : row
    ) as PanelField[];
    expect(pathsOf("scene", { fields: ["tagIds"], filters: [] }, rows)).toEqual(
      ["fields[0]"]
    );
    expect(
      pathsOf(
        "scene",
        {
          fields: [],
          filters: [{ ...FAVORITE, key: "tagIds", state: { tagIds: ["1:a"] } }],
        },
        rows
      )
    ).toEqual(["filters[0].key"]);
  });

  it("refuses a duplicate field", () => {
    expect(
      pathsOf("scene", { fields: ["tagIds", "rating", "tagIds"], filters: [] })
    ).toEqual(["fields[2]"]);
  });

  it(`refuses ${PIN_LIMIT + 1} pins in all`, () => {
    const keys = PANEL_FIELDS.scene.map((row) => row.key);
    const fields = keys.slice(0, 6);
    const filters = Array.from({ length: PIN_LIMIT + 1 - 6 }, (_, index) => ({
      ...FAVORITE,
      id: `pin-${index}`,
    }));
    expect(fields.length + filters.length).toBe(PIN_LIMIT + 1);
    expect(pathsOf("scene", { fields, filters })).toEqual(["pins"]);
    // PIN_LIMIT is allowed
    expect(pathsOf("scene", { fields, filters: filters.slice(0, -1) })).toEqual(
      []
    );
  });

  it("refuses a filter whose key is no row", () => {
    expect(
      pathsOf("scene", {
        fields: [],
        filters: [{ ...FAVORITE, key: "nope", state: { nope: "true" } }],
      })
    ).toEqual(["filters[0].key"]);
  });

  it("refuses a filter state key that is not the row's key or companion", () => {
    expect(
      pathsOf("scene", {
        fields: [],
        filters: [{ ...FAVORITE, state: { favorite: "true", x: "1" } }],
      })
    ).toEqual(["filters[0].state.x"]);
    // another row's key is no companion of this one
    expect(
      pathsOf("scene", {
        fields: [],
        filters: [
          { ...FAVORITE, state: { favorite: "true", watched: "true" } },
        ],
      })
    ).toEqual(["filters[0].state.watched"]);
  });

  it("accepts a ref row's modifier, depth and exclude companions", () => {
    expect(
      problemsOf("scene", {
        fields: [],
        filters: [
          {
            id: "tags-1",
            key: "tagIds",
            state: {
              tagIds: ["5:inst-1"],
              tagIdsModifier: "INCLUDES",
              tagIdsDepth: "all",
              tagIdsExclude: ["6:inst-1"],
            },
          },
        ],
      })
    ).toEqual([]);
  });

  it("refuses a filter state with no active value", () => {
    for (const state of [
      {},
      { favorite: "any" },
      { favorite: "" },
      { favorite: false },
      { favorite: null },
    ]) {
      expect(
        pathsOf("scene", { fields: [], filters: [{ ...FAVORITE, state }] })
      ).toEqual(["filters[0].state"]);
    }
    expect(
      pathsOf("scene", {
        fields: [],
        filters: [
          {
            id: "tags-1",
            key: "tagIds",
            state: { tagIds: [], tagIdsModifier: "INCLUDES" },
          },
        ],
      })
    ).toEqual(["filters[0].state"]);
  });

  it("takes a presence modifier as a value", () => {
    expect(
      problemsOf("scene", {
        fields: [],
        filters: [
          {
            id: "no-tags",
            key: "tagIds",
            state: { tagIds: [], tagIdsModifier: "IS_NULL" },
          },
        ],
      })
    ).toEqual([]);
  });

  it("refuses a ref id without its instance (invariant 7)", () => {
    expect(
      pathsOf("scene", {
        fields: [],
        filters: [{ id: "t", key: "tagIds", state: { tagIds: ["5"] } }],
      })
    ).toEqual(["filters[0].state.tagIds[0]"]);
    expect(
      pathsOf("scene", {
        fields: [],
        filters: [
          {
            id: "t",
            key: "tagIds",
            state: { tagIds: ["5:inst-1"], tagIdsExclude: ["6", "7:inst-1"] },
          },
        ],
      })
    ).toEqual(["filters[0].state.tagIdsExclude[0]"]);
    expect(
      pathsOf("scene", {
        fields: [],
        filters: [{ id: "t", key: "tagIds", state: { tagIds: [5] } }],
      })
    ).toEqual(["filters[0].state.tagIds[0]"]);
  });

  it("takes positive integer ids on a playlists row", () => {
    const filter = (ids: unknown[]) => ({
      fields: [],
      filters: [{ id: "p", key: "playlistIds", state: { playlistIds: ids } }],
    });
    expect(problemsOf("scene", filter(["12", 7]))).toEqual([]);
    expect(pathsOf("scene", filter(["0"]))).toEqual([
      "filters[0].state.playlistIds[0]",
    ]);
    expect(pathsOf("scene", filter(["12:inst-1"]))).toEqual([
      "filters[0].state.playlistIds[0]",
    ]);
    expect(pathsOf("scene", filter(["-3", "x"]))).toEqual([
      "filters[0].state.playlistIds[0]",
      "filters[0].state.playlistIds[1]",
    ]);
  });

  it("refuses a label over 60 characters", () => {
    expect(
      pathsOf("scene", {
        fields: [],
        filters: [{ ...FAVORITE, label: "x".repeat(60) }],
      })
    ).toEqual([]);
    expect(
      pathsOf("scene", {
        fields: [],
        filters: [{ ...FAVORITE, label: "x".repeat(61) }],
      })
    ).toEqual(["filters[0].label"]);
    expect(
      pathsOf("scene", { fields: [], filters: [{ ...FAVORITE, label: 5 }] })
    ).toEqual(["filters[0].label"]);
  });

  it("refuses a duplicate filter id", () => {
    expect(
      pathsOf("scene", { fields: [], filters: [FAVORITE, FAVORITE] })
    ).toEqual(["filters[1].id"]);
  });

  it("takes an id of 1 to 64 characters of letters, digits, _ and -", () => {
    const idPaths = (id: unknown) =>
      pathsOf("scene", { fields: [], filters: [{ ...FAVORITE, id }] });
    expect(idPaths("a")).toEqual([]);
    expect(idPaths("x".repeat(64))).toEqual([]);
    expect(idPaths("")).toEqual(["filters[0].id"]);
    expect(idPaths("x".repeat(65))).toEqual(["filters[0].id"]);
    expect(idPaths("has space")).toEqual(["filters[0].id"]);
    expect(idPaths("a.b")).toEqual(["filters[0].id"]);
    expect(idPaths(12)).toEqual(["filters[0].id"]);
  });

  it("refuses a body over 16 KB", () => {
    expect(PINS_MAX_BYTES).toBe(16 * 1024);
    const ids = Array.from({ length: 1500 }, (_, index) => `${index}:inst-1`);
    const result = validateListPins("scene", {
      fields: [],
      filters: [{ id: "big", key: "tagIds", state: { tagIds: ids } }],
    });
    expect("issues" in result && result.issues).toEqual([
      { path: "", message: stringContaining("16 KB") },
    ]);
  });
});

describe("pinsOf", () => {
  it("fills every list missing from the stored value with its defaults and keeps a stored empty list empty", () => {
    const pins = pinsOf({
      performer: { fields: [], filters: [] },
      scene: { fields: ["rating"], filters: [] },
    });
    expect(Object.keys(pins)).toEqual([...LIST_KINDS]);
    expect(pins.performer).toEqual({ fields: [], filters: [] });
    expect(pins.scene).toEqual({ fields: ["rating"], filters: [] });
    for (const kind of LIST_KINDS) {
      if (kind === "performer" || kind === "scene") continue;
      expect(pins[kind]).toEqual(defaultPinsOf(kind));
    }
  });

  it("shows the defaults for no stored value, and for a stored entry that is not a list's pins", () => {
    const defaults = pinsOf(null);
    for (const kind of LIST_KINDS) {
      expect(defaults[kind]).toEqual(defaultPinsOf(kind));
    }
    expect(pinsOf("junk")).toEqual(defaults);
    expect(pinsOf({ scene: "junk", tag: { fields: "x" } })).toEqual(defaults);
  });

  it("drops a stored field or filter the panel no longer has", () => {
    const pins = pinsOf({
      scene: {
        fields: ["rating", "gone", "rating"],
        filters: [FAVORITE, { ...FAVORITE, id: "b", key: "gone" }],
      },
    });
    expect(pins.scene).toEqual({ fields: ["rating"], filters: [FAVORITE] });
  });
});
