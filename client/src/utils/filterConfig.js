/**
 * Sorting and filtering configuration for all entity types
 */

import {
  UNITS,
  feetInchesToCm,
  lbsToKg,
  inchesToCm,
} from "./unitConversions.js";

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
export const SCENE_INDEX_SORT_OPTION = { value: "scene_index", label: "Scene Number" };

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

// Filter type options for different data types
const RATING_OPTIONS = [
  { value: "1", label: "1 Star" },
  { value: "2", label: "2 Stars" },
  { value: "3", label: "3 Stars" },
  { value: "4", label: "4 Stars" },
  { value: "5", label: "5 Stars" },
];

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "TRANSGENDER_MALE", label: "Trans Male" },
  { value: "TRANSGENDER_FEMALE", label: "Trans Female" },
  { value: "INTERSEX", label: "Intersex" },
  { value: "NON_BINARY", label: "Non-Binary" },
];

const ETHNICITY_OPTIONS = [
  { value: "CAUCASIAN", label: "Caucasian" },
  { value: "BLACK", label: "Black" },
  { value: "ASIAN", label: "Asian" },
  { value: "INDIAN", label: "Indian" },
  { value: "LATIN", label: "Latin" },
  { value: "MIDDLE_EASTERN", label: "Middle Eastern" },
  { value: "MIXED", label: "Mixed" },
  { value: "OTHER", label: "Other" },
];

const HAIR_COLOR_OPTIONS = [
  { value: "BLONDE", label: "Blonde" },
  { value: "BRUNETTE", label: "Brunette" },
  { value: "BLACK", label: "Black" },
  { value: "RED", label: "Red" },
  { value: "AUBURN", label: "Auburn" },
  { value: "GREY", label: "Grey" },
  { value: "BALD", label: "Bald" },
  { value: "VARIOUS", label: "Various" },
  { value: "OTHER", label: "Other" },
];

const EYE_COLOR_OPTIONS = [
  { value: "BROWN", label: "Brown" },
  { value: "BLUE", label: "Blue" },
  { value: "GREEN", label: "Green" },
  { value: "GREY", label: "Grey" },
  { value: "HAZEL", label: "Hazel" },
  { value: "OTHER", label: "Other" },
];

const FAKE_TITS_OPTIONS = [
  { value: "Fake", label: "Fake/Augmented" },
  { value: "Natural", label: "Natural" },
];

// Resolution options (matching Stash's ResolutionEnum)
const RESOLUTION_OPTIONS = [
  { value: "VERY_LOW", label: "144p" },
  { value: "LOW", label: "240p" },
  { value: "R360P", label: "360p" },
  { value: "STANDARD", label: "480p" },
  { value: "WEB_HD", label: "540p" },
  { value: "STANDARD_HD", label: "720p" },
  { value: "FULL_HD", label: "1080p" },
  { value: "QUAD_HD", label: "1440p" },
  { value: "FOUR_K", label: "4K" },
  { value: "FIVE_K", label: "5K" },
  { value: "SIX_K", label: "6K" },
  { value: "SEVEN_K", label: "7K" },
  { value: "EIGHT_K", label: "8K" },
  { value: "HUGE", label: "Huge" },
];

// Resolution modifier options
const RESOLUTION_MODIFIER_OPTIONS = [
  { value: "EQUALS", label: "Equals" },
  { value: "NOT_EQUALS", label: "Not Equals" },
  { value: "GREATER_THAN", label: "Greater Than" },
  { value: "LESS_THAN", label: "Less Than" },
];

// Multi-criterion modifier options (for tags, performers, etc.)
const MULTI_MODIFIER_OPTIONS = [
  { value: "INCLUDES_ALL", label: "Has ALL of these" },
  { value: "INCLUDES", label: "Has ANY of these" },
  { value: "EXCLUDES", label: "Has NONE of these" },
];

// Group/Collection modifier options (simpler - just include/exclude)
const GROUP_MODIFIER_OPTIONS = [
  { value: "INCLUDES", label: "In ANY of these" },
  { value: "EXCLUDES", label: "NOT in these" },
];

