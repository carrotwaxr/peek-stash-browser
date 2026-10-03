/**
 * Library API — entity search and lookup endpoints.
 */
import type {
  CreateCarouselRequest,
  CreateCarouselResponse,
  DeleteCarouselResponse,
  EntityKind,
  ExecuteCarouselByIdResponse,
  FindGalleriesMinimalRequest,
  FindGalleriesMinimalResponse,
  FindGalleriesRequest,
  FindGalleriesResponse,
  FindGroupsMinimalRequest,
  FindGroupsMinimalResponse,
  FindGroupsRequest,
  FindGroupsResponse,
  FindImagesRequest,
  FindImagesResponse,
  FindPerformersMinimalRequest,
  FindPerformersMinimalResponse,
  FindPerformersRequest,
  FindPerformersResponse,
  FindRecommendedScenesRequest,
  FindScenesMinimalRequest,
  FindScenesMinimalResponse,
  FindScenesRequest,
  FindScenesResponse,
  FindStudiosMinimalRequest,
  FindStudiosMinimalResponse,
  FindStudiosRequest,
  FindStudiosResponse,
  FindTagTreeRequest,
  FindTagTreeResponse,
  FindTagsMinimalRequest,
  FindTagsMinimalResponse,
  FindTagsRequest,
  FindTagsResponse,
  GetCarouselResponse,
  GetRecommendedScenesResponse,
  GetUserCarouselsResponse,
  ListRequestInput,
  NormalizedGallery,
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
  PreviewCarouselRequest,
  PreviewCarouselResponse,
  RatableEntityType,
  RelationCountsResponse,
  RelationCountsType,
  UpdateCarouselRequest,
  UpdateCarouselResponse,
  UpdateRatingRequest,
  UpdateRatingResponse,
  WithStashUrl,
} from "@peek/shared-types";
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

/** The page's Include sub-tags or sub-studios toggle, as its counts take it */
export interface RelationCountsOptions {
  includeSubTags?: boolean;
  includeSubStudios?: boolean;
}

/** Each detail page's counts endpoint, under /library */
const COUNTS_PATHS: Record<RelationCountsType, string> = {
  performer: "performers",
  studio: "studios",
  tag: "tags",
  group: "groups",
  gallery: "galleries",
};

// ── Single-entity lookup ───────────────────────────────────────────────

/** The pages that look one entity up by id, besides the Scene page */
export type DetailType = "performer" | "studio" | "tag" | "group" | "gallery";

/** What each lookup answers: the entity's list row, with its View in Stash link */
export interface DetailEntityByType {
  performer: WithStashUrl<NormalizedPerformer>;
  studio: WithStashUrl<NormalizedStudio>;
  tag: WithStashUrl<NormalizedTag>;
  group: WithStashUrl<NormalizedGroup>;
  gallery: WithStashUrl<NormalizedGallery>;
}

/** Each list endpoint's response, as the lookup reads it */
interface ByIdResponseByType {
  performer: FindPerformersResponse;
  studio: FindStudiosResponse;
  tag: FindTagsResponse;
  group: FindGroupsResponse;
  gallery: FindGalleriesResponse;
}

/** The list endpoint each detail page looks its entity up through */
const BY_ID: {
  [T in DetailType]: {
    path: string;
    filter: string;
    /** The one row of the list's response, if it holds one */
    pick: (data: ByIdResponseByType[T]) => DetailEntityByType[T] | undefined;
  };
} = {
  performer: {
    path: "/library/performers",
    filter: "performer_filter",
    pick: (data) => data.findPerformers.performers[0],
  },
  studio: {
    path: "/library/studios",
    filter: "studio_filter",
    pick: (data) => data.findStudios.studios[0],
  },
  tag: {
    path: "/library/tags",
    filter: "tag_filter",
    pick: (data) => data.findTags.tags[0],
  },
  gallery: {
    path: "/library/galleries",
    filter: "gallery_filter",
    pick: (data) => data.findGalleries.galleries[0],
  },
  group: {
    path: "/library/groups",
    filter: "group_filter",
    pick: (data) => data.findGroups.groups[0],
  },
};

/**
 * One entity by id through its list endpoint, so the user's exclusions
 * apply: null when nothing matches (a missing, hidden or restricted entity
 * looks the same). Without an instance, an id found on several servers
 * rejects with the server's 400 (an ApiError whose data lists the matches).
 */
