/**
 * The client's filter panel and sort options (`client/src/utils/filterConfig.ts`)
 * for the filter contract test (item 38), and the panel states it walks.
 *
 * The client file is loaded at run time through a non-literal `import()` of a
 * `new URL(...)` specifier and typed by `ClientFilterConfig` below, so it
 * stays out of the server's type program (`tsconfig.tests.json`): the client
 * checks it with its own flags, and the server's stricter ones (B23's
 * `exactOptionalPropertyTypes`) do not reach it before PR 8 rewrites it.
 * Vitest transforms it like any TypeScript module.
 */
import type { ListKind } from "@peek/shared-types/filters/index.js";

/** One filter panel option, as the client declares it (`FilterOption`) */
export interface ClientOption {
  readonly key: string;
  readonly type: string;
  readonly label?: string;
  readonly multi?: boolean;
  readonly defaultValue?: unknown;
  readonly entityType?: string;
  readonly options?: readonly ClientChoice[];
  readonly modifierKey?: string;
  readonly modifierOptions?: readonly ClientChoice[];
  readonly defaultModifier?: string;
  readonly hierarchyKey?: string;
  readonly supportsHierarchy?: boolean;
  readonly min?: number;
  readonly max?: number;
}

/** A select's value or a sort option */
export interface ClientChoice {
  readonly value: string;
  readonly label: string;
}

/** The filter panel's state: option keys and their modifier and hierarchy companions */
export type PanelState = Readonly<Record<string, unknown>>;

/** A `build*Filter`: the panel state to the request's filter (a clip's query parameters) */
export type BuildFilter = (state: PanelState) => Record<string, unknown>;

/** The exports of `client/src/utils/filterConfig.ts` the walk reads */
export interface ClientFilterConfig {
  readonly SCENE_FILTER_OPTIONS: readonly ClientOption[];
  readonly PERFORMER_FILTER_OPTIONS: readonly ClientOption[];
  readonly STUDIO_FILTER_OPTIONS: readonly ClientOption[];
  readonly TAG_FILTER_OPTIONS: readonly ClientOption[];
  readonly GROUP_FILTER_OPTIONS: readonly ClientOption[];
  readonly GALLERY_FILTER_OPTIONS: readonly ClientOption[];
  readonly IMAGE_FILTER_OPTIONS: readonly ClientOption[];
  readonly CLIP_FILTER_OPTIONS: readonly ClientOption[];
  readonly SCENE_SORT_OPTIONS: readonly ClientChoice[];
  readonly PERFORMER_SORT_OPTIONS: readonly ClientChoice[];
  readonly STUDIO_SORT_OPTIONS: readonly ClientChoice[];
  readonly TAG_SORT_OPTIONS: readonly ClientChoice[];
  readonly GROUP_SORT_OPTIONS: readonly ClientChoice[];
  readonly GALLERY_SORT_OPTIONS: readonly ClientChoice[];
  readonly IMAGE_SORT_OPTIONS: readonly ClientChoice[];
  readonly CLIP_SORT_OPTIONS: readonly ClientChoice[];
  readonly buildSceneFilter: BuildFilter;
  /** The metric panel (the default unit preference) */
  readonly buildPerformerFilter: BuildFilter;
  readonly buildStudioFilter: BuildFilter;
  readonly buildTagFilter: BuildFilter;
  readonly buildGroupFilter: BuildFilter;
  readonly buildGalleryFilter: BuildFilter;
  readonly buildImageFilter: BuildFilter;
  readonly buildClipFilter: BuildFilter;
}

/** One list's panel: its options, its sorts and its filter builder */
export interface ClientList {
  readonly options: readonly ClientOption[];
  readonly sorts: readonly ClientChoice[];
  readonly build: BuildFilter;
}

