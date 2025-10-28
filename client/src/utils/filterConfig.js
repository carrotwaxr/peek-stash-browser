/**
 * Sorting and filtering configuration for all entity types
 */

// Scene sorting options (alphabetically organized by label)
export const SCENE_SORT_OPTIONS = [
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

// Filter type options for different data types
export const RATING_OPTIONS = [
  { value: "1", label: "1 Star" },
  { value: "2", label: "2 Stars" },
  { value: "3", label: "3 Stars" },
  { value: "4", label: "4 Stars" },
  { value: "5", label: "5 Stars" },
];

export const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "TRANSGENDER_MALE", label: "Trans Male" },
  { value: "TRANSGENDER_FEMALE", label: "Trans Female" },
  { value: "INTERSEX", label: "Intersex" },
  { value: "NON_BINARY", label: "Non-Binary" },
];

export const ETHNICITY_OPTIONS = [
  { value: "CAUCASIAN", label: "Caucasian" },
  { value: "BLACK", label: "Black" },
  { value: "ASIAN", label: "Asian" },
  { value: "INDIAN", label: "Indian" },
  { value: "LATIN", label: "Latin" },
  { value: "MIDDLE_EASTERN", label: "Middle Eastern" },
  { value: "MIXED", label: "Mixed" },
  { value: "OTHER", label: "Other" },
];

