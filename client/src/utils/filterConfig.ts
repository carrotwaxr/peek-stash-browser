/**
 * Sorting and filtering configuration for all entity types
 */
import {
  CLIP_PARAMS,
  type EntityKind,
  GALLERY_FIELDS,
  GENDERS,
  GROUP_FIELDS,
  type GalleryFilterInput,
  type GroupFilterInput,
  IMAGE_FIELDS,
  type ImageFilterInput,
  ORIENTATIONS,
  PERFORMER_FIELDS,
  type PerformerFilterInput,
  RESOLUTIONS,
  type RefModifier,
  type RefSpec,
  SCENE_FIELDS,
  STUDIO_FIELDS,
  type SceneFilterInput,
  type StudioFilterInput,
  TAG_FIELDS,
  type TagFilterInput,
} from "@peek/shared-types";
import type { ClipFilterParams } from "../api/clips";
import { type FilterOption, filterOptionsOf } from "./filterFields";
import { UNITS, feetInchesToCm, inchesToCm, lbsToKg } from "./unitConversions";

export type { FilterOption };

// Scene sorting options (alphabetically organized by label)
// Note: scene_index is added dynamically when group filter is active
export const SCENE_SORT_OPTIONS_BASE = [
  { value: "bitrate", label: "Bitrate" },
  { value: "created_at", label: "Created At" },
  { value: "date", label: "Date" },
  { value: "duration", label: "Duration" },
  { value: "filesize", label: "File Size" },
  { value: "framerate", label: "Framerate" },
  { value: "last_o_at", label: "Last O At" },
  { value: "last_played_at", label: "Last Played At" },
  { value: "o_counter", label: "O Count" },
  { value: "path", label: "Path" },
  { value: "performer_count", label: "Performer Count" },
  { value: "play_count", label: "Play Count" },
  { value: "play_duration", label: "Play Duration" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "tag_count", label: "Tag Count" },
  { value: "title", label: "Title" },
  { value: "updated_at", label: "Updated At" },
];

// Scene Number option - only shown when group filter is active
export const SCENE_INDEX_SORT_OPTION = {
  value: "scene_index",
  label: "Scene Number",
};

// Full list for backwards compatibility
export const SCENE_SORT_OPTIONS = [
  ...SCENE_SORT_OPTIONS_BASE.slice(0, 15), // up to "rating"
  SCENE_INDEX_SORT_OPTION,
  ...SCENE_SORT_OPTIONS_BASE.slice(15), // "tag_count" onwards
];

// Performer sorting options (alphabetically organized by label)
export const PERFORMER_SORT_OPTIONS = [
  { value: "birthdate", label: "Birthdate" },
  { value: "career_length", label: "Career Length" },
  { value: "created_at", label: "Created At" },
  { value: "height", label: "Height" },
  { value: "last_o_at", label: "Last O At" },
  { value: "last_played_at", label: "Last Played At" },
  { value: "measurements", label: "Measurements" },
  { value: "name", label: "Name" },
  { value: "o_counter", label: "O Count" },
  { value: "penis_length", label: "Penis Length" },
  { value: "play_count", label: "Play Count" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "scenes_count", label: "Scene Count" },
  { value: "updated_at", label: "Updated At" },
  { value: "weight", label: "Weight" },
];

// Studio sorting options (alphabetically organized by label)
export const STUDIO_SORT_OPTIONS = [
  { value: "created_at", label: "Created At" },
  { value: "name", label: "Name" },
  { value: "o_counter", label: "O Count" },
  { value: "play_count", label: "Play Count" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "scenes_count", label: "Scene Count" },
  { value: "updated_at", label: "Updated At" },
];

// Tag sorting options (alphabetically organized by label)
export const TAG_SORT_OPTIONS = [
  { value: "created_at", label: "Created At" },
  { value: "name", label: "Name" },
  { value: "o_counter", label: "O Count" },
  { value: "performer_count", label: "Performer Count" },
  { value: "play_count", label: "Play Count" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "scenes_count", label: "Scene Count" },
  { value: "updated_at", label: "Updated At" },
];

// Group sorting options (alphabetically organized by label)
export const GROUP_SORT_OPTIONS = [
  { value: "created_at", label: "Created At" },
  { value: "date", label: "Date" },
  { value: "duration", label: "Duration" },
  { value: "name", label: "Name" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "scene_count", label: "Scene Count" },
  { value: "updated_at", label: "Updated At" },
];

// Gallery sorting options (alphabetically organized by label)
export const GALLERY_SORT_OPTIONS = [
  { value: "created_at", label: "Created At" },
  { value: "date", label: "Date" },
  { value: "image_count", label: "Image Count" },
  { value: "path", label: "Path" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "title", label: "Title" },
  { value: "updated_at", label: "Updated At" },
];

// Image sorting options
export const IMAGE_SORT_OPTIONS = [
  { value: "created_at", label: "Created At" },
  { value: "date", label: "Date" },
  { value: "filesize", label: "File Size" },
  { value: "o_counter", label: "O Count" },
  { value: "path", label: "Path" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "title", label: "Title" },
  { value: "updated_at", label: "Updated At" },
];

// Clip sorting options (Peek server API)
export const CLIP_SORT_OPTIONS = [
  { value: "stashCreatedAt", label: "Created At" },
  { value: "title", label: "Title" },
  { value: "seconds", label: "Position in Scene" },
  { value: "duration", label: "Duration" },
  { value: "random", label: "Random" },
];

