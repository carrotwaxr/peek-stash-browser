import { useCallback } from "react";
import { useAsyncData } from "./useApi.js";
import { libraryApi, commonFilters } from "../services/api.js";

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
 * Hook for high-bitrate scenes
 */
export function useHighBitrateScenes(perPage = 24) {
  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findScenes(
      commonFilters.highBitrateScenes(1, perPage)
    );

    // Extract scenes from server response structure
    return response?.findScenes?.scenes || [];
  }, [perPage]);

  return useAsyncData(fetchFunction, [perPage]);
}

/**
 * Hook for favorite performer scenes
 */
export function useFavoritePerformerScenes(perPage = 24) {
  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findScenes(
      commonFilters.favoritePerformerScenes(1, perPage)
    );

    // Extract scenes from server response structure
    return response?.findScenes?.scenes || [];
  }, [perPage]);

  return useAsyncData(fetchFunction, [perPage]);
}

/**
 * Hook for barely legal scenes
 */
export function useBarelyLegalScenes(perPage = 24) {
  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findScenes(
      commonFilters.barelyLegalScenes(1, perPage)
    );

    // Extract scenes from server response structure
    return response?.findScenes?.scenes || [];
  }, [perPage]);

  return useAsyncData(fetchFunction, [perPage]);
}

/**
 * Hook for recently added scenes
 */
export function useRecentlyAddedScenes(perPage = 24) {
  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findScenes(
      commonFilters.recentlyAddedScenes(1, perPage)
    );

    // Extract scenes from server response structure
    return response?.findScenes?.scenes || [];
  }, [perPage]);

  return useAsyncData(fetchFunction, [perPage]);
}

/**
 * Hook for random scenes from favorite studios
 */
export function useFavoriteStudioScenes(perPage = 24) {
  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findStudios(
      commonFilters.favoriteStudios(1, perPage)
    );

    // Extract scenes from server response structure
    const favoriteStudios = response?.findStudios?.studios || [];
    const favoriteStudioIds = favoriteStudios.map((studio) => studio.id);

    if (favoriteStudioIds.length === 0) {
      return [];
    }
    const scenesResponse = await libraryApi.findScenes({
      filter: {
        page: 1,
        per_page: perPage,
        sort: "random",
        direction: "ASC",
      },
      scene_filter: {
        studios: {
          value: favoriteStudioIds,
          excludes: [],
          modifier: "INCLUDES",
          depth: 0,
        },
      },
    });

    return scenesResponse?.findScenes?.scenes || [];
  }, [perPage]);

  return useAsyncData(fetchFunction, [perPage]);
}

/**
 * Hook for random scenes from favorite tags
 */
export function useFavoriteTagScenes(perPage = 24) {
  const fetchFunction = useCallback(async () => {
    const response = await libraryApi.findTags(
      commonFilters.favoriteTags(1, perPage)
    );

    // Extract scenes from server response structure
    const favoriteTags = response?.findTags?.tags || [];
    const favoriteTagIds = favoriteTags.map((tag) => tag.id);

    if (favoriteTagIds.length === 0) {
      return [];
    }
    const scenesResponse = await libraryApi.findScenes({
      filter: {
        page: 1,
        per_page: perPage,
        sort: "random",
        direction: "ASC",
      },
      scene_filter: {
        tags: {
          value: favoriteTagIds,
          excludes: [],
          modifier: "INCLUDES",
          depth: 0,
        },
      },
    });

    return scenesResponse?.findScenes?.scenes || [];
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

