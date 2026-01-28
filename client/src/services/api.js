/**
 * API service for interacting with the Peek backend
 * Provides functions for all library endpoints with proper error handling
 */

const API_BASE_URL = "/api";
const REDIRECT_STORAGE_KEY = "peek_auth_redirect";

// Flag to prevent multiple simultaneous redirects to login.
// This flag is never reset because the page does a full navigation (window.location.href),
// which destroys the JavaScript context. If this ever changes to SPA-style navigation,
// the flag would need to be reset after successful login.
let isRedirectingToLogin = false;

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

  let response;
  try {
    response = await fetch(url, config);
  } catch (err) {
    // Re-throw AbortError so it can be caught by useCancellableQuery
    if (err.name === "AbortError") {
      throw err;
    }
    throw err;
  }

  if (!response.ok) {
    // Try to parse error response body
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: `HTTP error! status: ${response.status}` };
    }

    // Handle auth failures (401/403) - redirect to login
    // Exclude auth endpoints to avoid redirect loops
    const isAuthEndpoint = endpoint.startsWith("/auth/");
    if ((response.status === 401 || response.status === 403) && !isAuthEndpoint && !isRedirectingToLogin) {
      isRedirectingToLogin = true;
      // Save current URL for redirect after login
      const currentUrl = window.location.pathname + window.location.search;
      if (currentUrl !== "/login" && currentUrl !== "/setup") {
        sessionStorage.setItem(REDIRECT_STORAGE_KEY, currentUrl);
      }
      window.location.href = "/login";
      // Return a never-resolving promise to prevent further processing
      return new Promise(() => {});
    }

    // Create error with additional metadata
    const error = new Error(
      errorData.error ||
        errorData.message ||
        `HTTP error! status: ${response.status}`
    );
    error.status = response.status;
    error.data = errorData;

    // Special handling for 503 - server initializing
    if (response.status === 503 && errorData.ready === false) {
      error.isInitializing = true;
    }

    throw error;
  }

  return await response.json();
}

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

// Export redirect storage key for use by Login component
export { REDIRECT_STORAGE_KEY };

