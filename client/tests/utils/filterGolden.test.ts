/**
 * Golden files of today's filter output: each list's panel options, what
 * every option's samples build, how they go through the URL, how presets and
 * carousel rules read back. They pin the paths the filter-foundations
 * rewrite (C2 to C6) changes, so each of those tasks must leave them as they
 * are or regenerate the ones it changes on purpose and name each changed
 * entry in its commit body.
 *
 * One folder per list under `__golden__/` holding `options.json`,
 * `builders.json` and `url.json` (the scene list also `carousel.json`).
 * Regenerate one list with
 * `npx vitest run tests/utils/filterGolden.test.ts -u -t "<list>"`, never a
 * bare `-u`. The folder is ignored by Prettier and each file is written as
 * `JSON.stringify(value, null, 2) + "\n"`.
 */
import { type ReactNode, createElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  DEFAULT_SORT,
  type GetFilterPresetsResponse,
  type ListKind,
  UI_KEYS,
} from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import {
  type SavedPreset,
  defaultPresetsQueryOptions,
  presetsQueryOptions,
} from "@/api/hooks/usePresets";
import { UnitPreferenceContext } from "@/contexts/UnitPreferenceContext";
import { useFilterOptions } from "@/hooks/useListOptions";
import { useListUrlState } from "@/hooks/useListUrlState";
import { buildCustomCarouselUrl } from "@/utils/carouselUrl";
import { getFilteredListPath } from "@/utils/entityLinks";
import {
  CAROUSEL_FILTER_DEFINITIONS,
  CLIP_FILTER_OPTIONS,
  type FilterOption,
  GALLERY_FILTER_OPTIONS,
  GROUP_FILTER_OPTIONS,
  IMAGE_FILTER_OPTIONS,
  PERFORMER_FILTER_OPTIONS,
  SCENE_FILTER_OPTIONS,
  STUDIO_FILTER_OPTIONS,
  TAG_FILTER_OPTIONS,
  buildCarouselRules,
  buildClipFilter,
  buildGalleryFilter,
  buildGroupFilter,
  buildImageFilter,
  buildPerformerFilter,
  buildSceneFilter,
  buildStudioFilter,
  buildTagFilter,
  carouselRulesToFilterState,
} from "@/utils/filterConfig";
import {
  buildListQuery,
  lockedFieldsOf,
  sortOptionsFor,
  withoutLockedFilters,
  withoutLockedOptions,
} from "@/utils/listQuery";
import {
  buildSearchParams,
  listOwnedKeys,
  parseSearchParams,
  readListParams,
  writeListParams,
} from "@/utils/urlParams";
import { untrusted } from "../helpers/untrusted";

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

const OPTIONS: Record<ListKind, readonly FilterOption[]> = {
  scene: SCENE_FILTER_OPTIONS,
  performer: PERFORMER_FILTER_OPTIONS,
  studio: STUDIO_FILTER_OPTIONS,
  tag: TAG_FILTER_OPTIONS,
  group: GROUP_FILTER_OPTIONS,
  gallery: GALLERY_FILTER_OPTIONS,
  image: IMAGE_FILTER_OPTIONS,
  clip: CLIP_FILTER_OPTIONS,
};

type State = Record<string, unknown>;

const BUILDERS: Record<ListKind, (state: State) => unknown> = {
  scene: buildSceneFilter,
  performer: buildPerformerFilter,
  studio: buildStudioFilter,
  tag: buildTagFilter,
  group: buildGroupFilter,
  gallery: buildGalleryFilter,
  image: buildImageFilter,
  clip: buildClipFilter,
};

/** The list page a card's count opens for each list */
const LIST_PAGES = {
  scene: "/scenes",
  performer: "/performers",
  studio: "/studios",
  tag: "/tags",
  group: "/collections",
  gallery: "/galleries",
  image: "/images",
  clip: "/clips",
} as const;

const ENTITY_TYPES = [
  "scenes",
  "performers",
  "studios",
  "tags",
  "groups",
  "galleries",
] as const;

/** A golden file's text: pretty JSON with a final newline, which Prettier would not keep */
const golden = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

