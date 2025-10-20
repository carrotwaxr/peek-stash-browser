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
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "scenes_count", label: "Scene Count" },
  { value: "updated_at", label: "Updated At" },
];

// Tag sorting options (alphabetically organized by label)
export const TAG_SORT_OPTIONS = [
  { value: "created_at", label: "Created At" },
  { value: "name", label: "Name" },
  { value: "random", label: "Random" },
  { value: "scenes_count", label: "Scene Count" },
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
    label: "Rating",
    type: "select",
    defaultValue: "",
    options: RATING_OPTIONS,
    placeholder: "Any rating",
  },
  {
    key: "favorite",
    label: "Favorites Only",
    type: "checkbox",
    defaultValue: false,
  },
  {
    key: "performerFavorite",
    label: "Favorite Performers Only",
    type: "checkbox",
    defaultValue: false,
  },
  {
    key: "organized",
    label: "Organized",
    type: "select",
    defaultValue: "",
    options: ORGANIZED_OPTIONS,
    placeholder: "Any",
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
    key: "duration",
    label: "Duration (minutes)",
    type: "range",
    defaultValue: {},
    min: 1,
    max: 300,
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
    key: "oCount",
    label: "O Count",
    type: "range",
    defaultValue: {},
    min: 0,
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
    key: "director",
    label: "Director Search",
    type: "text",
    defaultValue: "",
    placeholder: "Search director...",
  },
  {
    key: "audioCodec",
    label: "Audio Codec",
    type: "text",
    defaultValue: "",
    placeholder: "e.g. aac, mp3",
  },
];