// New filtered search API endpoints
export const libraryApi = {
  /**
   * Search scenes with filtering and pagination
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @param {Object} params.scene_filter - Scene-specific filters
   * @param {Array<string>} params.ids - Specific scene IDs to fetch
   */
  findScenes: (params = {}, signal) => {
    return apiFetch("/library/scenes", { method: "POST", body: JSON.stringify(params), signal });
  },

  /**
   * Search performers with filtering and pagination
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @param {Object} params.performer_filter - Performer-specific filters
   */
  findPerformers: (params = {}, signal) => {
    return apiFetch("/library/performers", { method: "POST", body: JSON.stringify(params), signal });
  },

  /**
   * Search studios with filtering and pagination
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @param {Object} params.studio_filter - Studio-specific filters
   */
  findStudios: (params = {}, signal) => {
    return apiFetch("/library/studios", { method: "POST", body: JSON.stringify(params), signal });
  },

  /**
   * Search tags with filtering and pagination
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @param {Object} params.tag_filter - Tag-specific filters
   */
  findTags: (params = {}, signal) => {
    return apiFetch("/library/tags", { method: "POST", body: JSON.stringify(params), signal });
  },

  /**
   * Find a single performer by ID
   * @param {string} id - Performer ID
   * @param {string|null} instanceId - Optional Stash instance ID
   * @returns {Promise<Object|null>} Performer object or null if not found
   */
  findPerformerById: async (id, instanceId = null) => {
    const params = { ids: [id] };
    if (instanceId) {
      params.performer_filter = { instance_id: instanceId };
    }
    const result = await apiPost("/library/performers", params);
    return result?.findPerformers?.performers?.[0] || null;
  },

  /**
   * Find a single scene by ID
   * @param {string} id - Scene ID
   * @param {string|null} instanceId - Optional Stash instance ID
   * @returns {Promise<Object|null>} Scene object or null if not found
   */
  findSceneById: async (id, instanceId = null) => {
    const params = { ids: [id] };
    if (instanceId) {
      params.scene_filter = { instance_id: instanceId };
    }
    const result = await apiPost("/library/scenes", params);
    return result?.findScenes?.scenes?.[0] || null;
  },

  /**
   * Find a single studio by ID
   * @param {string} id - Studio ID
   * @param {string|null} instanceId - Optional Stash instance ID
   * @returns {Promise<Object|null>} Studio object or null if not found
   */
  findStudioById: async (id, instanceId = null) => {
    const params = { ids: [id] };
    if (instanceId) {
      params.studio_filter = { instance_id: instanceId };
    }
    const result = await apiPost("/library/studios", params);
    return result?.findStudios?.studios?.[0] || null;
  },

  /**
   * Find a single tag by ID
   * @param {string} id - Tag ID
   * @param {string|null} instanceId - Optional Stash instance ID
   * @returns {Promise<Object|null>} Tag object or null if not found
   */
  findTagById: async (id, instanceId = null) => {
    const params = { ids: [id] };
    if (instanceId) {
      params.tag_filter = { instance_id: instanceId };
    }
    const result = await apiPost("/library/tags", params);
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

  /**
   * Search galleries with filtering and pagination
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @param {Object} params.gallery_filter - Gallery-specific filters
   */
  findGalleries: (params = {}, signal) => {
    return apiFetch("/library/galleries", { method: "POST", body: JSON.stringify(params), signal });
  },

  /**
   * Find a single gallery by ID
   * @param {string} id - Gallery ID
   * @param {string|null} instanceId - Optional Stash instance ID
   * @returns {Promise<Object|null>} Gallery object or null if not found
   */
  findGalleryById: async (id, instanceId = null) => {
    const params = { ids: [id] };
    if (instanceId) {
      params.gallery_filter = { instance_id: instanceId };
    }
    const result = await apiPost("/library/galleries", params);
    return result?.findGalleries?.galleries?.[0] || null;
  },

  /**
   * Get images for a gallery with optional pagination
   * @param {string} galleryId - Gallery ID
   * @param {Object} options - Pagination options
   * @param {number} options.page - Page number (1-indexed)
   * @param {number} options.per_page - Items per page (0 = all)
   * @param {string|null} options.instanceId - Optional Stash instance ID
   * @returns {Promise<Object>} Object with images array, count, and pagination metadata
   */
  getGalleryImages: async (galleryId, { page = 1, per_page = 0, instanceId = null } = {}) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", page.toString());
    if (per_page > 0) params.set("per_page", per_page.toString());
    if (instanceId) params.set("instance", instanceId);
    const queryString = params.toString();
    const url = `/library/galleries/${galleryId}/images${queryString ? `?${queryString}` : ""}`;
    return apiGet(url);
  },

  /**
   * Search groups with filtering and pagination
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @param {Object} params.group_filter - Group-specific filters
   */
  findGroups: (params = {}, signal) => {
    return apiFetch("/library/groups", { method: "POST", body: JSON.stringify(params), signal });
  },

  /**
   * Find a single group by ID
   * @param {string} id - Group ID
   * @param {string|null} instanceId - Optional Stash instance ID
   * @returns {Promise<Object|null>} Group object or null if not found
   */
  findGroupById: async (id, instanceId = null) => {
    const params = { ids: [id] };
    if (instanceId) {
      params.group_filter = { instance_id: instanceId };
    }
    const result = await apiPost("/library/groups", params);
    return result?.findGroups?.groups?.[0] || null;
  },

  /**
   * Find groups with minimal data (id + name only)
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @returns {Promise<Array>} Array of {id, name} objects
   */
  findGroupsMinimal: async (params = {}) => {
    const result = await apiPost("/library/groups/minimal", params);
    return result?.groups || [];
  },

  /**
   * Find galleries with minimal data (id + name only)
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @returns {Promise<Array>} Array of {id, name} objects
   */
  findGalleriesMinimal: async (params = {}) => {
    const result = await apiPost("/library/galleries/minimal", params);
    return result?.galleries || [];
  },

  /**
   * Search images with filtering and pagination
   * @param {Object} params - Search parameters
   * @param {Object} params.filter - General filters (pagination, search, sort)
   * @param {Object} params.image_filter - Image-specific filters
   */
  findImages: (params = {}, signal) => {
    return apiFetch("/library/images", { method: "POST", body: JSON.stringify(params), signal });
  },

  /**
   * Update rating for any entity type
   * @param {string} entityType - Entity type (scene, performer, tag, studio, gallery, group)
   * @param {string} entityId - Entity ID
   * @param {number|null} rating - Rating value (0-100) or null to clear
   * @param {string|null} instanceId - Optional Stash instance ID for multi-instance support
   * @returns {Promise<Object>} Updated rating object
   */
  updateRating: async (entityType, entityId, rating, instanceId = null) => {
    const methodMap = {
      scene: ratingsApi.updateSceneRating,
      performer: ratingsApi.updatePerformerRating,
      tag: ratingsApi.updateTagRating,
      studio: ratingsApi.updateStudioRating,
      gallery: ratingsApi.updateGalleryRating,
      group: ratingsApi.updateGroupRating,
      image: ratingsApi.updateImageRating,
    };

    const method = methodMap[entityType.toLowerCase()];
    if (!method) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    const data = { rating };
    if (instanceId) {
      data.instanceId = instanceId;
    }
    return method(entityId, data);
  },

  /**
   * Update favorite status for any entity type
   * @param {string} entityType - Entity type (scene, performer, tag, studio, gallery, group, image)
   * @param {string} entityId - Entity ID
   * @param {boolean} favorite - Favorite status
   * @param {string|null} instanceId - Optional Stash instance ID for multi-instance support
   * @returns {Promise<Object>} Updated favorite object
   */
  updateFavorite: async (entityType, entityId, favorite, instanceId = null) => {
    const methodMap = {
      scene: ratingsApi.updateSceneRating,
      performer: ratingsApi.updatePerformerRating,
      tag: ratingsApi.updateTagRating,
      studio: ratingsApi.updateStudioRating,
      gallery: ratingsApi.updateGalleryRating,
      group: ratingsApi.updateGroupRating,
      image: ratingsApi.updateImageRating,
    };

    const method = methodMap[entityType.toLowerCase()];
    if (!method) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    const data = { favorite };
    if (instanceId) {
      data.instanceId = instanceId;
    }
    return method(entityId, data);
  },

  // ============================================================================
  // CUSTOM CAROUSELS
  // ============================================================================

  /**
   * Get all custom carousels for the current user
   * @returns {Promise<{carousels: Array}>}
   */
  getCarousels: () => apiGet("/carousels"),

  /**
   * Get a single carousel by ID
   * @param {string} id - Carousel ID
   * @returns {Promise<{carousel: Object}>}
   */
  getCarousel: (id) => apiGet(`/carousels/${id}`),

  /**
   * Create a new custom carousel
   * @param {Object} data - Carousel data
   * @param {string} data.title - Carousel title
   * @param {string} data.icon - Lucide icon name
   * @param {Object} data.rules - Filter rules (buildSceneFilter output format)
   * @param {string} data.sort - Sort field
   * @param {string} data.direction - Sort direction (ASC/DESC)
   * @returns {Promise<{carousel: Object}>}
   */
  createCarousel: (data) => apiPost("/carousels", data),

  /**
   * Update an existing carousel
   * @param {string} id - Carousel ID
   * @param {Object} data - Updated carousel data
   * @returns {Promise<{carousel: Object}>}
   */
  updateCarousel: (id, data) => apiPut(`/carousels/${id}`, data),

  /**
   * Delete a carousel
   * @param {string} id - Carousel ID
   * @returns {Promise<{success: boolean, message: string}>}
   */
  deleteCarousel: (id) => apiDelete(`/carousels/${id}`),

  /**
   * Preview carousel results without saving
   * @param {Object} data - Query parameters
   * @param {Object} data.rules - Filter rules
   * @param {string} data.sort - Sort field
   * @param {string} data.direction - Sort direction
   * @returns {Promise<{scenes: Array}>}
   */
  previewCarousel: (data) => apiPost("/carousels/preview", data),

  /**
   * Execute a carousel by ID and get its scenes
   * @param {string} id - Carousel ID
   * @returns {Promise<{carousel: Object, scenes: Array}>}
   */
  executeCarousel: (id) => apiGet(`/carousels/${id}/execute`),
};

