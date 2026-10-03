/**
 * The Clips panel's rows beyond the first panel: the Scenes picker, sub-tags
 * on both tag pickers, a Studio that is multi-value with exclusions and
 * sub-studios, Duration in seconds, and the Created and Updated date
 * ranges. Each row builds its request, goes through the URL and back and
 * reads on its chip. A clip preset saved before 9a (a lone `studioId`
 * string, the prod preset `{ sceneTagIds: ["280"] }`) keeps sending what it
 * sent.
 */
import { type ReactNode, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import {
  CLIP_FIELDS,
  type GetFilterPresetsResponse,
  PANEL_FIELDS,
  type PanelField,
} from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  type SavedPreset,
  defaultPresetsQueryOptions,
  presetsQueryOptions,
} from "@/api/hooks/usePresets";
import { useFilterOptions } from "@/hooks/useListOptions";
import { useListUrlState } from "@/hooks/useListUrlState";
import { CLIP_FILTER_OPTIONS, buildClipFilter } from "@/utils/filterConfig";
import { chipsOf, filterOptionsOf } from "@/utils/filterFields";
import { buildListQuery, sortOptionsFor } from "@/utils/listQuery";
import { buildSearchParams, parseSearchParams } from "@/utils/urlParams";
import { untrusted } from "../../helpers/untrusted";

type State = Record<string, unknown>;

/** The state's URL, read back as the Clips page reads it */
function throughUrl(filters: State): State {
  const params = buildSearchParams({
    searchText: "",
    sortField: "",
    sortDirection: "",
    currentPage: 1,
    perPage: 24,
    filters,
    filterOptions: CLIP_FILTER_OPTIONS,
    viewMode: "grid",
    zoomLevel: "medium",
    gridDensity: "medium",
    timelinePeriod: null,
  });
  return parseSearchParams(
    new URLSearchParams(params.toString()),
    CLIP_FILTER_OPTIONS
  ).filters;
}

const rowOf = (key: string): PanelField | undefined =>
  PANEL_FIELDS.clip.find((row) => row.key === key);

describe("the clip panel's rows", () => {
  it("offers each new row on its contract field", () => {
    for (const [key, field, editor] of [
      ["sceneIds", "scenes", "ref"],
      ["duration", "duration", "number"],
      ["createdAt", "created_at", "date"],
      ["updatedAt", "updated_at", "date"],
    ] as const) {
      expect(rowOf(key), key).toMatchObject({ field, editor });
      expect(
        CLIP_FILTER_OPTIONS.some((option) => option.key === key),
        `${key} option`
      ).toBe(true);
      expect(CLIP_FIELDS[field], field).toBeDefined();
    }
  });

  it("the Scenes picker reads scenes and offers any or none of them", () => {
    expect(rowOf("sceneIds")).toMatchObject({
      multi: true,
      modifiers: ["INCLUDES", "EXCLUDES"],
      modifierKey: "sceneIdsModifier",
    });
    expect(
      CLIP_FILTER_OPTIONS.find((option) => option.key === "sceneIds")
    ).toMatchObject({ type: "searchable-select", entityType: "scenes" });
    expect(
      buildClipFilter({
        sceneIds: ["5:a", "6:a"],
        sceneIdsModifier: "EXCLUDES",
      }).scenes
    ).toEqual({ value: ["5:a", "6:a"], modifier: "EXCLUDES" });
    expect(buildClipFilter({ sceneIds: ["5:a"] }).scenes).toEqual({
      value: ["5:a"],
      modifier: "INCLUDES",
    });
    const state = { sceneIds: ["5:a", "6:b"], sceneIdsModifier: "EXCLUDES" };
    expect(throughUrl(state)).toEqual(state);
  });

  it("both tag pickers send a depth, and keep sending none without one", () => {
    expect(
      buildClipFilter({
        tagIds: ["1:a"],
        tagIdsDepth: -1,
        sceneTagIds: ["2:a"],
        sceneTagIdsDepth: -1,
      })
    ).toMatchObject({
      tags: { value: ["1:a"], modifier: "INCLUDES", depth: -1 },
      scene_tags: { value: ["2:a"], modifier: "INCLUDES", depth: -1 },
    });
    expect(buildClipFilter({ tagIds: ["1:a"] }).tags).toEqual({
      value: ["1:a"],
      modifier: "INCLUDES",
    });
    for (const key of ["tagIds", "sceneTagIds"]) {
      expect(rowOf(key), key).toMatchObject({
        hierarchyKey: `${key}Depth`,
        hierarchyLabel: "Include sub-tags",
      });
    }
    const state = {
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES_ALL",
      tagIdsDepth: -1,
      sceneTagIds: ["2:a"],
      sceneTagIdsDepth: 1,
    };
    expect(throughUrl(state)).toEqual(state);
  });

  it("Studio picks several, excludes values and takes sub-studios", () => {
    expect(rowOf("studioId")).toMatchObject({
      multi: true,
      modifiers: ["INCLUDES", "EXCLUDES"],
      modifierKey: "studioIdModifier",
      hierarchyKey: "studioIdDepth",
      hierarchyLabel: "Include sub-studios",
      excludeKey: "studioIdExclude",
    });
    expect(
      buildClipFilter({
        studioId: ["3:a", "4:a"],
        studioIdDepth: -1,
        studioIdExclude: ["9:a"],
      }).studios
    ).toEqual({
      value: ["3:a", "4:a"],
      excludes: ["9:a"],
      modifier: "INCLUDES",
      depth: -1,
    });
    expect(
      buildClipFilter({ studioId: ["3:a"], studioIdModifier: "EXCLUDES" })
        .studios
    ).toEqual({ value: ["3:a"], modifier: "EXCLUDES" });
    const state = {
      studioId: ["3:a", "4:b"],
      studioIdDepth: -1,
      studioIdExclude: ["9:a"],
    };
    expect(throughUrl(state)).toEqual(state);
    expect(
      CLIP_FILTER_OPTIONS.find((option) => option.key === "studioId")
    ).toMatchObject({ multi: true, entityType: "studios" });
  });

  it("a studio link from a page names its instance, and a list in the URL reads as a list", () => {
    const read = (query: string) =>
      parseSearchParams(new URLSearchParams(query), CLIP_FILTER_OPTIONS)
        .filters;
    expect(read("studioId=5&instance=x").studioId).toEqual(["5:x"]);
    expect(read("studioId=1:a,2:b").studioId).toEqual(["1:a", "2:b"]);
  });

  it("Duration is in seconds and sends the stored seconds", () => {
    expect(rowOf("duration")).toMatchObject({ unit: "seconds" });
    expect(buildClipFilter({ duration: { min: "10", max: "60" } })).toEqual({
      duration: { modifier: "BETWEEN", value: 10, value2: 60 },
      is_generated: true,
    });
    expect(buildClipFilter({ duration: { min: "10" } }).duration).toEqual({
      modifier: "BETWEEN",
      value: 10,
    });
    const state = { duration: { min: "10", max: "60" } };
    expect(throughUrl(state)).toEqual(state);
    expect(
      chipsOf("clip", state).map((chip) => [
        chip.parts.label,
        chip.parts.values,
      ])
    ).toEqual([["Duration", ["10 to 60 seconds"]]]);
  });

  it("Created and Updated send a date range and keep it through the URL", () => {
    expect(
      buildClipFilter({
        createdAt: { start: "2021-02-03", end: "2021-03-04" },
        updatedAt: { end: "2022-04-05" },
      })
    ).toEqual({
      created_at: {
        modifier: "BETWEEN",
        value: "2021-02-03",
        value2: "2021-03-04",
      },
      updated_at: { modifier: "BETWEEN", value2: "2022-04-05" },
      is_generated: true,
    });
    const state = {
      createdAt: { start: "2021-02-03", end: "2021-03-04" },
      updatedAt: { end: "2022-04-05" },
    };
    expect(throughUrl(state)).toEqual(state);
    expect(chipsOf("clip", state)).toHaveLength(2);
  });

  it("the chips name a studio exclusion", () => {
    expect(
      chipsOf("clip", { studioId: ["3:a"], studioIdExclude: ["9:a"] }).length
    ).toBe(1);
    expect(
      filterOptionsOf("clip").find((option) => option.key === "studioId")
        ?.modifierOptions
    ).toEqual([
      { value: "INCLUDES", label: "Has ANY of these" },
      { value: "EXCLUDES", label: "Has NONE of these" },
    ]);
  });
});