export const SCENE_FILTER_OPTIONS = [
  // Common Filters
  {
    type: "section-header",
    label: "Common Filters",
    key: "section-common",
    collapsible: true,
    defaultOpen: true,
  },
  {
    key: "title",
    label: "Title Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search title...",
  },
  {
    key: "details",
    label: "Details Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search details...",
  },
  {
    key: "performerIds",
    label: "Performers",
    type: "searchable-select",
    entityType: "performers",
    multi: true,
    defaultValue: [],
    placeholder: "Select performers...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "performerIdsModifier",
    defaultModifier: "INCLUDES",
    countFilterContext: "scenes",
  },
  {
    key: "studioId",
    label: "Studio",
    type: "searchable-select",
    entityType: "studios",
    multi: false,
    defaultValue: "",
    placeholder: "Select studio...",
    supportsHierarchy: true,
    hierarchyKey: "studioIdDepth",
    hierarchyLabel: "Include sub-studios",
    countFilterContext: "scenes",
  },
  {
    key: "tagIds",
    label: "Tags",
    type: "searchable-select",
    entityType: "tags",
    multi: true,
    defaultValue: [],
    placeholder: "Select tags...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "tagIdsModifier",
    defaultModifier: "INCLUDES_ALL",
    supportsHierarchy: true,
    hierarchyKey: "tagIdsDepth",
    hierarchyLabel: "Include sub-tags",
    countFilterContext: "scenes",
  },
  {
    key: "groupIds",
    label: "Collections",
    type: "searchable-select",
    entityType: "groups",
    multi: true,
    defaultValue: [],
    placeholder: "Select collections...",
    modifierOptions: GROUP_MODIFIER_OPTIONS,
    modifierKey: "groupIdsModifier",
    defaultModifier: "INCLUDES",
    countFilterContext: "scenes",
  },
  {
    key: "rating",
    label: "Rating (0-100)",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 100,
  },
  {
    key: "oCount",
    label: "O Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 300,
  },
  {
    key: "duration",
    label: "Duration (minutes)",
    type: "range",
    defaultValue: {},
    min: 1,
    max: 300,
  },
  {
    key: "favorite",
    label: "Favorite Scenes",
    type: "checkbox",
    defaultValue: false,
    placeholder: "Favorites Only",
  },
  {
    key: "performerFavorite",
    label: "Favorite Performers",
    type: "checkbox",
    defaultValue: false,
    placeholder: "Favorite Performers Only",
  },
  {
    key: "studioFavorite",
    label: "Favorite Studios",
    type: "checkbox",
    defaultValue: false,
    placeholder: "Favorite Studios Only",
  },
  {
    key: "tagFavorite",
    label: "Favorite Tags",
    type: "checkbox",
    defaultValue: false,
    placeholder: "Favorite Tags Only",
  },

  // Date Ranges
  {
    type: "section-header",
    label: "Date Ranges",
    key: "section-dates",
    collapsible: true,
    defaultOpen: false,
  },
  {
    key: "date",
    label: "Scene Date",
    type: "date-range",
    defaultValue: {},
  },
  {
    key: "createdAt",
    label: "Created Date",
    type: "date-range",
    defaultValue: {},
  },
  {
    key: "updatedAt",
    label: "Updated Date",
    type: "date-range",
    defaultValue: {},
  },
  {
    key: "lastPlayedAt",
    label: "Last Played Date",
    type: "date-range",
    defaultValue: {},
  },

  // Video Properties
  {
    type: "section-header",
    label: "Video Properties",
    key: "section-video",
    collapsible: true,
    defaultOpen: false,
  },
  {
    key: "resolution",
    label: "Resolution",
    type: "select",
    defaultValue: "",
    options: RESOLUTION_OPTIONS,
    placeholder: "Any resolution",
    modifierOptions: RESOLUTION_MODIFIER_OPTIONS,
    modifierKey: "resolutionModifier",
    defaultModifier: "EQUALS",
  },
  {
    key: "bitrate",
    label: "Bitrate (Mbps)",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 100,
  },
  {
    key: "framerate",
    label: "Framerate (fps)",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 120,
  },
  {
    key: "orientation",
    label: "Orientation",
    type: "select",
    defaultValue: "",
    options: [
      { value: "LANDSCAPE", label: "Landscape" },
      { value: "PORTRAIT", label: "Portrait" },
      { value: "SQUARE", label: "Square" },
    ],
    placeholder: "Any orientation",
  },
  {
    key: "videoCodec",
    label: "Video Codec",
    type: "text",
    defaultValue: "",
    placeholder: "e.g. h264, hevc",
  },
  {
    key: "audioCodec",
    label: "Audio Codec",
    type: "text",
    defaultValue: "",
    placeholder: "e.g. aac, mp3",
  },

  // Other Filters
  {
    type: "section-header",
    label: "Other Filters",
    key: "section-other",
    collapsible: true,
    defaultOpen: false,
  },
  {
    key: "director",
    label: "Director Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search director...",
  },
  {
    key: "playDuration",
    label: "Play Duration (minutes)",
    type: "range",
    defaultValue: {},
    min: 1,
    max: 300,
  },
  {
    key: "playCount",
    label: "Play Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
  {
    key: "performerCount",
    label: "Performer Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 20,
  },
  {
    key: "performerAge",
    label: "Performer Age",
    type: "range",
    defaultValue: {},
    min: 18,
    max: 100,
  },
  {
    key: "tagCount",
    label: "Tag Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 50,
  },

];

export const PERFORMER_FILTER_OPTIONS = [
  // Common Filters
  {
    type: "section-header",
    label: "Common Filters",
    key: "section-common",
    collapsible: true,
    defaultOpen: true,
  },
  {
    key: "name",
    label: "Name Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search name...",
  },
  {
    key: "tagIds",
    label: "Tags",
    type: "searchable-select",
    entityType: "tags",
    multi: true,
    defaultValue: [],
    placeholder: "Select tags...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "tagIdsModifier",
    defaultModifier: "INCLUDES_ALL",
    supportsHierarchy: true,
    hierarchyKey: "tagIdsDepth",
    hierarchyLabel: "Include sub-tags",
    countFilterContext: "performers",
  },
  {
    key: "gender",
    label: "Gender",
    type: "select",
    defaultValue: "",
    options: GENDER_OPTIONS,
    placeholder: "Any gender",
  },
  {
    key: "rating",
    label: "Rating (0-100)",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 100,
  },
  {
    key: "oCounter",
    label: "O Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
  {
    key: "sceneCount",
    label: "Scene Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
  {
    key: "favorite",
    label: "Favorite Performers",
    type: "checkbox",
    defaultValue: false,
    placeholder: "Favorites Only",
  },

  // Date Ranges
  {
    type: "section-header",
    label: "Date Ranges",
    key: "section-dates",
    collapsible: true,
    defaultOpen: false,
  },
  {
    key: "age",
    label: "Age",
    type: "range",
    defaultValue: {},
    min: 18,
    max: 100,
  },
  {
    key: "birthYear",
    label: "Birth Year",
    type: "range",
    defaultValue: {},
    min: 1900,
    max: 2010,
  },
  {
    key: "deathYear",
    label: "Death Year",
    type: "range",
    defaultValue: {},
    min: 1900,
    max: 2100,
  },
  {
    key: "careerLength",
    label: "Career Length (years)",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 50,
  },
  {
    key: "birthdate",
    label: "Birth Date",
    type: "date-range",
    defaultValue: {},
  },
  {
    key: "deathDate",
    label: "Death Date",
    type: "date-range",
    defaultValue: {},
  },
  {
    key: "createdAt",
    label: "Created Date",
    type: "date-range",
    defaultValue: {},
  },
  {
    key: "updatedAt",
    label: "Updated Date",
    type: "date-range",
    defaultValue: {},
  },

  // Performer Attributes
  {
    type: "section-header",
    label: "Performer Attributes",
    key: "section-attributes",
    collapsible: true,
    defaultOpen: false,
  },
  {
    key: "hairColor",
    label: "Hair Color",
    type: "select",
    defaultValue: "",
    options: HAIR_COLOR_OPTIONS,
    placeholder: "Any hair color",
  },
  {
    key: "eyeColor",
    label: "Eye Color",
    type: "select",
    defaultValue: "",
    options: EYE_COLOR_OPTIONS,
    placeholder: "Any eye color",
  },
  {
    key: "ethnicity",
    label: "Ethnicity",
    type: "select",
    defaultValue: "",
    options: ETHNICITY_OPTIONS,
    placeholder: "Any ethnicity",
  },
  {
    key: "fakeTits",
    label: "Breast Type",
    type: "select",
    defaultValue: "",
    options: FAKE_TITS_OPTIONS,
    placeholder: "Any",
  },
  {
    key: "measurements",
    label: "Measurements",
    type: "text",
    defaultValue: "",
    placeholder: "e.g. 34-24-34",
  },
  {
    key: "tattoos",
    label: "Tattoos",
    type: "text",
    defaultValue: "",
    placeholder: "Search tattoos...",
  },
  {
    key: "piercings",
    label: "Piercings",
    type: "text",
    defaultValue: "",
    placeholder: "Search piercings...",
  },
  {
    key: "height",
    label: "Height (cm)",
    type: "range",
    defaultValue: {},
    min: 100,
    max: 250,
  },
  {
    key: "weight",
    label: "Weight (kg)",
    type: "range",
    defaultValue: {},
    min: 30,
    max: 200,
  },
  {
    key: "penisLength",
    label: "Penis Length (cm)",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 40,
  },

  // Other Filters
  {
    type: "section-header",
    label: "Other Filters",
    key: "section-other",
    collapsible: true,
    defaultOpen: false,
  },
  {
    key: "playCount",
    label: "Play Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
  {
    key: "details",
    label: "Details Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search details...",
  },
];

export const STUDIO_FILTER_OPTIONS = [
  // Common Filters
  {
    type: "section-header",
    label: "Common Filters",
    key: "section-common",
    collapsible: true,
    defaultOpen: true,
  },
  {
    key: "name",
    label: "Name Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search name...",
  },
  {
    key: "details",
    label: "Details Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search details...",
  },
  {
    key: "tagIds",
    label: "Tags",
    type: "searchable-select",
    entityType: "tags",
    multi: true,
    defaultValue: [],
    placeholder: "Select tags...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "tagIdsModifier",
    defaultModifier: "INCLUDES_ALL",
    supportsHierarchy: true,
    hierarchyKey: "tagIdsDepth",
    hierarchyLabel: "Include sub-tags",
    countFilterContext: "studios",
  },
  {
    key: "rating",
    label: "Rating (0-100)",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 100,
  },
  {
    key: "sceneCount",
    label: "Scene Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
  {
    key: "oCounter",
    label: "O Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
  {
    key: "playCount",
    label: "Play Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
  {
    key: "favorite",
    label: "Favorite Studios",
    type: "checkbox",
    defaultValue: false,
    placeholder: "Favorites Only",
  },

  // Date Ranges
  {
    type: "section-header",
    label: "Date Ranges",
    key: "section-dates",
    collapsible: true,
    defaultOpen: false,
  },
  {
    key: "createdAt",
    label: "Created Date",
    type: "date-range",
    defaultValue: {},
  },
  {
    key: "updatedAt",
    label: "Updated Date",
    type: "date-range",
    defaultValue: {},
  },
];

export const TAG_FILTER_OPTIONS = [
  // Common Filters
  {
    type: "section-header",
    label: "Common Filters",
    key: "section-common",
    collapsible: true,
    defaultOpen: true,
  },
  {
    key: "name",
    label: "Name Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search name...",
  },
  {
    key: "description",
    label: "Description Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search description...",
  },
  {
    key: "rating",
    label: "Rating (0-100)",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 100,
  },
  {
    key: "sceneCount",
    label: "Scene Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
  {
    key: "oCounter",
    label: "O Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
  {
    key: "playCount",
    label: "Play Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
  {
    key: "favorite",
    label: "Favorite Tags",
    type: "checkbox",
    defaultValue: false,
    placeholder: "Favorites Only",
  },

  // Entity Filters
  {
    type: "section-header",
    label: "Entity Filters",
    key: "section-entities",
    collapsible: true,
    defaultOpen: false,
  },
  {
    key: "performerIds",
    label: "Performers",
    type: "searchable-select",
    entityType: "performers",
    multi: true,
    defaultValue: [],
    placeholder: "Select performers...",
  },
  {
    key: "studioId",
    label: "Studio",
    type: "searchable-select",
    entityType: "studios",
    multi: false,
    defaultValue: "",
    placeholder: "Select studio...",
  },
  {
    key: "sceneId",
    label: "Scene",
    type: "searchable-select",
    entityType: "scenes",
    multi: false,
    defaultValue: "",
    placeholder: "Select scene...",
  },
  {
    key: "groupIds",
    label: "Collections",
    type: "searchable-select",
    entityType: "groups",
    multi: true,
    defaultValue: [],
    placeholder: "Select collections...",
  },

  // Date Ranges
  {
    type: "section-header",
    label: "Date Ranges",
    key: "section-dates",
    collapsible: true,
    defaultOpen: false,
  },
  {
    key: "createdAt",
    label: "Created Date",
    type: "date-range",
    defaultValue: {},
  },
  {
    key: "updatedAt",
    label: "Updated Date",
    type: "date-range",
    defaultValue: {},
  },
];

export const GROUP_FILTER_OPTIONS = [
  // Common Filters
  {
    type: "section-header",
    label: "Common Filters",
    key: "section-common",
    collapsible: true,
    defaultOpen: true,
  },
  {
    key: "name",
    label: "Name Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search name...",
  },
  {
    key: "synopsis",
    label: "Synopsis Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search synopsis...",
  },
  {
    key: "director",
    label: "Director Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search director...",
  },
  {
    key: "performerIds",
    label: "Performers",
    type: "searchable-select",
    entityType: "performers",
    multi: true,
    defaultValue: [],
    placeholder: "Select performers...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "performerIdsModifier",
    defaultModifier: "INCLUDES",
    countFilterContext: "groups",
  },
  {
    key: "studioId",
    label: "Studio",
    type: "searchable-select",
    entityType: "studios",
    multi: false,
    defaultValue: "",
    placeholder: "Select studio...",
    countFilterContext: "groups",
  },
  {
    key: "tagIds",
    label: "Tags",
    type: "searchable-select",
    entityType: "tags",
    multi: true,
    defaultValue: [],
    placeholder: "Select tags...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "tagIdsModifier",
    defaultModifier: "INCLUDES_ALL",
    countFilterContext: "groups",
  },
  {
    key: "rating",
    label: "Rating (0-100)",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 100,
  },
  {
    key: "sceneCount",
    label: "Scene Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
  {
    key: "duration",
    label: "Duration (minutes)",
    type: "range",
    defaultValue: {},
    min: 1,
    max: 300,
  },
  {
    key: "favorite",
    label: "Favorite Collections",
    type: "checkbox",
    defaultValue: false,
    placeholder: "Favorites Only",
  },

  // Date Ranges
  {
    type: "section-header",
    label: "Date Ranges",
    key: "section-dates",
    collapsible: true,
    defaultOpen: false,
  },
  {
    key: "date",
    label: "Release Date",
    type: "date-range",
    defaultValue: {},
  },
  {
    key: "createdAt",
    label: "Created Date",
    type: "date-range",
    defaultValue: {},
  },
  {
    key: "updatedAt",
    label: "Updated Date",
    type: "date-range",
    defaultValue: {},
  },

  // Entity Filters
  {
    type: "section-header",
    label: "Entity Filters",
    key: "section-entities",
    collapsible: true,
    defaultOpen: false,
  },
  {
    key: "sceneId",
    label: "Scene",
    type: "searchable-select",
    entityType: "scenes",
    multi: false,
    defaultValue: "",
    placeholder: "Select scene...",
  },
];

export const GALLERY_FILTER_OPTIONS = [
  // Common Filters
  {
    type: "section-header",
    label: "Common Filters",
    key: "section-common",
    collapsible: true,
    defaultOpen: true,
  },
  {
    key: "title",
    label: "Title Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search title...",
  },
  {
    key: "performerIds",
    label: "Performers",
    type: "searchable-select",
    entityType: "performers",
    multi: true,
    defaultValue: [],
    placeholder: "Select performers...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "performerIdsModifier",
    defaultModifier: "INCLUDES",
    countFilterContext: "galleries",
  },
  {
    key: "studioIds",
    label: "Studios",
    type: "searchable-select",
    entityType: "studios",
    multi: true,
    defaultValue: [],
    placeholder: "Select studios...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "studioIdsModifier",
    defaultModifier: "INCLUDES",
    supportsHierarchy: true,
    hierarchyKey: "studioIdsDepth",
    hierarchyLabel: "Include sub-studios",
    countFilterContext: "galleries",
  },
  {
    key: "tagIds",
    label: "Tags",
    type: "searchable-select",
    entityType: "tags",
    multi: true,
    defaultValue: [],
    placeholder: "Select tags...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "tagIdsModifier",
    defaultModifier: "INCLUDES_ALL",
    supportsHierarchy: true,
    hierarchyKey: "tagIdsDepth",
    hierarchyLabel: "Include sub-tags",
    countFilterContext: "galleries",
  },
  {
    key: "rating",
    label: "Rating (0-100)",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 100,
  },
  {
    key: "imageCount",
    label: "Image Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
  {
    key: "favorite",
    label: "Favorite Galleries",
    type: "checkbox",
    defaultValue: false,
    placeholder: "Favorites Only",
  },
  {
    key: "hasFavoriteImage",
    label: "Has Favorite Image",
    type: "checkbox",
    defaultValue: false,
    placeholder: "Has at least one favorited image",
  },
];

// Image filter options (with gallery-umbrella inheritance)
export const IMAGE_FILTER_OPTIONS = [
  // Common Filters
  {
    type: "section-header",
    label: "Common Filters",
    key: "section-common",
    collapsible: true,
    defaultOpen: true,
  },
  {
    key: "performerIds",
    label: "Performers",
    type: "searchable-select",
    entityType: "performers",
    multi: true,
    defaultValue: [],
    placeholder: "Select performers...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "performerIdsModifier",
    defaultModifier: "INCLUDES",
    countFilterContext: "images",
  },
  {
    key: "studioIds",
    label: "Studios",
    type: "searchable-select",
    entityType: "studios",
    multi: true,
    defaultValue: [],
    placeholder: "Select studios...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "studioIdsModifier",
    defaultModifier: "INCLUDES",
    supportsHierarchy: true,
    hierarchyKey: "studioIdsDepth",
    hierarchyLabel: "Include sub-studios",
    countFilterContext: "images",
  },
  {
    key: "tagIds",
    label: "Tags",
    type: "searchable-select",
    entityType: "tags",
    multi: true,
    defaultValue: [],
    placeholder: "Select tags...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "tagIdsModifier",
    defaultModifier: "INCLUDES_ALL",
    supportsHierarchy: true,
    hierarchyKey: "tagIdsDepth",
    hierarchyLabel: "Include sub-tags",
    countFilterContext: "images",
  },
  {
    key: "galleryIds",
    label: "Galleries",
    type: "searchable-select",
    entityType: "galleries",
    multi: true,
    defaultValue: [],
    placeholder: "Select galleries...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "galleryIdsModifier",
    defaultModifier: "INCLUDES",
    countFilterContext: "images",
  },
  {
    key: "rating",
    label: "Rating (0-100)",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 100,
  },
  {
    key: "favorite",
    label: "Favorite Images",
    type: "checkbox",
    defaultValue: false,
    placeholder: "Favorites Only",
  },
  {
    key: "oCounter",
    label: "O Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
  },
];

// Clip filter options (Peek server API)
export const CLIP_FILTER_OPTIONS = [
  // Common Filters
  {
    type: "section-header",
    label: "Common Filters",
    key: "section-common",
    collapsible: true,
    defaultOpen: true,
  },
  {
    key: "tagIds",
    label: "Clip Tags",
    type: "searchable-select",
    entityType: "tags",
    multi: true,
    defaultValue: [],
    placeholder: "Filter by clip tags...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "tagIdsModifier",
    defaultModifier: "INCLUDES",
  },
  {
    key: "sceneTagIds",
    label: "Scene Tags",
    type: "searchable-select",
    entityType: "tags",
    multi: true,
    defaultValue: [],
    placeholder: "Filter by scene tags...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "sceneTagIdsModifier",
    defaultModifier: "INCLUDES",
  },
  {
    key: "performerIds",
    label: "Performers",
    type: "searchable-select",
    entityType: "performers",
    multi: true,
    defaultValue: [],
    placeholder: "Filter by performers...",
    modifierOptions: MULTI_MODIFIER_OPTIONS,
    modifierKey: "performerIdsModifier",
    defaultModifier: "INCLUDES",
  },
  {
    key: "studioId",
    label: "Studio",
    type: "searchable-select",
    entityType: "studios",
    multi: false,
    defaultValue: "",
    placeholder: "Filter by studio...",
  },
  {
    key: "isGenerated",
    label: "Has Preview",
    type: "select",
    defaultValue: "true",
    options: [
      { value: "true", label: "With preview only" },
      { value: "false", label: "Without preview only" },
      { value: "", label: "All clips" },
    ],
    placeholder: "Filter by preview status",
  },
];

/**
 * Helper functions to convert UI filter values to GraphQL filter format
 */

export const buildSceneFilter = (filters) => {
  const sceneFilter = {};

  // ID-based filters - merge permanent filters with UI filters
  // Performers: Merge permanent + UI filters
  const performerIds = [];
  if (filters.performers?.value) {
    performerIds.push(...filters.performers.value);
  }
  if (filters.performerIds && filters.performerIds.length > 0) {
    performerIds.push(...filters.performerIds);
  }
  if (performerIds.length > 0) {
    sceneFilter.performers = {
      value: [...new Set(performerIds)], // Remove duplicates
      modifier:
        filters.performerIdsModifier ||
        filters.performers?.modifier ||
        "INCLUDES",
    };
  }

  // Studios: Merge permanent + UI filters
  // Supports hierarchical filtering via depth parameter
  const studioIds = [];
  if (filters.studios?.value) {
    studioIds.push(...filters.studios.value);
  }
  if (filters.studioId && filters.studioId !== "") {
    studioIds.push(filters.studioId);
  }
  if (studioIds.length > 0) {
    sceneFilter.studios = {
      value: [...new Set(studioIds)], // Remove duplicates
      modifier: "INCLUDES",
    };
    // Pass through depth for hierarchical filtering
    // Priority: permanent filters > UI filters
    if (filters.studios?.depth !== undefined) {
      sceneFilter.studios.depth = filters.studios.depth;
    } else if (filters.studioIdDepth !== undefined) {
      sceneFilter.studios.depth = filters.studioIdDepth;
    }
  }

  // Tags: Merge permanent + UI filters
  // Supports hierarchical filtering via depth parameter
  const tagIds = [];
  if (filters.tags?.value) {
    tagIds.push(...filters.tags.value);
  }
  if (filters.tagIds && filters.tagIds.length > 0) {
    tagIds.push(...filters.tagIds);
  }
  if (tagIds.length > 0) {
    sceneFilter.tags = {
      value: [...new Set(tagIds)], // Remove duplicates
      modifier:
        filters.tagIdsModifier || filters.tags?.modifier || "INCLUDES_ALL",
    };
    // Pass through depth for hierarchical filtering
    // Priority: permanent filters > UI filters
    if (filters.tags?.depth !== undefined) {
      sceneFilter.tags.depth = filters.tags.depth;
    } else if (filters.tagIdsDepth !== undefined) {
      sceneFilter.tags.depth = filters.tagIdsDepth;
    }
  }

  // Collections/Groups: Merge permanent + UI filters
  const groupIds = [];
  if (filters.groups?.value) {
    groupIds.push(...filters.groups.value);
  }
  if (filters.groupIds && filters.groupIds.length > 0) {
    groupIds.push(...filters.groupIds);
  }
  if (groupIds.length > 0) {
    sceneFilter.groups = {
      value: [...new Set(groupIds)], // Remove duplicates
      modifier:
        filters.groupIdsModifier || filters.groups?.modifier || "INCLUDES",
    };
  }

  // Galleries: Merge permanent + UI filters
  const galleryIds = [];
  if (filters.galleries?.value) {
    galleryIds.push(...filters.galleries.value);
  }
  if (filters.galleryIds && filters.galleryIds.length > 0) {
    galleryIds.push(...filters.galleryIds);
  }
  if (galleryIds.length > 0) {
    sceneFilter.galleries = {
      value: [...new Set(galleryIds)], // Remove duplicates
      modifier:
        filters.galleryIdsModifier || filters.galleries?.modifier || "INCLUDES",
    };
  }

  // Boolean filters
  if (filters.favorite === true || filters.favorite === "TRUE") {
    sceneFilter.favorite = true;
  }
  if (
    filters.performerFavorite === true ||
    filters.performerFavorite === "TRUE"
  ) {
    sceneFilter.performer_favorite = true;
  }
  if (filters.studioFavorite === true || filters.studioFavorite === "TRUE") {
    sceneFilter.studio_favorite = true;
  }
  if (filters.tagFavorite === true || filters.tagFavorite === "TRUE") {
    sceneFilter.tag_favorite = true;
  }


  // Rating filter (0-100 scale)
  if (filters.rating?.min !== undefined || filters.rating?.max !== undefined) {
    sceneFilter.rating100 = {};
    const hasMin =
      filters.rating.min !== undefined && filters.rating.min !== "";
    const hasMax =
      filters.rating.max !== undefined && filters.rating.max !== "";

    if (hasMin && hasMax) {
      sceneFilter.rating100.modifier = "BETWEEN";
      sceneFilter.rating100.value = parseInt(filters.rating.min);
      sceneFilter.rating100.value2 = parseInt(filters.rating.max);
    } else if (hasMin) {
      sceneFilter.rating100.modifier = "GREATER_THAN";
      sceneFilter.rating100.value = parseInt(filters.rating.min) - 1;
    } else if (hasMax) {
      sceneFilter.rating100.modifier = "LESS_THAN";
      sceneFilter.rating100.value = parseInt(filters.rating.max) + 1;
    }
  }

  // Resolution filter
  if (filters.resolution) {
    sceneFilter.resolution = {
      value: filters.resolution,
      modifier: filters.resolutionModifier || "EQUALS",
    };
  }

  // Range filters
  if (
    filters.duration?.min !== undefined ||
    filters.duration?.max !== undefined
  ) {
    sceneFilter.duration = {};
    const hasMin =
      filters.duration.min !== undefined && filters.duration.min !== "";
    const hasMax =
      filters.duration.max !== undefined && filters.duration.max !== "";

    if (hasMin && hasMax) {
      sceneFilter.duration.modifier = "BETWEEN";
      sceneFilter.duration.value = parseInt(filters.duration.min) * 60;
      sceneFilter.duration.value2 = parseInt(filters.duration.max) * 60;
    } else if (hasMin) {
      sceneFilter.duration.modifier = "GREATER_THAN";
      sceneFilter.duration.value = parseInt(filters.duration.min) * 60 - 1;
    } else if (hasMax) {
      sceneFilter.duration.modifier = "LESS_THAN";
      sceneFilter.duration.value = parseInt(filters.duration.max) * 60 + 1;
    }
  }

  if (
    filters.playDuration?.min !== undefined ||
    filters.playDuration?.max !== undefined
  ) {
    sceneFilter.play_duration = {};
    const hasMin =
      filters.playDuration.min !== undefined && filters.playDuration.min !== "";
    const hasMax =
      filters.playDuration.max !== undefined && filters.playDuration.max !== "";

    if (hasMin && hasMax) {
      sceneFilter.play_duration.modifier = "BETWEEN";
      sceneFilter.play_duration.value = parseInt(filters.playDuration.min) * 60;
      sceneFilter.play_duration.value2 =
        parseInt(filters.playDuration.max) * 60;
    } else if (hasMin) {
      sceneFilter.play_duration.modifier = "GREATER_THAN";
      sceneFilter.play_duration.value =
        parseInt(filters.playDuration.min) * 60 - 1;
    } else if (hasMax) {
      sceneFilter.play_duration.modifier = "LESS_THAN";
      sceneFilter.play_duration.value =
        parseInt(filters.playDuration.max) * 60 + 1;
    }
  }

  if (filters.oCount?.min !== undefined || filters.oCount?.max !== undefined) {
    sceneFilter.o_counter = {};
    const hasMin =
      filters.oCount.min !== undefined && filters.oCount.min !== "";
    const hasMax =
      filters.oCount.max !== undefined && filters.oCount.max !== "";

    if (hasMin && hasMax) {
      sceneFilter.o_counter.modifier = "BETWEEN";
      sceneFilter.o_counter.value = parseInt(filters.oCount.min);
      sceneFilter.o_counter.value2 = parseInt(filters.oCount.max);
    } else if (hasMin) {
      sceneFilter.o_counter.modifier = "GREATER_THAN";
      sceneFilter.o_counter.value = parseInt(filters.oCount.min) - 1;
    } else if (hasMax) {
      sceneFilter.o_counter.modifier = "LESS_THAN";
      sceneFilter.o_counter.value = parseInt(filters.oCount.max) + 1;
    }
  }

  if (
    filters.playCount?.min !== undefined ||
    filters.playCount?.max !== undefined
  ) {
    sceneFilter.play_count = {};
    const hasMin =
      filters.playCount.min !== undefined && filters.playCount.min !== "";
    const hasMax =
      filters.playCount.max !== undefined && filters.playCount.max !== "";

    if (hasMin && hasMax) {
      sceneFilter.play_count.modifier = "BETWEEN";
      sceneFilter.play_count.value = parseInt(filters.playCount.min);
      sceneFilter.play_count.value2 = parseInt(filters.playCount.max);
    } else if (hasMin) {
      sceneFilter.play_count.modifier = "GREATER_THAN";
      sceneFilter.play_count.value = parseInt(filters.playCount.min) - 1;
    } else if (hasMax) {
      sceneFilter.play_count.modifier = "LESS_THAN";
      sceneFilter.play_count.value = parseInt(filters.playCount.max) + 1;
    }
  }

  if (
    filters.bitrate?.min !== undefined ||
    filters.bitrate?.max !== undefined
  ) {
    sceneFilter.bitrate = {};
    const hasMin =
      filters.bitrate.min !== undefined && filters.bitrate.min !== "";
    const hasMax =
      filters.bitrate.max !== undefined && filters.bitrate.max !== "";

    if (hasMin && hasMax) {
      sceneFilter.bitrate.modifier = "BETWEEN";
      sceneFilter.bitrate.value = parseInt(filters.bitrate.min) * 1000000;
      sceneFilter.bitrate.value2 = parseInt(filters.bitrate.max) * 1000000;
    } else if (hasMin) {
      sceneFilter.bitrate.modifier = "GREATER_THAN";
      sceneFilter.bitrate.value = parseInt(filters.bitrate.min) * 1000000 - 1;
    } else if (hasMax) {
      sceneFilter.bitrate.modifier = "LESS_THAN";
      sceneFilter.bitrate.value = parseInt(filters.bitrate.max) * 1000000 + 1;
    }
  }

  if (
    filters.framerate?.min !== undefined ||
    filters.framerate?.max !== undefined
  ) {
    sceneFilter.framerate = {};
    const hasMin =
      filters.framerate.min !== undefined && filters.framerate.min !== "";
    const hasMax =
      filters.framerate.max !== undefined && filters.framerate.max !== "";

    if (hasMin && hasMax) {
      sceneFilter.framerate.modifier = "BETWEEN";
      sceneFilter.framerate.value = parseInt(filters.framerate.min);
      sceneFilter.framerate.value2 = parseInt(filters.framerate.max);
    } else if (hasMin) {
      sceneFilter.framerate.modifier = "GREATER_THAN";
      sceneFilter.framerate.value = parseInt(filters.framerate.min) - 1;
    } else if (hasMax) {
      sceneFilter.framerate.modifier = "LESS_THAN";
      sceneFilter.framerate.value = parseInt(filters.framerate.max) + 1;
    }
  }

  if (
    filters.performerCount?.min !== undefined ||
    filters.performerCount?.max !== undefined
  ) {
    sceneFilter.performer_count = {};
    const hasMin =
      filters.performerCount.min !== undefined &&
      filters.performerCount.min !== "";
    const hasMax =
      filters.performerCount.max !== undefined &&
      filters.performerCount.max !== "";

    if (hasMin && hasMax) {
      sceneFilter.performer_count.modifier = "BETWEEN";
      sceneFilter.performer_count.value = parseInt(filters.performerCount.min);
      sceneFilter.performer_count.value2 = parseInt(filters.performerCount.max);
    } else if (hasMin) {
      sceneFilter.performer_count.modifier = "GREATER_THAN";
      sceneFilter.performer_count.value =
        parseInt(filters.performerCount.min) - 1;
    } else if (hasMax) {
      sceneFilter.performer_count.modifier = "LESS_THAN";
      sceneFilter.performer_count.value =
        parseInt(filters.performerCount.max) + 1;
    }
  }

  if (
    filters.performerAge?.min !== undefined ||
    filters.performerAge?.max !== undefined
  ) {
    sceneFilter.performer_age = {};
    const hasMin =
      filters.performerAge.min !== undefined && filters.performerAge.min !== "";
    const hasMax =
      filters.performerAge.max !== undefined && filters.performerAge.max !== "";

    if (hasMin && hasMax) {
      sceneFilter.performer_age.modifier = "BETWEEN";
      sceneFilter.performer_age.value = parseInt(filters.performerAge.min);
      sceneFilter.performer_age.value2 = parseInt(filters.performerAge.max);
    } else if (hasMin) {
      sceneFilter.performer_age.modifier = "GREATER_THAN";
      sceneFilter.performer_age.value = parseInt(filters.performerAge.min) - 1;
    } else if (hasMax) {
      sceneFilter.performer_age.modifier = "LESS_THAN";
      sceneFilter.performer_age.value = parseInt(filters.performerAge.max) + 1;
    }
  }

  if (
    filters.tagCount?.min !== undefined ||
    filters.tagCount?.max !== undefined
  ) {
    sceneFilter.tag_count = {};
    const hasMin =
      filters.tagCount.min !== undefined && filters.tagCount.min !== "";
    const hasMax =
      filters.tagCount.max !== undefined && filters.tagCount.max !== "";

    if (hasMin && hasMax) {
      sceneFilter.tag_count.modifier = "BETWEEN";
      sceneFilter.tag_count.value = parseInt(filters.tagCount.min);
      sceneFilter.tag_count.value2 = parseInt(filters.tagCount.max);
    } else if (hasMin) {
      sceneFilter.tag_count.modifier = "GREATER_THAN";
      sceneFilter.tag_count.value = parseInt(filters.tagCount.min) - 1;
    } else if (hasMax) {
      sceneFilter.tag_count.modifier = "LESS_THAN";
      sceneFilter.tag_count.value = parseInt(filters.tagCount.max) + 1;
    }
  }

  // Date-range filters
  if (filters.date?.start || filters.date?.end) {
    sceneFilter.date = {};
    if (filters.date.start) sceneFilter.date.value = filters.date.start;
    sceneFilter.date.modifier = filters.date.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.date.end) sceneFilter.date.value2 = filters.date.end;
  }

  if (filters.createdAt?.start || filters.createdAt?.end) {
    sceneFilter.created_at = {};
    if (filters.createdAt.start)
      sceneFilter.created_at.value = filters.createdAt.start;
    sceneFilter.created_at.modifier = filters.createdAt.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.createdAt.end)
      sceneFilter.created_at.value2 = filters.createdAt.end;
  }

  if (filters.updatedAt?.start || filters.updatedAt?.end) {
    sceneFilter.updated_at = {};
    if (filters.updatedAt.start)
      sceneFilter.updated_at.value = filters.updatedAt.start;
    sceneFilter.updated_at.modifier = filters.updatedAt.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.updatedAt.end)
      sceneFilter.updated_at.value2 = filters.updatedAt.end;
  }

  if (filters.lastPlayedAt?.start || filters.lastPlayedAt?.end) {
    sceneFilter.last_played_at = {};
    if (filters.lastPlayedAt.start)
      sceneFilter.last_played_at.value = filters.lastPlayedAt.start;
    sceneFilter.last_played_at.modifier = filters.lastPlayedAt.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.lastPlayedAt.end)
      sceneFilter.last_played_at.value2 = filters.lastPlayedAt.end;
  }

  // Text search filters
  if (filters.title) {
    sceneFilter.title = {
      value: filters.title,
      modifier: "INCLUDES",
    };
  }

  if (filters.details) {
    sceneFilter.details = {
      value: filters.details,
      modifier: "INCLUDES",
    };
  }

  if (filters.director) {
    sceneFilter.director = {
      value: filters.director,
      modifier: "INCLUDES",
    };
  }

  if (filters.videoCodec) {
    sceneFilter.video_codec = {
      value: filters.videoCodec,
      modifier: "INCLUDES",
    };
  }

  if (filters.audioCodec) {
    sceneFilter.audio_codec = {
      value: filters.audioCodec,
      modifier: "INCLUDES",
    };
  }

  // Orientation filter
  if (filters.orientation) {
    sceneFilter.orientation = {
      value: [filters.orientation],
    };
  }

  return sceneFilter;
};

/**
 * Converts filter values from imperial to metric if needed.
 * Height uses feet/inches fields, weight uses lbs, penisLength uses inches.
 */
const convertFilterUnits = (filters, unitPreference) => {
  if (unitPreference !== UNITS.IMPERIAL) return filters;

  const converted = { ...filters };

  // Height: convert feet/inches to cm (from imperial-height-range filter type)
  // The filter stores: { feetMin, inchesMin, feetMax, inchesMax }
  if (filters.height?.feetMin !== undefined || filters.height?.inchesMin !== undefined) {
    const feet = parseInt(filters.height.feetMin || 0);
    const inches = parseInt(filters.height.inchesMin || 0);
    if (feet || inches) {
      converted.height = {
        ...converted.height,
        min: feetInchesToCm(feet, inches),
      };
    }
  }
  if (filters.height?.feetMax !== undefined || filters.height?.inchesMax !== undefined) {
    const feet = parseInt(filters.height.feetMax || 0);
    const inches = parseInt(filters.height.inchesMax || 0);
    if (feet || inches) {
      converted.height = {
        ...converted.height,
        max: feetInchesToCm(feet, inches),
      };
    }
  }

  // Weight: convert lbs to kg
  if (filters.weight?.min) {
    converted.weight = {
      ...converted.weight,
      min: lbsToKg(parseInt(filters.weight.min)),
    };
  }
  if (filters.weight?.max) {
    converted.weight = {
      ...converted.weight,
      max: lbsToKg(parseInt(filters.weight.max)),
    };
  }

  // Penis length: convert inches to cm
  if (filters.penisLength?.min) {
    converted.penisLength = {
      ...converted.penisLength,
      min: inchesToCm(parseFloat(filters.penisLength.min)),
    };
  }
  if (filters.penisLength?.max) {
    converted.penisLength = {
      ...converted.penisLength,
      max: inchesToCm(parseFloat(filters.penisLength.max)),
    };
  }

  return converted;
};

export const buildPerformerFilter = (filters, unitPreference = UNITS.METRIC) => {
  // Convert imperial values to metric before building filter
  const convertedFilters = convertFilterUnits(filters, unitPreference);
  const performerFilter = {};

  // Boolean filter
  if (filters.favorite === true || filters.favorite === "TRUE") {
    performerFilter.favorite = true;
  }

  // Tags filter
  // Supports hierarchical filtering via depth parameter
  if (filters.tagIds && filters.tagIds.length > 0) {
    performerFilter.tags = {
      value: filters.tagIds.map(String),
      modifier: filters.tagIdsModifier || "INCLUDES_ALL",
    };
    // Pass through depth for hierarchical filtering
    if (filters.tagIdsDepth !== undefined) {
      performerFilter.tags.depth = filters.tagIdsDepth;
    }
  }

  // Select filters with EQUALS modifier
  if (filters.gender) {
    performerFilter.gender = {
      value: filters.gender,
      modifier: "EQUALS",
    };
  }

  // Rating filter (0-100 scale)
  // Check for non-empty values before creating filter object
  const hasRatingMin =
    filters.rating?.min !== undefined && filters.rating.min !== "";
  const hasRatingMax =
    filters.rating?.max !== undefined && filters.rating.max !== "";

  if (hasRatingMin || hasRatingMax) {
    performerFilter.rating100 = {};

    if (hasRatingMin && hasRatingMax) {
      performerFilter.rating100.modifier = "BETWEEN";
      performerFilter.rating100.value = parseInt(filters.rating.min);
      performerFilter.rating100.value2 = parseInt(filters.rating.max);
    } else if (hasRatingMin) {
      performerFilter.rating100.modifier = "GREATER_THAN";
      performerFilter.rating100.value = parseInt(filters.rating.min) - 1;
    } else if (hasRatingMax) {
      performerFilter.rating100.modifier = "LESS_THAN";
      performerFilter.rating100.value = parseInt(filters.rating.max) + 1;
    }
  }

  if (filters.ethnicity) {
    performerFilter.ethnicity = {
      value: filters.ethnicity,
      modifier: "EQUALS",
    };
  }

  if (filters.hairColor) {
    performerFilter.hair_color = {
      value: filters.hairColor,
      modifier: "EQUALS",
    };
  }

  if (filters.eyeColor) {
    performerFilter.eye_color = {
      value: filters.eyeColor,
      modifier: "EQUALS",
    };
  }

  if (filters.fakeTits) {
    performerFilter.fake_tits = {
      value: filters.fakeTits,
      modifier: "EQUALS",
    };
  }

  // Range filters
  if (filters.age?.min || filters.age?.max) {
    performerFilter.age = {};
    if (filters.age.min) performerFilter.age.value = parseInt(filters.age.min);
    performerFilter.age.modifier = filters.age.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.age.max) performerFilter.age.value2 = parseInt(filters.age.max);
  }

  if (filters.birthYear?.min || filters.birthYear?.max) {
    performerFilter.birth_year = {};
    if (filters.birthYear.min)
      performerFilter.birth_year.value = parseInt(filters.birthYear.min);
    performerFilter.birth_year.modifier = filters.birthYear.max
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.birthYear.max)
      performerFilter.birth_year.value2 = parseInt(filters.birthYear.max);
  }

  if (filters.deathYear?.min || filters.deathYear?.max) {
    performerFilter.death_year = {};
    if (filters.deathYear.min)
      performerFilter.death_year.value = parseInt(filters.deathYear.min);
    performerFilter.death_year.modifier = filters.deathYear.max
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.deathYear.max)
      performerFilter.death_year.value2 = parseInt(filters.deathYear.max);
  }

  if (filters.careerLength?.min || filters.careerLength?.max) {
    performerFilter.career_length = {};
    if (filters.careerLength.min)
      performerFilter.career_length.value = parseInt(filters.careerLength.min);
    performerFilter.career_length.modifier = filters.careerLength.max
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.careerLength.max)
      performerFilter.career_length.value2 = parseInt(filters.careerLength.max);
  }

  // Height, weight, and penisLength use convertedFilters for unit conversion
  if (convertedFilters.height?.min || convertedFilters.height?.max) {
    performerFilter.height = {};
    if (convertedFilters.height.min)
      performerFilter.height.value = parseInt(convertedFilters.height.min);
    performerFilter.height.modifier = convertedFilters.height.max
      ? "BETWEEN"
      : "GREATER_THAN";
    if (convertedFilters.height.max)
      performerFilter.height.value2 = parseInt(convertedFilters.height.max);
  }

  if (convertedFilters.weight?.min || convertedFilters.weight?.max) {
    performerFilter.weight = {};
    if (convertedFilters.weight.min)
      performerFilter.weight.value = parseInt(convertedFilters.weight.min);
    performerFilter.weight.modifier = convertedFilters.weight.max
      ? "BETWEEN"
      : "GREATER_THAN";
    if (convertedFilters.weight.max)
      performerFilter.weight.value2 = parseInt(convertedFilters.weight.max);
  }

  if (convertedFilters.penisLength?.min || convertedFilters.penisLength?.max) {
    performerFilter.penis_length = {};
    if (convertedFilters.penisLength.min)
      performerFilter.penis_length.value = parseInt(convertedFilters.penisLength.min);
    performerFilter.penis_length.modifier = convertedFilters.penisLength.max
      ? "BETWEEN"
      : "GREATER_THAN";
    if (convertedFilters.penisLength.max)
      performerFilter.penis_length.value2 = parseInt(convertedFilters.penisLength.max);
  }

  // Check for non-empty values before creating filter object
  const hasOCounterMin =
    filters.oCounter?.min !== undefined && filters.oCounter.min !== "";
  const hasOCounterMax =
    filters.oCounter?.max !== undefined && filters.oCounter.max !== "";

  if (hasOCounterMin || hasOCounterMax) {
    performerFilter.o_counter = {};

    if (hasOCounterMin && hasOCounterMax) {
      performerFilter.o_counter.modifier = "BETWEEN";
      performerFilter.o_counter.value = parseInt(filters.oCounter.min);
      performerFilter.o_counter.value2 = parseInt(filters.oCounter.max);
    } else if (hasOCounterMin) {
      performerFilter.o_counter.modifier = "GREATER_THAN";
      performerFilter.o_counter.value = parseInt(filters.oCounter.min) - 1;
    } else if (hasOCounterMax) {
      performerFilter.o_counter.modifier = "LESS_THAN";
      performerFilter.o_counter.value = parseInt(filters.oCounter.max) + 1;
    }
  }

  // Check for non-empty values before creating filter object
  const hasPlayCountMin =
    filters.playCount?.min !== undefined && filters.playCount.min !== "";
  const hasPlayCountMax =
    filters.playCount?.max !== undefined && filters.playCount.max !== "";

  if (hasPlayCountMin || hasPlayCountMax) {
    performerFilter.play_count = {};

    if (hasPlayCountMin && hasPlayCountMax) {
      performerFilter.play_count.modifier = "BETWEEN";
      performerFilter.play_count.value = parseInt(filters.playCount.min);
      performerFilter.play_count.value2 = parseInt(filters.playCount.max);
    } else if (hasPlayCountMin) {
      performerFilter.play_count.modifier = "GREATER_THAN";
      performerFilter.play_count.value = parseInt(filters.playCount.min) - 1;
    } else if (hasPlayCountMax) {
      performerFilter.play_count.modifier = "LESS_THAN";
      performerFilter.play_count.value = parseInt(filters.playCount.max) + 1;
    }
  }

  // Check for non-empty values before creating filter object
  const hasSceneCountMin =
    filters.sceneCount?.min !== undefined && filters.sceneCount.min !== "";
  const hasSceneCountMax =
    filters.sceneCount?.max !== undefined && filters.sceneCount.max !== "";

  if (hasSceneCountMin || hasSceneCountMax) {
    performerFilter.scene_count = {};

    if (hasSceneCountMin && hasSceneCountMax) {
      performerFilter.scene_count.modifier = "BETWEEN";
      performerFilter.scene_count.value = parseInt(filters.sceneCount.min);
      performerFilter.scene_count.value2 = parseInt(filters.sceneCount.max);
    } else if (hasSceneCountMin) {
      performerFilter.scene_count.modifier = "GREATER_THAN";
      performerFilter.scene_count.value = parseInt(filters.sceneCount.min) - 1;
    } else if (hasSceneCountMax) {
      performerFilter.scene_count.modifier = "LESS_THAN";
      performerFilter.scene_count.value = parseInt(filters.sceneCount.max) + 1;
    }
  }

  // Date-range filters
  if (filters.birthdate?.start || filters.birthdate?.end) {
    performerFilter.birthdate = {};
    if (filters.birthdate.start)
      performerFilter.birthdate.value = filters.birthdate.start;
    performerFilter.birthdate.modifier = filters.birthdate.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.birthdate.end)
      performerFilter.birthdate.value2 = filters.birthdate.end;
  }

  if (filters.deathDate?.start || filters.deathDate?.end) {
    performerFilter.death_date = {};
    if (filters.deathDate.start)
      performerFilter.death_date.value = filters.deathDate.start;
    performerFilter.death_date.modifier = filters.deathDate.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.deathDate.end)
      performerFilter.death_date.value2 = filters.deathDate.end;
  }

  if (filters.createdAt?.start || filters.createdAt?.end) {
    performerFilter.created_at = {};
    if (filters.createdAt.start)
      performerFilter.created_at.value = filters.createdAt.start;
    performerFilter.created_at.modifier = filters.createdAt.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.createdAt.end)
      performerFilter.created_at.value2 = filters.createdAt.end;
  }

  if (filters.updatedAt?.start || filters.updatedAt?.end) {
    performerFilter.updated_at = {};
    if (filters.updatedAt.start)
      performerFilter.updated_at.value = filters.updatedAt.start;
    performerFilter.updated_at.modifier = filters.updatedAt.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.updatedAt.end)
      performerFilter.updated_at.value2 = filters.updatedAt.end;
  }

  // Text search filters
  if (filters.name) {
    performerFilter.name = {
      value: filters.name,
      modifier: "INCLUDES",
    };
  }

  if (filters.details) {
    performerFilter.details = {
      value: filters.details,
      modifier: "INCLUDES",
    };
  }

  if (filters.measurements) {
    performerFilter.measurements = {
      value: filters.measurements,
      modifier: "INCLUDES",
    };
  }

  if (filters.tattoos) {
    performerFilter.tattoos = {
      value: filters.tattoos,
      modifier: "INCLUDES",
    };
  }

  if (filters.piercings) {
    performerFilter.piercings = {
      value: filters.piercings,
      modifier: "INCLUDES",
    };
  }

  // Entity filters
  if (filters.sceneId) {
    performerFilter.scene_filter = {
      id: {
        value: [filters.sceneId],
        modifier: "INCLUDES",
      },
    };
  }

  if (filters.groupIds && filters.groupIds.length > 0) {
    performerFilter.scene_filter = performerFilter.scene_filter || {};
    performerFilter.scene_filter.groups = {
      value: filters.groupIds,
      modifier: "INCLUDES",
    };
  }

  return performerFilter;
};

