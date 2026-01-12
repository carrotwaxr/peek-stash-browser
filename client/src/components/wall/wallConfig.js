/**
 * Entity-specific configuration for WallView rendering.
 * Keeps WallView and WallItem entity-agnostic.
 */

import { formatDistanceToNow } from "date-fns";

const formatDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
};

const formatResolution = (width, height) => {
  if (!width || !height) return null;
  return `${width}×${height}`;
};

export const wallConfig = {
  scene: {
    getImageUrl: (item) => item.paths?.screenshot,
    getPreviewUrl: (item) => item.paths?.preview,
    getAspectRatio: (item) => {
      const file = item.files?.[0];
      if (file?.width && file?.height) {
        return file.width / file.height;
      }
      return 16 / 9; // Default for scenes
    },
    getTitle: (item) => item.title || "Untitled",
    getSubtitle: (item) => {
      const parts = [];
      if (item.studio?.name) parts.push(item.studio.name);
      if (item.date) parts.push(formatDate(item.date));
      return parts.join(" • ");
    },
    getLinkPath: (item) => `/scene/${item.id}`,
    hasPreview: true,
  },

  gallery: {
    // gallery.cover is a direct URL string (proxy URL)
    getImageUrl: (item) => item.cover || null,
    getPreviewUrl: () => null,
    getAspectRatio: (item) => {
      // Use cover image dimensions if available (from coverImageId -> StashImage)
      if (item.coverWidth && item.coverHeight) {
        return item.coverWidth / item.coverHeight;
      }
      return 1; // Default square if no dimensions
    },
    getTitle: (item) => item.title || "Untitled Gallery",
    getSubtitle: (item) => `${item.image_count || 0} images`,
    getLinkPath: (item) => `/gallery/${item.id}`,
    hasPreview: false,
  },

  image: {
    getImageUrl: (item) => item.paths?.thumbnail,
    getPreviewUrl: () => null,
    getAspectRatio: (item) => {
      if (item.width && item.height) {
        return item.width / item.height;
      }
      return 1; // Default square for images
    },
    getTitle: (item) => item.title || item.files?.[0]?.basename || "Untitled",
    getSubtitle: (item) => formatResolution(item.width, item.height),
    getLinkPath: (item) => `/image/${item.id}`,
    hasPreview: false,
  },
};

// Zoom level configurations
export const ZOOM_LEVELS = {
  small: { targetRowHeight: 150, label: "S" },
  medium: { targetRowHeight: 220, label: "M" },
  large: { targetRowHeight: 320, label: "L" },
};

export const DEFAULT_ZOOM = "medium";
export const DEFAULT_VIEW_MODE = "grid";
