/**
 * "Not rated" and "is set / not set": a number field whose contract spec
 * takes IS_NULL gets a condition select ("Between", then the field's
 * presence words) and a `<key>Modifier` companion. The choice sends the
 * modifier with no value, round-trips through the URL, presets and
 * carousel rules, and reads on its chip. The derivation reads the spec, so
 * the fields the server opened are exactly the ones offered.
 */
import {
  CLIP_FIELDS,
  FIELDS,
  type FieldSpec,
  LIST_KINDS,
  type ListKind,
  PANEL_FIELDS,
  type PanelField,
  UI_KEYS,
} from "@peek/shared-types";
import { describe, expect, it } from "vitest";
import {
  CAROUSEL_FILTER_DEFINITIONS,
  SCENE_FILTER_OPTIONS,
  buildCarouselRules,
  buildPerformerFilter,
  buildSceneFilter,
  carouselRulesToFilterState,
} from "@/utils/filterConfig";
import {
  activeFieldCount,
  buildPanelFilter,
  chipsOf,
  filterOptionsOf,
  readPanelFilter,
} from "@/utils/filterFields";
import { buildSearchParams, parseSearchParams } from "@/utils/urlParams";

const specsOf = (kind: ListKind): Readonly<Record<string, FieldSpec>> =>
  kind === "clip" ? CLIP_FIELDS : FIELDS[kind];

const rowsOf = (kind: ListKind): readonly PanelField[] => PANEL_FIELDS[kind];

/** Whether a number field's contract spec takes IS_NULL */
const takesPresence = (kind: ListKind, row: PanelField): boolean => {
  const spec = specsOf(kind)[row.field];
  return (
    row.editor === "number" &&
    spec?.kind === "number" &&
    spec.modifiers.some((modifier) => modifier === "IS_NULL")
  );
};

const NUMBER_ROWS = LIST_KINDS.flatMap((kind) =>
  rowsOf(kind)
    .filter((row) => row.editor === "number")
    .map((row) => ({ kind, row }))
);