const goldenPath = (list: string, file: string) =>
  `./__golden__/${list}/${file}.json`;

// ── Samples: what the panel's states look like, per option ────────────────

const REFS = ["1:inst-a", "2:inst-b"];
const TEXT_SAMPLE = "contract";
const DATE_START = "2020-01-01";
const DATE_END = "2024-12-31";

interface Sample {
  label: string;
  state: State;
}

/** How a panel names an option's companions */
interface Companions {
  modifierKey: (option: FilterOption) => string | undefined;
  hierarchyKey: (option: FilterOption) => string | undefined;
}

const PANEL_COMPANIONS: Companions = {
  modifierKey: (option) => option.modifierKey,
  hierarchyKey: (option) => option.hierarchyKey,
};

/**
 * The option's states, as `server/integration/helpers/clientFilterConfig.ts`
 * `optionSamples` walks them: range min only, max only, both; date start,
 * end, both; text; each select value but the unfiltered one; checkbox;
 * picker one id and (multi) two ids, with and without sub-items; each under
 * every modifier the option offers, and once with none chosen.
 */
function samplesOf(
  option: FilterOption,
  companions: Companions = PANEL_COMPANIONS
): Sample[] {
  const { key } = option;
  const plain = (variant: string, value: unknown) => ({
    variant,
    state: { [key]: value } as State,
  });
  let values: { variant: string; state: State }[];
  switch (option.type) {
    case "text":
      values = [plain("text", TEXT_SAMPLE)];
      break;
    case "checkbox":
      values = [plain("checked", true)];
      break;
    case "range": {
      const low = option.min ?? 0;
      const high = option.max ?? 100;
      const min = String(low + Math.round((high - low) / 4));
      const max = String(low + Math.round((3 * (high - low)) / 4));
      values = [
        plain("min only", { min }),
        plain("max only", { max }),
        plain("min and max", { min, max }),
      ];
      break;
    }
    case "imperial-height-range":
      // The editor shows feet and inches and holds whole cm: 5'6" to 6'2"
      // is 167 to 189 cm
      values = [
        plain("min only", { min: "167" }),
        plain("max only", { max: "189" }),
        plain("min and max", { min: "167", max: "189" }),
      ];
      break;
    case "date-range":
      values = [
        plain("start only", { start: DATE_START }),
        plain("end only", { end: DATE_END }),
        plain("start and end", { start: DATE_START, end: DATE_END }),
      ];
      break;
    case "select":
      values = (option.options ?? [])
        .filter((choice) => choice.value !== option.defaultValue)
        .map((choice) =>
          plain(choice.value || `"" (${choice.label})`, choice.value)
        );
      break;
    case "searchable-select": {
      const hierarchyKey = companions.hierarchyKey(option);
      const picks =
        option.multi === true
          ? [
              { variant: "one id", ids: REFS.slice(0, 1) },
              { variant: "two ids", ids: REFS },
            ]
          : [{ variant: "one id", ids: REFS.slice(0, 1) }];
      const depths =
        option.supportsHierarchy === true && hierarchyKey !== undefined
          ? [false, true]
          : [false];
      values = depths.flatMap((deep) =>
        picks.map((pick) => ({
          variant: deep ? `${pick.variant}, with sub-items` : pick.variant,
          state: {
            [key]: option.multi === true ? pick.ids : pick.ids[0],
            ...(deep && hierarchyKey !== undefined
              ? { [hierarchyKey]: -1 }
              : {}),
          },
        }))
      );
      break;
    }
    case "section-header":
      return [];
    default:
      throw new Error(`No samples for option ${key} of type ${option.type}`);
  }
  const modifierKey = companions.modifierKey(option);
  const modifiers: (string | undefined)[] = [
    ...(option.modifierOptions?.map((choice) => choice.value) ?? []),
    // The panel's default: no modifier chosen
    ...(option.modifierOptions ? [undefined] : []),
  ];
  if (modifiers.length === 0) modifiers.push(undefined);
  return modifiers.flatMap((modifier) =>
    values.map((value) => ({
      label: `${key}: ${modifier === undefined ? "" : `${modifier} `}${value.variant}`,
      state: {
        ...value.state,
        ...(modifier !== undefined && modifierKey !== undefined
          ? { [modifierKey]: modifier }
          : {}),
      },
    }))
  );
}