async function findOneById<T extends DetailType>(
  type: T,
  id: string,
  instanceId: string | null,
  signal?: AbortSignal
): Promise<DetailEntityByType[T] | null> {
  const { path, filter, pick } = BY_ID[type];
  const params: Record<string, unknown> = { ids: [id] };
  if (instanceId) params[filter] = { instance_id: instanceId };
  const data = await apiPost<ByIdResponseByType[T]>(path, params, signal);
  return pick(data) ?? null;
}

/** The detail pages' lookup: the typed entity row, or null when none is visible */
export function findEntityById<T extends DetailType>(
  type: T,
  id: string,
  instanceId: string | null,
  signal?: AbortSignal
): Promise<DetailEntityByType[T] | null> {
  return findOneById(type, id, instanceId, signal);
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

  /**
   * One page of the user's top 500 (`RECOMMENDED_LIMIT`) as the scene list
   * asks it: its filters, search and sort, `recommended` (the rank) among them
   */
  findRecommendedScenes: (
    params: FindRecommendedScenesRequest = {},
    signal?: AbortSignal
  ) =>
    apiFetch<GetRecommendedScenesResponse>("/library/scenes/recommended", {
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
   * user can see, or with a scope the tags on its scenes and their
   * ancestors; with `untagged`, that type's count of untagged items
   */
  findTagTree: (request: FindTagTreeRequest, signal?: AbortSignal) =>
    apiPost<FindTagTreeResponse>("/library/tags/tree", request, signal),

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
    apiFetch<FindImagesResponse>("/library/images", {
      method: "POST",
      body: JSON.stringify(params),
      signal,
    }),

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

  // A scene's minimal is its title; the endpoint takes no count filter or scope
  findScenesMinimal: async (
    params: FindScenesMinimalRequest = {},
    signal?: AbortSignal
  ) =>
    (
      await apiPost<FindScenesMinimalResponse>(
        "/library/scenes/minimal",
        params,
        signal
      )
    ).scenes,

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

  /**
   * A detail page's tab counts, as the viewer sees them: each is the total
   * of the tab's list (GET /library/<entities>/:id/counts)
   */
  getRelationCounts: <T extends RelationCountsType>(
    type: T,
    id: string,
    instanceId: string,
    options: RelationCountsOptions = {},
    signal?: AbortSignal
  ) => {
    const query = new URLSearchParams({ instanceId });
    if (options.includeSubTags) query.set("includeSubTags", "true");
    if (options.includeSubStudios) query.set("includeSubStudios", "true");
    return apiGet<RelationCountsResponse<T>>(
      `/library/${COUNTS_PATHS[type]}/${encodeURIComponent(id)}/counts?${query.toString()}`,
      signal
    );
  },

  // Rating and favorite (PUT /ratings/:type/:id)
  updateRating: (
    entityType: RatableEntityType,
    entityId: string,
    rating: number | null,
    instanceId: string
  ) => {
    const data: UpdateRatingRequest = { rating, instanceId };
    return ratingsApiInternal.update(entityType, entityId, data);
  },

  updateFavorite: (
    entityType: RatableEntityType,
    entityId: string,
    favorite: boolean,
    instanceId: string
  ) => {
    const data: UpdateRatingRequest = { favorite, instanceId };
    return ratingsApiInternal.update(entityType, entityId, data);
  },

  // Carousels
  getCarousels: () => apiGet<GetUserCarouselsResponse>("/carousels"),
  getCarousel: (id: string) => apiGet<GetCarouselResponse>(`/carousels/${id}`),
  createCarousel: (data: CreateCarouselRequest) =>
    apiPost<CreateCarouselResponse>("/carousels", data),
  updateCarousel: (id: string, data: UpdateCarouselRequest) =>
    apiFetch<UpdateCarouselResponse>(`/carousels/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteCarousel: (id: string) =>
    apiFetch<DeleteCarouselResponse>(`/carousels/${id}`, { method: "DELETE" }),
  previewCarousel: (data: PreviewCarouselRequest) =>
    apiPost<PreviewCarouselResponse>("/carousels/preview", data),
  executeCarousel: (id: string, signal?: AbortSignal) =>
    apiGet<ExecuteCarouselByIdResponse>(`/carousels/${id}/execute`, signal),
};

// Internal ratings helper used by libraryApi.updateRating/updateFavorite
const ratingsApiInternal = {
  update: (
    entityType: RatableEntityType,
    entityId: string,
    data: UpdateRatingRequest
  ) =>
    apiFetch<UpdateRatingResponse>(`/ratings/${entityType}/${entityId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
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
};
