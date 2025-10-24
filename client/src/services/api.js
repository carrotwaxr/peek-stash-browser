/**
 * API service for interacting with the Peek backend
 * Provides functions for all library endpoints with proper error handling
 */

const API_BASE_URL = "/api";

/**
 * Base fetch wrapper with error handling
 */
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const config = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

/**
 * GET request wrapper
 */
async function apiGet(endpoint) {
  return apiFetch(endpoint, { method: "GET" });
}

/**
 * POST request wrapper
 */
async function apiPost(endpoint, data) {
  return apiFetch(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * PUT request wrapper
 */
async function apiPut(endpoint, data) {
  return apiFetch(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * DELETE request wrapper
 */
async function apiDelete(endpoint) {
  return apiFetch(endpoint, {
    method: "DELETE",
  });
}

// Export API helper functions
export { apiGet, apiPost, apiPut, apiDelete };

// New filtered search API endpoints
export const libraryApi = {
  /**
   * Search scenes with filtering and pagination
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @param {Object} params.scene_filter - Scene-specific filters
   * @param {Array<string>} params.ids - Specific scene IDs to fetch
   */
  findScenes: (params = {}) => {
    return apiPost("/library/scenes", params);
  },

  /**
   * Search performers with filtering and pagination
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @param {Object} params.performer_filter - Performer-specific filters
   */
  findPerformers: (params = {}) => {
    return apiPost("/library/performers", params);
  },

  /**
   * Search studios with filtering and pagination
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @param {Object} params.studio_filter - Studio-specific filters
   */
  findStudios: (params = {}) => {
    return apiPost("/library/studios", params);
  },

  /**
   * Search tags with filtering and pagination
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @param {Object} params.tag_filter - Tag-specific filters
   */
  findTags: (params = {}) => {
    return apiPost("/library/tags", params);
  },

  /**
   * Find a single performer by ID
   * @param {string} id - Performer ID
   * @returns {Promise<Object|null>} Performer object or null if not found
   */
  findPerformerById: async (id) => {
    const result = await apiPost("/library/performers", { ids: [id] });
    return result?.findPerformers?.performers?.[0] || null;
  },

  /**
   * Find a single scene by ID
   * @param {string} id - Scene ID
   * @returns {Promise<Object|null>} Scene object or null if not found
   */
  findSceneById: async (id) => {
    const result = await apiPost("/library/scenes", { ids: [id] });
    return result?.findScenes?.scenes?.[0] || null;
  },

  /**
   * Find a single studio by ID
   * @param {string} id - Studio ID
   * @returns {Promise<Object|null>} Studio object or null if not found
   */
  findStudioById: async (id) => {
    const result = await apiPost("/library/studios", { ids: [id] });
    return result?.findStudios?.studios?.[0] || null;
  },

  /**
   * Find a single tag by ID
   * @param {string} id - Tag ID
   * @returns {Promise<Object|null>} Tag object or null if not found
   */
  findTagById: async (id) => {
    const result = await apiPost("/library/tags", { ids: [id] });
    return result?.findTags?.tags?.[0] || null;
  },

  /**
   * Find performers with minimal data (id + name only)
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @returns {Promise<Array>} Array of {id, name} objects
   */
  findPerformersMinimal: async (params = {}) => {
    const result = await apiPost("/library/performers/minimal", params);
    return result?.performers || [];
  },

  /**
   * Find studios with minimal data (id + name only)
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @returns {Promise<Array>} Array of {id, name} objects
   */
  findStudiosMinimal: async (params = {}) => {
    const result = await apiPost("/library/studios/minimal", params);
    return result?.studios || [];
  },

  /**
   * Find tags with minimal data (id + name only)
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @returns {Promise<Array>} Array of {id, name} objects
   */
  findTagsMinimal: async (params = {}) => {
    const result = await apiPost("/library/tags/minimal", params);
    return result?.tags || [];
  },
};

// Valid sort field mappings for Stash GraphQL API
export const sortFieldMap = {
  // Scene sort fields
  TITLE: "title",
  DATE: "date",
  CREATED_AT: "created_at",
  UPDATED_AT: "updated_at",
  RATING: "rating100",
  O_COUNTER: "o_counter",
  PLAY_COUNT: "play_count",
  PLAY_DURATION: "play_duration",
  DURATION: "duration",
  FILESIZE: "filesize",
  BITRATE: "bitrate",
  FRAMERATE: "framerate",
  PERFORMER_COUNT: "performer_count",
  TAG_COUNT: "tag_count",
  LAST_PLAYED_AT: "last_played_at",
  LAST_O_AT: "last_o_at",
  RANDOM: "random",

  // Performer sort fields
  NAME: "name",
  BIRTHDATE: "birthdate",
  HEIGHT: "height_cm",
  WEIGHT: "weight",
  PENIS_LENGTH: "penis_length",
  SCENE_COUNT: "scene_count",

  // Studio sort fields (reusing scene field names where applicable)

  // Tag sort fields (reusing scene field names where applicable)
};

// Helper functions for common filtering patterns
export const filterHelpers = {
  /**
   * Create basic pagination filter
   */
  pagination: (page = 1, perPage = 24, sort = null, direction = "ASC") => {
    const filter = {
      page,
      per_page: perPage,
    };

    if (sort) {
      filter.sort = sort;
      filter.direction = direction;
    }
    return filter;
  },

  /**
   * Create text search filter
   */
  textSearch: (query, page = 1, perPage = 24) => ({
    q: query,
    page,
    per_page: perPage,
  }),

  /**
   * Create rating filter for scenes
   */
  ratingFilter: (minRating, modifier = "GREATER_THAN") => ({
    rating100: {
      modifier,
      value: minRating,
    },
  }),
};

// Predefined filter combinations for common use cases
export const commonFilters = {
  /**
   * Get high-rated scenes
   */
  highRatedScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "random", "ASC"),
    scene_filter: filterHelpers.ratingFilter(80),
  }),

  /**
   * Get recently added scenes
   */
  recentlyAddedScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "created_at", "DESC"),
    scene_filter: {},
  }),

  /** Get highest bitrate scenes
   */
  highBitrateScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "random", "ASC"),
    scene_filter: {
      bitrate: { modifier: "GREATER_THAN", value: 14000000 },
    },
  }),

  /** Get barely legal scenes
   */
  barelyLegalScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "random", "ASC"),
    scene_filter: { performer_age: { modifier: "EQUALS", value: 18 } },
  }),

  /** Get barely legal scenes
   */
  favoritePerformerScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "random", "ASC"),
    scene_filter: { performer_favorite: true },
  }),

  /**
   * Get long scenes (over 30 minutes)
   */
  longScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "random", "ASC"),
    scene_filter: {
      duration: { modifier: "GREATER_THAN", value: 4800 },
    },
  }),

  /**
   * Search scenes by text
   */
  searchScenes: (query, page = 1, perPage = 24) => ({
    filter: filterHelpers.textSearch(query, page, perPage),
    scene_filter: {},
  }),

  /**
   * Get favorite performers
   */
  favoritePerformers: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "o_counter", "DESC"),
    performer_filter: { favorite: true },
  }),

  /**
   * Search performers by text
   */
  searchPerformers: (query, page = 1, perPage = 24) => ({
    filter: filterHelpers.textSearch(query, page, perPage),
    performer_filter: {},
  }),

  /**
   * Get favorite studios
   */
  favoriteStudios: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "scenes_count", "DESC"),
    studio_filter: { favorite: true },
  }),

  /**
   * Get favorite tags
   */
  favoriteTags: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "scenes_count", "DESC"),
    tag_filter: { favorite: true },
  }),
};

