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

  it("a lone minimum is an inclusive one-sided BETWEEN and keeps its decimals", () => {
    expect(
      buildPanelFilter("performer", { penisLength: { min: "14.5" } })
    ).toEqual({ penis_length: { modifier: "BETWEEN", value: 14.5 } });
    expect(
      buildPanelFilter("performer", { penisLength: { min: 15.24 } })
    ).toEqual({ penis_length: { modifier: "BETWEEN", value: 15.24 } });
  });

  it("a lone maximum is an inclusive one-sided BETWEEN with value2 only", () => {
    expect(buildPanelFilter("scene", { oCount: { max: "60" } })).toEqual({
      o_counter: { modifier: "BETWEEN", value2: 60 },
    });
  });

  it("both bounds BETWEEN them, decimals kept", () => {
    expect(
      buildPanelFilter("performer", { penisLength: { min: "14.5", max: "20" } })
    ).toEqual({
      penis_length: { modifier: "BETWEEN", value: 14.5, value2: 20 },
    });
  });

  it("a scaled bound carries no float noise", () => {
    expect(buildPanelFilter("scene", { bitrate: { min: "1.1" } })).toEqual({
      bitrate: { modifier: "BETWEEN", value: 1_100_000 },
    });
  });

  it("a date From alone is a one-sided BETWEEN, To alone value2", () => {
    expect(
      buildPanelFilter("scene", { createdAt: { start: "2024-05-15" } })
    ).toEqual({ created_at: { modifier: "BETWEEN", value: "2024-05-15" } });
    expect(buildPanelFilter("scene", { date: { end: "2024-05-20" } })).toEqual({
      date: { modifier: "BETWEEN", value2: "2024-05-20" },
    });
    expect(
      buildPanelFilter("scene", {
        updatedAt: { start: "2024-05-15", end: "2024-05-20" },
      })
    ).toEqual({
      updated_at: {
        modifier: "BETWEEN",
        value: "2024-05-15",
        value2: "2024-05-20",
      },
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

  it("clips build a clip_filter", () => {
    expect(
      buildPanelFilter("clip", {
        tagIds: ["1:a", "2:a"],
        tagIdsModifier: "EXCLUDES",
        performerIds: ["3:a"],
        studioId: "5:a",
        isGenerated: "all",
      })
    ).toEqual({
      tags: { value: ["1:a", "2:a"], modifier: "EXCLUDES" },
      performers: { value: ["3:a"], modifier: "INCLUDES" },
      studios: { value: ["5:a"], modifier: "INCLUDES" },
    });
    expect(buildPanelFilter("clip", {})).toEqual({ is_generated: true });
    expect(buildPanelFilter("clip", { isGenerated: "false" })).toEqual({
      is_generated: false,
    });
    // A scene's own clips: the page's permanent scene
    expect(
      buildPanelFilter("clip", {
        scenes: { value: ["9:a"], modifier: "INCLUDES" },
      })
    ).toEqual({
      is_generated: true,
      scenes: { value: ["9:a"], modifier: "INCLUDES" },
    });
  });

  it('the prod clip preset { sceneTagIds: ["280"] } builds a clip_filter.scene_tags the parser accepts', () => {
    expect(buildPanelFilter("clip", { sceneTagIds: ["280"] })).toEqual({
      scene_tags: { value: ["280"], modifier: "INCLUDES" },
      is_generated: true,
    });
  });

  it("include A, exclude B sends `{ value: [A], excludes: [B] }`", () => {
    expect(
      buildPanelFilter("scene", {
        tagIds: ["1:a"],
        tagIdsExclude: ["2:a"],
        tagIdsModifier: "INCLUDES",
        tagIdsDepth: -1,
      })
    ).toEqual({
      tags: {
        value: ["1:a"],
        excludes: ["2:a"],
        modifier: "INCLUDES",
        depth: -1,
      },
    });
    // A value both picked and excluded is sent once, as an include
    expect(
      buildPanelFilter("image", {
        performerIds: ["1:a"],
        performerIdsExclude: ["1:a", "3:a"],
      })
    ).toEqual({
      performers: {
        value: ["1:a"],
        excludes: ["3:a"],
        modifier: "INCLUDES",
      },
    });
  });

  it("excludes alone send `value: []`", () => {
    expect(buildPanelFilter("scene", { performerIdsExclude: ["4:b"] })).toEqual(
      {
        performers: { value: [], excludes: ["4:b"], modifier: "INCLUDES" },
      }
    );
  });

  it('Has any sends `{ modifier: "NOT_NULL" }` with no value', () => {
    const rows = (PANEL_FIELDS.scene as readonly PanelField[]).map(
      (row): PanelField =>
        row.key === "performerIds" && row.editor === "ref"
          ? { ...row, modifiers: [...row.modifiers, "IS_NULL", "NOT_NULL"] }
          : row
    );
    const table = { rows, specs: SCENE_FIELDS };

    expect(
      buildPanelFilter(
        "scene",
        {
          performerIds: ["1:a"],
          performerIdsExclude: ["2:a"],
          performerIdsModifier: "NOT_NULL",
        },
        table
      )
    ).toEqual({ performers: { modifier: "NOT_NULL" } });
    expect(
      buildPanelFilter("scene", { performerIdsModifier: "IS_NULL" }, table)
    ).toEqual({ performers: { modifier: "IS_NULL" } });
    // A row that does not offer presence ignores a stale choice
    expect(
      buildPanelFilter("scene", {
        performerIds: ["1:a"],
        performerIdsModifier: "NOT_NULL",
      })
    ).toEqual({ performers: { value: ["1:a"], modifier: "INCLUDES" } });
  });

  it("the To Review preset sends what it sent in beta.7", () => {
    const golden = JSON.parse(
      readFileSync(
        resolve(__dirname, "../__golden__/image/builders.json"),
        "utf8"
      )
    ) as {
      prodPresets: {
        name: string;
        stored: { filters: Record<string, unknown> };
        buildListQueryFromItsFilters: { image_filter: unknown };
      }[];
    };
    const toReview = golden.prodPresets.find(
      (preset) => preset.name === "To Review"
    );

    expect(toReview?.buildListQueryFromItsFilters.image_filter).toEqual({
      studios: { value: ["772", "971"], modifier: "EXCLUDES" },
      tags: { value: ["466"], modifier: "EXCLUDES" },
    });
    expect(
      text(buildPanelFilter("image", toReview?.stored.filters ?? {}))
    ).toBe(text(toReview?.buildListQueryFromItsFilters.image_filter));
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