// Helper functions for common filtering patterns
const filterHelpers = {
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

  /** Get favorite performer scenes
   */
  favoritePerformerScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "random", "ASC"),
    scene_filter: { performer_favorite: true },
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
   * @returns {Promise<{setupComplete: boolean, hasUsers: boolean, hasStashInstance: boolean, userCount: number}>}
   */
  getSetupStatus: () => apiGet("/setup/status"),

  /**
   * Create the first admin user (only works if no users exist)
   * @param {string} username - Admin username
   * @param {string} password - Admin password
   * @returns {Promise<{success: boolean, user: Object}>}
   */
  createFirstAdmin: (username, password) =>
    apiPost("/setup/create-admin", { username, password }),

  /**
   * Test connection to a Stash server
   * @param {string} url - Stash GraphQL URL (e.g., http://localhost:9999/graphql)
   * @param {string} apiKey - Stash API key
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  testStashConnection: (url, apiKey) =>
    apiPost("/setup/test-stash-connection", { url, apiKey }),

  /**
   * Create the first Stash instance (only works if no instances exist)
   * @param {string} url - Stash GraphQL URL
   * @param {string} apiKey - Stash API key
   * @param {string} name - Instance name (optional, defaults to "Default")
   * @returns {Promise<{success: boolean, instance: Object}>}
   */
  createFirstStashInstance: (url, apiKey, name = "Default") =>
    apiPost("/setup/create-stash-instance", { url, apiKey, name }),

  /**
   * Reset setup state for recovery (only works if setup is incomplete)
   * @returns {Promise<{success: boolean, message: string, deleted: {users: number, stashInstances: number}}>}
   */
  resetSetup: () => apiPost("/setup/reset", {}),
};