const samplesOfList = (options: readonly FilterOption[]) =>
  options.flatMap((option) => samplesOf(option));

/** The options an imperial viewer gets (`useFilterOptions`) */
function imperialOptionsOf(list: ListKind): FilterOption[] {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      UnitPreferenceContext.Provider,
      {
        value: {
          unitPreference: "imperial",
          setUnitPreference: () => Promise.resolve(),
          isLoading: false,
        },
      },
      children
    );
  return renderHook(() => useFilterOptions(list), { wrapper }).result.current;
}

/** The imperial options that differ from the metric ones (the body measures) */
function imperialOnly(list: ListKind): FilterOption[] {
  const metric = new Map(OPTIONS[list].map((option) => [option.key, option]));
  return imperialOptionsOf(list).filter(
    (option) => !isDeepStrictEqual(option, metric.get(option.key))
  );
}

// ── Options ────────────────────────────────────────────────────────────────

/** Every contract field of a list's UI keys, once */
const fieldsOf = (list: ListKind): string[] => [
  ...new Set(UI_KEYS[list].map((uiKey) => uiKey.field)),
];

/** All the list's samples' states in one state: every key a lock could drop */
const fullState = (list: ListKind): State =>
  samplesOfList(OPTIONS[list]).reduce<State>(
    (all, sample) => ({ ...all, ...sample.state }),
    {}
  );

