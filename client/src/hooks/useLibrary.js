import { useCallback } from "react";
import { useAsyncData, useSearch } from "./useApi.js";
import { libraryApi, legacyApi, commonFilters } from "../services/api.js";

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
  const { page = 1, perPage = 25, ...filterParams } = options;

  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findScenes({
      filter: { page, per_page: perPage },
      scene_filter: {},
      ...filterParams,
    });

    // Extract scenes and count from server response structure
    const findScenes = response?.findScenes;
    return {
      scenes: findScenes?.scenes || [],
      count: findScenes?.count || 0,
    };
  }, [page, perPage, filterParams]);

  return useAsyncData(fetchFunction, [page, perPage, filterParams]);
}

/**
 * Hook for high-rated scenes
 */
export function useHighRatedScenes(perPage = 25) {
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
export function useRecentScenes(perPage = 25) {
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
export function useLongScenes(perPage = 25) {
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
  const { page = 1, perPage = 25, ...filterParams } = options;

  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findPerformers({
      filter: { page, per_page: perPage },
      performer_filter: {},
      ...filterParams,
    });

    // Extract performers and count from server response structure
    const findPerformers = response?.findPerformers;
    return {
      performers: findPerformers?.performers || [],
      count: findPerformers?.count || 0,
    };
  }, [page, perPage, filterParams]);

  return useAsyncData(fetchFunction, [page, perPage, filterParams]);
}

/**
 * Hook for favorite performers
 */
export function useFavoritePerformers(perPage = 25) {
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
  const { page = 1, perPage = 25, ...filterParams } = options;

  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findStudios({
      filter: { page, per_page: perPage },
      studio_filter: {},
      ...filterParams,
    });

    // Extract studios and count from server response structure
    const findStudios = response?.findStudios;
    return {
      studios: findStudios?.studios || [],
      count: findStudios?.count || 0,
    };
  }, [page, perPage, filterParams]);

  return useAsyncData(fetchFunction, [page, perPage, filterParams]);
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
  const { page = 1, perPage = 25, ...filterParams } = options;

  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findTags({
      filter: { page, per_page: perPage },
      tag_filter: {},
      ...filterParams,
    });

    // Extract tags and count from server response structure
    const findTags = response?.findTags;
    return {
      tags: findTags?.tags || [],
      count: findTags?.count || 0,
    };
  }, [page, perPage, filterParams]);

  return useAsyncData(fetchFunction, [page, perPage, filterParams]);
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

  console.log("favorites", favorites);
  console.log("recent", recent);
  console.log("longVideos", longVideos);

  return {
    favorites,
    recent,
    longVideos,
    loading: favorites.loading || recent.loading || longVideos.loading,
    error: favorites.error || recent.error || longVideos.error,
  };
}
