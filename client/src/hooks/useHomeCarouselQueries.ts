import { commonFilters, libraryApi } from "../api";

interface StashScene {
  id: string;
  [key: string]: unknown;
}

interface FindScenesResponse {
  findScenes?: { scenes?: StashScene[] };
}

interface FindStudiosResponse {
  findStudios?: { studios?: Array<{ id: string; [key: string]: unknown }> };
}

interface FindTagsResponse {
  findTags?: { tags?: Array<{ id: string; [key: string]: unknown }> };
}

export const useHomeCarouselQueries = (perCarousel: number = 12) => {
  return {
    favoritePerformerScenes: async () => {
      const response = await libraryApi.findScenes(
        commonFilters.favoritePerformerScenes(1, perCarousel)
      ) as FindScenesResponse;
      // Extract scenes from server response structure
      return response?.findScenes?.scenes || [];
    },
    favoriteStudioScenes: async () => {
      const response = await libraryApi.findStudios(
        commonFilters.favoriteStudios(1, perCarousel)
      ) as FindStudiosResponse;

      // Extract scenes from server response structure
      const favoriteStudios = response?.findStudios?.studios || [];
      const favoriteStudioIds = favoriteStudios.map((studio) => studio.id);

      if (favoriteStudioIds.length === 0) {
        return [];
      }
      const scenesResponse = await libraryApi.findScenes({
        filter: {
          page: 1,
          per_page: perCarousel,
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
      }) as FindScenesResponse;

      return scenesResponse?.findScenes?.scenes || [];
    },
    favoriteTagScenes: async () => {
      const response = await libraryApi.findTags(
        commonFilters.favoriteTags(1, perCarousel)
      ) as FindTagsResponse;

      // Extract scenes from server response structure
      const favoriteTags = response?.findTags?.tags || [];
      const favoriteTagIds = favoriteTags.map((tag) => tag.id);

      if (favoriteTagIds.length === 0) {
        return [];
      }
      const scenesResponse = await libraryApi.findScenes({
        filter: {
          page: 1,
          per_page: perCarousel,
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
      }) as FindScenesResponse;

      return scenesResponse?.findScenes?.scenes || [];
    },
    highRatedScenes: async () => {
      const response = await libraryApi.findScenes(
        commonFilters.highRatedScenes(1, perCarousel)
      ) as FindScenesResponse;

      // Extract scenes from server response structure
      return response?.findScenes?.scenes || [];
    },
    recentlyAddedScenes: async () => {
      const response = await libraryApi.findScenes(
        commonFilters.recentlyAddedScenes(1, perCarousel)
      ) as FindScenesResponse;

      // Extract scenes from server response structure
      return response?.findScenes?.scenes || [];
    },
  };
};
