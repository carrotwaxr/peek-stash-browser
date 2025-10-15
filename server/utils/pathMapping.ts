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

    console.log("PathMapper initialized:");
    console.log(`  Stash internal path: ${this.config.stashInternalPath}`);
    console.log(`  Peek media path: ${this.config.peekMediaPath}`);
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
      console.warn(
        `Path does not start with expected Stash internal path: ${stashPath}`
      );
      console.warn(
        `Expected prefix: ${this.config.stashInternalPath}, got: ${normalizedPath}`
      );
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

    console.log(`Path translation: ${stashPath} → ${translatedPath}`);

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
    console.log("PathMapper configuration updated:");
    console.log(`  Stash internal path: ${this.config.stashInternalPath}`);
    console.log(`  Peek media path: ${this.config.peekMediaPath}`);
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