// User setup API (first-login setup wizard)
export const userSetupApi = {
  /**
   * Get setup status for the current user
   * @returns {Promise<{needsSetup: boolean, instances: Array}>}
   */
  getSetupStatus: () => apiGet("/user/setup-status"),

  /**
   * Complete user setup by selecting Stash instances
   * @param {string[]} selectedInstanceIds - Array of Stash instance IDs to enable
   * @returns {Promise<{success: boolean, user: Object}>}
   */
  completeSetup: (selectedInstanceIds) =>
    apiPost("/user/complete-setup", { selectedInstanceIds }),
};

/**
 * Rating and favorite API endpoints
 */
const ratingsApi = {
  /**
   * Update rating and/or favorite for a scene
   * @param {string} sceneId - Scene ID
   * @param {Object} data - Rating data
   * @param {number|null} data.rating - Rating value (0-100) or null
   * @param {boolean} data.favorite - Favorite status
   * @returns {Promise<{success: boolean, rating: Object}>}
   */
  updateSceneRating: (sceneId, data) =>
    apiPut(`/ratings/scene/${sceneId}`, data),

  /**
   * Update rating and/or favorite for a performer
   * @param {string} performerId - Performer ID
   * @param {Object} data - Rating data
   * @param {number|null} data.rating - Rating value (0-100) or null
   * @param {boolean} data.favorite - Favorite status
   * @returns {Promise<{success: boolean, rating: Object}>}
   */
  updatePerformerRating: (performerId, data) =>
    apiPut(`/ratings/performer/${performerId}`, data),

  /**
   * Update rating and/or favorite for a studio
   * @param {string} studioId - Studio ID
   * @param {Object} data - Rating data
   * @param {number|null} data.rating - Rating value (0-100) or null
   * @param {boolean} data.favorite - Favorite status
   * @returns {Promise<{success: boolean, rating: Object}>}
   */
  updateStudioRating: (studioId, data) =>
    apiPut(`/ratings/studio/${studioId}`, data),

  /**
   * Update rating and/or favorite for a tag
   * @param {string} tagId - Tag ID
   * @param {Object} data - Rating data
   * @param {number|null} data.rating - Rating value (0-100) or null
   * @param {boolean} data.favorite - Favorite status
   * @returns {Promise<{success: boolean, rating: Object}>}
   */
  updateTagRating: (tagId, data) => apiPut(`/ratings/tag/${tagId}`, data),

  /**
   * Update rating and/or favorite for a gallery
   * @param {string} galleryId - Gallery ID
   * @param {Object} data - Rating data
   * @param {number|null} data.rating - Rating value (0-100) or null
   * @param {boolean} data.favorite - Favorite status
   * @returns {Promise<{success: boolean, rating: Object}>}
   */
  updateGalleryRating: (galleryId, data) =>
    apiPut(`/ratings/gallery/${galleryId}`, data),

  /**
   * Update rating and/or favorite for a group
   * @param {string} groupId - Group ID
   * @param {Object} data - Rating data
   * @param {number|null} data.rating - Rating value (0-100) or null
   * @param {boolean} data.favorite - Favorite status
   * @returns {Promise<{success: boolean, rating: Object}>}
   */
  updateGroupRating: (groupId, data) =>
    apiPut(`/ratings/group/${groupId}`, data),

  /**
   * Update rating and/or favorite for an image
   * @param {string} imageId - Image ID
   * @param {Object} data - Rating data
   * @param {number|null} data.rating - Rating value (0-100) or null
   * @param {boolean} data.favorite - Favorite status
   * @returns {Promise<{success: boolean, rating: Object}>}
   */
  updateImageRating: (imageId, data) =>
    apiPut(`/ratings/image/${imageId}`, data),
};

