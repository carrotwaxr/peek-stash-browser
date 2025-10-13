/**
 * Sorting and filtering configuration for all entity types
 */

// Scene sorting options
export const SCENE_SORT_OPTIONS = [
  { value: "TITLE", label: "Title" },
  { value: "DATE", label: "Date" },
  { value: "CREATED_AT", label: "Created At" },
  { value: "UPDATED_AT", label: "Updated At" },
  { value: "RATING", label: "Rating" },
  { value: "O_COUNTER", label: "O Count" },
  { value: "PLAY_COUNT", label: "Play Count" },
  { value: "PLAY_DURATION", label: "Play Duration" },
  { value: "DURATION", label: "Duration" },
  { value: "FILESIZE", label: "File Size" },
  { value: "BITRATE", label: "Bit Rate" },
  { value: "FRAMERATE", label: "Frame Rate" },
  { value: "PERFORMER_COUNT", label: "Performer Count" },
  { value: "TAG_COUNT", label: "Tag Count" },
  { value: "LAST_PLAYED_AT", label: "Last Played At" },
  { value: "LAST_O_AT", label: "Last O At" },
  { value: "RANDOM", label: "Random" },
];

// Performer sorting options
export const PERFORMER_SORT_OPTIONS = [
  { value: "NAME", label: "Name" },
  { value: "BIRTHDATE", label: "Birthdate" },
  { value: "CREATED_AT", label: "Created At" },
  { value: "UPDATED_AT", label: "Updated At" },
  { value: "HEIGHT", label: "Height" },
  { value: "WEIGHT", label: "Weight" },
  { value: "RATING", label: "Rating" },
  { value: "O_COUNTER", label: "O Count" },
  { value: "PLAY_COUNT", label: "Play Count" },
  { value: "SCENE_COUNT", label: "Scene Count" },
  { value: "PENIS_LENGTH", label: "Penis Length" },
  { value: "RANDOM", label: "Random" },
];

// Studio sorting options
export const STUDIO_SORT_OPTIONS = [
  { value: "NAME", label: "Name" },
  { value: "CREATED_AT", label: "Created At" },
  { value: "UPDATED_AT", label: "Updated At" },
  { value: "RATING", label: "Rating" },
  { value: "SCENE_COUNT", label: "Scene Count" },
  { value: "RANDOM", label: "Random" },
];

// Tag sorting options
export const TAG_SORT_OPTIONS = [
  { value: "NAME", label: "Name" },
  { value: "CREATED_AT", label: "Created At" },
  { value: "UPDATED_AT", label: "Updated At" },
  { value: "SCENE_COUNT", label: "Scene Count" },
  { value: "RANDOM", label: "Random" },
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
  const sceneFilter = {};

  if (filters.rating) {
    sceneFilter.rating = {
      value: parseInt(filters.rating) * 20, // Convert 1-5 to 20-100 scale
      modifier: "EQUALS",
    };
  }

  if (filters.duration?.min || filters.duration?.max) {
    sceneFilter.duration = {};
    if (filters.duration.min)
      sceneFilter.duration.value = parseInt(filters.duration.min) * 60;
    sceneFilter.duration.modifier = filters.duration.max
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.duration.max)
      sceneFilter.duration.value2 = parseInt(filters.duration.max) * 60;
  }

  if (filters.oCount?.min || filters.oCount?.max) {
    sceneFilter.o_counter = {};
    if (filters.oCount.min)
      sceneFilter.o_counter.value = parseInt(filters.oCount.min);
    sceneFilter.o_counter.modifier = filters.oCount.max
      ? "BETWEEN"
      : "GREATER_THAN";
    if (filters.oCount.max)
      sceneFilter.o_counter.value2 = parseInt(filters.oCount.max);
  }

  if (filters.organized) {
    sceneFilter.organized = filters.organized === "TRUE";
  }

  if (filters.resolution) {
    const height = parseInt(filters.resolution);
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
