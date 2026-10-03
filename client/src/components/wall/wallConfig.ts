/**
 * Entity-specific configuration for WallView rendering.
 * Keeps WallView and WallItem entity-agnostic.
 */
import { formatDistanceToNow } from "date-fns";
import { getClipPreviewUrl } from "../../api";
import { clipTitle } from "../../utils/clipTitle";
import type { Clip } from "../cards/ClipCard";

const formatDate = (dateStr: any) => {
  if (!dateStr) return null;
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
};

const formatResolution = (width: any, height: any) => {
  if (!width || !height) return null;
  return `${width}×${height}`;
};

// A clip row as the wall reads it: the card's clip plus its scene's video file.
type WallClip = Clip & {
  scene?: {
    files?: Array<{ width?: number; height?: number } | undefined>;
  } | null;
};

// The wall hands every config a plain row; the clip entry reads it as a clip.
const asClip = (row: Record<string, unknown>) => row as unknown as WallClip;

export const wallConfig = {
  scene: {
    getImageUrl: (item: any) => item.paths?.screenshot,
    getPreviewUrl: (item: any) => item.paths?.preview,
    getAspectRatio: (item: any) => {
      const file = item.files?.[0];
      if (file?.width && file?.height) {
        return file.width / file.height;
      }
      return 16 / 9; // Default for scenes
    },
    getTitle: (item: any) => item.title || "Untitled",
    getSubtitle: (item: any) => {
      const parts: string[] = [];
      if (item.studio?.name) parts.push(item.studio.name);
      if (item.date) parts.push(formatDate(item.date));
      return parts.join(" • ");
    },
    hasPreview: true,
  },

  gallery: {
    // gallery.cover is a direct URL string (proxy URL)
    getImageUrl: (item: any) => item.cover || null,
    getPreviewUrl: () => null,
    getAspectRatio: (item: any) => {
      // Use cover image dimensions if available (from coverImageId -> StashImage)
      if (item.coverWidth && item.coverHeight) {
        return item.coverWidth / item.coverHeight;
      }
      return 1; // Default square if no dimensions
    },
    getTitle: (item: any) => item.title || "Untitled Gallery",
    getSubtitle: (item: any) => `${item.image_count || 0} images`,
    hasPreview: false,
  },

  image: {
    getImageUrl: (item: any) => item.paths?.thumbnail,
    getPreviewUrl: () => null,
    getAspectRatio: (item: any) => {
      if (item.width && item.height) {
        return item.width / item.height;
      }
      return 1; // Default square for images
    },
    getTitle: (item: any) =>
      item.title || item.files?.[0]?.basename || "Untitled",
    getSubtitle: (item: any) => formatResolution(item.width, item.height),
    hasPreview: false,
  },

  clip: {
    // The still image is the clip's screenshot, else its scene's, as
    // ClipCardPreview does. The preview endpoint serves the mp4, not an image.
    getImageUrl: (row: Record<string, unknown>): string | null => {
      const item = asClip(row);
      return item.screenshotUrl ?? item.scene?.pathScreenshot ?? null;
    },
    getPreviewUrl: (row: Record<string, unknown>): string | null => {
      const item = asClip(row);
      return item.isGenerated
        ? getClipPreviewUrl(item.id, item.instanceId)
        : null;
    },
    getAspectRatio: (row: Record<string, unknown>) => {
      const item = asClip(row);
      // Use parent scene's video dimensions
      const file = item.scene?.files?.[0];
      if (file?.width && file.height) {
        return file.width / file.height;
      }
      return 16 / 9; // Default for video clips
    },
    getTitle: (row: Record<string, unknown>) => clipTitle(asClip(row)),
    getSubtitle: (row: Record<string, unknown>) => {
      const item = asClip(row);
      const parts: string[] = [];
      if (item.scene?.title) parts.push(item.scene.title);
      if (item.primaryTag?.name) parts.push(item.primaryTag.name);
      return parts.join(" • ");
    },
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
