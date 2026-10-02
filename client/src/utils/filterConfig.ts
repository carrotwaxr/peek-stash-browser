/**
 * Sorting and filtering configuration for all entity types
 */
import {
  type GalleryFilterInput,
  type GroupFilterInput,
  type ImageFilterInput,
  type PerformerFilterInput,
  SCENE_FIELDS,
  type SceneFilterInput,
  type StudioFilterInput,
  type TagFilterInput,
} from "@peek/shared-types";
import type { ClipFilterParams } from "../api/clips";
import {
  type FilterOption,
  buildPanelFilter,
  filterOptionsOf,
} from "./filterFields";
import { UNITS } from "./unitConversions";

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
 * The filter panel's state: option keys with their modifier and depth
 * companions (`tagIdsModifier`, `tagIdsDepth`), and a page's permanent
 * criteria in the request's own shape (a performer page's `performers`)
 */
type FilterState = Readonly<Record<string, unknown>>;

/**
 * The panel's state to each list's request filter, through the one
 * table-driven builder (`buildPanelFilter`). Each returns the list's wire
 * type from the shared contract (`SceneFilterInput`, ...), so what the
 * panel sends is what the server's parser accepts.
 */
export const buildSceneFilter = (filters: FilterState): SceneFilterInput =>
  buildPanelFilter("scene", filters);

/** An imperial viewer's Height, Weight and Penis Length convert to metric */
export const buildPerformerFilter = (
  filters: FilterState,
  unitPreference: string = UNITS.METRIC
): PerformerFilterInput =>
  buildPanelFilter("performer", filters, { unitPreference });

export const buildStudioFilter = (filters: FilterState): StudioFilterInput =>
  buildPanelFilter("studio", filters);

export const buildTagFilter = (filters: FilterState): TagFilterInput =>
  buildPanelFilter("tag", filters);

export const buildGroupFilter = (filters: FilterState): GroupFilterInput =>
  buildPanelFilter("group", filters);

export const buildGalleryFilter = (filters: FilterState): GalleryFilterInput =>
  buildPanelFilter("gallery", filters);

export const buildImageFilter = (filters: FilterState): ImageFilterInput =>
  buildPanelFilter("image", filters);

/**
 * The Clips page's filter parameters for `GET /api/clips` (`getClips` joins
 * the lists with commas). Each list with a choice of modifier sends it in
 * `<param>Modifier`. Clips list with a preview unless the panel picks
 * "Without preview only" (false) or "All clips" (no `isGenerated`).
 */
export const buildClipFilter = (filters: FilterState): ClipFilterParams =>
  buildPanelFilter("clip", filters);

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

/** A date range control's day, or undefined when unset */
const day = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/**
 * A stored date criterion as the date range control holds it, `{ start, end }`
 * (what the date codec reads back)
 */
const dateRangeFromApi = (
  dateFilter: unknown
): { start?: string; end?: string } => {
  const { modifier, value, value2 } = (
    typeof dateFilter === "object" && dateFilter !== null ? dateFilter : {}
  ) as { modifier?: unknown; value?: unknown; value2?: unknown };
  const start = day(value);
  if (modifier === "BETWEEN") return { start, end: day(value2) };
  if (modifier === "GREATER_THAN") return { start };
  if (modifier === "LESS_THAN") return { end: start };
  return {};
};