export const buildStudioFilter = (filters) => {
  const studioFilter = {};

  // Boolean filter
  if (filters.favorite === true || filters.favorite === "TRUE") {
    studioFilter.favorite = true;
  }

  // Tags filter
  if (filters.tagIds && filters.tagIds.length > 0) {
    studioFilter.tags = {
      value: filters.tagIds.map(String),
      modifier: filters.tagIdsModifier || "INCLUDES_ALL",
    };
    // Pass through depth for hierarchical filtering
    if (filters.tagIdsDepth !== undefined) {
      studioFilter.tags.depth = filters.tagIdsDepth;
    }
  }

  // Rating filter (0-100 scale)
  if (filters.rating?.min !== undefined || filters.rating?.max !== undefined) {
    studioFilter.rating100 = {};
    const hasMin =
      filters.rating.min !== undefined && filters.rating.min !== "";
    const hasMax =
      filters.rating.max !== undefined && filters.rating.max !== "";

    if (hasMin && hasMax) {
      studioFilter.rating100.modifier = "BETWEEN";
      studioFilter.rating100.value = parseInt(filters.rating.min);
      studioFilter.rating100.value2 = parseInt(filters.rating.max);
    } else if (hasMin) {
      studioFilter.rating100.modifier = "GREATER_THAN";
      studioFilter.rating100.value = parseInt(filters.rating.min) - 1;
    } else if (hasMax) {
      studioFilter.rating100.modifier = "LESS_THAN";
      studioFilter.rating100.value = parseInt(filters.rating.max) + 1;
    }
  }

  // Range filter
  if (
    filters.sceneCount?.min !== undefined ||
    filters.sceneCount?.max !== undefined
  ) {
    studioFilter.scene_count = {};
    const hasMin =
      filters.sceneCount.min !== undefined && filters.sceneCount.min !== "";
    const hasMax =
      filters.sceneCount.max !== undefined && filters.sceneCount.max !== "";

    if (hasMin && hasMax) {
      studioFilter.scene_count.modifier = "BETWEEN";
      studioFilter.scene_count.value = parseInt(filters.sceneCount.min);
      studioFilter.scene_count.value2 = parseInt(filters.sceneCount.max);
    } else if (hasMin) {
      studioFilter.scene_count.modifier = "GREATER_THAN";
      studioFilter.scene_count.value = parseInt(filters.sceneCount.min) - 1;
    } else if (hasMax) {
      studioFilter.scene_count.modifier = "LESS_THAN";
      studioFilter.scene_count.value = parseInt(filters.sceneCount.max) + 1;
    }
  }

  if (
    filters.oCounter?.min !== undefined ||
    filters.oCounter?.max !== undefined
  ) {
    studioFilter.o_counter = {};
    const hasMin =
      filters.oCounter.min !== undefined && filters.oCounter.min !== "";
    const hasMax =
      filters.oCounter.max !== undefined && filters.oCounter.max !== "";

    if (hasMin && hasMax) {
      studioFilter.o_counter.modifier = "BETWEEN";
      studioFilter.o_counter.value = parseInt(filters.oCounter.min);
      studioFilter.o_counter.value2 = parseInt(filters.oCounter.max);
    } else if (hasMin) {
      studioFilter.o_counter.modifier = "GREATER_THAN";
      studioFilter.o_counter.value = parseInt(filters.oCounter.min) - 1;
    } else if (hasMax) {
      studioFilter.o_counter.modifier = "LESS_THAN";
      studioFilter.o_counter.value = parseInt(filters.oCounter.max) + 1;
    }
  }

  if (
    filters.playCount?.min !== undefined ||
    filters.playCount?.max !== undefined
  ) {
    studioFilter.play_count = {};
    const hasMin =
      filters.playCount.min !== undefined && filters.playCount.min !== "";
    const hasMax =
      filters.playCount.max !== undefined && filters.playCount.max !== "";

    if (hasMin && hasMax) {
      studioFilter.play_count.modifier = "BETWEEN";
      studioFilter.play_count.value = parseInt(filters.playCount.min);
      studioFilter.play_count.value2 = parseInt(filters.playCount.max);
    } else if (hasMin) {
      studioFilter.play_count.modifier = "GREATER_THAN";
      studioFilter.play_count.value = parseInt(filters.playCount.min) - 1;
    } else if (hasMax) {
      studioFilter.play_count.modifier = "LESS_THAN";
      studioFilter.play_count.value = parseInt(filters.playCount.max) + 1;
    }
  }

  // Date-range filters
  if (filters.createdAt?.start || filters.createdAt?.end) {
    studioFilter.created_at = {};
    if (filters.createdAt.start)
      studioFilter.created_at.value = filters.createdAt.start;
    studioFilter.created_at.modifier = filters.createdAt.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.createdAt.end)
      studioFilter.created_at.value2 = filters.createdAt.end;
  }

  if (filters.updatedAt?.start || filters.updatedAt?.end) {
    studioFilter.updated_at = {};
    if (filters.updatedAt.start)
      studioFilter.updated_at.value = filters.updatedAt.start;
    studioFilter.updated_at.modifier = filters.updatedAt.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.updatedAt.end)
      studioFilter.updated_at.value2 = filters.updatedAt.end;
  }

  // Text search filters
  if (filters.name) {
    studioFilter.name = {
      value: filters.name,
      modifier: "INCLUDES",
    };
  }

  if (filters.details) {
    studioFilter.details = {
      value: filters.details,
      modifier: "INCLUDES",
    };
  }

  return studioFilter;
};

