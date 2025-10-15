import { useCallback } from "react";
import { useAsyncData, useSearch } from "./useApi.js";
import {
  libraryApi,
  legacyApi,
  commonFilters,
  sortFieldMap,
} from "../services/api.js";

/**
 * Hook for fetching scenes with the legacy endpoint
 */
export function useScenes() {
  return useAsyncData(() => legacyApi.getScenes());
}

/**
 * Hook for searching scenes with filtering and pagination
 */
export function useScenesSearch() {
  const searchFunction = useCallback((query) => {
    return libraryApi.findScenes(commonFilters.searchScenes(query, 1, 50));
  }, []);

  return useSearch(searchFunction);
}

/**
 * Hook for paginated scenes with filtering
 */
export function useScenesPaginated(options = {}) {
  const {
    page = 1,
    perPage = 24,
    sort,
    sortDirection,
    scene_filter: sceneFilter = {},
    studio_filter: studioFilter,
    performer_filter: performerFilter,
    tag_filter: tagFilter,
    ...otherParams
  } = options;

  const fetchFunction = useCallback(async () => {
    const requestBody = {
      filter: {
        page,
        per_page: perPage,
        ...(sort && sortFieldMap[sort] && { sort: sortFieldMap[sort] }),
        ...(sortDirection && { direction: sortDirection }),
      },
      scene_filter: sceneFilter,
      ...(studioFilter && { studio_filter: studioFilter }),
      ...(performerFilter && { performer_filter: performerFilter }),
      ...(tagFilter && { tag_filter: tagFilter }),
      ...otherParams,
    };

    const response = await libraryApi.findScenes(requestBody);

    // Extract scenes and count from server response structure
    const findScenes = response?.findScenes;
    return {
      scenes: findScenes?.scenes || [],
      count: findScenes?.count || 0,
    };
  }, [
    page,
    perPage,
    sort,
    sortDirection,
    sceneFilter,
    studioFilter,
    performerFilter,
    tagFilter,
    otherParams,
  ]);

  return useAsyncData(fetchFunction, [
    page,
    perPage,
    sort,
    sortDirection,
    sceneFilter,
    studioFilter,
    performerFilter,
    tagFilter,
    otherParams,
  ]);
}

/**
 * Hook for high-rated scenes
 */
export function useHighRatedScenes(perPage = 24) {
  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findScenes(
      commonFilters.highRatedScenes(1, perPage)
    );

    // Extract scenes from server response structure
    return response?.findScenes?.scenes || [];
  }, [perPage]);

  return useAsyncData(fetchFunction, [perPage]);
}

/**
 * Hook for recent scenes
 */
export function useRecentScenes(perPage = 24) {
  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findScenes(
      commonFilters.recentScenes(1, perPage)
    );

    // Extract scenes from server response structure
    return response?.findScenes?.scenes || [];
  }, [perPage]);

  return useAsyncData(fetchFunction, [perPage]);
}

/**
 * Hook for long scenes (over 30 minutes)
 */
export function useLongScenes(perPage = 24) {
  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findScenes(
      commonFilters.longScenes(1, perPage)
    );

    // Extract scenes from server response structure
    return response?.findScenes?.scenes || [];
  }, [perPage]);

  return useAsyncData(fetchFunction, [perPage]);
}

/**
 * Hook for searching performers with filtering and pagination
 */
export function usePerformersSearch() {
  const searchFunction = useCallback((query) => {
    return libraryApi.findPerformers(
      commonFilters.searchPerformers(query, 1, 50)
    );
  }, []);

  return useSearch(searchFunction);
}

/**
 * Hook for paginated performers with filtering
 */