// The Clips page's "All clips" choice (the panel's `isGenerated` row): the
// request sends no isGenerated, so every clip lists
const ALL_CLIPS = "all";

// Each list's panel options, read from the shared field table
export const SCENE_FILTER_OPTIONS = filterOptionsOf("scene");
export const PERFORMER_FILTER_OPTIONS = filterOptionsOf("performer");
export const STUDIO_FILTER_OPTIONS = filterOptionsOf("studio");
export const TAG_FILTER_OPTIONS = filterOptionsOf("tag");
export const GROUP_FILTER_OPTIONS = filterOptionsOf("group");
export const GALLERY_FILTER_OPTIONS = filterOptionsOf("gallery");
export const IMAGE_FILTER_OPTIONS = filterOptionsOf("image");
export const CLIP_FILTER_OPTIONS = filterOptionsOf("clip");

/**
 * The panel's state to the request's filter. Each builder returns the list's
 * wire type from the shared contract (`SceneFilterInput`, ...), so what the
 * panel sends is what the server's parser accepts.
 */

/**
 * The filter panel's state: option keys with their modifier and depth
 * companions (`tagIdsModifier`, `tagIdsDepth`), and a page's permanent
 * criteria in the request's own shape (a performer page's `performers`)
 */
type FilterState = Readonly<Record<string, unknown>>;

/** A filter the builders fill in (the wire types' fields are read-only) */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

/** A picker's option: its key and the companions it names */
type RefControl = Pick<
  FilterOption,
  "key" | "modifierKey" | "modifierOptions" | "defaultModifier" | "hierarchyKey"
>;

/** A list's options by key, for the builders to read each picker's modifier default from */
const controlsOf = (options: readonly FilterOption[]) => {
  const byKey = new Map(options.map((option) => [option.key, option]));
  return (key: string): RefControl => {
    const control = byKey.get(key);
    if (!control) throw new Error(`No filter option ${key}`);
    return control;
  };
};

/** Sets a field only when the panel gave it a value, so an unset field is absent */
function put<F, K extends keyof F>(
  filter: F,
  key: K,
  value: F[K] | undefined
): void {
  if (value !== undefined) filter[key] = value;
}

/** A checkbox, or a boolean from the URL ("TRUE") */
const isChecked = (value: unknown): boolean =>
  value === true || value === "TRUE";

const isWholeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