export const HAIR_COLOR_OPTIONS = [
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

export const EYE_COLOR_OPTIONS = [
  { value: "BROWN", label: "Brown" },
  { value: "BLUE", label: "Blue" },
  { value: "GREEN", label: "Green" },
  { value: "GREY", label: "Grey" },
  { value: "HAZEL", label: "Hazel" },
  { value: "OTHER", label: "Other" },
];

export const FAKE_TITS_OPTIONS = [
  { value: "TRUE", label: "Fake" },
  { value: "FALSE", label: "Natural" },
];

export const ORGANIZED_OPTIONS = [
  { value: "TRUE", label: "Organized" },
  { value: "FALSE", label: "Not Organized" },
];

export const FAVORITE_OPTIONS = [
  { value: "TRUE", label: "Favorite" },
  { value: "FALSE", label: "Not Favorite" },
];

// Resolution options (common video resolutions)
export const RESOLUTION_OPTIONS = [
  { value: "720", label: "720p" },
  { value: "1080", label: "1080p" },
  { value: "1440", label: "1440p" },
  { value: "2160", label: "4K" },
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
    key: "tagIds",
    label: "Tags",
    type: "searchable-select",
    entityType: "tags",
    multi: true,
    defaultValue: [],
    placeholder: "Select tags...",
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
  {
    key: "organized",
    label: "Organized",
    type: "select",
    defaultValue: "",
    options: ORGANIZED_OPTIONS,
    placeholder: "Any",
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
    label: "Favorite Groups",
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
      modifier: filters.performers?.modifier || "INCLUDES_ALL",
    };
  }

  // Studios: Merge permanent + UI filters
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
  }

  // Tags: Merge permanent + UI filters
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
      modifier: filters.tags?.modifier || "INCLUDES_ALL",
    };
  }

  // Groups: Merge permanent + UI filters
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
      modifier: filters.groups?.modifier || "INCLUDES",
    };
  }

  // Boolean filters
  if (filters.favorite === true || filters.favorite === "TRUE") {
    sceneFilter.favorite = true;
  }
  if (filters.performerFavorite === true || filters.performerFavorite === "TRUE") {
    sceneFilter.performer_favorite = true;
  }
  if (filters.studioFavorite === true || filters.studioFavorite === "TRUE") {
    sceneFilter.studio_favorite = true;
  }
  if (filters.tagFavorite === true || filters.tagFavorite === "TRUE") {
    sceneFilter.tag_favorite = true;
  }
  if (filters.organized) {
    sceneFilter.organized = filters.organized === "TRUE";
  }

  // Rating filter (0-100 scale)
  if (filters.rating?.min !== undefined || filters.rating?.max !== undefined) {
    sceneFilter.rating100 = {};
    const hasMin = filters.rating.min !== undefined && filters.rating.min !== '';
    const hasMax = filters.rating.max !== undefined && filters.rating.max !== '';

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
    const height = parseInt(filters.resolution);
    sceneFilter.resolution = {
      value: `${height}p`,
      modifier: "EQUALS",
    };
  }

  // Range filters
  if (filters.duration?.min !== undefined || filters.duration?.max !== undefined) {
    sceneFilter.duration = {};
    const hasMin = filters.duration.min !== undefined && filters.duration.min !== '';
    const hasMax = filters.duration.max !== undefined && filters.duration.max !== '';

    if (hasMin && hasMax) {
      sceneFilter.duration.modifier = "BETWEEN";
      sceneFilter.duration.value = parseInt(filters.duration.min) * 60;
      sceneFilter.duration.value2 = parseInt(filters.duration.max) * 60;
    } else if (hasMin) {
      sceneFilter.duration.modifier = "GREATER_THAN";
      sceneFilter.duration.value = (parseInt(filters.duration.min) * 60) - 1;
    } else if (hasMax) {
      sceneFilter.duration.modifier = "LESS_THAN";
      sceneFilter.duration.value = (parseInt(filters.duration.max) * 60) + 1;
    }
  }

  if (filters.playDuration?.min !== undefined || filters.playDuration?.max !== undefined) {
    sceneFilter.play_duration = {};
    const hasMin = filters.playDuration.min !== undefined && filters.playDuration.min !== '';
    const hasMax = filters.playDuration.max !== undefined && filters.playDuration.max !== '';

    if (hasMin && hasMax) {
      sceneFilter.play_duration.modifier = "BETWEEN";
      sceneFilter.play_duration.value = parseInt(filters.playDuration.min) * 60;
      sceneFilter.play_duration.value2 = parseInt(filters.playDuration.max) * 60;
    } else if (hasMin) {
      sceneFilter.play_duration.modifier = "GREATER_THAN";
      sceneFilter.play_duration.value = (parseInt(filters.playDuration.min) * 60) - 1;
    } else if (hasMax) {
      sceneFilter.play_duration.modifier = "LESS_THAN";
      sceneFilter.play_duration.value = (parseInt(filters.playDuration.max) * 60) + 1;
    }
  }

  if (filters.oCount?.min !== undefined || filters.oCount?.max !== undefined) {
    sceneFilter.o_counter = {};
    const hasMin = filters.oCount.min !== undefined && filters.oCount.min !== '';
    const hasMax = filters.oCount.max !== undefined && filters.oCount.max !== '';

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

  if (filters.playCount?.min !== undefined || filters.playCount?.max !== undefined) {
    sceneFilter.play_count = {};
    const hasMin = filters.playCount.min !== undefined && filters.playCount.min !== '';
    const hasMax = filters.playCount.max !== undefined && filters.playCount.max !== '';

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

  if (filters.bitrate?.min !== undefined || filters.bitrate?.max !== undefined) {
    sceneFilter.bitrate = {};
    const hasMin = filters.bitrate.min !== undefined && filters.bitrate.min !== '';
    const hasMax = filters.bitrate.max !== undefined && filters.bitrate.max !== '';

    if (hasMin && hasMax) {
      sceneFilter.bitrate.modifier = "BETWEEN";
      sceneFilter.bitrate.value = parseInt(filters.bitrate.min) * 1000000;
      sceneFilter.bitrate.value2 = parseInt(filters.bitrate.max) * 1000000;
    } else if (hasMin) {
      sceneFilter.bitrate.modifier = "GREATER_THAN";
      sceneFilter.bitrate.value = (parseInt(filters.bitrate.min) * 1000000) - 1;
    } else if (hasMax) {
      sceneFilter.bitrate.modifier = "LESS_THAN";
      sceneFilter.bitrate.value = (parseInt(filters.bitrate.max) * 1000000) + 1;
    }
  }

  if (filters.framerate?.min !== undefined || filters.framerate?.max !== undefined) {
    sceneFilter.framerate = {};
    const hasMin = filters.framerate.min !== undefined && filters.framerate.min !== '';
    const hasMax = filters.framerate.max !== undefined && filters.framerate.max !== '';

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

  if (filters.performerCount?.min !== undefined || filters.performerCount?.max !== undefined) {
    sceneFilter.performer_count = {};
    const hasMin = filters.performerCount.min !== undefined && filters.performerCount.min !== '';
    const hasMax = filters.performerCount.max !== undefined && filters.performerCount.max !== '';

    if (hasMin && hasMax) {
      sceneFilter.performer_count.modifier = "BETWEEN";
      sceneFilter.performer_count.value = parseInt(filters.performerCount.min);
      sceneFilter.performer_count.value2 = parseInt(filters.performerCount.max);
    } else if (hasMin) {
      sceneFilter.performer_count.modifier = "GREATER_THAN";
      sceneFilter.performer_count.value = parseInt(filters.performerCount.min) - 1;
    } else if (hasMax) {
      sceneFilter.performer_count.modifier = "LESS_THAN";
      sceneFilter.performer_count.value = parseInt(filters.performerCount.max) + 1;
    }
  }

  if (filters.performerAge?.min !== undefined || filters.performerAge?.max !== undefined) {
    sceneFilter.performer_age = {};
    const hasMin = filters.performerAge.min !== undefined && filters.performerAge.min !== '';
    const hasMax = filters.performerAge.max !== undefined && filters.performerAge.max !== '';

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

  if (filters.tagCount?.min !== undefined || filters.tagCount?.max !== undefined) {
    sceneFilter.tag_count = {};
    const hasMin = filters.tagCount.min !== undefined && filters.tagCount.min !== '';
    const hasMax = filters.tagCount.max !== undefined && filters.tagCount.max !== '';

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
    if (filters.createdAt.start) sceneFilter.created_at.value = filters.createdAt.start;
    sceneFilter.created_at.modifier = filters.createdAt.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.createdAt.end) sceneFilter.created_at.value2 = filters.createdAt.end;
  }

  if (filters.updatedAt?.start || filters.updatedAt?.end) {
    sceneFilter.updated_at = {};
    if (filters.updatedAt.start) sceneFilter.updated_at.value = filters.updatedAt.start;
    sceneFilter.updated_at.modifier = filters.updatedAt.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.updatedAt.end) sceneFilter.updated_at.value2 = filters.updatedAt.end;
  }

  if (filters.lastPlayedAt?.start || filters.lastPlayedAt?.end) {
    sceneFilter.last_played_at = {};
    if (filters.lastPlayedAt.start) sceneFilter.last_played_at.value = filters.lastPlayedAt.start;
    sceneFilter.last_played_at.modifier = filters.lastPlayedAt.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.lastPlayedAt.end) sceneFilter.last_played_at.value2 = filters.lastPlayedAt.end;
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

  if (filters.audioCodec) {
    sceneFilter.audio_codec = {
      value: filters.audioCodec,
      modifier: "INCLUDES",
    };
  }

  return sceneFilter;
};

export const buildPerformerFilter = (filters) => {
  const performerFilter = {};

  // Boolean filter
  if (filters.favorite === true || filters.favorite === "TRUE") {
    performerFilter.favorite = true;
  }

  // Select filters with EQUALS modifier
  if (filters.gender) {
    performerFilter.gender = {
      value: filters.gender,
      modifier: "EQUALS",
    };
  }

  // Rating filter (0-100 scale)
  if (filters.rating?.min !== undefined || filters.rating?.max !== undefined) {
    performerFilter.rating100 = {};
    const hasMin = filters.rating.min !== undefined && filters.rating.min !== '';
    const hasMax = filters.rating.max !== undefined && filters.rating.max !== '';

    if (hasMin && hasMax) {
      performerFilter.rating100.modifier = "BETWEEN";
      performerFilter.rating100.value = parseInt(filters.rating.min);
      performerFilter.rating100.value2 = parseInt(filters.rating.max);
    } else if (hasMin) {
      performerFilter.rating100.modifier = "GREATER_THAN";
      performerFilter.rating100.value = parseInt(filters.rating.min) - 1;
    } else if (hasMax) {
      performerFilter.rating100.modifier = "LESS_THAN";
      performerFilter.rating100.value = parseInt(filters.rating.max) + 1;
    }
  }

  if (filters.ethnicity) {
    performerFilter.ethnicity = {
      value: filters.ethnicity,
      modifier: "INCLUDES",
    };
  }

  if (filters.hairColor) {
    performerFilter.hair_color = {
      value: filters.hairColor,
      modifier: "INCLUDES",
    };
  }

  if (filters.eyeColor) {
    performerFilter.eye_color = {
      value: filters.eyeColor,
      modifier: "INCLUDES",
    };
  }

  if (filters.fakeTits) {
    performerFilter.fake_tits = {
      value: filters.fakeTits,
      modifier: "INCLUDES",
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
    if (filters.birthYear.min) performerFilter.birth_year.value = parseInt(filters.birthYear.min);
    performerFilter.birth_year.modifier = filters.birthYear.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.birthYear.max) performerFilter.birth_year.value2 = parseInt(filters.birthYear.max);
  }

  if (filters.deathYear?.min || filters.deathYear?.max) {
    performerFilter.death_year = {};
    if (filters.deathYear.min) performerFilter.death_year.value = parseInt(filters.deathYear.min);
    performerFilter.death_year.modifier = filters.deathYear.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.deathYear.max) performerFilter.death_year.value2 = parseInt(filters.deathYear.max);
  }

  if (filters.careerLength?.min || filters.careerLength?.max) {
    performerFilter.career_length = {};
    if (filters.careerLength.min) performerFilter.career_length.value = parseInt(filters.careerLength.min);
    performerFilter.career_length.modifier = filters.careerLength.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.careerLength.max) performerFilter.career_length.value2 = parseInt(filters.careerLength.max);
  }

  if (filters.height?.min || filters.height?.max) {
    performerFilter.height_cm = {};
    if (filters.height.min) performerFilter.height_cm.value = parseInt(filters.height.min);
    performerFilter.height_cm.modifier = filters.height.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.height.max) performerFilter.height_cm.value2 = parseInt(filters.height.max);
  }

  if (filters.weight?.min || filters.weight?.max) {
    performerFilter.weight = {};
    if (filters.weight.min) performerFilter.weight.value = parseInt(filters.weight.min);
    performerFilter.weight.modifier = filters.weight.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.weight.max) performerFilter.weight.value2 = parseInt(filters.weight.max);
  }

  if (filters.penisLength?.min || filters.penisLength?.max) {
    performerFilter.penis_length = {};
    if (filters.penisLength.min) performerFilter.penis_length.value = parseInt(filters.penisLength.min);
    performerFilter.penis_length.modifier = filters.penisLength.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.penisLength.max) performerFilter.penis_length.value2 = parseInt(filters.penisLength.max);
  }

  if (filters.oCounter?.min !== undefined || filters.oCounter?.max !== undefined) {
    performerFilter.o_counter = {};
    const hasMin = filters.oCounter.min !== undefined && filters.oCounter.min !== '';
    const hasMax = filters.oCounter.max !== undefined && filters.oCounter.max !== '';

    if (hasMin && hasMax) {
      performerFilter.o_counter.modifier = "BETWEEN";
      performerFilter.o_counter.value = parseInt(filters.oCounter.min);
      performerFilter.o_counter.value2 = parseInt(filters.oCounter.max);
    } else if (hasMin) {
      performerFilter.o_counter.modifier = "GREATER_THAN";
      performerFilter.o_counter.value = parseInt(filters.oCounter.min) - 1;
    } else if (hasMax) {
      performerFilter.o_counter.modifier = "LESS_THAN";
      performerFilter.o_counter.value = parseInt(filters.oCounter.max) + 1;
    }
  }

  if (filters.playCount?.min !== undefined || filters.playCount?.max !== undefined) {
    performerFilter.play_count = {};
    const hasMin = filters.playCount.min !== undefined && filters.playCount.min !== '';
    const hasMax = filters.playCount.max !== undefined && filters.playCount.max !== '';

    if (hasMin && hasMax) {
      performerFilter.play_count.modifier = "BETWEEN";
      performerFilter.play_count.value = parseInt(filters.playCount.min);
      performerFilter.play_count.value2 = parseInt(filters.playCount.max);
    } else if (hasMin) {
      performerFilter.play_count.modifier = "GREATER_THAN";
      performerFilter.play_count.value = parseInt(filters.playCount.min) - 1;
    } else if (hasMax) {
      performerFilter.play_count.modifier = "LESS_THAN";
      performerFilter.play_count.value = parseInt(filters.playCount.max) + 1;
    }
  }

  if (filters.sceneCount?.min !== undefined || filters.sceneCount?.max !== undefined) {
    performerFilter.scene_count = {};
    const hasMin = filters.sceneCount.min !== undefined && filters.sceneCount.min !== '';
    const hasMax = filters.sceneCount.max !== undefined && filters.sceneCount.max !== '';

    if (hasMin && hasMax) {
      performerFilter.scene_count.modifier = "BETWEEN";
      performerFilter.scene_count.value = parseInt(filters.sceneCount.min);
      performerFilter.scene_count.value2 = parseInt(filters.sceneCount.max);
    } else if (hasMin) {
      performerFilter.scene_count.modifier = "GREATER_THAN";
      performerFilter.scene_count.value = parseInt(filters.sceneCount.min) - 1;
    } else if (hasMax) {
      performerFilter.scene_count.modifier = "LESS_THAN";
      performerFilter.scene_count.value = parseInt(filters.sceneCount.max) + 1;
    }
  }

  // Date-range filters
  if (filters.birthdate?.start || filters.birthdate?.end) {
    performerFilter.birthdate = {};
    if (filters.birthdate.start) performerFilter.birthdate.value = filters.birthdate.start;
    performerFilter.birthdate.modifier = filters.birthdate.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.birthdate.end) performerFilter.birthdate.value2 = filters.birthdate.end;
  }

  if (filters.deathDate?.start || filters.deathDate?.end) {
    performerFilter.death_date = {};
    if (filters.deathDate.start) performerFilter.death_date.value = filters.deathDate.start;
    performerFilter.death_date.modifier = filters.deathDate.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.deathDate.end) performerFilter.death_date.value2 = filters.deathDate.end;
  }

  if (filters.createdAt?.start || filters.createdAt?.end) {
    performerFilter.created_at = {};
    if (filters.createdAt.start) performerFilter.created_at.value = filters.createdAt.start;
    performerFilter.created_at.modifier = filters.createdAt.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.createdAt.end) performerFilter.created_at.value2 = filters.createdAt.end;
  }

  if (filters.updatedAt?.start || filters.updatedAt?.end) {
    performerFilter.updated_at = {};
    if (filters.updatedAt.start) performerFilter.updated_at.value = filters.updatedAt.start;
    performerFilter.updated_at.modifier = filters.updatedAt.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.updatedAt.end) performerFilter.updated_at.value2 = filters.updatedAt.end;
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

  return performerFilter;
};