/** Each list's exports in the client module */
const EXPORTS = {
  scene: {
    options: "SCENE_FILTER_OPTIONS",
    sorts: "SCENE_SORT_OPTIONS",
    build: "buildSceneFilter",
  },
  performer: {
    options: "PERFORMER_FILTER_OPTIONS",
    sorts: "PERFORMER_SORT_OPTIONS",
    build: "buildPerformerFilter",
  },
  studio: {
    options: "STUDIO_FILTER_OPTIONS",
    sorts: "STUDIO_SORT_OPTIONS",
    build: "buildStudioFilter",
  },
  tag: {
    options: "TAG_FILTER_OPTIONS",
    sorts: "TAG_SORT_OPTIONS",
    build: "buildTagFilter",
  },
  group: {
    options: "GROUP_FILTER_OPTIONS",
    sorts: "GROUP_SORT_OPTIONS",
    build: "buildGroupFilter",
  },
  gallery: {
    options: "GALLERY_FILTER_OPTIONS",
    sorts: "GALLERY_SORT_OPTIONS",
    build: "buildGalleryFilter",
  },
  image: {
    options: "IMAGE_FILTER_OPTIONS",
    sorts: "IMAGE_SORT_OPTIONS",
    build: "buildImageFilter",
  },
  clip: {
    options: "CLIP_FILTER_OPTIONS",
    sorts: "CLIP_SORT_OPTIONS",
    build: "buildClipFilter",
  },
} as const satisfies Record<
  ListKind,
  {
    options: keyof ClientFilterConfig;
    sorts: keyof ClientFilterConfig;
    build: keyof ClientFilterConfig;
  }
>;

/** The client module's exports the walk needs, checked by name and kind */
function isClientFilterConfig(module: unknown): module is ClientFilterConfig {
  if (typeof module !== "object" || module === null) return false;
  return Object.values(EXPORTS).every(
    (names) =>
      Array.isArray(Reflect.get(module, names.options)) &&
      Array.isArray(Reflect.get(module, names.sorts)) &&
      typeof Reflect.get(module, names.build) === "function"
  );
}

/** Loads `client/src/utils/filterConfig.ts`, outside the server's type program */
export async function loadClientFilterConfig(): Promise<ClientFilterConfig> {
  const specifier = new URL(
    "../../../client/src/utils/filterConfig.ts",
    import.meta.url
  ).href;
  const module: unknown = await import(specifier);
  if (!isClientFilterConfig(module)) {
    throw new Error(
      `${specifier} lacks a *_FILTER_OPTIONS, *_SORT_OPTIONS or build*Filter export the contract test reads`
    );
  }
  return module;
}

/** One list's panel, read from the client module */
export function clientList(
  config: ClientFilterConfig,
  kind: ListKind
): ClientList {
  const names = EXPORTS[kind];
  const build = config[names.build];
  return {
    options: config[names.options],
    sorts: config[names.sorts],
    build: (state) => build(state),
  };
}

/** Two composite ids (`"id:instanceId"`) of an entity type, on the test instance */
export type RefPair = readonly [string, string];

/** A searchable select's entity type (`"tags"`, `"scenes"`) to its two ids */
export type RefPool = (entityType: string) => RefPair;

/**
 * One panel state for one option: a value (one sample per bound or
 * choice), the modifier when the option offers a choice, and sub-items on
 * or off where the option supports them.
 */
export interface OptionSample {
  /** `"<modifier> <variant>"`, or the variant alone */
  readonly label: string;
  /** The option's own keys: the value, the modifier, the depth */
  readonly state: PanelState;
  /** The modifier chosen from `modifierOptions`; undefined when the option offers none */
  readonly modifier: string | undefined;
  /** The sample's value, without the modifier: "min only", "two ids, with sub-items" */
  readonly variant: string;
  /** Searchable selects: how many ids the sample holds */
  readonly ids: number | undefined;
  /** With sub-items (depth -1): the variant of the same sample without them */
  readonly withoutSubItems: string | undefined;
}

const TEXT_SAMPLE = "contract";
const DATE_START = "2020-01-01";
const DATE_END = "2024-12-31";
const SUB_ITEMS = ", with sub-items";

/**
 * The option's samples, per its type: range min only, max only, both; date
 * start only, end only, both; text; each select value but the one the
 * control shows when unset (its `defaultValue`, the unfiltered state);
 * checkbox checked; searchable select one id and (multi) two ids, with and
 * without sub-items. Each under every modifier the option offers. A type
 * with no samples here throws, so a new kind of option cannot go unwalked.
 */
