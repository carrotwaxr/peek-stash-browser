/**
 * Pins (Contract 5): the fields and one-tap filters a user keeps on a
 * list's chip bar. A pinned filter acts on its key's first root row: on
 * when that row equals the pin, turned on by replacing the row, off by
 * removing it. Pins are stored per list kind, at most `PIN_LIMIT`.
 */
import {
  type ListPins,
  PANEL_FIELDS,
  PIN_LIMIT,
  type PinnedFilter,
  defaultPinsOf,
} from "@peek/shared-types";
import { must } from "@tests/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type PanelState,
  filterOptionsOf,
  readTreeUrl,
  rowState,
} from "@/utils/filterFields";
import {
  atCap,
  isPinnable,
  isPinnedFilterOn,
  pinField,
  pinFilter,
  pinnedFilterOf,
  pinsOf,
  togglePinnedFilter,
  unpinField,
  unpinFilter,
  visiblePins,
} from "@/utils/filterFields/pins";

const FAVORITES: PinnedFilter = {
  id: "default-favorites",
  key: "favorite",
  state: { favorite: true },
  label: "Favorites",
};

const UNWATCHED: PinnedFilter = {
  id: "default-unwatched",
  key: "watched",
  state: { watched: "false" },
  label: "Unwatched",
};

/** A list's pins: `fields` keys, then filters on the given keys */
const pinsWith = (
  fields: readonly string[],
  filters: readonly PinnedFilter[] = []
): ListPins => ({ fields, filters });