/** A range bound as a whole number (the inputs hold strings), else undefined */
const wholeBound = (value: unknown): number | undefined => {
  const parsed =
    typeof value === "number"
      ? Math.trunc(value)
      : typeof value === "string"
        ? parseInt(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** A range control's bounds, or none */
const rangeOf = (value: unknown): { min?: unknown; max?: unknown } =>
  typeof value === "object" && value !== null ? value : {};

type RangeCriterion =
  | { modifier: "BETWEEN"; value: number; value2: number }
  | { modifier: "GREATER_THAN" | "LESS_THAN"; value: number };

/**
 * A number range: both bounds BETWEEN them; one bound GREATER_THAN min - 1 or
 * LESS_THAN max + 1, so a lone whole bound is inclusive (PR 9 revisits the
 * semantics); undefined without a bound. `scale` converts the panel's unit
 * to the stored one (minutes to seconds, Mbps to bits per second).
 */
const rangeCriterion = (
  range: unknown,
  scale = 1
): RangeCriterion | undefined => {
  const { min: rawMin, max: rawMax } = rangeOf(range);
  const min = wholeBound(rawMin);
  const max = wholeBound(rawMax);
  if (min !== undefined && max !== undefined) {
    return { modifier: "BETWEEN", value: min * scale, value2: max * scale };
  }
  if (min !== undefined) {
    return { modifier: "GREATER_THAN", value: min * scale - 1 };
  }
  if (max !== undefined) {
    return { modifier: "LESS_THAN", value: max * scale + 1 };
  }
  return undefined;
};

/**
 * A count a view fixes as a permanent filter (the folder view's Untagged:
 * `tag_count` EQUALS 0), which wins over the panel's range of that count
 */
const fixedCount = (
  value: unknown
): { modifier: "EQUALS"; value: number } | undefined => {
  const fixed = rangeOf(value) as { modifier?: unknown; value?: unknown };
  return fixed.modifier === "EQUALS" && isWholeNumber(fixed.value)
    ? { modifier: "EQUALS", value: fixed.value }
    : undefined;
};

type DateRangeCriterion =
  | { modifier: "BETWEEN"; value: string; value2: string }
  | { modifier: "GREATER_THAN" | "LESS_THAN"; value: string };

/** A date range control's day, or undefined when unset */
const day = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/**
 * A date range control's `{ start, end }`: both BETWEEN them, a start alone
 * GREATER_THAN it, an end alone LESS_THAN it; undefined when both are unset
 */
const dateCriterion = (range: unknown): DateRangeCriterion | undefined => {
  const { start, end } =
    typeof range === "object" && range !== null
      ? (range as { start?: unknown; end?: unknown })
      : {};
  const from = day(start);
  const to = day(end);
  if (from !== undefined && to !== undefined) {
    return { modifier: "BETWEEN", value: from, value2: to };
  }
  if (from !== undefined) return { modifier: "GREATER_THAN", value: from };
  if (to !== undefined) return { modifier: "LESS_THAN", value: to };
  return undefined;
};

/** A text search: the trimmed text as a substring, or undefined when blank */
const textCriterion = (
  value: unknown
): { value: string; modifier: "INCLUDES" } | undefined => {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? undefined : { value: text, modifier: "INCLUDES" };
};

/** A select of Stash's free-text values (hair colour), compared whole */
const equalsCriterion = (
  value: unknown
): { value: string; modifier: "EQUALS" } | undefined =>
  typeof value === "string" && value !== ""
    ? { value, modifier: "EQUALS" }
    : undefined;

/** A select's value when it is one the field takes */
const oneOf = <V extends string>(
  values: readonly V[],
  value: unknown
): V | undefined => values.find((candidate) => candidate === value);

/** The ids a picker holds: a multi-select's list or a single select's one id */
const idList = (value: unknown): string[] =>
  (Array.isArray(value) ? (value as unknown[]) : [value])
    .filter(
      (id): id is string | number =>
        (typeof id === "string" && id !== "") || typeof id === "number"
    )
    .map(String);

/** A page's permanent criterion of a field, in the request's shape */
interface PermanentRef {
  value?: unknown;
  modifier?: unknown;
  depth?: unknown;
}

const permanentOf = (value: unknown): PermanentRef =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as PermanentRef)
    : {};

interface RefCriterion<M extends RefModifier> {
  value: string[];
  modifier: M;
  depth?: number;
}

/**
 * One ref field's criterion: the picker's ids merged with a page's permanent
 * criterion of the same field (a collection page's `groups`). The modifier is
 * the panel's choice when the picker offers it, else the permanent
 * criterion's, else the option's `defaultModifier`, else the field's, each
 * only if the field takes it (a stale Has ALL on a one-studio field falls
 * back), so every criterion carries the modifier the panel shows. Depth, on
 * a hierarchical field only: the permanent criterion's, else the panel's.
 */
function refCriterion<M extends RefModifier>(
  spec: RefSpec<EntityKind, M>,
  state: FilterState,
  control?: RefControl,
  permanent?: unknown
): RefCriterion<M> | undefined {
  const fixed = permanentOf(permanent);
  const value = [
    ...new Set([
      ...idList(fixed.value),
      ...idList(control ? state[control.key] : undefined),
    ]),
  ];
  if (value.length === 0) return undefined;

  const takes = (candidate: unknown): candidate is M =>
    spec.modifiers.some((modifier) => modifier === candidate);
  const chosen =
    control?.modifierKey === undefined ? undefined : state[control.modifierKey];
  const offered = control?.modifierOptions?.some(
    (choice) => choice.value === chosen
  );
  const modifier =
    [
      offered ? chosen : undefined,
      fixed.modifier,
      control?.defaultModifier,
    ].find(takes) ?? spec.defaultModifier;

  const depth = spec.hierarchical
    ? [
        fixed.depth,
        control?.hierarchyKey === undefined
          ? undefined
          : state[control.hierarchyKey],
      ].find(isWholeNumber)
    : undefined;
  return depth === undefined ? { value, modifier } : { value, modifier, depth };
}

const SCENE_CONTROLS = controlsOf(SCENE_FILTER_OPTIONS);
const PERFORMER_CONTROLS = controlsOf(PERFORMER_FILTER_OPTIONS);
const STUDIO_CONTROLS = controlsOf(STUDIO_FILTER_OPTIONS);
const TAG_CONTROLS = controlsOf(TAG_FILTER_OPTIONS);
const GROUP_CONTROLS = controlsOf(GROUP_FILTER_OPTIONS);
const GALLERY_CONTROLS = controlsOf(GALLERY_FILTER_OPTIONS);
const IMAGE_CONTROLS = controlsOf(IMAGE_FILTER_OPTIONS);
const CLIP_CONTROLS = controlsOf(CLIP_FILTER_OPTIONS);

export const buildSceneFilter = (filters: FilterState): SceneFilterInput => {
  const control = SCENE_CONTROLS;
  const sceneFilter: Writable<SceneFilterInput> = {};

  // Pickers, merged with a page's permanent criteria (a performer page's
  // scenes, the folder view's tag, a gallery page's scenes)
  put(
    sceneFilter,
    "performers",
    refCriterion(
      SCENE_FIELDS.performers,
      filters,
      control("performerIds"),
      filters.performers
    )
  );
  put(
    sceneFilter,
    "studios",
    refCriterion(
      SCENE_FIELDS.studios,
      filters,
      control("studioId"),
      filters.studios
    )
  );
  put(
    sceneFilter,
    "tags",
    refCriterion(SCENE_FIELDS.tags, filters, control("tagIds"), filters.tags)
  );
  put(
    sceneFilter,
    "groups",
    refCriterion(
      SCENE_FIELDS.groups,
      filters,
      control("groupIds"),
      filters.groups
    )
  );
  put(
    sceneFilter,
    "galleries",
    refCriterion(SCENE_FIELDS.galleries, filters, undefined, filters.galleries)
  );

  if (isChecked(filters.favorite)) sceneFilter.favorite = true;
  if (isChecked(filters.performerFavorite)) {
    sceneFilter.performer_favorite = true;
  }
  if (isChecked(filters.studioFavorite)) sceneFilter.studio_favorite = true;
  if (isChecked(filters.tagFavorite)) sceneFilter.tag_favorite = true;

  const resolution = oneOf(RESOLUTIONS, filters.resolution);
  if (resolution !== undefined) {
    sceneFilter.resolution = {
      value: resolution,
      modifier:
        oneOf(SCENE_FIELDS.resolution.modifiers, filters.resolutionModifier) ??
        "EQUALS",
    };
  }
  const orientation = oneOf(ORIENTATIONS, filters.orientation);
  if (orientation !== undefined) {
    sceneFilter.orientation = { value: [orientation] };
  }

  put(sceneFilter, "rating100", rangeCriterion(filters.rating));
  put(sceneFilter, "duration", rangeCriterion(filters.duration, 60));
  put(sceneFilter, "play_duration", rangeCriterion(filters.playDuration, 60));
  put(sceneFilter, "o_counter", rangeCriterion(filters.oCount));
  put(sceneFilter, "play_count", rangeCriterion(filters.playCount));
  put(sceneFilter, "bitrate", rangeCriterion(filters.bitrate, 1_000_000));
  put(sceneFilter, "framerate", rangeCriterion(filters.framerate));
  put(sceneFilter, "performer_count", rangeCriterion(filters.performerCount));
  put(sceneFilter, "performer_age", rangeCriterion(filters.performerAge));
  put(sceneFilter, "tag_count", rangeCriterion(filters.tagCount));
  // The folder view's Untagged: no tag, own or inherited
  if (typeof filters.tagged === "boolean") sceneFilter.tagged = filters.tagged;

  put(sceneFilter, "date", dateCriterion(filters.date));
  put(sceneFilter, "created_at", dateCriterion(filters.createdAt));
  put(sceneFilter, "updated_at", dateCriterion(filters.updatedAt));
  put(sceneFilter, "last_played_at", dateCriterion(filters.lastPlayedAt));

  put(sceneFilter, "title", textCriterion(filters.title));
  put(sceneFilter, "details", textCriterion(filters.details));
  put(sceneFilter, "director", textCriterion(filters.director));
  put(sceneFilter, "video_codec", textCriterion(filters.videoCodec));
  put(sceneFilter, "audio_codec", textCriterion(filters.audioCodec));

  return sceneFilter;
};

/** A decimal bound (penis length in inches), else undefined */
const decimalBound = (value: unknown): number | undefined => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseFloat(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Converts filter values from imperial to metric if needed.
 * Height uses feet/inches fields, weight uses lbs, penisLength uses inches.
 */
const convertFilterUnits = (
  filters: FilterState,
  unitPreference: string
): FilterState => {
  if (unitPreference !== UNITS.IMPERIAL) return filters;

  const converted: Record<string, unknown> = { ...filters };

  // Height: the imperial-height-range control stores
  // { feetMin, inchesMin, feetMax, inchesMax }
  const height = rangeOf(filters.height) as {
    feetMin?: unknown;
    inchesMin?: unknown;
    feetMax?: unknown;
    inchesMax?: unknown;
  };
  const heightCm: { min?: number; max?: number } = {};
  const minFeet = wholeBound(height.feetMin) ?? 0;
  const minInches = wholeBound(height.inchesMin) ?? 0;
  if (minFeet || minInches) heightCm.min = feetInchesToCm(minFeet, minInches);
  const maxFeet = wholeBound(height.feetMax) ?? 0;
  const maxInches = wholeBound(height.inchesMax) ?? 0;
  if (maxFeet || maxInches) heightCm.max = feetInchesToCm(maxFeet, maxInches);
  if (heightCm.min !== undefined || heightCm.max !== undefined) {
    converted.height = { ...rangeOf(filters.height), ...heightCm };
  }

  // Weight: lbs to kg
  const weight = rangeOf(filters.weight);
  const minLbs = wholeBound(weight.min);
  const maxLbs = wholeBound(weight.max);
  if (minLbs || maxLbs) {
    converted.weight = {
      ...weight,
      ...(minLbs ? { min: lbsToKg(minLbs) } : {}),
      ...(maxLbs ? { max: lbsToKg(maxLbs) } : {}),
    };
  }

  // Penis length: inches (with decimals) to cm
  const length = rangeOf(filters.penisLength);
  const minInchesLength = decimalBound(length.min);
  const maxInchesLength = decimalBound(length.max);
  if (minInchesLength || maxInchesLength) {
    converted.penisLength = {
      ...length,
      ...(minInchesLength ? { min: inchesToCm(minInchesLength) } : {}),
      ...(maxInchesLength ? { max: inchesToCm(maxInchesLength) } : {}),
    };
  }

  return converted;
};

export const buildPerformerFilter = (
  filters: FilterState,
  unitPreference: string = UNITS.METRIC
): PerformerFilterInput => {
  // Imperial values to metric before building the filter
  const converted = convertFilterUnits(filters, unitPreference);
  const control = PERFORMER_CONTROLS;
  const performerFilter: Writable<PerformerFilterInput> = {};

  if (isChecked(filters.favorite)) performerFilter.favorite = true;

  put(
    performerFilter,
    "tags",
    refCriterion(PERFORMER_FIELDS.tags, filters, control("tagIds"))
  );

  const gender = oneOf(GENDERS, filters.gender);
  if (gender !== undefined) {
    performerFilter.gender = { value: gender, modifier: "EQUALS" };
  }
  put(performerFilter, "ethnicity", equalsCriterion(filters.ethnicity));
  put(performerFilter, "hair_color", equalsCriterion(filters.hairColor));
  put(performerFilter, "eye_color", equalsCriterion(filters.eyeColor));
  put(performerFilter, "fake_tits", equalsCriterion(filters.fakeTits));

  put(performerFilter, "rating100", rangeCriterion(filters.rating));
  put(performerFilter, "age", rangeCriterion(filters.age));
  put(performerFilter, "birth_year", rangeCriterion(filters.birthYear));
  put(performerFilter, "death_year", rangeCriterion(filters.deathYear));
  put(performerFilter, "career_length", rangeCriterion(filters.careerLength));
  put(performerFilter, "height", rangeCriterion(converted.height));
  put(performerFilter, "weight", rangeCriterion(converted.weight));
  put(performerFilter, "penis_length", rangeCriterion(converted.penisLength));
  put(performerFilter, "o_counter", rangeCriterion(filters.oCounter));
  put(performerFilter, "play_count", rangeCriterion(filters.playCount));
  put(performerFilter, "scene_count", rangeCriterion(filters.sceneCount));

  put(performerFilter, "birthdate", dateCriterion(filters.birthdate));
  put(performerFilter, "death_date", dateCriterion(filters.deathDate));
  put(performerFilter, "created_at", dateCriterion(filters.createdAt));
  put(performerFilter, "updated_at", dateCriterion(filters.updatedAt));

  put(performerFilter, "name", textCriterion(filters.name));
  put(performerFilter, "details", textCriterion(filters.details));
  put(performerFilter, "measurements", textCriterion(filters.measurements));
  put(performerFilter, "tattoos", textCriterion(filters.tattoos));
  put(performerFilter, "piercings", textCriterion(filters.piercings));

  return performerFilter;
};

export const buildStudioFilter = (filters: FilterState): StudioFilterInput => {
  const control = STUDIO_CONTROLS;
  const studioFilter: Writable<StudioFilterInput> = {};

  if (isChecked(filters.favorite)) studioFilter.favorite = true;

  put(
    studioFilter,
    "tags",
    refCriterion(STUDIO_FIELDS.tags, filters, control("tagIds"))
  );

  put(studioFilter, "rating100", rangeCriterion(filters.rating));
  put(studioFilter, "scene_count", rangeCriterion(filters.sceneCount));
  put(studioFilter, "o_counter", rangeCriterion(filters.oCounter));
  put(studioFilter, "play_count", rangeCriterion(filters.playCount));

  put(studioFilter, "created_at", dateCriterion(filters.createdAt));
  put(studioFilter, "updated_at", dateCriterion(filters.updatedAt));

  put(studioFilter, "name", textCriterion(filters.name));
  put(studioFilter, "details", textCriterion(filters.details));

  return studioFilter;
};

export const buildTagFilter = (filters: FilterState): TagFilterInput => {
  const control = TAG_CONTROLS;
  const tagFilter: Writable<TagFilterInput> = {};

  if (isChecked(filters.favorite)) tagFilter.favorite = true;

  put(tagFilter, "rating100", rangeCriterion(filters.rating));
  put(tagFilter, "scene_count", rangeCriterion(filters.sceneCount));
  put(tagFilter, "o_counter", rangeCriterion(filters.oCounter));
  put(tagFilter, "play_count", rangeCriterion(filters.playCount));

  put(tagFilter, "created_at", dateCriterion(filters.createdAt));
  put(tagFilter, "updated_at", dateCriterion(filters.updatedAt));

  put(tagFilter, "name", textCriterion(filters.name));
  put(tagFilter, "description", textCriterion(filters.description));

  put(
    tagFilter,
    "performers",
    refCriterion(TAG_FIELDS.performers, filters, control("performerIds"))
  );
  put(
    tagFilter,
    "studios",
    refCriterion(TAG_FIELDS.studios, filters, control("studioId"))
  );
  // Tags on scenes of these collections, as `scenes_filter.groups`
  const groups = refCriterion(TAG_FIELDS.groups, filters, control("groupIds"));
  if (groups) tagFilter.scenes_filter = { groups };

  return tagFilter;
};

export const buildGroupFilter = (filters: FilterState): GroupFilterInput => {
  const control = GROUP_CONTROLS;
  const groupFilter: Writable<GroupFilterInput> = {};

  if (isChecked(filters.favorite)) groupFilter.favorite = true;

  put(
    groupFilter,
    "tags",
    refCriterion(GROUP_FIELDS.tags, filters, control("tagIds"))
  );
  put(
    groupFilter,
    "performers",
    refCriterion(GROUP_FIELDS.performers, filters, control("performerIds"))
  );
  put(
    groupFilter,
    "studios",
    refCriterion(GROUP_FIELDS.studios, filters, control("studioId"))
  );
  // Parent collection: the direct sub-collections of these
  put(
    groupFilter,
    "containing_groups",
    refCriterion(GROUP_FIELDS.containing_groups, filters, control("groupIds"))
  );

  put(groupFilter, "rating100", rangeCriterion(filters.rating));
  put(groupFilter, "scene_count", rangeCriterion(filters.sceneCount));
  put(groupFilter, "duration", rangeCriterion(filters.duration, 60));

  put(groupFilter, "date", dateCriterion(filters.date));
  put(groupFilter, "created_at", dateCriterion(filters.createdAt));
  put(groupFilter, "updated_at", dateCriterion(filters.updatedAt));

  put(groupFilter, "name", textCriterion(filters.name));
  put(groupFilter, "synopsis", textCriterion(filters.synopsis));
  put(groupFilter, "director", textCriterion(filters.director));

  return groupFilter;
};

export const buildGalleryFilter = (
  filters: FilterState
): GalleryFilterInput => {
  const control = GALLERY_CONTROLS;
  const galleryFilter: Writable<GalleryFilterInput> = {};

  if (isChecked(filters.favorite)) galleryFilter.favorite = true;
  if (isChecked(filters.hasFavoriteImage)) {
    galleryFilter.hasFavoriteImage = true;
  }

  put(galleryFilter, "rating100", rangeCriterion(filters.rating));
  put(galleryFilter, "image_count", rangeCriterion(filters.imageCount));
  // The folder view's Untagged fixes it
  put(
    galleryFilter,
    "tag_count",
    fixedCount(filters.tag_count) ?? rangeCriterion(filters.tagCount)
  );
  put(galleryFilter, "title", textCriterion(filters.title));

  put(
    galleryFilter,
    "studios",
    refCriterion(GALLERY_FIELDS.studios, filters, control("studioIds"))
  );
  put(
    galleryFilter,
    "performers",
    refCriterion(GALLERY_FIELDS.performers, filters, control("performerIds"))
  );
  // The folder view's tag arrives as a permanent `tags` criterion
  put(
    galleryFilter,
    "tags",
    refCriterion(GALLERY_FIELDS.tags, filters, control("tagIds"), filters.tags)
  );

  // The timeline view's period
  put(galleryFilter, "date", dateCriterion(filters.date));

  return galleryFilter;
};

export const buildImageFilter = (filters: FilterState): ImageFilterInput => {
  const control = IMAGE_CONTROLS;
  const imageFilter: Writable<ImageFilterInput> = {};

  if (isChecked(filters.favorite)) imageFilter.favorite = true;

  put(imageFilter, "rating100", rangeCriterion(filters.rating));
  put(imageFilter, "o_counter", rangeCriterion(filters.oCounter));
  // The folder view's Untagged fixes it
  put(
    imageFilter,
    "tag_count",
    fixedCount(filters.tag_count) ?? rangeCriterion(filters.tagCount)
  );

  // Performers, studios and tags match through the image's galleries too
  // (the server's gallery-umbrella inheritance). Each takes a permanent
  // criterion (a detail page's Images tab; the folder view's tag)
  put(
    imageFilter,
    "performers",
    refCriterion(
      IMAGE_FIELDS.performers,
      filters,
      control("performerIds"),
      filters.performers
    )
  );
  put(
    imageFilter,
    "studios",
    refCriterion(
      IMAGE_FIELDS.studios,
      filters,
      control("studioIds"),
      filters.studios
    )
  );
  put(
    imageFilter,
    "tags",
    refCriterion(IMAGE_FIELDS.tags, filters, control("tagIds"), filters.tags)
  );
  put(
    imageFilter,
    "galleries",
    refCriterion(
      IMAGE_FIELDS.galleries,
      filters,
      control("galleryIds"),
      filters.galleries
    )
  );

  // The timeline view's period
  put(imageFilter, "date", dateCriterion(filters.date));

  return imageFilter;
};

/**
 * The Clips page's filter parameters for `GET /api/clips` (`getClips` joins
 * the lists with commas). Each list with a choice of modifier sends it in
 * `<param>Modifier`. Clips list with a preview unless the panel picks
 * "Without preview only" (false) or "All clips" (no `isGenerated`).
 */
export const buildClipFilter = (filters: FilterState): ClipFilterParams => {
  const control = CLIP_CONTROLS;
  const clipParams: ClipFilterParams = {};

  const tags = refCriterion(CLIP_PARAMS.tagIds, filters, control("tagIds"));
  if (tags) {
    clipParams.tagIds = tags.value;
    clipParams.tagIdsModifier = tags.modifier;
  }
  const sceneTags = refCriterion(
    CLIP_PARAMS.sceneTagIds,
    filters,
    control("sceneTagIds")
  );
  if (sceneTags) {
    clipParams.sceneTagIds = sceneTags.value;
    clipParams.sceneTagIdsModifier = sceneTags.modifier;
  }
  const performers = refCriterion(
    CLIP_PARAMS.performerIds,
    filters,
    control("performerIds")
  );
  if (performers) {
    clipParams.performerIds = performers.value;
    clipParams.performerIdsModifier = performers.modifier;
  }
  const studio = refCriterion(
    CLIP_PARAMS.studioId,
    filters,
    control("studioId")
  );
  if (studio) clipParams.studioId = studio.value[0];

  if (filters.isGenerated !== ALL_CLIPS) {
    clipParams.isGenerated = !(
      filters.isGenerated === "false" || filters.isGenerated === false
    );
  }

  return clipParams;
};

// ============================================================================
// CAROUSEL BUILDER HELPERS
// ============================================================================

/**
 * Filter definitions for the carousel builder rule selector.
 * Each definition describes a filter that can be used as a carousel rule.
 *
 * Structure:
 * - key: The filter key (matches buildSceneFilter's expected input)
 * - label: Display label in the rule dropdown
 * - type: Input type (searchable-select, range, checkbox, select, text)
 * - entityType: For searchable-select, which entity to search
 * - modifierOptions: Available comparison modifiers
 * - defaultModifier: Default modifier when creating new rule
 * - options: For select type, the available options
 * - min/max: For range type, the bounds
 * - valueUnit: Optional unit label (e.g., "minutes")
 */
export const CAROUSEL_FILTER_DEFINITIONS = [
  // Sorted alphabetically by label
  {
    key: "bitrate",
    label: "Bitrate",
    type: "range",
    min: 0,
    max: 100,
    step: 1,
    valueUnit: "Mbps",
  },
  {
    key: "groupIds",
    label: "Collections",
    type: "searchable-select",
    entityType: "groups",
    multi: true,
    modifierOptions: [
      { value: "INCLUDES", label: "in any of" },
      { value: "EXCLUDES", label: "not in" },
    ],
    defaultModifier: "INCLUDES",
  },
  {
    key: "createdAt",
    label: "Created Date",
    type: "date-range",
  },
  {
    key: "details",
    label: "Details Contains",
    type: "text",
    placeholder: "Search details...",
    maxLength: SCENE_FIELDS.details.maxLength,
  },
  {
    key: "duration",
    label: "Duration",
    type: "range",
    min: 1,
    max: 300,
    step: 1,
    valueUnit: "minutes",
  },
  {
    key: "performerFavorite",
    label: "Favorite Performers",
    type: "checkbox",
  },
  {
    key: "favorite",
    label: "Favorite Scenes",
    type: "checkbox",
  },
  {
    key: "studioFavorite",
    label: "Favorite Studios",
    type: "checkbox",
  },
  {
    key: "tagFavorite",
    label: "Favorite Tags",
    type: "checkbox",
  },
  {
    key: "lastPlayedAt",
    label: "Last Played Date",
    type: "date-range",
  },
  {
    key: "oCount",
    label: "O Count",
    type: "range",
    min: 0,
    max: 300,
    step: 1,
  },
  {
    key: "performerAge",
    label: "Performer Age",
    type: "range",
    min: 18,
    max: 100,
    step: 1,
  },
  {
    key: "performerCount",
    label: "Performer Count",
    type: "range",
    min: 0,
    max: 20,
    step: 1,
  },
  {
    key: "performerIds",
    label: "Performers",
    type: "searchable-select",
    entityType: "performers",
    multi: true,
    modifierOptions: [
      { value: "INCLUDES", label: "includes any of" },
      { value: "INCLUDES_ALL", label: "includes all of" },
      { value: "EXCLUDES", label: "excludes" },
    ],
    defaultModifier: "INCLUDES",
  },
  {
    key: "playCount",
    label: "Play Count",
    type: "range",
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    key: "playDuration",
    label: "Play Duration",
    type: "range",
    min: 1,
    max: 300,
    step: 1,
    valueUnit: "minutes",
  },
  {
    key: "rating",
    label: "Rating",
    type: "range",
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "resolution",
    label: "Resolution",
    type: "select",
    options: [
      { value: "VERY_LOW", label: "144p" },
      { value: "LOW", label: "240p" },
      { value: "R360P", label: "360p" },
      { value: "STANDARD", label: "480p" },
      { value: "WEB_HD", label: "540p" },
      { value: "STANDARD_HD", label: "720p" },
      { value: "FULL_HD", label: "1080p" },
      { value: "QUAD_HD", label: "1440p" },
      { value: "FOUR_K", label: "4K" },
      { value: "EIGHT_K", label: "8K" },
    ],
    modifierOptions: [
      { value: "EQUALS", label: "equals" },
      { value: "NOT_EQUALS", label: "not equals" },
      { value: "GREATER_THAN", label: "greater than" },
      { value: "LESS_THAN", label: "less than" },
    ],
    defaultModifier: "GREATER_THAN",
  },
  {
    key: "date",
    label: "Scene Date",
    type: "date-range",
  },
  {
    key: "studioId",
    label: "Studio",
    type: "searchable-select",
    entityType: "studios",
    multi: false,
    supportsHierarchy: true,
  },
  {
    key: "tagIds",
    label: "Tags",
    type: "searchable-select",
    entityType: "tags",
    multi: true,
    modifierOptions: [
      { value: "INCLUDES", label: "includes any of" },
      { value: "INCLUDES_ALL", label: "includes all of" },
      { value: "EXCLUDES", label: "excludes" },
    ],
    defaultModifier: "INCLUDES_ALL",
    supportsHierarchy: true,
  },
  {
    key: "title",
    label: "Title Contains",
    type: "text",
    placeholder: "Search title...",
    maxLength: SCENE_FIELDS.title.maxLength,
  },
];

/**
 * Convert carousel rules (stored format) to filter state (UI format).
 * The stored format is the API-ready filter object.
 * The UI format matches what buildSceneFilter expects as input.
 *
 * Example:
 * Input (stored rules):
 *   { performers: { value: ['1', '2'], modifier: 'INCLUDES' } }
 * Output (UI state):
 *   { performerIds: ['1', '2'], performerIdsModifier: 'INCLUDES' }
 */
export const carouselRulesToFilterState = (
  rules: Record<string, any> | null | undefined
): Record<string, any> => {
  const filterState: Record<string, any> = {};

  if (!rules || typeof rules !== "object") {
    return filterState;
  }

  // Performers
  if (rules.performers) {
    filterState.performerIds = rules.performers.value || [];
    filterState.performerIdsModifier = rules.performers.modifier || "INCLUDES";
  }

  // Studios
  if (rules.studios) {
    // Single studio stored as array with one element
    filterState.studioId = rules.studios.value?.[0] || "";
    if (rules.studios.depth !== undefined) {
      filterState.studioIdDepth = rules.studios.depth;
    }
  }

  // Tags
  if (rules.tags) {
    filterState.tagIds = rules.tags.value || [];
    filterState.tagIdsModifier = rules.tags.modifier || "INCLUDES_ALL";
    if (rules.tags.depth !== undefined) {
      filterState.tagIdsDepth = rules.tags.depth;
    }
  }

  // Groups
  if (rules.groups) {
    filterState.groupIds = rules.groups.value || [];
    filterState.groupIdsModifier = rules.groups.modifier || "INCLUDES";
  }

  // Rating
  if (rules.rating100) {
    const r = rules.rating100;
    if (r.modifier === "BETWEEN") {
      filterState.rating = { min: r.value, max: r.value2 };
    } else if (r.modifier === "GREATER_THAN") {
      filterState.rating = { min: Number(r.value) + 1 };
    } else if (r.modifier === "LESS_THAN") {
      filterState.rating = { max: r.value - 1 };
    }
  }

  // O Counter
  if (rules.o_counter) {
    const o = rules.o_counter;
    if (o.modifier === "BETWEEN") {
      filterState.oCount = { min: o.value, max: o.value2 };
    } else if (o.modifier === "GREATER_THAN") {
      filterState.oCount = { min: Number(o.value) + 1 };
    } else if (o.modifier === "LESS_THAN") {
      filterState.oCount = { max: o.value - 1 };
    }
  }

  // Duration (convert from seconds to minutes)
  if (rules.duration) {
    const d = rules.duration;
    if (d.modifier === "BETWEEN") {
      filterState.duration = {
        min: Math.round(d.value / 60),
        max: Math.round(d.value2 / 60),
      };
    } else if (d.modifier === "GREATER_THAN") {
      filterState.duration = { min: Math.round((Number(d.value) + 1) / 60) };
    } else if (d.modifier === "LESS_THAN") {
      filterState.duration = { max: Math.round((d.value - 1) / 60) };
    }
  }

  // Play Count
  if (rules.play_count) {
    const p = rules.play_count;
    if (p.modifier === "BETWEEN") {
      filterState.playCount = { min: p.value, max: p.value2 };
    } else if (p.modifier === "GREATER_THAN") {
      filterState.playCount = { min: Number(p.value) + 1 };
    } else if (p.modifier === "LESS_THAN") {
      filterState.playCount = { max: p.value - 1 };
    }
  }

  // Play Duration (convert from seconds to minutes)
  if (rules.play_duration) {
    const pd = rules.play_duration;
    if (pd.modifier === "BETWEEN") {
      filterState.playDuration = {
        min: Math.round(pd.value / 60),
        max: Math.round(pd.value2 / 60),
      };
    } else if (pd.modifier === "GREATER_THAN") {
      filterState.playDuration = {
        min: Math.round((Number(pd.value) + 1) / 60),
      };
    } else if (pd.modifier === "LESS_THAN") {
      filterState.playDuration = { max: Math.round((pd.value - 1) / 60) };
    }
  }

  // Performer Count
  if (rules.performer_count) {
    const pc = rules.performer_count;
    if (pc.modifier === "BETWEEN") {
      filterState.performerCount = { min: pc.value, max: pc.value2 };
    } else if (pc.modifier === "GREATER_THAN") {
      filterState.performerCount = { min: Number(pc.value) + 1 };
    } else if (pc.modifier === "LESS_THAN") {
      filterState.performerCount = { max: pc.value - 1 };
    }
  }

  // Bitrate (convert from bps to Mbps)
  if (rules.bitrate) {
    const b = rules.bitrate;
    if (b.modifier === "BETWEEN") {
      filterState.bitrate = {
        min: Math.round(b.value / 1000000),
        max: Math.round(b.value2 / 1000000),
      };
    } else if (b.modifier === "GREATER_THAN") {
      filterState.bitrate = {
        min: Math.round((Number(b.value) + 1) / 1000000),
      };
    } else if (b.modifier === "LESS_THAN") {
      filterState.bitrate = { max: Math.round((b.value - 1) / 1000000) };
    }
  }

  // Boolean filters
  if (rules.favorite === true) {
    filterState.favorite = true;
  }
  if (rules.performer_favorite === true) {
    filterState.performerFavorite = true;
  }
  if (rules.studio_favorite === true) {
    filterState.studioFavorite = true;
  }
  if (rules.tag_favorite === true) {
    filterState.tagFavorite = true;
  }

  // Resolution
  if (rules.resolution) {
    filterState.resolution = rules.resolution.value;
    filterState.resolutionModifier = rules.resolution.modifier || "EQUALS";
  }

  // Text filters
  if (rules.title) {
    filterState.title = rules.title.value;
  }
  if (rules.details) {
    filterState.details = rules.details.value;
  }

  // Date range filters
  if (rules.date) {
    filterState.date = dateRangeFromApi(rules.date);
  }
  if (rules.created_at) {
    filterState.createdAt = dateRangeFromApi(rules.created_at);
  }
  if (rules.last_played_at) {
    filterState.lastPlayedAt = dateRangeFromApi(rules.last_played_at);
  }

  return filterState;
};

/**
 * A stored date criterion as the date range control holds it, `{ start, end }`
 * (what `dateCriterion` reads back)
 */
const dateRangeFromApi = (
  dateFilter: unknown
): { start?: string; end?: string } => {
  const { modifier, value, value2 } = permanentOf(dateFilter) as {
    modifier?: unknown;
    value?: unknown;
    value2?: unknown;
  };
  const start = day(value);
  if (modifier === "BETWEEN") return { start, end: day(value2) };
  if (modifier === "GREATER_THAN") return { start };
  if (modifier === "LESS_THAN") return { end: start };
  return {};
};