describe("clip presets saved before 9a", () => {
  /** A clip list's request through `useListUrlState`, the preset as the default or loaded */
  function render(preset: SavedPreset, mode: "default" | "load") {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      presetsQueryOptions.queryKey,
      untrusted<GetFilterPresetsResponse>({ presets: { clip: [preset] } })
    );
    queryClient.setQueryData(defaultPresetsQueryOptions.queryKey, {
      defaults: mode === "default" ? { clip: preset.id } : {},
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, { initialEntries: ["/clips"] }, children)
      );
    const view = renderHook(
      () => ({
        options: useFilterOptions("clip"),
        state: useListUrlState({
          entityType: "clip",
          filterOptions: CLIP_FILTER_OPTIONS,
          sortOptions: (filters) => sortOptionsFor("clip", filters),
          viewModes: ["grid"],
          defaults: {
            sort: "created_at",
            direction: "DESC",
            perPage: 24,
            viewMode: "grid",
            zoomLevel: "medium",
            gridDensity: "medium",
          },
        }),
      }),
      { wrapper }
    );
    if (mode === "load") {
      act(() => {
        view.result.current.state.loadPreset(preset);
      });
    }
    return view.result.current.state.filters;
  }

  const presetOf = (filters: Record<string, unknown>): SavedPreset =>
    untrusted<SavedPreset>({
      id: "p1",
      name: "stored",
      filters,
      sort: "duration",
      direction: "DESC",
      viewMode: "grid",
      zoomLevel: "medium",
    });

  it.each(["default", "load"] as const)(
    'a lone `studioId: "3"` sends one studio (%s)',
    (mode) => {
      const filters = render(presetOf({ studioId: "3" }), mode);
      expect(buildClipFilter(filters)).toEqual({
        studios: { value: ["3"], modifier: "INCLUDES" },
        is_generated: true,
      });
      expect(
        buildListQuery(
          "clip",
          {
            ready: true,
            filters,
            sort: { field: "duration", direction: "DESC", seed: null },
            page: 1,
            perPage: 24,
            q: "",
          },
          {}
        )
      ).toMatchObject({
        clip_filter: { studios: { value: ["3"], modifier: "INCLUDES" } },
      });
      expect(chipsOf("clip", filters)).toHaveLength(1);
    }
  );

  it("a lone string also goes through the URL", () => {
    expect(buildClipFilter(throughUrl({ studioId: "3" }))).toEqual({
      studios: { value: ["3"], modifier: "INCLUDES" },
      is_generated: true,
    });
  });

  it("the prod preset sends what it sent after F16", () => {
    expect(buildClipFilter({ sceneTagIds: ["280"] })).toEqual({
      scene_tags: { value: ["280"], modifier: "INCLUDES" },
      is_generated: true,
    });
  });
});
