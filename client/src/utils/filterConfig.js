/**
 * Sorting and filtering configuration for all entity types
 */

// Scene sorting options
export const SCENE_SORT_OPTIONS = [
  { value: "title", label: "Title" },
  { value: "date", label: "Date" },
  { value: "created_at", label: "Created At" },
  { value: "updated_at", label: "Updated At" },
  { value: "rating", label: "Rating" },
  { value: "o_counter", label: "O Count" },
  { value: "play_count", label: "Play Count" },
  { value: "play_duration", label: "Play Duration" },
  { value: "duration", label: "Duration" },
  { value: "filesize", label: "File Size" },
  { value: "bitrate", label: "Bit Rate" },
  { value: "framerate", label: "Frame Rate" },
  { value: "performer_count", label: "Performer Count" },
  { value: "tag_count", label: "Tag Count" },
  { value: "last_played_at", label: "Last Played At" },
  { value: "last_o_at", label: "Last O At" },
  { value: "random", label: "Random" },
];

// Performer sorting options
export const PERFORMER_SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "birthdate", label: "Birthdate" },
  { value: "created_at", label: "Created At" },
  { value: "updated_at", label: "Updated At" },
  { value: "height", label: "Height" },
  { value: "weight", label: "Weight" },
  { value: "rating", label: "Rating" },
  { value: "o_counter", label: "O Count" },
  { value: "play_count", label: "Play Count" },
  { value: "scene_count", label: "Scene Count" },
  { value: "penis_length", label: "Penis Length" },
  { value: "random", label: "Random" },
];

// Studio sorting options
export const STUDIO_SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "created_at", label: "Created At" },
  { value: "updated_at", label: "Updated At" },
  { value: "rating", label: "Rating" },
  { value: "scene_count", label: "Scene Count" },
  { value: "random", label: "Random" },
];

// Tag sorting options
export const TAG_SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "created_at", label: "Created At" },
  { value: "updated_at", label: "Updated At" },
  { value: "scene_count", label: "Scene Count" },
  { value: "random", label: "Random" },
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

/**
 * Helper functions to convert UI filter values to GraphQL filter format
 */

export const buildSceneFilter = (filters) => {
  const {
    duration,
    oCount,
    organized,
    rating,
    resolution,
    ...straightThruFilters
  } = filters;

  const sceneFilter = { ...straightThruFilters };

  if (rating) {
    sceneFilter.rating = {
      value: parseInt(rating) * 20, // Convert 1-5 to 20-100 scale
      modifier: "EQUALS",
    };
  }

  if (duration?.min || duration?.max) {
    sceneFilter.duration = {};
    if (duration.min) sceneFilter.duration.value = parseInt(duration.min) * 60;
    sceneFilter.duration.modifier = duration.max ? "BETWEEN" : "GREATER_THAN";
    if (duration.max) sceneFilter.duration.value2 = parseInt(duration.max) * 60;
  }

  if (oCount?.min || oCount?.max) {
    sceneFilter.o_counter = {};
    if (oCount.min) sceneFilter.o_counter.value = parseInt(oCount.min);
    sceneFilter.o_counter.modifier = oCount.max ? "BETWEEN" : "GREATER_THAN";
    if (oCount.max) sceneFilter.o_counter.value2 = parseInt(oCount.max);
  }

  if (organized) {
    sceneFilter.organized = organized === "TRUE";
  }

  if (resolution) {
    const height = parseInt(resolution);
    sceneFilter.resolution = {
      value: `${height}p`,
      modifier: "EQUALS",
    };
  }

  return sceneFilter;
};

export const buildPerformerFilter = (filters) => {
  const performerFilter = {};

  if (filters.gender) {
    performerFilter.gender = {
      value: filters.gender,
      modifier: "EQUALS",
    };
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

  if (filters.age?.min || filters.age?.max) {
    performerFilter.age = {};
    if (filters.age.min) performerFilter.age.value = parseInt(filters.age.min);
    performerFilter.age.modifier = filters.age.max ? "BETWEEN" : "GREATER_THAN";
    if (filters.age.max) performerFilter.age.value2 = parseInt(filters.age.max);
  }

  if (filters.minAge) {
    performerFilter.age = {
      value: parseInt(filters.minAge),
      modifier: "GREATER_THAN",
    };
  }

  if (filters.height?.min || filters.height?.max) {
    performerFilter.height_cm = {};
    if (filters.height.min)
      performerFilter.height_cm.value = parseInt(filters.height.min);
    performerFilter.height_cm.modifier = filters.height.max
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.height.max)
      performerFilter.height_cm.value2 = parseInt(filters.height.max);
  }

  if (filters.fakeTits) {
    performerFilter.fake_tits = {
      value: filters.fakeTits,
      modifier: "EQUALS",
    };
  }

  if (filters.favorite) {
    performerFilter.favorite = filters.favorite === "TRUE";
  }

  return performerFilter;
};

export const buildStudioFilter = (filters) => {
  const studioFilter = {};

  if (filters.rating) {
    studioFilter.rating = {
      value: parseInt(filters.rating) * 20,
      modifier: "EQUALS",
    };
  }

  if (filters.favorite) {
    studioFilter.favorite = filters.favorite === "TRUE";
  }

  if (filters.sceneCount) {
    studioFilter.scene_count = {
      value: parseInt(filters.sceneCount),
      modifier: "GREATER_THAN",
    };
  }

  return studioFilter;
};

export const buildTagFilter = (filters) => {
  const tagFilter = {};

  if (filters.favorite) {
    tagFilter.favorite = filters.favorite === "TRUE";
  }

  if (filters.sceneCount) {
    tagFilter.scene_count = {
      value: parseInt(filters.sceneCount),
      modifier: "GREATER_THAN",
    };
  }

  return tagFilter;
};
