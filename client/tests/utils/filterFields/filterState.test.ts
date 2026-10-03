/**
 * The flat row operations behind the chip bar (Contract 11): one row's keys
 * and companions in the prefixed state, replaced, removed and compared.
 */
import { PANEL_FIELDS, type PanelField } from "@peek/shared-types";
import { must } from "@tests/testUtils";
import { describe, expect, it } from "vitest";
import {
  type PanelState,
  clearFilters,
  isRowActive,
  removeGroup,
  removeRow,
  rowState,
  sameRowState,
  setRow,
  withRefValue,
} from "@/utils/filterFields";

const sceneRow = (key: string): PanelField =>
  must(
    PANEL_FIELDS.scene.find((row) => row.key === key),
    `scene row ${key}`
  );

describe("filterState", () => {
  it("rowState returns a row's own keys unprefixed", () => {
    const state: PanelState = {
      tagIds: ["1:a"],
      "g1.2.tagIds": ["5:a", "6:a"],
      "g1.2.tagIdsModifier": "INCLUDES",
      "g1.tagIds": ["9:a"],
    };
    expect(
      rowState("scene", state, { group: 1, occurrence: 2, key: "tagIds" })
    ).toEqual({ tagIds: ["5:a", "6:a"], tagIdsModifier: "INCLUDES" });
    expect(
      rowState("scene", state, { group: 0, occurrence: 3, key: "tagIds" })
    ).toEqual({});
  });

  it("setRow replaces only that row's keys and companions", () => {
    const state: PanelState = {
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES",
      "2.tagIds": ["2:a"],
      "g1.tagIds": ["3:a"],
      g1: "any",
      favorite: true,
    };
    const next = setRow(
      "scene",
      state,
      { group: 0, occurrence: 1, key: "tagIds" },
      { tagIds: ["7:a"] }
    );
    expect(next).toEqual({
      tagIds: ["7:a"],
      "2.tagIds": ["2:a"],
      "g1.tagIds": ["3:a"],
      g1: "any",
      favorite: true,
    });
    // a missing row is added under its prefix
    expect(
      setRow(
        "scene",
        { tagIds: ["1:a"] },
        { group: 1, occurrence: 1, key: "tagIds" },
        { tagIds: ["4:a"], tagIdsModifier: "EXCLUDES" }
      )
    ).toEqual({
      tagIds: ["1:a"],
      "g1.tagIds": ["4:a"],
      "g1.tagIdsModifier": "EXCLUDES",
    });
  });

  it("removeRow drops the row and renumbers", () => {
    const state: PanelState = {
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES",
      "2.tagIds": ["5:a"],
      "2.tagIdsModifier": "EXCLUDES",
      favorite: true,
    };
    expect(
      removeRow("scene", state, { group: 0, occurrence: 1, key: "tagIds" })
    ).toEqual({
      tagIds: ["5:a"],
      tagIdsModifier: "EXCLUDES",
      favorite: "true",
    });
  });

  it("removeRow drops a group left with no row", () => {
    const state: PanelState = {
      g1: "any",
      "g1.tagIds": ["5:a"],
      favorite: true,
    };
    expect(
      removeRow("scene", state, { group: 1, occurrence: 1, key: "tagIds" })
    ).toEqual({ favorite: "true" });
  });

  it("removeGroup drops `g2.*` and `g2`, and `g3` becomes `g2`", () => {
    const state: PanelState = {
      tagIds: ["1:a"],
      g1: "all",
      "g1.tagIds": ["2:a"],
      g2: "any",
      "g2.tagIds": ["3:a"],
      "g2.2.tagIds": ["4:a"],
      g3: "all",
      "g3.favorite": true,
    };
    expect(removeGroup("scene", state, 2)).toEqual({
      tagIds: ["1:a"],
      g1: "all",
      "g1.tagIds": ["2:a"],
      g2: "all",
      "g2.favorite": true,
    });
  });

  it("clearFilters keeps only the permanent keys", () => {
    const state: PanelState = {
      tagIds: ["1:a"],
      "2.tagIds": ["2:a"],
      g1: "any",
      "g1.favorite": true,
      match: "any",
      favorite: true,
      // a contract field no panel row owns: a page's permanent criterion
      studios: { value: ["9:a"], modifier: "INCLUDES" },
    };
    expect(clearFilters("scene", state)).toEqual({
      studios: { value: ["9:a"], modifier: "INCLUDES" },
    });
    expect(clearFilters("scene", { tagIds: ["1:a"] })).toEqual({});
  });

  it("isRowActive follows the row codec's isActive; sameRowState compares after normalizePanelState", () => {
    const tags = sceneRow("tagIds");
    expect(isRowActive(tags, { tagIds: ["1:a"] })).toBe(true);
    expect(isRowActive(tags, { tagIds: [] })).toBe(false);
    expect(isRowActive(tags, {})).toBe(false);

    expect(
      sameRowState("scene", { tagIds: ["1:a"] }, { tagIds: ["1:a"] })
    ).toBe(true);
    expect(
      sameRowState("scene", { tagIds: ["1:a"] }, { tagIds: ["2:a"] })
    ).toBe(false);
    // key order does not count
    expect(
      sameRowState(
        "scene",
        { tagIdsModifier: "INCLUDES", tagIds: ["1:a"] },
        { tagIds: ["1:a"], tagIdsModifier: "INCLUDES" }
      )
    ).toBe(true);
  });
});

describe("withRefValue", () => {
  it("adds an id to the row's values, keeps the condition, drops the id from the exclude companion, and on a single row replaces the value", () => {
    const state: PanelState = {
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES_ALL",
      tagIdsExclude: ["2:a", "3:a"],
      "2.tagIds": ["9:a"],
      favorite: true,
    };

    const next = withRefValue("scene", state, "tagIds", "2:a");

    expect(next).toEqual({
      tagIds: ["1:a", "2:a"],
      tagIdsModifier: "INCLUDES_ALL",
      tagIdsExclude: ["3:a"],
      "2.tagIds": ["9:a"],
      favorite: true,
    });
    // The same id again changes nothing; the last exclusion going drops the key
    expect(withRefValue("scene", next, "tagIds", "2:a")).toEqual(next);
    expect(
      withRefValue("scene", { tagIdsExclude: ["2:a"] }, "tagIds", "2:a")
    ).toEqual({ tagIds: ["2:a"] });
    // A row not there yet is added at the root
    expect(withRefValue("scene", {}, "tagIds", "5:a")).toEqual({
      tagIds: ["5:a"],
    });
    // A single row's value is replaced; its condition and depth stay
    expect(
      withRefValue(
        "group",
        { studioId: "1:a", studioIdModifier: "EXCLUDES", studioIdDepth: 1 },
        "studioId",
        "2:a"
      )
    ).toEqual({
      studioId: "2:a",
      studioIdModifier: "EXCLUDES",
      studioIdDepth: 1,
    });
  });

  it("a Has none / Has any condition gives way to the value", () => {
    expect(
      withRefValue("scene", { tagIdsModifier: "IS_NULL" }, "tagIds", "2:a")
    ).toEqual({ tagIds: ["2:a"] });
  });
});