describe.each(LISTS)("%s", (list) => {
  it("options", async () => {
    const imperial = imperialOptionsOf(list);
    const same = isDeepStrictEqual(imperial, OPTIONS[list]);
    const everything = fullState(list);
    // Each contract field a detail tab can lock, in both shapes a page passes
    // (top level, or inside the entity's own filter): the panel keys and
    // options it takes away
    const locks = fieldsOf(list).map((field) => {
      const offered = withoutLockedOptions(list, [...OPTIONS[list]], [field]);
      return {
        field,
        lockedFieldsTop: lockedFieldsOf(list, { [field]: {} }),
        lockedFieldsInner: lockedFieldsOf(list, {
          [`${list}_filter`]: { [field]: {} },
        }),
        removedStateKeys: Object.keys(everything).filter(
          (key) => !(key in withoutLockedFilters(list, everything, [field]))
        ),
        removedOptions: OPTIONS[list]
          .filter((option) => !offered.includes(option))
          .map((option) => `${option.type}:${option.key}`),
        optionCountAfter: offered.length,
      };
    });
    await expect(
      golden({
        options: OPTIONS[list],
        imperialOptions: same ? "same as the metric options" : imperial,
        locks,
      })
    ).toMatchFileSnapshot(goldenPath(list, "options"));
  });

  it("builders", async () => {
    const build = BUILDERS[list];
    const samples = samplesOfList(OPTIONS[list]).map((sample) => ({
      ...sample,
      request: build(sample.state),
    }));
    const imperialSamples = imperialOnly(list)
      .flatMap((option) => samplesOf(option))
      .map((sample) => ({
        ...sample,
        request: build(sample.state),
      }));
    // The metric samples of the same body measures, through the imperial build
    const imperialKeys = new Set(
      imperialOnly(list).map((option) => option.key)
    );
    const metricThroughImperial = samplesOfList(
      OPTIONS[list].filter((option) => imperialKeys.has(option.key))
    ).map((sample) => ({
      ...sample,
      request: build(sample.state),
    }));
    await expect(
      golden({
        samples,
        permanent: PERMANENT[list].map(({ label, state }) => ({
          label,
          state,
          request: build(state),
        })),
        imperial: {
          imperialOptions: imperialSamples,
          metricOptions: metricThroughImperial,
        },
        prodPresets: prodPresetResults(list),
      })
    ).toMatchFileSnapshot(goldenPath(list, "builders"));
  });

  it("url", async () => {
    const options = OPTIONS[list];
    const roundTrip = (opts: readonly FilterOption[], sample: Sample) => {
      const params = buildSearchParams({
        searchText: "",
        sortField: "",
        sortDirection: "",
        currentPage: 1,
        perPage: 24,
        filters: sample.state,
        filterOptions: [...opts],
        viewMode: "grid",
        zoomLevel: "medium",
        gridDensity: "medium",
        timelinePeriod: null,
      });
      const parsed = parseSearchParams(new URLSearchParams(params.toString()), [
        ...opts,
      ]).filters;
      return {
        label: sample.label,
        params: params.toString(),
        parsed,
        lossless: isDeepStrictEqual(parsed, sample.state),
      };
    };
    const listParams = (opts: readonly FilterOption[], sample: Sample) => {
      const written = writeListParams(
        new URLSearchParams("instance=inst-a&tab=x"),
        { filters: sample.state, page: 1 },
        {
          entity: list,
          filterOptions: opts,
          shown: {
            perPage: 24,
            viewMode: "grid",
            zoomLevel: "medium",
            gridDensity: "medium",
          },
        }
      );
      const read = readListParams(written, list, opts);
      return {
        label: sample.label,
        written: written.toString(),
        filters: read.filters,
        hasFilters: read.hasFilters,
      };
    };
    const samples = samplesOfList(options);
    const imperialOptions = imperialOptionsOf(list);
    const imperialSamples = imperialOnly(list).flatMap((option) =>
      samplesOf(option)
    );
    await expect(
      golden({
        ownedKeys: listOwnedKeys(list),
        roundTrip: samples.map((sample) => roundTrip(options, sample)),
        imperialRoundTrip: imperialSamples.map((sample) =>
          roundTrip(imperialOptions, sample)
        ),
        listParams: samples.map((sample) => listParams(options, sample)),
        imperialListParams: imperialSamples.map((sample) =>
          listParams(imperialOptions, sample)
        ),
        filteredListPath: ENTITY_TYPES.flatMap((entityType) =>
          [true, false].map((multiple) => ({
            entityType,
            hasMultipleInstances: multiple,
            withInstance: getFilteredListPath(
              LIST_PAGES[list],
              entityType,
              { id: "5", instanceId: "inst-a" },
              multiple
            ),
            numericIdNoInstance: getFilteredListPath(
              LIST_PAGES[list],
              entityType,
              { id: 7 },
              multiple
            ),
            noId: getFilteredListPath(
              LIST_PAGES[list],
              entityType,
              {},
              multiple
            ),
          }))
        ),
      })
    ).toMatchFileSnapshot(goldenPath(list, "url"));
  });
});

// ── Permanent criteria the builders merge today ───────────────────────────

const ref = (id: string, modifier = "INCLUDES", depth?: number) => ({
  value: [`${id}:inst-a`],
  modifier,
  ...(depth === undefined ? {} : { depth }),
});

const DATES = [
  {
    label: "timeline date, both",
    state: { date: { start: DATE_START, end: DATE_END } },
  },
  { label: "timeline date, start", state: { date: { start: DATE_START } } },
  { label: "timeline date, end", state: { date: { end: DATE_END } } },
];

