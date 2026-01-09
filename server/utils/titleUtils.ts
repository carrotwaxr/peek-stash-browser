/**
 * Utilities for computing display titles with fallback logic.
 */

/**
 * Strip file extension from a filename.
 * @param filename - The filename (with or without extension)
 * @returns The filename without extension
 */
export function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "");
}

/**
 * Extract basename from a file path (handles both / and \ separators).
 * @param filePath - The full file path
 * @returns The basename (filename only)
 */
export function extractBasename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

/**
 * Get fallback title for a scene when no explicit title is set.
 * Uses file path basename with extension stripped.
 *
 * @param filePath - The scene's primary file path
 * @returns The fallback title or null if no path available
 */
export function getSceneFallbackTitle(filePath: string | null): string | null {
  if (!filePath) {
    return null;
  }
  const basename = extractBasename(filePath);
  return stripExtension(basename);
}

/**
 * Get fallback title for a gallery when no explicit title is set.
 * Uses file basename (for zip galleries) or folder path basename (for folder-based galleries).
 * Extensions are stripped from the result.
 *
 * @param folderPath - The gallery's folder path
 * @param fileBasename - The gallery's file basename (for zip galleries)
 * @returns The fallback title or null if neither is available
 */
export function getGalleryFallbackTitle(
  folderPath: string | null,
  fileBasename: string | null
): string | null {
  // Try file basename first (for zip galleries)
  if (fileBasename) {
    return stripExtension(fileBasename);
  }
  // Try folder path basename (for folder-based galleries)
  if (folderPath) {
    const basename = extractBasename(folderPath);
    return basename; // Folder names don't have extensions to strip
  }
  return null;
}

/**
 * Get fallback title for an image when no explicit title is set.
 * Uses file path basename with extension stripped.
 *
 * @param filePath - The image's file path
 * @returns The fallback title or null if no path available
 */
export function getImageFallbackTitle(filePath: string | null): string | null {
  if (!filePath) {
    return null;
  }
  const basename = extractBasename(filePath);
  return stripExtension(basename);
}