/**
 * Image View History API
 */
export const imageViewHistoryApi = {
  /**
   * Increment O counter for an image
   * @param {string} imageId - Image ID
   * @returns {Promise<{success: boolean, oCount: number, timestamp: string}>}
   */
  incrementO: (imageId) => apiPost("/image-view-history/increment-o", { imageId }),

  /**
   * Record image view
   * @param {string} imageId - Image ID
   * @returns {Promise<{success: boolean, viewCount: number, lastViewedAt: string}>}
   */
  recordView: (imageId) => apiPost("/image-view-history/view", { imageId }),

  /**
   * Get view history for specific image
   * @param {string} imageId - Image ID
   * @returns {Promise<Object>} View history object
   */
  getViewHistory: (imageId) => apiGet(`/image-view-history/${imageId}`),
};

// ============================================================================
// Groups API
// ============================================================================

/**
 * Admin: Get all groups
 * @returns {Promise<{groups: Array}>}
 */
export const getGroups = () => apiGet("/groups");

/**
 * Admin: Get single group with members
 * @param {string} groupId - Group ID
 * @returns {Promise<{group: Object}>}
 */
export const getGroup = (groupId) => apiGet(`/groups/${groupId}`);

/**
 * Admin: Create group
 * @param {Object} data - Group data
 * @param {string} data.name - Group name
 * @param {string} data.description - Group description (optional)
 * @param {Object} data.permissions - Group permissions
 * @returns {Promise<{group: Object}>}
 */
export const createGroup = (data) => apiPost("/groups", data);

/**
 * Admin: Update group
 * @param {string} groupId - Group ID
 * @param {Object} data - Updated group data
 * @returns {Promise<{group: Object}>}
 */
export const updateGroup = (groupId, data) => apiPut(`/groups/${groupId}`, data);

/**
 * Admin: Delete group
 * @param {string} groupId - Group ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const deleteGroup = (groupId) => apiDelete(`/groups/${groupId}`);

/**
 * Admin: Add user to group
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const addGroupMember = (groupId, userId) =>
  apiPost(`/groups/${groupId}/members`, { userId });

/**
 * Admin: Remove user from group
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const removeGroupMember = (groupId, userId) =>
  apiDelete(`/groups/${groupId}/members/${userId}`);

/**
 * Get group memberships for a specific user (admin only)
 * @param {number} userId - User ID
 * @returns {Promise<{groups: Array}>}
 */
export const getUserGroupMemberships = (userId) =>
  apiGet(`/user/${userId}/groups`);

/**
 * User: Get my groups (for sharing UI)
 * @returns {Promise<{groups: Array}>}
 */
export const getMyGroups = () => apiGet("/groups/user/mine");

// ============================================================================
// Permissions API
// ============================================================================

/**
 * User: Get my resolved permissions
 * @returns {Promise<{permissions: Object}>}
 */
export const getMyPermissions = () => apiGet("/user/permissions");

/**
 * Admin: Get any user's resolved permissions
 * @param {string} userId - User ID
 * @returns {Promise<{permissions: Object}>}
 */
export const getUserPermissions = (userId) => apiGet(`/user/${userId}/permissions`);

/**
 * Admin: Update user permission overrides
 * @param {string} userId - User ID
 * @param {Object} overrides - Permission overrides
 * @returns {Promise<{success: boolean, permissions: Object}>}
 */
export const updateUserPermissionOverrides = (userId, overrides) =>
  apiPut(`/user/${userId}/permissions`, overrides);

// ============================================================================
// Recovery Key & Password Reset API
// ============================================================================