/** `n` pinnable scene field keys, none of them `date` */
const sceneFields = (n: number) =>
  PANEL_FIELDS.scene
    .filter((row) => row.key !== "date" && isPinnable("scene", row.key))
    .slice(0, n)
    .map((row) => row.key);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pins", () => {
  it("a new user's pins are `defaultPinsOf(kind)`: scenes Tags, Performers, Rating; Unwatched; Favorites", () => {
    const scenes = pinsOf("scene", undefined);

    expect(scenes).toEqual(defaultPinsOf("scene"));
    expect([...scenes.fields].sort()).toEqual(
      ["performerIds", "rating", "tagIds"].sort()
    );
    expect(scenes.filters.map((pin) => pin.label)).toEqual([
      "Unwatched",
      "Favorites",
    ]);
    expect(pinsOf("performer", undefined).filters).toMatchObject([
      { key: "favorite", label: "Favorites" },
    ]);
    // A list the user changed keeps what they stored
    expect(pinsOf("scene", pinsWith([]))).toEqual(pinsWith([]));
  });

  it('a pinned filter is on when the root\'s slice of its key equals its state after `normalizePanelState` (`favorite: true` stored, `"true"` in the URL: on)', () => {
    const fromUrl = readTreeUrl(
      "scene",
      PANEL_FIELDS.scene,
      new URLSearchParams("favorite=true")
    );
    expect(fromUrl.favorite).toBe("true");

    expect(isPinnedFilterOn("scene", fromUrl, FAVORITES)).toBe(true);
    expect(isPinnedFilterOn("scene", { favorite: "false" }, FAVORITES)).toBe(
      false
    );
    expect(isPinnedFilterOn("scene", {}, FAVORITES)).toBe(false);
    // The first root row only: a group's or a second row's value is not it
    expect(
      isPinnedFilterOn("scene", { "g1.favorite": "true", g1: "any" }, FAVORITES)
    ).toBe(false);
    expect(isPinnedFilterOn("scene", { watched: "false" }, UNWATCHED)).toBe(
      true
    );
  });

  it("turning a pinned filter on replaces its field's value; off removes the field", () => {
    const root: PanelState = {
      favorite: "false",
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES",
    };

    const on = togglePinnedFilter("scene", root, FAVORITES);
    expect(on).toEqual({
      favorite: "true",
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES",
    });
    expect(isPinnedFilterOn("scene", on, FAVORITES)).toBe(true);

    const off = togglePinnedFilter("scene", on, FAVORITES);
    expect(off).toEqual({ tagIds: ["1:a"], tagIdsModifier: "INCLUDES" });
  });

  it("a pin naming a key the list no longer has, or a view-locked field, is not drawn and does not count toward the cap", () => {
    // The timeline fixes Date: its option is not offered there
    const timeline = filterOptionsOf("scene").filter(
      (option) => option.key !== "date"
    );
    const pins = pinsWith(
      [...sceneFields(PIN_LIMIT - 2), "date", "gone"],
      [{ ...UNWATCHED, key: "nolonger", state: { nolonger: true } }]
    );

    const visible = visiblePins("scene", pins, timeline);

    expect(visible.fields).toEqual(sceneFields(PIN_LIMIT - 2));
    expect(visible.filters).toEqual([]);
    expect(atCap(visible)).toBe(false);
    // The grid offers Date, so the same pin shows there
    expect(
      visiblePins("scene", pins, filterOptionsOf("scene")).fields
    ).toContain("date");
  });

  it("a pinned Studios field shows on a studio's Performers tab", () => {
    // A page's locked field is offered (FILTERS-12): its row is AND-ed with the page's lock
    const pins = pinsWith(["studioIds"]);

    expect(
      visiblePins("performer", pins, filterOptionsOf("performer")).fields
    ).toEqual(["studioIds"]);
  });

  it("Pin as quick filter makes its id with `newClientToken`", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(171),
      randomUUID: () => {
        throw new TypeError("crypto.randomUUID is not a function");
      },
    });

    const pins = must(
      pinFilter("scene", pinsWith([]), { organized: "true" }, "organized"),
      "the pinned filter"
    );

    expect(must(pins.filters[0]).id).toBe("ab".repeat(16));
  });

  it("pinning at 10 is refused with `atCap`; unpinning the last pin stores empty lists, not the default", () => {
    const full = pinsWith(sceneFields(PIN_LIMIT - 1), [UNWATCHED]);
    expect(atCap(full)).toBe(true);
    expect(pinField("scene", full, "organized")).toBeUndefined();
    expect(
      pinFilter("scene", full, { organized: "true" }, "organized")
    ).toBeUndefined();
    expect(atCap(pinsWith(sceneFields(PIN_LIMIT - 1)))).toBe(false);

    const pinned = must(pinField("scene", pinsWith([]), "tagIds"), "a pin");
    expect(pinned).toEqual(pinsWith(["tagIds"]));
    expect(pinField("scene", pinned, "tagIds")).toEqual(pinned);
    expect(pinField("scene", pinned, "nosuchfield")).toBeUndefined();

    expect(unpinField(pinned, "tagIds")).toEqual({ fields: [], filters: [] });
    expect(unpinFilter(pinsWith([], [UNWATCHED]), UNWATCHED.id)).toEqual({
      fields: [],
      filters: [],
    });
  });

  it("Pin as quick filter stores the row's keys and companions only, ids as `id:instanceId`, measures metric", () => {
    const tags = must(
      pinFilter(
        "scene",
        pinsWith([]),
        {
          tagIds: ["1:a", "2:b"],
          tagIdsModifier: "INCLUDES_ALL",
          tagIdsDepth: -1,
          tagIdsExclude: ["6:a"],
          title: "not a tag key",
        },
        "tagIds"
      ),
      "the Tags pin"
    );
    expect(must(tags.filters[0])).toMatchObject({
      key: "tagIds",
      state: {
        tagIds: ["1:a", "2:b"],
        tagIdsModifier: "INCLUDES_ALL",
        tagIdsDepth: -1,
        tagIdsExclude: ["6:a"],
      },
    });
    expect(must(tags.filters[0]).state).not.toHaveProperty("title");
    expect(must(tags.filters[0])).not.toHaveProperty("label");

    // A bare id names no instance: the server refuses it, so it is left out
    const bare = must(
      pinFilter("scene", pinsWith([]), { tagIds: ["1:a", "7"] }, "tagIds"),
      "the Tags pin"
    );
    expect(must(bare.filters[0]).state).toEqual({ tagIds: ["1:a"] });
    expect(
      pinFilter("scene", pinsWith([]), { tagIds: ["7"] }, "tagIds")
    ).toBeUndefined();

    // Height as the list holds it: centimetres, whatever the viewer reads
    const url = readTreeUrl(
      "performer",
      PANEL_FIELDS.performer,
      new URLSearchParams("height_min=150")
    );
    const row = rowState("performer", url, {
      group: 0,
      occurrence: 1,
      key: "height",
    });
    const height = must(
      pinFilter("performer", pinsWith([]), row, "height"),
      "the Height pin"
    );
    expect(must(height.filters[0]).state).toEqual(row);
    expect(JSON.stringify(must(height.filters[0]).state)).toContain("150");

    // An empty row has nothing to pin; a value pinned already is found
    expect(
      pinFilter("scene", pinsWith([]), { organized: "any" }, "organized")
    ).toBeUndefined();
    const once = must(
      pinFilter("scene", pinsWith([]), { organized: "true" }, "organized"),
      "the pin"
    );
    expect(
      pinnedFilterOf("scene", once, { organized: "true" }, "organized")
    ).toBe(once.filters[0]);
    expect(
      pinFilter("scene", once, { organized: "true" }, "organized")
    ).toEqual(once);
  });
});