const PERMANENT: Record<ListKind, { label: string; state: State }[]> = {
  scene: [
    { label: "performers", state: { performers: ref("10") } },
    {
      label: "performers beside the picker",
      state: {
        performers: ref("10"),
        performerIds: ["1:inst-a", "10:inst-a"],
        performerIdsModifier: "EXCLUDES",
      },
    },
    {
      label: "studios, with sub-studios",
      state: { studios: ref("11", "INCLUDES", -1) },
    },
    {
      label: "studios beside the picker",
      state: { studios: ref("11"), studioId: "2:inst-b", studioIdDepth: -1 },
    },
    {
      label: "tags, with sub-tags",
      state: { tags: ref("12", "INCLUDES", -1) },
    },
    {
      label: "tags beside the picker",
      state: {
        tags: ref("12", "INCLUDES_ALL", 0),
        tagIds: ["3:inst-a"],
        tagIdsModifier: "EXCLUDES",
        tagIdsDepth: -1,
      },
    },
    { label: "groups", state: { groups: ref("13") } },
    {
      label: "groups beside the picker",
      state: {
        groups: ref("13"),
        groupIds: ["4:inst-a"],
        groupIdsModifier: "EXCLUDES",
      },
    },
    { label: "galleries", state: { galleries: ref("14") } },
    { label: "tagged false", state: { tagged: false } },
    { label: "tagged true", state: { tagged: true } },
    ...DATES,
  ],
  performer: [],
  studio: [],
  tag: [],
  group: [],
  gallery: [
    {
      label: "untagged",
      state: { tag_count: { modifier: "EQUALS", value: 0 } },
    },
    {
      label: "untagged beside the tag count range",
      state: {
        tag_count: { modifier: "EQUALS", value: 0 },
        tagCount: { min: "2" },
      },
    },
    { label: "tags", state: { tags: ref("12", "INCLUDES", -1) } },
    {
      label: "tags beside the picker",
      state: {
        tags: ref("12"),
        tagIds: ["3:inst-a"],
        tagIdsModifier: "EXCLUDES",
      },
    },
    ...DATES,
  ],
  image: [
    {
      label: "untagged",
      state: { tag_count: { modifier: "EQUALS", value: 0 } },
    },
    {
      label: "untagged beside the tag count range",
      state: {
        tag_count: { modifier: "EQUALS", value: 0 },
        tagCount: { min: "2" },
      },
    },
    { label: "performers", state: { performers: ref("10") } },
    {
      label: "studios, with sub-studios",
      state: { studios: ref("11", "INCLUDES", -1) },
    },
    {
      label: "tags, with sub-tags",
      state: { tags: ref("12", "INCLUDES", -1) },
    },
    { label: "galleries", state: { galleries: ref("14") } },
    {
      label: "galleries beside the picker",
      state: { galleries: ref("14"), galleryIds: ["5:inst-a"] },
    },
    ...DATES,
  ],
  clip: [],
};

// ── The prod presets and carousel, verbatim ───────────────────────────────

/** `User.filterPresets` of the prod snapshot (2026-09-23), as stored: bare ids */
const PROD_PRESETS: Partial<Record<ListKind, string>> = {
  performer: `{"id":"6a1cdecf-5228-4e23-9205-d235bc8df240","name":"Fave Ladies","filters":{"gender":"FEMALE"},"sort":"rating","direction":"DESC","createdAt":"2025-11-08T02:04:38.675Z"}`,
  tag: `{"id":"3abe5163-e661-4853-8009-f161758e9efe","name":"Hierarchy","filters":{},"sort":"name","direction":"ASC","viewMode":"hierarchy","zoomLevel":"medium","tableColumns":null,"createdAt":"2026-01-23T19:04:44.835Z"}`,
  clip: `{"id":"5f300887-40f6-438a-adf1-9eb072e8352c","name":"test","filters":{"sceneTagIds":["280"]},"sort":"duration","direction":"DESC","viewMode":"grid","zoomLevel":"medium","tableColumns":null,"createdAt":"2026-01-29T02:00:59.279Z"}`,
  image: `{"id":"afe187ab-6a14-4b06-85b3-5ea689dece32","name":"To Review","filters":{"studioIdsModifier":"EXCLUDES","studioIds":["772","971"],"tagIds":["466"],"tagIdsModifier":"EXCLUDES"},"sort":"created_at","direction":"ASC","viewMode":"wall","zoomLevel":"medium","gridDensity":"small","tableColumns":null,"perPage":120,"createdAt":"2026-02-19T06:33:49.853Z"}`,
};

/** `UserCarousel` of the prod snapshot: rules, sort and direction */
const PROD_CAROUSEL = {
  rules: `{"tags":{"value":["284"],"modifier":"INCLUDES_ALL"}}`,
  sort: "random",
  direction: "DESC",
};

const ALL_VIEWS = ["grid", "wall", "table", "timeline", "folder", "hierarchy"];