describe("presence choices on number fields", () => {
  it("every number field whose spec takes IS_NULL offers the choice, and no other", () => {
    const offered = (kind: ListKind, key: string) => {
      const option = filterOptionsOf(kind).find((each) => each.key === key);
      return (option?.modifierOptions ?? []).map((choice) => choice.value);
    };
    const wrong = NUMBER_ROWS.flatMap(({ kind, row }) => {
      const expected = takesPresence(kind, row)
        ? ["BETWEEN", "IS_NULL", "NOT_NULL"]
        : [];
      const problems: string[] = [];
      if (JSON.stringify(offered(kind, row.key)) !== JSON.stringify(expected)) {
        problems.push(
          `${kind}.${row.key}: offers ${offered(kind, row.key).join(",")}`
        );
      }
      if ((row.modifierKey !== undefined) !== takesPresence(kind, row)) {
        problems.push(`${kind}.${row.key}: modifierKey ${row.modifierKey}`);
      }
      return problems;
    });

    expect(wrong).toEqual([]);
    // The fields S opened: Rating on six lists and the image list, four
    // performer measures and the collection's duration
    const offering = NUMBER_ROWS.filter(({ kind, row }) =>
      takesPresence(kind, row)
    ).map(({ kind, row }) => `${kind}.${row.key}`);
    expect(offering.sort()).toEqual(
      [
        "gallery.rating",
        "group.rating",
        "group.duration",
        "image.rating",
        "performer.rating",
        "performer.careerLength",
        "performer.height",
        "performer.weight",
        "performer.penisLength",
        "scene.rating",
        "studio.rating",
        "tag.rating",
      ].sort()
    );
  });

  it("each choice's companion is a UI key of its list", () => {
    for (const { kind, row } of NUMBER_ROWS) {
      if (!takesPresence(kind, row)) continue;
      expect(UI_KEYS[kind].find((key) => key.key === row.key)).toMatchObject({
        modifierKey: `${row.key}Modifier`,
      });
    }
  });

  it("Rating offers Not rated and Rated; Height offers Not set and Set", () => {
    const labels = (kind: ListKind, key: string) =>
      filterOptionsOf(kind)
        .find((each) => each.key === key)
        ?.modifierOptions?.map((choice) => choice.label);
    expect(labels("scene", "rating")).toEqual([
      "Between",
      "Not rated",
      "Rated",
    ]);
    expect(labels("performer", "height")).toEqual([
      "Between",
      "Not set",
      "Set",
    ]);
    expect(
      filterOptionsOf("scene").find((each) => each.key === "rating")
    ).toMatchObject({
      modifierKey: "ratingModifier",
      defaultModifier: "BETWEEN",
    });
  });

  it("Rating builds IS_NULL with no value, and the bounds are ignored while it is set", () => {
    expect(buildSceneFilter({ ratingModifier: "IS_NULL" })).toEqual({
      rating100: { modifier: "IS_NULL" },
    });
    expect(
      buildSceneFilter({
        ratingModifier: "IS_NULL",
        rating: { min: "20", max: "80" },
      })
    ).toEqual({ rating100: { modifier: "IS_NULL" } });
    expect(buildSceneFilter({ ratingModifier: "NOT_NULL" })).toEqual({
      rating100: { modifier: "NOT_NULL" },
    });
  });

  it("Between keeps the bounds' own criterion", () => {
    expect(
      buildSceneFilter({
        ratingModifier: "BETWEEN",
        rating: { min: "20", max: "80" },
      })
    ).toEqual({ rating100: { modifier: "BETWEEN", value: 20, value2: 80 } });
    // A modifier with no bounds filters nothing
    expect(buildSceneFilter({ ratingModifier: "BETWEEN" })).toEqual({});
  });

  it("Height builds NOT_NULL, in metric", () => {
    expect(buildPerformerFilter({ heightModifier: "NOT_NULL" })).toEqual({
      height: { modifier: "NOT_NULL" },
    });
    expect(buildPanelFilter("group", { durationModifier: "IS_NULL" })).toEqual({
      duration: { modifier: "IS_NULL" },
    });
  });

  it("a modifier no field takes is not a presence choice", () => {
    expect(buildSceneFilter({ ratingModifier: "GREATER_THAN" })).toEqual({});
    expect(buildSceneFilter({ oCountModifier: "IS_NULL" })).toEqual({});
  });

  describe("the URL", () => {
    const urlOf = (filters: Record<string, unknown>) =>
      buildSearchParams({
        searchText: "",
        sortField: "",
        sortDirection: "",
        currentPage: 1,
        perPage: 24,
        filters,
        filterOptions: SCENE_FILTER_OPTIONS,
        viewMode: "grid",
        zoomLevel: "medium",
        gridDensity: "medium",
        timelinePeriod: null,
      });

    it("writes ratingModifier=IS_NULL and no bounds, and reads it back", () => {
      const params = urlOf({
        ratingModifier: "IS_NULL",
        rating: { min: "20", max: "80" },
      });
      expect(params.get("ratingModifier")).toBe("IS_NULL");
      expect(params.has("rating_min")).toBe(false);
      expect(params.has("rating_max")).toBe(false);

      const { filters } = parseSearchParams(params, SCENE_FILTER_OPTIONS);
      expect(filters).toEqual({ ratingModifier: "IS_NULL" });
    });

    it("writes bounds without the choice for Between", () => {
      const params = urlOf({
        ratingModifier: "BETWEEN",
        rating: { min: "20" },
      });
      expect(params.has("ratingModifier")).toBe(false);
      expect(params.get("rating_min")).toBe("20");
    });

    it("drops a modifier that is no presence choice", () => {
      const read = parseSearchParams(
        new URLSearchParams("ratingModifier=GREATER_THAN"),
        SCENE_FILTER_OPTIONS
      );
      expect(read.filters).toEqual({});
    });
  });

  it("round-trips through a preset and a carousel rule", () => {
    // A preset holds the panel state
    const state = { ratingModifier: "IS_NULL" };
    expect(buildSceneFilter(state)).toEqual({
      rating100: { modifier: "IS_NULL" },
    });
    // A carousel rule reads the stored criterion back
    const rules = buildCarouselRules(state);
    expect(rules).toEqual({ rating100: { modifier: "IS_NULL" } });
    expect(carouselRulesToFilterState(rules)).toEqual({
      state: { ratingModifier: "IS_NULL" },
      kept: {},
    });
    expect(
      readPanelFilter("performer", { height: { modifier: "NOT_NULL" } })
    ).toEqual({ state: { heightModifier: "NOT_NULL" }, kept: {} });
  });

  it("the carousel builder offers the choice", () => {
    const rating = CAROUSEL_FILTER_DEFINITIONS.find(
      (each) => each.key === "rating"
    );
    expect(rating?.modifierOptions?.map((choice) => choice.value)).toEqual([
      "BETWEEN",
      "IS_NULL",
      "NOT_NULL",
    ]);
  });

  it("the chip reads Rating: not rated, and the badge counts it once", () => {
    const state = {
      ratingModifier: "IS_NULL",
      rating: { min: "20", max: "80" },
    };
    expect(chipsOf("scene", state)).toEqual([
      { key: "rating", parts: { label: "Rating", values: ["not rated"] } },
    ]);
    expect(activeFieldCount("scene", state)).toBe(1);
    expect(chipsOf("scene", { ratingModifier: "NOT_NULL" })[0]?.parts).toEqual({
      label: "Rating",
      values: ["rated"],
    });
    expect(
      chipsOf("performer", { heightModifier: "IS_NULL" })[0]?.parts
    ).toEqual({ label: "Height", values: ["not set"] });
    // Between with a range is the range's chip
    expect(
      chipsOf("scene", { ratingModifier: "BETWEEN", rating: { min: "20" } })[0]
        ?.parts
    ).toEqual({ label: "Rating", condition: "at least", values: ["20"] });
    expect(chipsOf("scene", { ratingModifier: "BETWEEN" })).toEqual([]);
  });
});
