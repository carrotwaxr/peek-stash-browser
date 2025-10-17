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
};

// Video playback API endpoints
export const videoApi = {
  /**
   * Start video playback
   */
  playVideo: (videoId, params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiGet(`/video/play?videoId=${videoId}&${queryString}`);
  },

  /**
   * Seek to a specific time in video
   */
  seekVideo: (data) => apiPost("/video/seek", data),

  /**
   * Get session status
   */
  getSessionStatus: (sessionId) => apiGet(`/video/session/${sessionId}/status`),

  /**
   * Kill a video session
   */
  killSession: (sessionId) =>
    apiFetch(`/video/session/${sessionId}`, { method: "DELETE" }),
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
    // Map sort field to correct GraphQL field name and add if valid
    if (sort && sortFieldMap[sort]) {
      filter.sort = sortFieldMap[sort];
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

  /**
   * Create favorite filter
   */
  favoriteFilter: () => ({
    performer_favorite: true,
  }),

  /**
   * Create date range filter
   */
  dateRangeFilter: (startDate, endDate) => ({
    date: {
      modifier: "BETWEEN",
      value: startDate,
      value2: endDate,
    },
  }),

  /**
   * Create duration filter for scenes (in seconds)
   */
  durationFilter: (minDuration, modifier = "GREATER_THAN") => ({
    duration: {
      modifier,
      value: minDuration,
    },
  }),
};

// Predefined filter combinations for common use cases
export const commonFilters = {
  /**
   * Get high-rated scenes
   */
  highRatedScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "rating100", "DESC"),
    scene_filter: filterHelpers.ratingFilter(80),
  }),

  /**
   * Get recently added scenes
   */
  recentScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "created_at", "DESC"),
    scene_filter: {},
  }),

  /**
   * Get favorite performers
   */
  favoritePerformers: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "name", "ASC"),
    performer_filter: { favorite: true },
  }),

  /**
   * Get long scenes (over 30 minutes)
   */
  longScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "duration", "DESC"),
    scene_filter: filterHelpers.durationFilter(1800), // 30 minutes in seconds
  }),

  /**
   * Search scenes by text
   */
  searchScenes: (query, page = 1, perPage = 24) => ({
    filter: filterHelpers.textSearch(query, page, perPage),
    scene_filter: {},
  }),

  /**
   * Search performers by text
   */
  searchPerformers: (query, page = 1, perPage = 24) => ({
    filter: filterHelpers.textSearch(query, page, perPage),
    performer_filter: {},
  }),
};