/** A list's request through `useListUrlState`, with the preset as the default or loaded */
function renderList(
  list: ListKind,
  preset: SavedPreset,
  mode: "default" | "load"
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // A stored preset has no more shape than `SavedPreset` declares
  queryClient.setQueryData(
    presetsQueryOptions.queryKey,
    untrusted<GetFilterPresetsResponse>({ presets: { [list]: [preset] } })
  );
  queryClient.setQueryData(defaultPresetsQueryOptions.queryKey, {
    defaults: mode === "default" ? { [list]: preset.id } : {},
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: [`/${list}`] }, children)
    );
  const view = renderHook(
    () => ({
      state: useListUrlState({
        entityType: list,
        filterOptions: OPTIONS[list],
        sortOptions: (filters) => sortOptionsFor(list, filters),
        viewModes: ALL_VIEWS,
        defaults: {
          sort: DEFAULT_SORT[list].field,
          direction: "DESC",
          perPage: 24,
          viewMode: "grid",
          zoomLevel: "medium",
          gridDensity: "medium",
        },
      }),
      search: useLocation().search,
    }),
    { wrapper }
  );
  if (mode === "load") {
    act(() => {
      view.result.current.state.loadPreset(preset);
    });
  }
  return {
    panelFilters: view.result.current.state.filters,
    url: view.result.current.search,
    request: untrusted<unknown>(JSON.parse(view.result.current.state.listKey)),
  };
}

function prodPresetResults(list: ListKind) {
  const stored = PROD_PRESETS[list];
  if (stored === undefined) return [];
  const preset = untrusted<SavedPreset>(JSON.parse(stored));
  const direct = buildListQuery(
    list,
    {
      ready: true,
      filters: preset.filters,
      sort: { field: preset.sort, direction: "DESC", seed: null },
      page: 1,
      perPage: 24,
      q: "",
    },
    {}
  );
  return [
    {
      name: preset.name,
      stored: preset,
      asDefault: renderList(list, preset, "default"),
      afterLoad: renderList(list, preset, "load"),
      buildListQueryFromItsFilters: direct,
    },
  ];
}

// ── The scene carousel ────────────────────────────────────────────────────

describe("scene", () => {
  it("carousel", async () => {
    const samples = CAROUSEL_FILTER_DEFINITIONS.flatMap((definition) =>
      samplesOf(definition)
    ).map((sample) => {
      const rules = buildCarouselRules(sample.state);
      const { state: back, kept } = carouselRulesToFilterState(rules);
      return {
        ...sample,
        rules,
        back,
        kept,
        lossless: isDeepStrictEqual(buildCarouselRules(back, kept), rules),
        seeMore: buildCustomCarouselUrl(
          untrusted<Record<string, unknown>>(rules),
          "created_at",
          "ASC"
        ),
      };
    });
    const prodRules = untrusted<Record<string, unknown>>(
      JSON.parse(PROD_CAROUSEL.rules)
    );
    const prodRead = carouselRulesToFilterState(prodRules);
    const prod = {
      rules: prodRules,
      back: prodRead.state,
      kept: prodRead.kept,
      seeMore: buildCustomCarouselUrl(
        prodRules,
        PROD_CAROUSEL.sort,
        PROD_CAROUSEL.direction
      ),
      rebuilt: buildCarouselRules(prodRead.state, prodRead.kept),
    };
    const seeMoreCases = [
      { label: "no rules", rules: null, sort: undefined, direction: undefined },
      {
        label: "empty rules",
        rules: {},
        sort: undefined,
        direction: undefined,
      },
      {
        label: "rules without a sort",
        rules: prodRules,
        sort: undefined,
        direction: undefined,
      },
    ].map((each) => ({
      ...each,
      seeMore: buildCustomCarouselUrl(each.rules, each.sort, each.direction),
    }));
    await expect(
      golden({
        definitions: CAROUSEL_FILTER_DEFINITIONS,
        samples,
        prod,
        seeMoreCases,
      })
    ).toMatchFileSnapshot(goldenPath("scene", "carousel"));
  });
});