export const buildTagFilter = (filters) => {
  const tagFilter = {};

  // Boolean filter
  if (filters.favorite === true || filters.favorite === "TRUE") {
    tagFilter.favorite = true;
  }

  // Rating filter (0-100 scale)
  if (filters.rating?.min !== undefined || filters.rating?.max !== undefined) {
    tagFilter.rating100 = {};
    const hasMin =
      filters.rating.min !== undefined && filters.rating.min !== "";
    const hasMax =
      filters.rating.max !== undefined && filters.rating.max !== "";

    if (hasMin && hasMax) {
      tagFilter.rating100.modifier = "BETWEEN";
      tagFilter.rating100.value = parseInt(filters.rating.min);
      tagFilter.rating100.value2 = parseInt(filters.rating.max);
    } else if (hasMin) {
      tagFilter.rating100.modifier = "GREATER_THAN";
      tagFilter.rating100.value = parseInt(filters.rating.min) - 1;
    } else if (hasMax) {
      tagFilter.rating100.modifier = "LESS_THAN";
      tagFilter.rating100.value = parseInt(filters.rating.max) + 1;
    }
  }

  // Range filter
  if (
    filters.sceneCount?.min !== undefined ||
    filters.sceneCount?.max !== undefined
  ) {
    tagFilter.scene_count = {};
    const hasMin =
      filters.sceneCount.min !== undefined && filters.sceneCount.min !== "";
    const hasMax =
      filters.sceneCount.max !== undefined && filters.sceneCount.max !== "";

    if (hasMin && hasMax) {
      tagFilter.scene_count.modifier = "BETWEEN";
      tagFilter.scene_count.value = parseInt(filters.sceneCount.min);
      tagFilter.scene_count.value2 = parseInt(filters.sceneCount.max);
    } else if (hasMin) {
      tagFilter.scene_count.modifier = "GREATER_THAN";
      tagFilter.scene_count.value = parseInt(filters.sceneCount.min) - 1;
    } else if (hasMax) {
      tagFilter.scene_count.modifier = "LESS_THAN";
      tagFilter.scene_count.value = parseInt(filters.sceneCount.max) + 1;
    }
  }

  if (
    filters.oCounter?.min !== undefined ||
    filters.oCounter?.max !== undefined
  ) {
    tagFilter.o_counter = {};
    const hasMin =
      filters.oCounter.min !== undefined && filters.oCounter.min !== "";
    const hasMax =
      filters.oCounter.max !== undefined && filters.oCounter.max !== "";

    if (hasMin && hasMax) {
      tagFilter.o_counter.modifier = "BETWEEN";
      tagFilter.o_counter.value = parseInt(filters.oCounter.min);
      tagFilter.o_counter.value2 = parseInt(filters.oCounter.max);
    } else if (hasMin) {
      tagFilter.o_counter.modifier = "GREATER_THAN";
      tagFilter.o_counter.value = parseInt(filters.oCounter.min) - 1;
    } else if (hasMax) {
      tagFilter.o_counter.modifier = "LESS_THAN";
      tagFilter.o_counter.value = parseInt(filters.oCounter.max) + 1;
    }
  }

  if (
    filters.playCount?.min !== undefined ||
    filters.playCount?.max !== undefined
  ) {
    tagFilter.play_count = {};
    const hasMin =
      filters.playCount.min !== undefined && filters.playCount.min !== "";
    const hasMax =
      filters.playCount.max !== undefined && filters.playCount.max !== "";

    if (hasMin && hasMax) {
      tagFilter.play_count.modifier = "BETWEEN";
      tagFilter.play_count.value = parseInt(filters.playCount.min);
      tagFilter.play_count.value2 = parseInt(filters.playCount.max);
    } else if (hasMin) {
      tagFilter.play_count.modifier = "GREATER_THAN";
      tagFilter.play_count.value = parseInt(filters.playCount.min) - 1;
    } else if (hasMax) {
      tagFilter.play_count.modifier = "LESS_THAN";
      tagFilter.play_count.value = parseInt(filters.playCount.max) + 1;
    }
  }

  // Date-range filters
  if (filters.createdAt?.start || filters.createdAt?.end) {
    tagFilter.created_at = {};
    if (filters.createdAt.start)
      tagFilter.created_at.value = filters.createdAt.start;
    tagFilter.created_at.modifier = filters.createdAt.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.createdAt.end)
      tagFilter.created_at.value2 = filters.createdAt.end;
  }

  if (filters.updatedAt?.start || filters.updatedAt?.end) {
    tagFilter.updated_at = {};
    if (filters.updatedAt.start)
      tagFilter.updated_at.value = filters.updatedAt.start;
    tagFilter.updated_at.modifier = filters.updatedAt.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.updatedAt.end)
      tagFilter.updated_at.value2 = filters.updatedAt.end;
  }

  // Text search filters
  if (filters.name) {
    tagFilter.name = {
      value: filters.name,
      modifier: "INCLUDES",
    };
  }

  if (filters.description) {
    tagFilter.description = {
      value: filters.description,
      modifier: "INCLUDES",
    };
  }

  // Entity filters
  if (filters.performerIds && filters.performerIds.length > 0) {
    tagFilter.performers = {
      value: filters.performerIds,
      modifier: "INCLUDES",
    };
  }

  if (filters.studioId) {
    tagFilter.studios = {
      value: [filters.studioId],
      modifier: "INCLUDES",
    };
  }

  if (filters.sceneId) {
    tagFilter.scenes_filter = {
      id: {
        value: [filters.sceneId],
        modifier: "INCLUDES",
      },
    };
  }

  if (filters.groupIds && filters.groupIds.length > 0) {
    tagFilter.scenes_filter = tagFilter.scenes_filter || {};
    tagFilter.scenes_filter.groups = {
      value: filters.groupIds,
      modifier: "INCLUDES",
    };
  }

  return tagFilter;
};

