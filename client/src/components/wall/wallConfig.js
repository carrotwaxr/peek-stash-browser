/**
 * Entity-specific configuration for WallView rendering.
 * Keeps WallView and WallItem entity-agnostic.
 */

import { formatDistanceToNow } from "date-fns";
import { getClipPreviewUrl } from "../../services/api.js";

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

  clip: {
    getImageUrl: (item) => {
      // Use dedicated clip preview proxy endpoint - it handles the URL properly
      if (item.id) {
        return getClipPreviewUrl(item.id);
      }
      return null;
    },
    getPreviewUrl: (item) => (item.isGenerated ? getClipPreviewUrl(item.id) : null),
    getAspectRatio: (item) => {
      // Use parent scene's video dimensions
      const file = item.scene?.files?.[0];
      if (file?.width && file?.height) {
        return file.width / file.height;
      }
      return 16 / 9; // Default for video clips
    },
    getTitle: (item) => item.title || "Untitled",
    getSubtitle: (item) => {
      const parts = [];
      if (item.scene?.title) parts.push(item.scene.title);
      if (item.primaryTag?.name) parts.push(item.primaryTag.name);
      return parts.join(" • ");
    },
    getLinkPath: (item) => `/scene/${item.sceneId}?t=${Math.floor(item.seconds)}`,
    hasPreview: true,
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
