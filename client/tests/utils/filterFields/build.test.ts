/**
 * The generic builder: every list's request from its panel rows and their
 * codecs, with a page's permanent criteria applied over them. Today's output
 * is pinned per list in `__golden__/<list>/builders.json`, which these tests
 * replay entry by entry, key order included.
 */
import {
  type FieldSpec,
  LIST_KINDS,
  type ListKind,
  NUMBER_MODIFIERS,
  PANEL_FIELDS,
  type PanelField,
  SCENE_FIELDS,
} from "@peek/shared-types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPanelFilter } from "@/utils/filterFields";

interface GoldenEntry {
  label: string;
  state: Record<string, unknown>;
  request: unknown;
}

interface BuildersGolden {
  samples: GoldenEntry[];
  permanent: GoldenEntry[];
  imperial: { imperialOptions: GoldenEntry[]; metricOptions: GoldenEntry[] };
}

const goldenOf = (list: ListKind): BuildersGolden =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, "../__golden__", list, "builders.json"),
      "utf8"
    )
  ) as BuildersGolden;

/** The request as its golden text: key order counts */
const text = (value: unknown) => JSON.stringify(value);

describe("buildPanelFilter", () => {
  it.each(LIST_KINDS)(
    "buildPanelFilter equals today's builder for every sample: %s",
    (list) => {
      const golden = goldenOf(list);
      const metric = [...golden.samples, ...golden.permanent];
      // The imperial editors hold metric too: no viewer's state converts
      const imperial = [
        ...golden.imperial.imperialOptions,
        ...golden.imperial.metricOptions,
      ];
      for (const entry of [...metric, ...imperial]) {
        expect(text(buildPanelFilter(list, entry.state)), entry.label).toBe(
          text(entry.request)
        );
      }
    }
  );

  it("a permanent ref criterion merges with the panel's picks, the panel's modifier when the picker offers it", () => {
    expect(
      buildPanelFilter("scene", {
        performers: { value: ["10:a"], modifier: "INCLUDES_ALL" },
        performerIds: ["1:a", "10:a"],
        performerIdsModifier: "EXCLUDES",
      })
    ).toEqual({
      performers: { value: ["10:a", "1:a"], modifier: "EXCLUDES" },
    });
    // A modifier the picker does not offer: the permanent criterion's
    expect(
      buildPanelFilter("scene", {
        performers: { value: ["10:a"], modifier: "INCLUDES_ALL" },
        performerIds: ["1:a"],
        performerIdsModifier: "NOT_A_MODIFIER",
      })
    ).toEqual({
      performers: { value: ["10:a", "1:a"], modifier: "INCLUDES_ALL" },
    });
  });

  it("a permanent non-ref criterion wins over the panel key of the same field", () => {
    expect(
      buildPanelFilter("gallery", {
        tag_count: { modifier: "EQUALS", value: 0 },
        tagCount: { min: "2", max: "5" },
      })
    ).toEqual({ tag_count: { modifier: "EQUALS", value: 0 } });
  });

  it("a permanent date range in panel shape goes through the date codec", () => {
    expect(
      buildPanelFilter("gallery", {
        date: { start: "2020-01-01", end: "2020-12-31" },
      })
    ).toEqual({
      date: { modifier: "BETWEEN", value: "2020-01-01", value2: "2020-12-31" },
    });
  });

  it("a permanent undefined locks without sending", () => {
    const request = buildPanelFilter("scene", {
      tagged: false,
      tag_count: undefined,
    });
    expect(request).toEqual({ tagged: false });
    expect(Object.keys(request)).toEqual(["tagged"]);
  });

  it("a field with a path lands there", () => {
    expect(
      buildPanelFilter("tag", { groupIds: ["4:a"], performerIds: ["1:a"] })
    ).toEqual({
      performers: { value: ["1:a"], modifier: "INCLUDES" },
      scenes_filter: { groups: { value: ["4:a"], modifier: "INCLUDES" } },
    });
  });

  it("clips flatten", () => {
    expect(
      buildPanelFilter("clip", {
        tagIds: ["1:a", "2:a"],
        tagIdsModifier: "EXCLUDES",
        studioId: "5:a",
        isGenerated: "all",
      })
    ).toEqual({
      tagIds: ["1:a", "2:a"],
      tagIdsModifier: "EXCLUDES",
      studioId: "5:a",
    });
    expect(buildPanelFilter("clip", {})).toEqual({ isGenerated: true });
    expect(buildPanelFilter("clip", { isGenerated: "false" })).toEqual({
      isGenerated: false,
    });
  });

  it("a new field needs only its table row", () => {
    const row: PanelField = {
      key: "markerCount",
      field: "marker_count",
      label: "Marker Count",
      group: "other",
      editor: "number",
      bounds: { min: 0, max: 50 },
    };
    const spec: FieldSpec = {
      kind: "number",
      modifiers: NUMBER_MODIFIERS,
      defaultModifier: "EQUALS",
    };
    const table = {
      rows: [...PANEL_FIELDS.scene, row],
      specs: { ...SCENE_FIELDS, marker_count: spec },
    };
    expect(
      buildPanelFilter(
        "scene",
        { markerCount: { min: "3", max: "9" }, favorite: true },
        table
      )
    ).toEqual({
      favorite: true,
      marker_count: { modifier: "BETWEEN", value: 3, value2: 9 },
    });
  });
});