export function usePerformersPaginated(options = {}) {
  const {
    page = 1,
    perPage = 24,
    sort,
    sortDirection,
    filter: performerFilter = {},
    ...otherParams
  } = options;

  const fetchFunction = useCallback(async () => {
    const requestBody = {
      filter: {
        page,
        per_page: perPage,
        ...(sort && sortFieldMap[sort] && { sort: sortFieldMap[sort] }),
        ...(sortDirection && { direction: sortDirection }),
      },
      performer_filter: performerFilter,
      ...otherParams,
    };

    const response = await libraryApi.findPerformers(requestBody);

    // Extract performers and count from server response structure
    const findPerformers = response?.findPerformers;
    return {
      performers: findPerformers?.performers || [],
      count: findPerformers?.count || 0,
    };
  }, [page, perPage, sort, sortDirection, performerFilter, otherParams]);

  return useAsyncData(fetchFunction, [
    page,
    perPage,
    sort,
    sortDirection,
    performerFilter,
    otherParams,
  ]);
}

/**
 * Hook for favorite performers
 */
export function useFavoritePerformers(perPage = 24) {
  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findPerformers(
      commonFilters.favoritePerformers(1, perPage)
    );

    // Extract performers from server response structure
    return response?.findPerformers?.performers || [];
  }, [perPage]);

  return useAsyncData(fetchFunction, [perPage]);
}

/**
 * Hook for paginated studios with filtering
 */
export function useStudiosPaginated(options = {}) {
  const {
    page = 1,
    perPage = 24,
    sort,
    sortDirection,
    filter: studioFilter = {},
    ...otherParams
  } = options;

  const fetchFunction = useCallback(async () => {
    const requestBody = {
      filter: {
        page,
        per_page: perPage,
        ...(sort && sortFieldMap[sort] && { sort: sortFieldMap[sort] }),
        ...(sortDirection && { direction: sortDirection }),
      },
      studio_filter: studioFilter,
      ...otherParams,
    };

    const response = await libraryApi.findStudios(requestBody);

    // Extract studios and count from server response structure
    const findStudios = response?.findStudios;
    return {
      studios: findStudios?.studios || [],
      count: findStudios?.count || 0,
    };
  }, [page, perPage, sort, sortDirection, studioFilter, otherParams]);

  return useAsyncData(fetchFunction, [
    page,
    perPage,
    sort,
    sortDirection,
    studioFilter,
    otherParams,
  ]);
}

/**
 * Hook for searching studios
 */
export function useStudiosSearch() {
  const searchFunction = useCallback((query) => {
    return libraryApi.findStudios({
      filter: { q: query, per_page: 50 },
      studio_filter: {},
    });
  }, []);

  return useSearch(searchFunction);
}

/**
 * Hook for paginated tags with filtering
 */
export function useTagsPaginated(options = {}) {
  const {
    page = 1,
    perPage = 24,
    sort,
    sortDirection,
    filter: tagFilter = {},
    ...otherParams
  } = options;

  const fetchFunction = useCallback(async () => {
    const requestBody = {
      filter: {
        page,
        per_page: perPage,
        ...(sort && sortFieldMap[sort] && { sort: sortFieldMap[sort] }),
        ...(sortDirection && { direction: sortDirection }),
      },
      tag_filter: tagFilter,
      ...otherParams,
    };

    const response = await libraryApi.findTags(requestBody);

    // Extract tags and count from server response structure
    const findTags = response?.findTags;
    return {
      tags: findTags?.tags || [],
      count: findTags?.count || 0,
    };
  }, [page, perPage, sort, sortDirection, tagFilter, otherParams]);

  return useAsyncData(fetchFunction, [
    page,
    perPage,
    sort,
    sortDirection,
    tagFilter,
    otherParams,
  ]);
}

/**
 * Hook for searching tags
 */
export function useTagsSearch() {
  const searchFunction = useCallback((query) => {
    return libraryApi.findTags({
      filter: { q: query, per_page: 100 },
      tag_filter: {},
    });
  }, []);

  return useSearch(searchFunction);
}

/**
 * Hook for home page data (multiple carousels)
 */
export function useHomeData() {
  const favorites = useHighRatedScenes(12);
  const recent = useRecentScenes(12);
  const longVideos = useLongScenes(12);

  return {
    favorites,
    recent,
    longVideos,
    loading: favorites.loading || recent.loading || longVideos.loading,
    error: favorites.error || recent.error || longVideos.error,
  };
}