export const buildGroupFilter = (filters) => {
  const groupFilter = {};

  // Boolean filter
  if (filters.favorite === true || filters.favorite === "TRUE") {
    groupFilter.favorite = true;
  }

  // Tags filter
  if (filters.tagIds && filters.tagIds.length > 0) {
    groupFilter.tags = {
      value: filters.tagIds.map(String),
      modifier: filters.tagIdsModifier || "INCLUDES_ALL",
    };
  }

  // Performers filter
  if (filters.performerIds && filters.performerIds.length > 0) {
    groupFilter.performers = {
      value: filters.performerIds.map(String),
      modifier: filters.performerIdsModifier || "INCLUDES",
    };
  }

  // Studios filter
  if (filters.studioId && filters.studioId !== "") {
    groupFilter.studios = {
      value: [String(filters.studioId)],
      modifier: "INCLUDES",
    };
  }

  // Rating filter (0-100 scale)
  if (filters.rating?.min !== undefined || filters.rating?.max !== undefined) {
    groupFilter.rating100 = {};
    const hasMin =
      filters.rating.min !== undefined && filters.rating.min !== "";
    const hasMax =
      filters.rating.max !== undefined && filters.rating.max !== "";

    if (hasMin && hasMax) {
      groupFilter.rating100.modifier = "BETWEEN";
      groupFilter.rating100.value = parseInt(filters.rating.min);
      groupFilter.rating100.value2 = parseInt(filters.rating.max);
    } else if (hasMin) {
      groupFilter.rating100.modifier = "GREATER_THAN";
      groupFilter.rating100.value = parseInt(filters.rating.min) - 1;
    } else if (hasMax) {
      groupFilter.rating100.modifier = "LESS_THAN";
      groupFilter.rating100.value = parseInt(filters.rating.max) + 1;
    }
  }

  // Range filters
  if (
    filters.sceneCount?.min !== undefined ||
    filters.sceneCount?.max !== undefined
  ) {
    groupFilter.scene_count = {};
    const hasMin =
      filters.sceneCount.min !== undefined && filters.sceneCount.min !== "";
    const hasMax =
      filters.sceneCount.max !== undefined && filters.sceneCount.max !== "";

    if (hasMin && hasMax) {
      groupFilter.scene_count.modifier = "BETWEEN";
      groupFilter.scene_count.value = parseInt(filters.sceneCount.min);
      groupFilter.scene_count.value2 = parseInt(filters.sceneCount.max);
    } else if (hasMin) {
      groupFilter.scene_count.modifier = "GREATER_THAN";
      groupFilter.scene_count.value = parseInt(filters.sceneCount.min) - 1;
    } else if (hasMax) {
      groupFilter.scene_count.modifier = "LESS_THAN";
      groupFilter.scene_count.value = parseInt(filters.sceneCount.max) + 1;
    }
  }

  if (
    filters.duration?.min !== undefined ||
    filters.duration?.max !== undefined
  ) {
    groupFilter.duration = {};
    const hasMin =
      filters.duration.min !== undefined && filters.duration.min !== "";
    const hasMax =
      filters.duration.max !== undefined && filters.duration.max !== "";

    if (hasMin && hasMax) {
      groupFilter.duration.modifier = "BETWEEN";
      groupFilter.duration.value = parseInt(filters.duration.min) * 60;
      groupFilter.duration.value2 = parseInt(filters.duration.max) * 60;
    } else if (hasMin) {
      groupFilter.duration.modifier = "GREATER_THAN";
      groupFilter.duration.value = parseInt(filters.duration.min) * 60 - 1;
    } else if (hasMax) {
      groupFilter.duration.modifier = "LESS_THAN";
      groupFilter.duration.value = parseInt(filters.duration.max) * 60 + 1;
    }
  }

  // Date-range filters
  if (filters.date?.start || filters.date?.end) {
    groupFilter.date = {};
    if (filters.date.start) groupFilter.date.value = filters.date.start;
    groupFilter.date.modifier = filters.date.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.date.end) groupFilter.date.value2 = filters.date.end;
  }

  if (filters.createdAt?.start || filters.createdAt?.end) {
    groupFilter.created_at = {};
    if (filters.createdAt.start)
      groupFilter.created_at.value = filters.createdAt.start;
    groupFilter.created_at.modifier = filters.createdAt.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.createdAt.end)
      groupFilter.created_at.value2 = filters.createdAt.end;
  }

  if (filters.updatedAt?.start || filters.updatedAt?.end) {
    groupFilter.updated_at = {};
    if (filters.updatedAt.start)
      groupFilter.updated_at.value = filters.updatedAt.start;
    groupFilter.updated_at.modifier = filters.updatedAt.end
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.updatedAt.end)
      groupFilter.updated_at.value2 = filters.updatedAt.end;
  }

  // Text search filters
  if (filters.name) {
    groupFilter.name = {
      value: filters.name,
      modifier: "INCLUDES",
    };
  }

  if (filters.synopsis) {
    groupFilter.synopsis = {
      value: filters.synopsis,
      modifier: "INCLUDES",
    };
  }

  if (filters.director) {
    groupFilter.director = {
      value: filters.director,
      modifier: "INCLUDES",
    };
  }

  // Entity filters
  if (filters.sceneId) {
    groupFilter.scene_filter = {
      id: {
        value: [filters.sceneId],
        modifier: "INCLUDES",
      },
    };
  }

  return groupFilter;
};