export const buildStudioFilter = (filters) => {
  const studioFilter = {};

  // Boolean filter
  if (filters.favorite === true || filters.favorite === "TRUE") {
    studioFilter.favorite = true;
  }

  // Rating filter (0-100 scale)
  if (filters.rating?.min !== undefined || filters.rating?.max !== undefined) {
    studioFilter.rating100 = {};
    const hasMin = filters.rating.min !== undefined && filters.rating.min !== '';
    const hasMax = filters.rating.max !== undefined && filters.rating.max !== '';

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
  if (filters.sceneCount?.min !== undefined || filters.sceneCount?.max !== undefined) {
    studioFilter.scene_count = {};
    const hasMin = filters.sceneCount.min !== undefined && filters.sceneCount.min !== '';
    const hasMax = filters.sceneCount.max !== undefined && filters.sceneCount.max !== '';

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

  if (filters.oCounter?.min !== undefined || filters.oCounter?.max !== undefined) {
    studioFilter.o_counter = {};
    const hasMin = filters.oCounter.min !== undefined && filters.oCounter.min !== '';
    const hasMax = filters.oCounter.max !== undefined && filters.oCounter.max !== '';

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

  if (filters.playCount?.min !== undefined || filters.playCount?.max !== undefined) {
    studioFilter.play_count = {};
    const hasMin = filters.playCount.min !== undefined && filters.playCount.min !== '';
    const hasMax = filters.playCount.max !== undefined && filters.playCount.max !== '';

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
    if (filters.createdAt.start) studioFilter.created_at.value = filters.createdAt.start;
    studioFilter.created_at.modifier = filters.createdAt.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.createdAt.end) studioFilter.created_at.value2 = filters.createdAt.end;
  }

  if (filters.updatedAt?.start || filters.updatedAt?.end) {
    studioFilter.updated_at = {};
    if (filters.updatedAt.start) studioFilter.updated_at.value = filters.updatedAt.start;
    studioFilter.updated_at.modifier = filters.updatedAt.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.updatedAt.end) studioFilter.updated_at.value2 = filters.updatedAt.end;
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
    const hasMin = filters.rating.min !== undefined && filters.rating.min !== '';
    const hasMax = filters.rating.max !== undefined && filters.rating.max !== '';

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
  if (filters.sceneCount?.min !== undefined || filters.sceneCount?.max !== undefined) {
    tagFilter.scene_count = {};
    const hasMin = filters.sceneCount.min !== undefined && filters.sceneCount.min !== '';
    const hasMax = filters.sceneCount.max !== undefined && filters.sceneCount.max !== '';

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

  if (filters.oCounter?.min !== undefined || filters.oCounter?.max !== undefined) {
    tagFilter.o_counter = {};
    const hasMin = filters.oCounter.min !== undefined && filters.oCounter.min !== '';
    const hasMax = filters.oCounter.max !== undefined && filters.oCounter.max !== '';

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

  if (filters.playCount?.min !== undefined || filters.playCount?.max !== undefined) {
    tagFilter.play_count = {};
    const hasMin = filters.playCount.min !== undefined && filters.playCount.min !== '';
    const hasMax = filters.playCount.max !== undefined && filters.playCount.max !== '';

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
    if (filters.createdAt.start) tagFilter.created_at.value = filters.createdAt.start;
    tagFilter.created_at.modifier = filters.createdAt.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.createdAt.end) tagFilter.created_at.value2 = filters.createdAt.end;
  }

  if (filters.updatedAt?.start || filters.updatedAt?.end) {
    tagFilter.updated_at = {};
    if (filters.updatedAt.start) tagFilter.updated_at.value = filters.updatedAt.start;
    tagFilter.updated_at.modifier = filters.updatedAt.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.updatedAt.end) tagFilter.updated_at.value2 = filters.updatedAt.end;
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

  return tagFilter;
};

export const buildGroupFilter = (filters) => {
  const groupFilter = {};

  // Boolean filter
  if (filters.favorite === true || filters.favorite === "TRUE") {
    groupFilter.favorite = true;
  }

  // Rating filter (0-100 scale)
  if (filters.rating?.min !== undefined || filters.rating?.max !== undefined) {
    groupFilter.rating100 = {};
    const hasMin = filters.rating.min !== undefined && filters.rating.min !== '';
    const hasMax = filters.rating.max !== undefined && filters.rating.max !== '';

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
  if (filters.sceneCount?.min !== undefined || filters.sceneCount?.max !== undefined) {
    groupFilter.scene_count = {};
    const hasMin = filters.sceneCount.min !== undefined && filters.sceneCount.min !== '';
    const hasMax = filters.sceneCount.max !== undefined && filters.sceneCount.max !== '';

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

  if (filters.duration?.min !== undefined || filters.duration?.max !== undefined) {
    groupFilter.duration = {};
    const hasMin = filters.duration.min !== undefined && filters.duration.min !== '';
    const hasMax = filters.duration.max !== undefined && filters.duration.max !== '';

    if (hasMin && hasMax) {
      groupFilter.duration.modifier = "BETWEEN";
      groupFilter.duration.value = parseInt(filters.duration.min) * 60;
      groupFilter.duration.value2 = parseInt(filters.duration.max) * 60;
    } else if (hasMin) {
      groupFilter.duration.modifier = "GREATER_THAN";
      groupFilter.duration.value = (parseInt(filters.duration.min) * 60) - 1;
    } else if (hasMax) {
      groupFilter.duration.modifier = "LESS_THAN";
      groupFilter.duration.value = (parseInt(filters.duration.max) * 60) + 1;
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
    if (filters.createdAt.start) groupFilter.created_at.value = filters.createdAt.start;
    groupFilter.created_at.modifier = filters.createdAt.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.createdAt.end) groupFilter.created_at.value2 = filters.createdAt.end;
  }

  if (filters.updatedAt?.start || filters.updatedAt?.end) {
    groupFilter.updated_at = {};
    if (filters.updatedAt.start) groupFilter.updated_at.value = filters.updatedAt.start;
    groupFilter.updated_at.modifier = filters.updatedAt.end ? "BETWEEN" : "GREATER_THAN";
    if (filters.updatedAt.end) groupFilter.updated_at.value2 = filters.updatedAt.end;
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

  return groupFilter;
};
