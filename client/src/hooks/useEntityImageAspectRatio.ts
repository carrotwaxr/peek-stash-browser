import { useMemo } from "react";

export const useEntityImageAspectRatio = (entityType) => {
  return useMemo(() => {
    if (["performer", "gallery", "group"].includes(entityType)) {
      return "2/3"; // Portrait
    }
    if (entityType === "scene" || entityType === "clip") {
      return "16/9"; // Landscape video format
    }
    return "16/9"; // Landscape (default for tags, studios, groups, etc.)
  }, [entityType]);
};
