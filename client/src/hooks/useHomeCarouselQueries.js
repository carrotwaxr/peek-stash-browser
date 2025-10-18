import { commonFilters, libraryApi } from "../services/api";

export const useHomeCarouselQueries = (perCarousel = 12) => {
  return {
    barelyLegalScenes: async () => {
      const response = await libraryApi.findScenes(
        commonFilters.barelyLegalScenes(1, perCarousel)
      );
      // Extract scenes from server response structure
      return response?.findScenes?.scenes || [];
    },
    favoritePerformerScenes: async () => {
      const response = await libraryApi.findScenes(
        commonFilters.favoritePerformerScenes(1, perCarousel)
      );
      // Extract scenes from server response structure
      return response?.findScenes?.scenes || [];
    },
    favoriteStudioScenes: async () => {
      const response = await libraryApi.findStudios(
        commonFilters.favoriteStudios(1, perCarousel)
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
      });

      return scenesResponse?.findScenes?.scenes || [];
    },
    favoriteTagScenes: async () => {
      const response = await libraryApi.findTags(
        commonFilters.favoriteTags(1, perCarousel)
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
      });

      return scenesResponse?.findScenes?.scenes || [];
    },
    highBitrateScenes: async () => {
      const response = await libraryApi.findScenes(
        commonFilters.highBitrateScenes(1, perCarousel)
      );

      // Extract scenes from server response structure
      return response?.findScenes?.scenes || [];
    },
    highRatedScenes: async () => {
      const response = await libraryApi.findScenes(
        commonFilters.highRatedScenes(1, perCarousel)
      );

      // Extract scenes from server response structure
      return response?.findScenes?.scenes || [];
    },
    longScenes: async () => {
      const response = await libraryApi.findScenes(
        commonFilters.longScenes(1, perCarousel)
      );
      // Extract scenes from server response structure
      return response?.findScenes?.scenes || [];
    },
    recentlyAddedScenes: async () => {
      const response = await libraryApi.findScenes(
        commonFilters.recentlyAddedScenes(1, perCarousel)
      );

      // Extract scenes from server response structure
      return response?.findScenes?.scenes || [];
    },
  };
};
