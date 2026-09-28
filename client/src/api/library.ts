/**
 * Library API — entity search and lookup endpoints.
 */
import type {
  EntityKind,
  FindGalleriesMinimalRequest,
  FindGalleriesMinimalResponse,
  FindGalleriesRequest,
  FindGroupsMinimalRequest,
  FindGroupsMinimalResponse,
  FindGroupsRequest,
  FindImagesRequest,
  FindPerformersMinimalRequest,
  FindPerformersMinimalResponse,
  FindPerformersRequest,
  FindScenesRequest,
  FindStudiosMinimalRequest,
  FindStudiosMinimalResponse,
  FindStudiosRequest,
  FindTagTreeResponse,
  FindTagsMinimalRequest,
  FindTagsMinimalResponse,
  FindTagsRequest,
  ListRequestInput,
  NormalizedImage,
  TagTreeScope,
} from "@peek/shared-types";
import { makeCompositeKey } from "../utils/compositeKey";
import { apiFetch, apiGet, apiPost } from "./client";

// ── Types ──────────────────────────────────────────────────────────────

/**
 * A list request, as the server's parser takes it (`ListRequestInput<E>`):
 * paging, sort and search in `filter`, top-level `ids`, and the list's own
 * `<entity>_filter`. Each list endpoint takes its kind's (`FindScenesRequest`
 * is `LibrarySearchParams<"scene">`).
 */
export type LibrarySearchParams<E extends EntityKind = EntityKind> =
  ListRequestInput<E>;

// ── Single-entity lookup ───────────────────────────────────────────────

/** The list endpoint each detail page looks its entity up through */
const BY_ID = {
  scene: {
    path: "/library/scenes",
    filter: "scene_filter",
    result: "findScenes",
    list: "scenes",
  },
  performer: {
    path: "/library/performers",
    filter: "performer_filter",
    result: "findPerformers",
    list: "performers",
  },
  studio: {
    path: "/library/studios",
    filter: "studio_filter",
    result: "findStudios",
    list: "studios",
  },
  tag: {
    path: "/library/tags",
    filter: "tag_filter",
    result: "findTags",
    list: "tags",
  },
  gallery: {
    path: "/library/galleries",
    filter: "gallery_filter",
    result: "findGalleries",
    list: "galleries",
  },
  group: {
    path: "/library/groups",
    filter: "group_filter",
    result: "findGroups",
    list: "groups",
  },
} as const;

type ListResponse = Partial<
  Record<string, Partial<Record<string, Record<string, unknown>[]>>>
>;

/**
 * One entity by id through its list endpoint, so the user's exclusions
 * apply: null when nothing matches (a missing, hidden or restricted entity
 * looks the same). Without an instance, an id found on several servers
 * rejects with the server's 400 (an ApiError whose data lists the matches).
 */
async function findOneById(
  type: keyof typeof BY_ID,
  id: string,
  instanceId: string | null,
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  const { path, filter, result, list } = BY_ID[type];
  const params: LibrarySearchParams = { ids: [id] };
  if (instanceId) params[filter] = { instance_id: instanceId };
  const data = await apiPost<ListResponse>(path, params, signal);
  return data[result]?.[list]?.[0] ?? null;
}

// ── Library API ────────────────────────────────────────────────────────