export function optionSamples(
  option: ClientOption,
  refs: RefPool
): OptionSample[] {
  const modifiers: readonly (string | undefined)[] =
    option.modifierOptions?.map((choice) => choice.value) ?? [undefined];
  const values = sampleValues(option, refs);
  return modifiers.flatMap((modifier) =>
    values.map((value) => ({
      label:
        modifier === undefined ? value.variant : `${modifier} ${value.variant}`,
      state: {
        ...value.state,
        ...(modifier !== undefined && option.modifierKey !== undefined
          ? { [option.modifierKey]: modifier }
          : {}),
      },
      modifier,
      variant: value.variant,
      ids: value.ids,
      withoutSubItems: value.withoutSubItems,
    }))
  );
}

interface SampleValue {
  readonly variant: string;
  readonly state: PanelState;
  readonly ids: number | undefined;
  readonly withoutSubItems: string | undefined;
}

function sampleValues(option: ClientOption, refs: RefPool): SampleValue[] {
  const { key } = option;
  const plain = (variant: string, value: unknown): SampleValue => ({
    variant,
    state: { [key]: value },
    ids: undefined,
    withoutSubItems: undefined,
  });
  switch (option.type) {
    case "text":
      return [plain("text", TEXT_SAMPLE)];
    case "checkbox":
      return [plain("checked", true)];
    case "range": {
      // Strings, as the panel's inputs hold them, inside the option's bounds
      const low = option.min ?? 0;
      const high = option.max ?? 100;
      const min = String(low + Math.round((high - low) / 4));
      const max = String(low + Math.round((3 * (high - low)) / 4));
      return [
        plain("min only", { min }),
        plain("max only", { max }),
        plain("min and max", { min, max }),
      ];
    }
    case "date-range":
      return [
        plain("start only", { start: DATE_START }),
        plain("end only", { end: DATE_END }),
        plain("start and end", { start: DATE_START, end: DATE_END }),
      ];
    case "select":
      return (option.options ?? [])
        .filter((choice) => choice.value !== option.defaultValue)
        .map((choice) =>
          plain(
            choice.value === "" ? `"" (${choice.label})` : choice.value,
            choice.value
          )
        );
    case "searchable-select":
      return refSamples(option, refs);
    default:
      throw new Error(
        `No samples for option ${key} of type ${option.type}: add them to integration/helpers/clientFilterConfig.ts`
      );
  }
}

function refSamples(option: ClientOption, refs: RefPool): SampleValue[] {
  const { key, entityType, hierarchyKey } = option;
  if (entityType === undefined) {
    throw new Error(`Searchable select ${key} names no entityType`);
  }
  const [first, second] = refs(entityType);
  const picks: { variant: string; ids: string[] }[] =
    option.multi === true
      ? [
          { variant: "one id", ids: [first] },
          { variant: "two ids", ids: [first, second] },
        ]
      : [{ variant: "one id", ids: [first] }];
  const subItems =
    option.supportsHierarchy === true && hierarchyKey !== undefined
      ? [false, true]
      : [false];
  return subItems.flatMap((on) =>
    picks.map((pick) => ({
      variant: on ? `${pick.variant}${SUB_ITEMS}` : pick.variant,
      state: {
        [key]: option.multi === true ? pick.ids : pick.ids[0],
        // The panel's "Include sub-tags" checkbox sets the depth to -1
        ...(on && hierarchyKey !== undefined ? { [hierarchyKey]: -1 } : {}),
      },
      ids: pick.ids.length,
      withoutSubItems: on ? pick.variant : undefined,
    }))
  );
}

/**
 * A clip panel's filter as `GET /api/clips` receives it: `ClipSearch` and
 * `api/clips.ts` send each parameter as a string, lists joined with commas.
 * They forward only the parameters they name, so a parameter
 * `buildClipFilter` gains must be added there too.
 */
export function clipQueryParams(
  params: Readonly<Record<string, unknown>>
): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [name, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      if (value.length > 0) query[name] = value.map(String).join(",");
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      query[name] = String(value);
    } else if (value !== undefined && value !== null) {
      throw new Error(
        `Clip parameter ${name} is not a string, number, boolean or list`
      );
    }
  }
  return query;
}