export const PERFORMER_FILTER_OPTIONS = [
  {
    key: "favorite",
    label: "Favorites Only",
    type: "checkbox",
    defaultValue: false,
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
    label: "Rating",
    type: "select",
    defaultValue: "",
    options: RATING_OPTIONS,
    placeholder: "Any rating",
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
    key: "fakeTits",
    label: "Breast Type",
    type: "select",
    defaultValue: "",
    options: FAKE_TITS_OPTIONS,
    placeholder: "Any",
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
    key: "sceneCount",
    label: "Scene Count",
    type: "range",
    defaultValue: {},
    min: 0,
    max: 1000,
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
];

export const STUDIO_FILTER_OPTIONS = [
  {
    key: "favorite",
    label: "Favorites Only",
    type: "checkbox",
    defaultValue: false,
  },
  {
    key: "rating",
    label: "Rating",
    type: "select",
    defaultValue: "",
    options: RATING_OPTIONS,
    placeholder: "Any rating",
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
];

export const TAG_FILTER_OPTIONS = [
  {
    key: "favorite",
    label: "Favorites Only",
    type: "checkbox",
    defaultValue: false,
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
      modifier: "INCLUDES_ALL",
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
      modifier: "INCLUDES_ALL",
    };
  }

  // Boolean filters
  if (filters.favorite === true || filters.favorite === "TRUE") {
    sceneFilter.favorite = true;
  }
  if (filters.performerFavorite === true || filters.performerFavorite === "TRUE") {
    sceneFilter.performer_favorite = true;
  }
  if (filters.organized) {
    sceneFilter.organized = filters.organized === "TRUE";
  }

  // Rating filter (1-5 stars to 20-100 scale)
  if (filters.rating) {
    sceneFilter.rating100 = {
      value: parseInt(filters.rating) * 20,
      modifier: "GREATER_THAN",
    };
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
  if (filters.duration?.min || filters.duration?.max) {
    sceneFilter.duration = {};
    if (filters.duration.min) sceneFilter.duration.value = parseInt(filters.duration.min) * 60;
    sceneFilter.duration.modifier = filters.duration.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.duration.max) sceneFilter.duration.value2 = parseInt(filters.duration.max) * 60;
  }

  if (filters.playDuration?.min || filters.playDuration?.max) {
    sceneFilter.play_duration = {};
    if (filters.playDuration.min) sceneFilter.play_duration.value = parseInt(filters.playDuration.min) * 60;
    sceneFilter.play_duration.modifier = filters.playDuration.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.playDuration.max) sceneFilter.play_duration.value2 = parseInt(filters.playDuration.max) * 60;
  }

  if (filters.oCount?.min || filters.oCount?.max) {
    sceneFilter.o_counter = {};
    if (filters.oCount.min) sceneFilter.o_counter.value = parseInt(filters.oCount.min);
    sceneFilter.o_counter.modifier = filters.oCount.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.oCount.max) sceneFilter.o_counter.value2 = parseInt(filters.oCount.max);
  }

  if (filters.playCount?.min || filters.playCount?.max) {
    sceneFilter.play_count = {};
    if (filters.playCount.min) sceneFilter.play_count.value = parseInt(filters.playCount.min);
    sceneFilter.play_count.modifier = filters.playCount.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.playCount.max) sceneFilter.play_count.value2 = parseInt(filters.playCount.max);
  }

  if (filters.bitrate?.min || filters.bitrate?.max) {
    sceneFilter.bitrate = {};
    if (filters.bitrate.min) sceneFilter.bitrate.value = parseInt(filters.bitrate.min) * 1000000; // Convert Mbps to bps
    sceneFilter.bitrate.modifier = filters.bitrate.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.bitrate.max) sceneFilter.bitrate.value2 = parseInt(filters.bitrate.max) * 1000000;
  }

  if (filters.framerate?.min || filters.framerate?.max) {
    sceneFilter.framerate = {};
    if (filters.framerate.min) sceneFilter.framerate.value = parseInt(filters.framerate.min);
    sceneFilter.framerate.modifier = filters.framerate.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.framerate.max) sceneFilter.framerate.value2 = parseInt(filters.framerate.max);
  }

  if (filters.performerCount?.min || filters.performerCount?.max) {
    sceneFilter.performer_count = {};
    if (filters.performerCount.min) sceneFilter.performer_count.value = parseInt(filters.performerCount.min);
    sceneFilter.performer_count.modifier = filters.performerCount.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.performerCount.max) sceneFilter.performer_count.value2 = parseInt(filters.performerCount.max);
  }

  if (filters.performerAge?.min || filters.performerAge?.max) {
    sceneFilter.performer_age = {};
    if (filters.performerAge.min) sceneFilter.performer_age.value = parseInt(filters.performerAge.min);
    sceneFilter.performer_age.modifier = filters.performerAge.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.performerAge.max) sceneFilter.performer_age.value2 = parseInt(filters.performerAge.max);
  }

  if (filters.tagCount?.min || filters.tagCount?.max) {
    sceneFilter.tag_count = {};
    if (filters.tagCount.min) sceneFilter.tag_count.value = parseInt(filters.tagCount.min);
    sceneFilter.tag_count.modifier = filters.tagCount.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.tagCount.max) sceneFilter.tag_count.value2 = parseInt(filters.tagCount.max);
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

  if (filters.rating) {
    performerFilter.rating100 = {
      value: parseInt(filters.rating) * 20,
      modifier: "GREATER_THAN",
    };
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

  if (filters.oCounter?.min || filters.oCounter?.max) {
    performerFilter.o_counter = {};
    if (filters.oCounter.min) performerFilter.o_counter.value = parseInt(filters.oCounter.min);
    performerFilter.o_counter.modifier = filters.oCounter.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.oCounter.max) performerFilter.o_counter.value2 = parseInt(filters.oCounter.max);
  }

  if (filters.playCount?.min || filters.playCount?.max) {
    performerFilter.play_count = {};
    if (filters.playCount.min) performerFilter.play_count.value = parseInt(filters.playCount.min);
    performerFilter.play_count.modifier = filters.playCount.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.playCount.max) performerFilter.play_count.value2 = parseInt(filters.playCount.max);
  }

  if (filters.sceneCount?.min || filters.sceneCount?.max) {
    performerFilter.scene_count = {};
    if (filters.sceneCount.min) performerFilter.scene_count.value = parseInt(filters.sceneCount.min);
    performerFilter.scene_count.modifier = filters.sceneCount.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.sceneCount.max) performerFilter.scene_count.value2 = parseInt(filters.sceneCount.max);
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

  // Rating filter
  if (filters.rating) {
    studioFilter.rating100 = {
      value: parseInt(filters.rating) * 20,
      modifier: "GREATER_THAN",
    };
  }

  // Range filter
  if (filters.sceneCount?.min || filters.sceneCount?.max) {
    studioFilter.scene_count = {};
    if (filters.sceneCount.min) studioFilter.scene_count.value = parseInt(filters.sceneCount.min);
    studioFilter.scene_count.modifier = filters.sceneCount.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.sceneCount.max) studioFilter.scene_count.value2 = parseInt(filters.sceneCount.max);
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

  // Range filter
  if (filters.sceneCount?.min || filters.sceneCount?.max) {
    tagFilter.scene_count = {};
    if (filters.sceneCount.min) tagFilter.scene_count.value = parseInt(filters.sceneCount.min);
    tagFilter.scene_count.modifier = filters.sceneCount.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.sceneCount.max) tagFilter.scene_count.value2 = parseInt(filters.sceneCount.max);
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