/**
 * Get current user's recovery key
 * @returns {Promise<{recoveryKey: string | null}>}
 */
export const getRecoveryKey = () => apiGet("/user/recovery-key");

/**
 * Regenerate current user's recovery key
 * @returns {Promise<{recoveryKey: string}>}
 */
export const regenerateRecoveryKey = () => apiPost("/user/recovery-key/regenerate");

/**
 * Forgot password - check if user has recovery key
 * @param {string} username
 * @returns {Promise<{hasRecoveryKey: boolean}>}
 */
export const forgotPasswordInit = (username) =>
  apiPost("/auth/forgot-password/init", { username });

/**
 * Forgot password - reset with recovery key
 * @param {string} username
 * @param {string} recoveryKey
 * @param {string} newPassword
 * @returns {Promise<{success: boolean}>}
 */
export const forgotPasswordReset = (username, recoveryKey, newPassword) =>
  apiPost("/auth/forgot-password/reset", { username, recoveryKey, newPassword });

/**
 * Admin: Reset user's password
 * @param {number} userId
 * @param {string} newPassword
 * @returns {Promise<{success: boolean}>}
 */
export const adminResetPassword = (userId, newPassword) =>
  apiPost(`/user/${userId}/reset-password`, { newPassword });

/**
 * Admin: Regenerate user's recovery key
 * @param {number} userId
 * @returns {Promise<{recoveryKey: string}>}
 */
export const adminRegenerateRecoveryKey = (userId) =>
  apiPost(`/user/${userId}/regenerate-recovery-key`);

// ============================================================================
// Playlist Sharing API
// ============================================================================

/**
 * Get playlists shared with current user
 * @returns {Promise<{playlists: Array}>}
 */
export const getSharedPlaylists = () => apiGet("/playlists/shared");

/**
 * Get sharing info for a playlist (owner only)
 * @param {number} playlistId - Playlist ID
 * @returns {Promise<{shares: Array}>}
 */
export const getPlaylistShares = (playlistId) => apiGet(`/playlists/${playlistId}/shares`);

/**
 * Update playlist sharing
 * @param {number} playlistId - Playlist ID
 * @param {number[]} groupIds - Array of group IDs to share with
 * @returns {Promise<{shares: Array}>}
 */
export const updatePlaylistShares = (playlistId, groupIds) =>
  apiPut(`/playlists/${playlistId}/shares`, { groupIds });

/**
 * Duplicate a playlist
 * @param {number} playlistId - Playlist ID to duplicate
 * @returns {Promise<{playlist: Object}>}
 */
export const duplicatePlaylist = (playlistId) => apiPost(`/playlists/${playlistId}/duplicate`);

// ============================================================================
// Clips
// ============================================================================

/**
 * Get clips with filtering
 */
export async function getClips(options = {}) {
  const params = new URLSearchParams();

  if (options.page) params.set("page", options.page);
  if (options.perPage) params.set("perPage", options.perPage);
  if (options.sortBy) params.set("sortBy", options.sortBy);
  if (options.sortDir) params.set("sortDir", options.sortDir);
  if (options.isGenerated !== undefined) params.set("isGenerated", options.isGenerated);
  if (options.sceneId) params.set("sceneId", options.sceneId);
  if (options.tagIds?.length) params.set("tagIds", options.tagIds.join(","));
  if (options.sceneTagIds?.length) params.set("sceneTagIds", options.sceneTagIds.join(","));
  if (options.performerIds?.length) params.set("performerIds", options.performerIds.join(","));
  if (options.studioId) params.set("studioId", options.studioId);
  if (options.q) params.set("q", options.q);

  const queryString = params.toString();
  return apiGet(`/clips${queryString ? `?${queryString}` : ""}`);
}

/**
 * Get single clip
 */
export async function getClipById(id) {
  return apiGet(`/clips/${id}`);
}

/**
 * Get clips for a scene
 */
export async function getClipsForScene(sceneId, includeUngenerated = false) {
  const params = new URLSearchParams();
  if (includeUngenerated) params.set("includeUngenerated", "true");
  const queryString = params.toString();
  return apiGet(`/scenes/${sceneId}/clips${queryString ? `?${queryString}` : ""}`);
}

/**
 * Get clip preview URL
 */
export function getClipPreviewUrl(clipId) {
  return `/api/proxy/clip/${clipId}/preview`;
}
