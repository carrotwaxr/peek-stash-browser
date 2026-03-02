/**
 * Library API — entity search and lookup endpoints.
 */
import { apiFetch, apiGet, apiPost } from "./client";

// ── Types ──────────────────────────────────────────────────────────────

export interface LibrarySearchParams {
  filter?: Record<string, unknown>;
  scene_filter?: Record<string, unknown>;
  performer_filter?: Record<string, unknown>;
  studio_filter?: Record<string, unknown>;
  tag_filter?: Record<string, unknown>;
  gallery_filter?: Record<string, unknown>;
  group_filter?: Record<string, unknown>;
  image_filter?: Record<string, unknown>;
  ids?: string[];
}

// ── Library API ────────────────────────────────────────────────────────

export const libraryApi = {
  // Search endpoints
  findScenes: (params: LibrarySearchParams = {}, signal?: AbortSignal) =>
    apiFetch("/library/scenes", { method: "POST", body: JSON.stringify(params), signal }),

  findPerformers: (params: LibrarySearchParams = {}, signal?: AbortSignal) =>
    apiFetch("/library/performers", { method: "POST", body: JSON.stringify(params), signal }),

  findStudios: (params: LibrarySearchParams = {}, signal?: AbortSignal) =>
    apiFetch("/library/studios", { method: "POST", body: JSON.stringify(params), signal }),

  findTags: (params: LibrarySearchParams = {}, signal?: AbortSignal) =>
    apiFetch("/library/tags", { method: "POST", body: JSON.stringify(params), signal }),

  findGalleries: (params: LibrarySearchParams = {}, signal?: AbortSignal) =>
    apiFetch("/library/galleries", { method: "POST", body: JSON.stringify(params), signal }),

  findGroups: (params: LibrarySearchParams = {}, signal?: AbortSignal) =>
    apiFetch("/library/groups", { method: "POST", body: JSON.stringify(params), signal }),

  findImages: (params: LibrarySearchParams = {}, signal?: AbortSignal) =>
    apiFetch("/library/images", { method: "POST", body: JSON.stringify(params), signal }),

  // Single-entity lookups
  findSceneById: async (id: string, instanceId: string | null = null) => {
    const params: LibrarySearchParams = { ids: [id] };
    if (instanceId) params.scene_filter = { instance_id: instanceId };
    const result = await apiPost<Record<string, unknown>>("/library/scenes", params);
    return (result?.findScenes as Record<string, unknown>)?.scenes
      ? ((result.findScenes as Record<string, unknown>).scenes as unknown[])[0] ?? null
      : null;
  },

  findPerformerById: async (id: string, instanceId: string | null = null) => {
    const params: LibrarySearchParams = { ids: [id] };
    if (instanceId) params.performer_filter = { instance_id: instanceId };
    const result = await apiPost<Record<string, unknown>>("/library/performers", params);
    return (result?.findPerformers as Record<string, unknown>)?.performers
      ? ((result.findPerformers as Record<string, unknown>).performers as unknown[])[0] ?? null
      : null;
  },

  findStudioById: async (id: string, instanceId: string | null = null) => {
    const params: LibrarySearchParams = { ids: [id] };
    if (instanceId) params.studio_filter = { instance_id: instanceId };
    const result = await apiPost<Record<string, unknown>>("/library/studios", params);
    return (result?.findStudios as Record<string, unknown>)?.studios
      ? ((result.findStudios as Record<string, unknown>).studios as unknown[])[0] ?? null
      : null;
  },

  findTagById: async (id: string, instanceId: string | null = null) => {
    const params: LibrarySearchParams = { ids: [id] };
    if (instanceId) params.tag_filter = { instance_id: instanceId };
    const result = await apiPost<Record<string, unknown>>("/library/tags", params);
    return (result?.findTags as Record<string, unknown>)?.tags
      ? ((result.findTags as Record<string, unknown>).tags as unknown[])[0] ?? null
      : null;
  },

  findGalleryById: async (id: string, instanceId: string | null = null) => {
    const params: LibrarySearchParams = { ids: [id] };
    if (instanceId) params.gallery_filter = { instance_id: instanceId };
    const result = await apiPost<Record<string, unknown>>("/library/galleries", params);
    return (result?.findGalleries as Record<string, unknown>)?.galleries
      ? ((result.findGalleries as Record<string, unknown>).galleries as unknown[])[0] ?? null
      : null;
  },

  findGroupById: async (id: string, instanceId: string | null = null) => {
    const params: LibrarySearchParams = { ids: [id] };
    if (instanceId) params.group_filter = { instance_id: instanceId };
    const result = await apiPost<Record<string, unknown>>("/library/groups", params);
    return (result?.findGroups as Record<string, unknown>)?.groups
      ? ((result.findGroups as Record<string, unknown>).groups as unknown[])[0] ?? null
      : null;
  },

  // Minimal endpoints
  findPerformersMinimal: async (params: LibrarySearchParams = {}) => {
    const result = await apiPost<Record<string, unknown>>("/library/performers/minimal", params);
    return (result?.performers as unknown[]) || [];
  },

  findStudiosMinimal: async (params: LibrarySearchParams = {}) => {
    const result = await apiPost<Record<string, unknown>>("/library/studios/minimal", params);
    return (result?.studios as unknown[]) || [];
  },

  findTagsMinimal: async (params: LibrarySearchParams = {}) => {
    const result = await apiPost<Record<string, unknown>>("/library/tags/minimal", params);
    return (result?.tags as unknown[]) || [];
  },

  findGroupsMinimal: async (params: LibrarySearchParams = {}) => {
    const result = await apiPost<Record<string, unknown>>("/library/groups/minimal", params);
    return (result?.groups as unknown[]) || [];
  },

  findGalleriesMinimal: async (params: LibrarySearchParams = {}) => {
    const result = await apiPost<Record<string, unknown>>("/library/galleries/minimal", params);
    return (result?.galleries as unknown[]) || [];
  },

  // Gallery images
  getGalleryImages: async (
    galleryId: string,
    { page = 1, per_page = 0, instanceId = null }: { page?: number; per_page?: number; instanceId?: string | null } = {},
  ) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", page.toString());
    if (per_page > 0) params.set("per_page", per_page.toString());
    if (instanceId) params.set("instance", instanceId);
    const queryString = params.toString();
    return apiGet(`/library/galleries/${galleryId}/images${queryString ? `?${queryString}` : ""}`);
  },

  // Rating and favorite (delegates to ratings module)
  updateRating: async (entityType: string, entityId: string, rating: number | null, instanceId: string | null = null) => {
    const data: Record<string, unknown> = { rating };
    if (instanceId) data.instanceId = instanceId;
    return ratingsApiInternal.update(entityType, entityId, data);
  },

  updateFavorite: async (entityType: string, entityId: string, favorite: boolean, instanceId: string | null = null) => {
    const data: Record<string, unknown> = { favorite };
    if (instanceId) data.instanceId = instanceId;
    return ratingsApiInternal.update(entityType, entityId, data);
  },

  // Carousels
  getCarousels: () => apiGet("/carousels"),
  getCarousel: (id: string) => apiGet(`/carousels/${id}`),
  createCarousel: (data: Record<string, unknown>) => apiPost("/carousels", data),
  updateCarousel: (id: string, data: Record<string, unknown>) =>
    apiFetch(`/carousels/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCarousel: (id: string) =>
    apiFetch(`/carousels/${id}`, { method: "DELETE" }),
  previewCarousel: (data: Record<string, unknown>) => apiPost("/carousels/preview", data),
  executeCarousel: (id: string) => apiGet(`/carousels/${id}/execute`),
};

// Internal ratings helper used by libraryApi.updateRating/updateFavorite
const ratingsApiInternal = {
  update: (entityType: string, entityId: string, data: Record<string, unknown>) => {
    const type = entityType.toLowerCase();
    return apiFetch(`/ratings/${type}/${entityId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
};

// ── Filter helpers ─────────────────────────────────────────────────────

export const filterHelpers = {
  pagination: (page = 1, perPage = 24, sort: string | null = null, direction: "ASC" | "DESC" = "ASC") => {
    const filter: Record<string, unknown> = { page, per_page: perPage };
    if (sort) {
      filter.sort = sort;
      filter.direction = direction;
    }
    return filter;
  },

  textSearch: (query: string, page = 1, perPage = 24) => ({
    q: query,
    page,
    per_page: perPage,
  }),

  ratingFilter: (minRating: number, modifier = "GREATER_THAN") => ({
    rating100: { modifier, value: minRating },
  }),
};

export const commonFilters = {
  highRatedScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "random", "ASC"),
    scene_filter: filterHelpers.ratingFilter(80),
  }),

  recentlyAddedScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "created_at", "DESC"),
    scene_filter: {},
  }),

  favoritePerformerScenes: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "random", "ASC"),
    scene_filter: { performer_favorite: true },
  }),

  searchScenes: (query: string, page = 1, perPage = 24) => ({
    filter: filterHelpers.textSearch(query, page, perPage),
    scene_filter: {},
  }),

  favoritePerformers: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "o_counter", "DESC"),
    performer_filter: { favorite: true },
  }),

  searchPerformers: (query: string, page = 1, perPage = 24) => ({
    filter: filterHelpers.textSearch(query, page, perPage),
    performer_filter: {},
  }),

  favoriteStudios: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "scenes_count", "DESC"),
    studio_filter: { favorite: true },
  }),

  favoriteTags: (page = 1, perPage = 24) => ({
    filter: filterHelpers.pagination(page, perPage, "scenes_count", "DESC"),
    tag_filter: { favorite: true },
  }),
};
