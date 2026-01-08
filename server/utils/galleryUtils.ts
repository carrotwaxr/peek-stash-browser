/**
 * Get a fallback title for a gallery when no explicit title is set.
 * Uses file basename (for zip galleries) or folder path basename (for folder-based galleries).
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
    return fileBasename;
  }
  // Try folder path basename (for folder-based galleries)
  if (folderPath) {
    return folderPath.replace(/^.*[\\/]/, "");
  }
  return null;
}