export const buildGalleryFilter = (filters) => {
  const galleryFilter = {};

  // Boolean filter
  if (filters.favorite === true || filters.favorite === "TRUE") {
    galleryFilter.favorite = true;
  }

  // Has favorite image filter
  if (filters.hasFavoriteImage === true || filters.hasFavoriteImage === "TRUE") {
    galleryFilter.hasFavoriteImage = true;
  }

  // Rating filter (0-100 scale)
  if (filters.rating?.min !== undefined || filters.rating?.max !== undefined) {
    galleryFilter.rating100 = {};
    const hasMin =
      filters.rating.min !== undefined && filters.rating.min !== "";
    const hasMax =
      filters.rating.max !== undefined && filters.rating.max !== "";

    if (hasMin && hasMax) {
      galleryFilter.rating100.modifier = "BETWEEN";
      galleryFilter.rating100.value = parseInt(filters.rating.min);
      galleryFilter.rating100.value2 = parseInt(filters.rating.max);
    } else if (hasMin) {
      galleryFilter.rating100.modifier = "GREATER_THAN";
      galleryFilter.rating100.value = parseInt(filters.rating.min) - 1;
    } else if (hasMax) {
      galleryFilter.rating100.modifier = "LESS_THAN";
      galleryFilter.rating100.value = parseInt(filters.rating.max) + 1;
    }
  }

  // Image count filter
  if (
    filters.imageCount?.min !== undefined ||
    filters.imageCount?.max !== undefined
  ) {
    galleryFilter.image_count = {};
    const hasMin =
      filters.imageCount.min !== undefined && filters.imageCount.min !== "";
    const hasMax =
      filters.imageCount.max !== undefined && filters.imageCount.max !== "";

    if (hasMin && hasMax) {
      galleryFilter.image_count.modifier = "BETWEEN";
      galleryFilter.image_count.value = parseInt(filters.imageCount.min);
      galleryFilter.image_count.value2 = parseInt(filters.imageCount.max);
    } else if (hasMin) {
      galleryFilter.image_count.modifier = "GREATER_THAN";
      galleryFilter.image_count.value = parseInt(filters.imageCount.min) - 1;
    } else if (hasMax) {
      galleryFilter.image_count.modifier = "LESS_THAN";
      galleryFilter.image_count.value = parseInt(filters.imageCount.max) + 1;
    }
  }

  // Text search filter
  if (filters.title) {
    galleryFilter.title = {
      value: filters.title,
      modifier: "INCLUDES",
    };
  }

  // Studio filter
  // Supports hierarchical filtering via depth parameter
  if (filters.studioIds && filters.studioIds.length > 0) {
    galleryFilter.studios = {
      value: filters.studioIds.map(String),
      modifier: filters.studioIdsModifier || "INCLUDES",
    };
    // Pass through depth for hierarchical filtering
    if (filters.studioIdsDepth !== undefined) {
      galleryFilter.studios.depth = filters.studioIdsDepth;
    }
  }

  // Performers filter
  if (filters.performerIds && filters.performerIds.length > 0) {
    galleryFilter.performers = {
      value: filters.performerIds.map(String),
      modifier: filters.performerIdsModifier || "INCLUDES",
    };
  }

  // Tags filter
  // Supports hierarchical filtering via depth parameter
  if (filters.tagIds && filters.tagIds.length > 0) {
    galleryFilter.tags = {
      value: filters.tagIds.map(String),
      modifier: filters.tagIdsModifier || "INCLUDES",
    };
    // Pass through depth for hierarchical filtering
    if (filters.tagIdsDepth !== undefined) {
      galleryFilter.tags.depth = filters.tagIdsDepth;
    }
  }

  // Date-range filters (for timeline view)
  if (filters.date?.start || filters.date?.end) {
    galleryFilter.date = {};
    if (filters.date.start) galleryFilter.date.value = filters.date.start;
    galleryFilter.date.modifier = filters.date.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.date.end) galleryFilter.date.value2 = filters.date.end;
  }

  return galleryFilter;
};