// Setup wizard API endpoints
export const setupApi = {
  /**
   * Get setup status
   * @returns {Promise<{setupComplete: boolean, mappingCount: number, mappings: Array}>}
   */
  getSetupStatus: () => apiGet("/setup/status"),

  /**
   * Discover Stash library paths via GraphQL
   * @returns {Promise<{success: boolean, libraries: Array, paths: Array<string>}>}
   */
  discoverStashLibraries: () => apiGet("/setup/discover-libraries"),

  /**
   * Test if a path exists and is readable
   * @param {string} path - Path to test
   * @returns {Promise<{success: boolean, exists: boolean, readable: boolean, isDirectory: boolean, fileCount: number|null, message: string}>}
   */
  testPath: (path) => apiPost("/setup/test-path", { path }),

  /**
   * Get all configured path mappings
   * @returns {Promise<{mappings: Array}>}
   */
  getPathMappings: () => apiGet("/setup/path-mappings"),

  /**
   * Add a new path mapping
   * @param {string} stashPath - Path as reported by Stash
   * @param {string} peekPath - Path where Peek accesses the files
   * @returns {Promise<{success: boolean, mapping: Object}>}
   */
  addPathMapping: (stashPath, peekPath) =>
    apiPost("/setup/path-mappings", { stashPath, peekPath }),

  /**
   * Update an existing path mapping
   * @param {number} id - Mapping ID
   * @param {string} stashPath - Path as reported by Stash
   * @param {string} peekPath - Path where Peek accesses the files
   * @returns {Promise<{success: boolean, mapping: Object}>}
   */
  updatePathMapping: (id, stashPath, peekPath) =>
    apiFetch(`/setup/path-mappings/${id}`, {
      method: "PUT",
      body: JSON.stringify({ stashPath, peekPath }),
    }),

  /**
   * Delete a path mapping
   * @param {number} id - Mapping ID
   * @returns {Promise<{success: boolean}>}
   */
  deletePathMapping: (id) => apiDelete(`/setup/path-mappings/${id}`),
};

/**
 * Rating and favorite API endpoints
 */
export const ratingsApi = {
  /**
   * Update rating and/or favorite for a scene
   * @param {string} sceneId - Scene ID
   * @param {Object} data - Rating data
   * @param {number|null} data.rating - Rating value (0-100) or null
   * @param {boolean} data.favorite - Favorite status
   * @returns {Promise<{success: boolean, rating: Object}>}
   */
  updateSceneRating: (sceneId, data) => apiPut(`/ratings/scene/${sceneId}`, data),

  /**
   * Update rating and/or favorite for a performer
   * @param {string} performerId - Performer ID
   * @param {Object} data - Rating data
   * @param {number|null} data.rating - Rating value (0-100) or null
   * @param {boolean} data.favorite - Favorite status
   * @returns {Promise<{success: boolean, rating: Object}>}
   */
  updatePerformerRating: (performerId, data) => apiPut(`/ratings/performer/${performerId}`, data),

  /**
   * Update rating and/or favorite for a studio
   * @param {string} studioId - Studio ID
   * @param {Object} data - Rating data
   * @param {number|null} data.rating - Rating value (0-100) or null
   * @param {boolean} data.favorite - Favorite status
   * @returns {Promise<{success: boolean, rating: Object}>}
   */
  updateStudioRating: (studioId, data) => apiPut(`/ratings/studio/${studioId}`, data),

  /**
   * Update rating and/or favorite for a tag
   * @param {string} tagId - Tag ID
   * @param {Object} data - Rating data
   * @param {number|null} data.rating - Rating value (0-100) or null
   * @param {boolean} data.favorite - Favorite status
   * @returns {Promise<{success: boolean, rating: Object}>}
   */
  updateTagRating: (tagId, data) => apiPut(`/ratings/tag/${tagId}`, data),
};