export const libraryApi = {
  // Search endpoints
  findScenes: (params: FindScenesRequest = {}, signal?: AbortSignal) =>
    apiFetch("/library/scenes", {
      method: "POST",
      body: JSON.stringify(params),
      signal,
    }),

  findPerformers: (params: FindPerformersRequest = {}, signal?: AbortSignal) =>
    apiFetch("/library/performers", {
      method: "POST",
      body: JSON.stringify(params),
      signal,
    }),

  findStudios: (params: FindStudiosRequest = {}, signal?: AbortSignal) =>
    apiFetch("/library/studios", {
      method: "POST",
      body: JSON.stringify(params),
      signal,
    }),

  findTags: (params: FindTagsRequest = {}, signal?: AbortSignal) =>
    apiFetch("/library/tags", {
      method: "POST",
      body: JSON.stringify(params),
      signal,
    }),

  /**
   * The compact tag tree for the hierarchy and folder views: every tag the
   * user can see, or with a scope the tags on its scenes and their ancestors
   */
  findTagTree: (scope?: TagTreeScope, signal?: AbortSignal) =>
    apiPost<FindTagTreeResponse>(
      "/library/tags/tree",
      scope ? { scope } : {},
      signal
    ),

  findGalleries: (params: FindGalleriesRequest = {}, signal?: AbortSignal) =>
    apiFetch("/library/galleries", {
      method: "POST",
      body: JSON.stringify(params),
      signal,
    }),

  findGroups: (params: FindGroupsRequest = {}, signal?: AbortSignal) =>
    apiFetch("/library/groups", {
      method: "POST",
      body: JSON.stringify(params),
      signal,
    }),

  findImages: (params: FindImagesRequest = {}, signal?: AbortSignal) =>
    apiFetch("/library/images", {
      method: "POST",
      body: JSON.stringify(params),
      signal,
    }),

  // Single-entity lookups: each resolves to null when there is no entity
  // the user can see, and rejects with a 400 ApiError listing the matches
  // when an id without an instance is on several servers
  findSceneById: (
    id: string,
    instanceId: string | null = null,
    signal?: AbortSignal
  ) => findOneById("scene", id, instanceId, signal),

  findPerformerById: (
    id: string,
    instanceId: string | null = null,
    signal?: AbortSignal
  ) => findOneById("performer", id, instanceId, signal),

  findStudioById: (
    id: string,
    instanceId: string | null = null,
    signal?: AbortSignal
  ) => findOneById("studio", id, instanceId, signal),

  findTagById: (
    id: string,
    instanceId: string | null = null,
    signal?: AbortSignal
  ) => findOneById("tag", id, instanceId, signal),

  findGalleryById: (
    id: string,
    instanceId: string | null = null,
    signal?: AbortSignal
  ) => findOneById("gallery", id, instanceId, signal),

  findGroupById: (
    id: string,
    instanceId: string | null = null,
    signal?: AbortSignal
  ) => findOneById("group", id, instanceId, signal),

  // Entity pickers: one page in name order, or the ids a picker selected
  findPerformersMinimal: async (
    params: FindPerformersMinimalRequest = {},
    signal?: AbortSignal
  ) =>
    (
      await apiPost<FindPerformersMinimalResponse>(
        "/library/performers/minimal",
        params,
        signal
      )
    ).performers,

  findStudiosMinimal: async (
    params: FindStudiosMinimalRequest = {},
    signal?: AbortSignal
  ) =>
    (
      await apiPost<FindStudiosMinimalResponse>(
        "/library/studios/minimal",
        params,
        signal
      )
    ).studios,

  findTagsMinimal: async (
    params: FindTagsMinimalRequest = {},
    signal?: AbortSignal
  ) =>
    (
      await apiPost<FindTagsMinimalResponse>(
        "/library/tags/minimal",
        params,
        signal
      )
    ).tags,

  findGroupsMinimal: async (
    params: FindGroupsMinimalRequest = {},
    signal?: AbortSignal
  ) =>
    (
      await apiPost<FindGroupsMinimalResponse>(
        "/library/groups/minimal",
        params,
        signal
      )
    ).groups,

  findGalleriesMinimal: async (
    params: FindGalleriesMinimalRequest = {},
    signal?: AbortSignal
  ) =>
    (
      await apiPost<FindGalleriesMinimalResponse>(
        "/library/galleries/minimal",
        params,
        signal
      )
    ).galleries,

  // Gallery images: the images search with an instance-aware galleries
  // filter, so exclusions apply and each image carries the user's own data
  findGalleryImages: async (
    galleryId: string,
    instanceId: string | null,
    { page = 1, perPage = 100 }: { page?: number; perPage?: number } = {}
  ): Promise<{ images: NormalizedImage[]; count: number }> => {
    const result = await apiPost<{
      findImages?: { images?: NormalizedImage[]; count?: number };
    }>("/library/images", {
      filter: { page, per_page: perPage, sort: "path", direction: "ASC" },
      image_filter: {
        galleries: {
          value: [makeCompositeKey(galleryId, instanceId)],
          modifier: "INCLUDES",
        },
      },
    });
    return {
      images: result?.findImages?.images ?? [],
      count: result?.findImages?.count ?? 0,
    };
  },

  // Rating and favorite (PUT /ratings/:type/:id)
  updateRating: async (
    entityType: string,
    entityId: string,
    rating: number | null,
    instanceId: string | null = null
  ) => {
    const data: Record<string, unknown> = { rating };
    if (instanceId) data.instanceId = instanceId;
    return ratingsApiInternal.update(entityType, entityId, data);
  },

  updateFavorite: async (
    entityType: string,
    entityId: string,
    favorite: boolean,
    instanceId: string | null = null
  ) => {
    const data: Record<string, unknown> = { favorite };
    if (instanceId) data.instanceId = instanceId;
    return ratingsApiInternal.update(entityType, entityId, data);
  },

  // Carousels
  getCarousels: () => apiGet("/carousels"),
  getCarousel: (id: string) => apiGet(`/carousels/${id}`),
  createCarousel: (data: Record<string, unknown>) =>
    apiPost("/carousels", data),
  updateCarousel: (id: string, data: Record<string, unknown>) =>
    apiFetch(`/carousels/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCarousel: (id: string) =>
    apiFetch(`/carousels/${id}`, { method: "DELETE" }),
  previewCarousel: (data: Record<string, unknown>) =>
    apiPost("/carousels/preview", data),
  executeCarousel: (id: string) => apiGet(`/carousels/${id}/execute`),
};

// Internal ratings helper used by libraryApi.updateRating/updateFavorite
const ratingsApiInternal = {
  update: (
    entityType: string,
    entityId: string,
    data: Record<string, unknown>
  ) => {
    const type = entityType.toLowerCase();
    return apiFetch(`/ratings/${type}/${entityId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
};

// ── Filter helpers ─────────────────────────────────────────────────────

export const filterHelpers = {
  pagination: (
    page = 1,
    perPage = 24,
    sort: string | null = null,
    direction: "ASC" | "DESC" = "ASC"
  ) => {
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

  ratingFilter: (
    minRating: number,
    modifier:
      | "EQUALS"
      | "NOT_EQUALS"
      | "GREATER_THAN"
      | "LESS_THAN" = "GREATER_THAN"
  ) => ({
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