export const buildImageFilter = (filters) => {
  const imageFilter = {};

  // Boolean filter
  if (filters.favorite === true || filters.favorite === "TRUE") {
    imageFilter.favorite = true;
  }

  // Rating filter (0-100 scale)
  if (filters.rating?.min !== undefined || filters.rating?.max !== undefined) {
    imageFilter.rating100 = {};
    const hasMin =
      filters.rating.min !== undefined && filters.rating.min !== "";
    const hasMax =
      filters.rating.max !== undefined && filters.rating.max !== "";

    if (hasMin && hasMax) {
      imageFilter.rating100.modifier = "BETWEEN";
      imageFilter.rating100.value = parseInt(filters.rating.min);
      imageFilter.rating100.value2 = parseInt(filters.rating.max);
    } else if (hasMin) {
      imageFilter.rating100.modifier = "GREATER_THAN";
      imageFilter.rating100.value = parseInt(filters.rating.min) - 1;
    } else if (hasMax) {
      imageFilter.rating100.modifier = "LESS_THAN";
      imageFilter.rating100.value = parseInt(filters.rating.max) + 1;
    }
  }

  // Performers filter (with gallery-umbrella inheritance on backend)
  if (filters.performerIds && filters.performerIds.length > 0) {
    imageFilter.performers = {
      value: filters.performerIds.map(String),
      modifier: filters.performerIdsModifier || "INCLUDES",
    };
  }

  // Studios filter (with gallery-umbrella inheritance on backend)
  // Supports hierarchical filtering via depth parameter
  if (filters.studioIds && filters.studioIds.length > 0) {
    imageFilter.studios = {
      value: filters.studioIds.map(String),
      modifier: filters.studioIdsModifier || "INCLUDES",
    };
    // Pass through depth for hierarchical filtering
    if (filters.studioIdsDepth !== undefined) {
      imageFilter.studios.depth = filters.studioIdsDepth;
    }
  }

  // Tags filter (with gallery-umbrella inheritance on backend)
  // Supports hierarchical filtering via depth parameter
  if (filters.tagIds && filters.tagIds.length > 0) {
    imageFilter.tags = {
      value: filters.tagIds.map(String),
      modifier: filters.tagIdsModifier || "INCLUDES",
    };
    // Pass through depth for hierarchical filtering
    if (filters.tagIdsDepth !== undefined) {
      imageFilter.tags.depth = filters.tagIdsDepth;
    }
  }

  // Galleries filter
  if (filters.galleryIds && filters.galleryIds.length > 0) {
    imageFilter.galleries = {
      value: filters.galleryIds.map(String),
      modifier: filters.galleryIdsModifier || "INCLUDES",
    };
  }

  // O Counter filter
  if (filters.oCounter?.min !== undefined || filters.oCounter?.max !== undefined) {
    imageFilter.o_counter = {};
    const hasMin =
      filters.oCounter.min !== undefined && filters.oCounter.min !== "";
    const hasMax =
      filters.oCounter.max !== undefined && filters.oCounter.max !== "";

    if (hasMin && hasMax) {
      imageFilter.o_counter.modifier = "BETWEEN";
      imageFilter.o_counter.value = parseInt(filters.oCounter.min);
      imageFilter.o_counter.value2 = parseInt(filters.oCounter.max);
    } else if (hasMin) {
      imageFilter.o_counter.modifier = "GREATER_THAN";
      imageFilter.o_counter.value = parseInt(filters.oCounter.min) - 1;
    } else if (hasMax) {
      imageFilter.o_counter.modifier = "LESS_THAN";
      imageFilter.o_counter.value = parseInt(filters.oCounter.max) + 1;
    }
  }

  // Date-range filters (for timeline view)
  if (filters.date?.start || filters.date?.end) {
    imageFilter.date = {};
    if (filters.date.start) imageFilter.date.value = filters.date.start;
    imageFilter.date.modifier = filters.date.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.date.end) imageFilter.date.value2 = filters.date.end;
  }

  return imageFilter;
};

