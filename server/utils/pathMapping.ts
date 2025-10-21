/**
 * Path Mapping Utility
 *
 * Handles cross-platform path translation between Stash's internal paths
 * and Peek's perspective of those same files.
 *
 * Configuration Sources (in order of preference):
 * 1. Database (PathMapping table) - primary source
 * 2. Environment variables (STASH_INTERNAL_PATH / STASH_MEDIA_PATH) - legacy fallback & auto-migration
 *
 * Use Cases:
 * 1. Stash Docker + Peek Docker: /data → /app/media
 * 2. Stash Windows + Peek Docker: C:\Videos → /app/media
 * 3. Stash native + Peek Docker: /home/user/videos → /mnt/nfs/videos
 * 4. Multiple libraries: /data, /data2, /images → separate Peek mounts
 */

import path from "path";
import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";

const prisma = new PrismaClient();

interface PathMapping {
  id: number;
  stashPath: string;
  peekPath: string;
}

interface PathMappingInput {
  stashPath: string;
  peekPath: string;
}

class PathMapper {
  private mappings: PathMapping[] = [];
  private initialized: boolean = false;

  /**
   * Initialize path mapper by loading mappings from database
   * Falls back to environment variables if database is empty (legacy support)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load mappings from database
      const dbMappings = await prisma.pathMapping.findMany();

      if (dbMappings.length > 0) {
        // Use database mappings
        this.mappings = dbMappings.map(m => ({
          id: m.id,
          stashPath: m.stashPath,
          peekPath: m.peekPath,
        }));

        logger.info("PathMapper loaded from database", {
          count: this.mappings.length,
          mappings: this.mappings.map(m => ({ stash: m.stashPath, peek: m.peekPath })),
        });

        // Sort by path length descending (longest match first)
        this.mappings.sort((a, b) => b.stashPath.length - a.stashPath.length);
      } else {
        // No mappings configured - setup wizard required
        logger.warn("No path mappings configured - setup wizard required");
        this.mappings = [];
      }

      this.initialized = true;
    } catch (error) {
      logger.error("Failed to initialize PathMapper", { error });
      throw error;
    }
  }

  /**
   * Check if path mappings are configured
   */
  hasMapping(): boolean {
    return this.mappings.length > 0;
  }

  /**
   * Get all configured path mappings
   */
  getMappings(): PathMapping[] {
    return [...this.mappings];
  }

  /**
   * Add a new path mapping
   */
  async addMapping(input: PathMappingInput): Promise<PathMapping> {
    const created = await prisma.pathMapping.create({
      data: {
        stashPath: input.stashPath,
        peekPath: input.peekPath,
      },
    });

    const mapping: PathMapping = {
      id: created.id,
      stashPath: created.stashPath,
      peekPath: created.peekPath,
    };

    // Add to in-memory cache and re-sort
    this.mappings.push(mapping);
    this.mappings.sort((a, b) => b.stashPath.length - a.stashPath.length);

    logger.info("Added new path mapping", mapping);

    return mapping;
  }

  /**
   * Update an existing path mapping
   */
  async updateMapping(id: number, input: PathMappingInput): Promise<PathMapping> {
    const updated = await prisma.pathMapping.update({
      where: { id },
      data: {
        stashPath: input.stashPath,
        peekPath: input.peekPath,
      },
    });

    const mapping: PathMapping = {
      id: updated.id,
      stashPath: updated.stashPath,
      peekPath: updated.peekPath,
    };

    // Update in-memory cache and re-sort
    const index = this.mappings.findIndex(m => m.id === id);
    if (index >= 0) {
      this.mappings[index] = mapping;
      this.mappings.sort((a, b) => b.stashPath.length - a.stashPath.length);
    }

    logger.info("Updated path mapping", mapping);

    return mapping;
  }

  /**
   * Delete a path mapping
   */
  async deleteMapping(id: number): Promise<void> {
    await prisma.pathMapping.delete({ where: { id } });

    // Remove from in-memory cache
    this.mappings = this.mappings.filter(m => m.id !== id);

    logger.info("Deleted path mapping", { id });
  }

  /**
   * Translate a Stash-reported path to Peek's perspective
   *
   * Algorithm:
   * 1. Normalize path separators (backslash → forward slash)
   * 2. Find longest matching prefix in configured mappings
   * 3. Replace Stash prefix with Peek prefix
   * 4. Return translated path
   *
   * Example:
   *   Stash reports: /data/scenes/video.mp4
   *   Mapping: /data → /app/media
   *   Peek translates to: /app/media/scenes/video.mp4
   *
   * Example (Windows):
   *   Stash reports: C:\Videos\scene.mp4
   *   Mapping: C:\Videos → /app/media
   *   Peek translates to: /app/media/scene.mp4
   */
  translateStashPath(stashPath: string): string {
    if (!stashPath) {
      throw new Error("Path cannot be empty");
    }

    if (!this.initialized) {
      throw new Error("PathMapper not initialized - call initialize() first");
    }

    if (this.mappings.length === 0) {
      throw new Error(
        "No path mappings configured. " +
        "Complete setup wizard or configure path mappings in Settings."
      );
    }

    // Normalize path separators to forward slashes
    const normalizedPath = stashPath.replace(/\\/g, "/");

    // Find longest matching mapping (already sorted by length)
    for (const mapping of this.mappings) {
      const normalizedStashPath = mapping.stashPath.replace(/\\/g, "/");

      if (normalizedPath.startsWith(normalizedStashPath)) {
        // Extract relative path
        let relativePath = normalizedPath.substring(normalizedStashPath.length);

        // Ensure relative path starts with /
        if (!relativePath.startsWith("/")) {
          relativePath = "/" + relativePath;
        }

        // Combine with Peek path
        const translatedPath = path.posix.join(mapping.peekPath, relativePath);

        logger.verbose("Path translation", {
          from: stashPath,
          to: translatedPath,
          mapping: { stash: mapping.stashPath, peek: mapping.peekPath },
        });

        return translatedPath;
      }
    }

    // No mapping found
    const error = new Error(
      `No path mapping found for: ${stashPath}\n` +
      `Configured mappings:\n` +
      this.mappings.map(m => `  ${m.stashPath} → ${m.peekPath}`).join("\n") +
      `\n\nConfigure path mappings in Settings > Path Mappings`
    );

    logger.error("Path translation failed", {
      stashPath,
      configuredMappings: this.mappings,
    });

    throw error;
  }
}

// Singleton instance
export const pathMapper = new PathMapper();

/**
 * Convenience function for path translation
 * Note: PathMapper must be initialized before use
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
