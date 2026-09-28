import { commonFilters, filterHelpers, libraryApi } from "../api";

interface StashScene {
  id: string;
  [key: string]: unknown;
}

interface FindScenesResponse {
  findScenes?: { scenes?: StashScene[] };
}

export const useHomeCarouselQueries = (perCarousel: number = 12) => {
  return {
    favoritePerformerScenes: async () => {
      const response = (await libraryApi.findScenes(
        commonFilters.favoritePerformerScenes(1, perCarousel)
      )) as FindScenesResponse;
      // Extract scenes from server response structure
      return response?.findScenes?.scenes ?? [];
    },
    // The server's favorite filters match every studio or tag the user has
    // favorited, each on its own instance, in one request.
    favoriteStudioScenes: async () => {
      const response = (await libraryApi.findScenes({
        filter: filterHelpers.pagination(1, perCarousel, "random", "ASC"),
        scene_filter: { studio_favorite: true },
      })) as FindScenesResponse;

      return response.findScenes?.scenes ?? [];
    },
    favoriteTagScenes: async () => {
      const response = (await libraryApi.findScenes({
        filter: filterHelpers.pagination(1, perCarousel, "random", "ASC"),
        scene_filter: { tag_favorite: true },
      })) as FindScenesResponse;

      return response.findScenes?.scenes ?? [];
    },
    highRatedScenes: async () => {
      const response = (await libraryApi.findScenes(
        commonFilters.highRatedScenes(1, perCarousel)
      )) as FindScenesResponse;

      // Extract scenes from server response structure
      return response?.findScenes?.scenes ?? [];
    },
    recentlyAddedScenes: async () => {
      const response = (await libraryApi.findScenes(
        commonFilters.recentlyAddedScenes(1, perCarousel)
      )) as FindScenesResponse;

      // Extract scenes from server response structure
      return response?.findScenes?.scenes ?? [];
    },
  };
};