/**
 * Build clip filter params for Peek server API
 * Unlike other build*Filter functions that return GraphQL filter objects,
 * this returns params for the Peek REST API's getClips endpoint.
 */
export const buildClipFilter = (filters) => {
  const clipParams = {};

  // Tag filters
  if (filters.tagIds && filters.tagIds.length > 0) {
    clipParams.tagIds = filters.tagIds;
  }

  // Scene tag filters
  if (filters.sceneTagIds && filters.sceneTagIds.length > 0) {
    clipParams.sceneTagIds = filters.sceneTagIds;
  }

  // Performer filters
  if (filters.performerIds && filters.performerIds.length > 0) {
    clipParams.performerIds = filters.performerIds;
  }

  // Studio filter (single value)
  if (filters.studioId) {
    clipParams.studioId = filters.studioId;
  }

  // isGenerated filter
  if (filters.isGenerated !== undefined && filters.isGenerated !== "") {
    clipParams.isGenerated = filters.isGenerated === "true" || filters.isGenerated === true;
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
  },
];

/**
 * Get a carousel filter definition by key
 */
export const getCarouselFilterDefinition = (key) => {
  return CAROUSEL_FILTER_DEFINITIONS.find((f) => f.key === key);
};

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
export const carouselRulesToFilterState = (rules) => {
  const filterState = {};

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
      filterState.rating = { min: r.value + 1 };
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
      filterState.oCount = { min: o.value + 1 };
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
      filterState.duration = { min: Math.round((d.value + 1) / 60) };
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
      filterState.playCount = { min: p.value + 1 };
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
      filterState.playDuration = { min: Math.round((pd.value + 1) / 60) };
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
      filterState.performerCount = { min: pc.value + 1 };
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
      filterState.bitrate = { min: Math.round((b.value + 1) / 1000000) };
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
 * Helper to convert API date filter to UI date range format
 */
const dateRangeFromApi = (dateFilter) => {
  if (!dateFilter) return {};

  if (dateFilter.modifier === "BETWEEN") {
    return { min: dateFilter.value, max: dateFilter.value2 };
  } else if (dateFilter.modifier === "GREATER_THAN") {
    return { min: dateFilter.value };
  } else if (dateFilter.modifier === "LESS_THAN") {
    return { max: dateFilter.value };
  }
  return {};
};

/**
 * Count active filters in a carousel's rules
 */
export const countCarouselRules = (rules) => {
  if (!rules || typeof rules !== "object") return 0;
  return Object.keys(rules).length;
};
