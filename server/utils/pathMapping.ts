/**
 * Path Mapping Utility
 *
 * Handles cross-platform path translation between Stash's internal paths
 * and Peek's perspective of those same files.
 *
 * Use Cases:
 * 1. Development: Stash on unRAID reports /data/videos/file.mp4
 *    - Peek accesses via SMB/CIFS: //10.0.0.4/share/videos/file.mp4
 *
 * 2. Production (same host as Stash): /data → /mnt/user/videos
 *
 * 3. Production (different host): /data → network mount or local path
 */

import path from "path";
import { logger } from "./logger.js";

interface PathMappingConfig {
  stashInternalPath: string;  // Path prefix Stash uses internally (e.g., "/data")
  peekMediaPath: string;      // Where Peek accesses those files (e.g., "/mnt/user/videos")
}

class PathMapper {
  private config: PathMappingConfig;

  constructor() {
    this.config = {
      stashInternalPath: process.env.STASH_INTERNAL_PATH || "/data",
      peekMediaPath: process.env.STASH_MEDIA_PATH || "/app/media",
    };

    logger.info("PathMapper initialized", {
      stashInternalPath: this.config.stashInternalPath,
      peekMediaPath: this.config.peekMediaPath,
    });
  }

  /**
   * Translate a Stash-reported path to Peek's perspective
   *
   * Example:
   *   Stash reports: /data/scenes/video.mp4
   *   Peek translates to: /mnt/user/videos/scenes/video.mp4
   */
  translateStashPath(stashPath: string): string {
    if (!stashPath) {
      throw new Error("Path cannot be empty");
    }

    // Normalize path separators to forward slashes
    const normalizedPath = stashPath.replace(/\\/g, "/");

    // Check if path starts with Stash's internal path
    if (!normalizedPath.startsWith(this.config.stashInternalPath)) {
      logger.warn("Path does not start with expected Stash internal path", {
        stashPath,
        expectedPrefix: this.config.stashInternalPath,
        actualPath: normalizedPath,
      });
      // Return as-is if it doesn't match the expected pattern
      return stashPath;
    }

    // Remove Stash's internal prefix
    const relativePath = normalizedPath.substring(
      this.config.stashInternalPath.length
    );

    // Ensure relative path starts with /
    const cleanRelativePath = relativePath.startsWith("/")
      ? relativePath
      : `/${relativePath}`;

    // Combine with Peek's media path
    const translatedPath = path.posix.join(
      this.config.peekMediaPath,
      cleanRelativePath
    );

    logger.verbose("Path translation", {
      from: stashPath,
      to: translatedPath,
    });

    return translatedPath;
  }

  /**
   * Get the current configuration
   */
  getConfig(): PathMappingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (useful for testing or runtime reconfiguration)
   */
  updateConfig(newConfig: Partial<PathMappingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info("PathMapper configuration updated", {
      stashInternalPath: this.config.stashInternalPath,
      peekMediaPath: this.config.peekMediaPath,
    });
  }
}

// Singleton instance
export const pathMapper = new PathMapper();

/**
 * Convenience function for path translation
 */
export function translateStashPath(stashPath: string): string {
  return pathMapper.translateStashPath(stashPath);
}

/**
 * Append API key to Stash image/video URLs for authentication
 */
export const appendApiKeyToUrl = (url: string): string => {
  try {
    // Skip null, undefined, or empty values
    if (!url || typeof url !== "string" || url.trim() === "") {
      return url;
    }

    const urlObj = new URL(url);
    if (!urlObj.searchParams.has("apikey")) {
      const apiKey = process.env.STASH_API_KEY;
      if (!apiKey) {
        logger.error("STASH_API_KEY not found in environment variables");
        return url; // Return original if no API key
      }
      urlObj.searchParams.append("apikey", apiKey);
    }
    return urlObj.toString();
  } catch (urlError) {
    logger.error(`Error processing URL: ${url}`, { error: urlError });
    return url; // Return original URL if parsing fails
  }
};

/**
 * Transform performer to add API key to image_path
 */
export const transformPerformer = (performer: any) => {
  try {
    return {
      ...performer,
      image_path: performer.image_path
        ? appendApiKeyToUrl(performer.image_path)
        : performer.image_path,
    };
  } catch (error) {
    logger.error("Error transforming performer", { error });
    return performer;
  }
};

/**
 * Transform studio to add API key to image_path
 */
export const transformStudio = (studio: any) => {
  try {
    return {
      ...studio,
      image_path: studio.image_path
        ? appendApiKeyToUrl(studio.image_path)
        : studio.image_path,
    };
  } catch (error) {
    logger.error("Error transforming studio", { error });
    return studio;
  }
};

/**
 * Transform tag to add API key to image_path
 */
export const transformTag = (tag: any) => {
  try {
    return {
      ...tag,
      image_path: tag.image_path
        ? appendApiKeyToUrl(tag.image_path)
        : tag.image_path,
    };
  } catch (error) {
    logger.error("Error transforming tag", { error });
    return tag;
  }
};

/**
 * Transform complete scene object to add API keys to all image/video URLs
 */
export const transformScene = (scene: any) => {
  try {
    const mutated: Record<string, any> = {
      ...scene,
      paths: Object.entries(scene.paths).reduce((acc, [key, val]) => {
        acc[key] = appendApiKeyToUrl(val as string);
        return acc;
      }, {} as { [key: string]: string }),
    };

    // Transform performers to add API key to image_path
    if (scene.performers && Array.isArray(scene.performers)) {
      mutated.performers = scene.performers.map((p: any) => transformPerformer(p));
    }

    // Transform tags to add API key to image_path
    if (scene.tags && Array.isArray(scene.tags)) {
      mutated.tags = scene.tags.map((t: any) => transformTag(t));
    }

    // Transform studio to add API key to image_path
    if (scene.studio) {
      mutated.studio = transformStudio(scene.studio);
    }

    return mutated;
  } catch (error) {
    logger.error("Error transforming scene", { error });
    return scene; // Return original scene if transformation fails
  }
};
