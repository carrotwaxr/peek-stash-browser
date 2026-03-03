/**
 * Gallery utility functions
 * Based on Stash's gallery title logic
 */

/**
 * Extract filename from path (basename)
 * @param {string} path - File path
 * @returns {string} Basename of path
 */
function fileNameFromPath(path: string) {
  if (!path) return "No File Name";
  return path.replace(/^.*[\\/]/, "");
}

/**
 * Get display title for a gallery with fallback to folder/file name
 * Logic:
 * 1. Use gallery.title if it exists
 * 2. Else use gallery.files[0].basename or basename from path
 * 3. Else use gallery.folder.path basename if available
 * 4. Else return "Untitled Gallery"
 *
 * @param {Object} gallery - Gallery object
 * @returns {string} Display title
 */
export function galleryTitle(gallery: Record<string, unknown> | null) {
  if (!gallery) return "Untitled Gallery";

  // Use title if available
  if (gallery.title) {
    return gallery.title;
  }

  // Try to get basename from files
  const files = gallery.files as Array<Record<string, unknown>> | undefined;
  if (files && files.length > 0) {
    const firstFile = files[0];

    // Prefer basename if available
    if (firstFile.basename) {
      return firstFile.basename as string;
    }

    // Fall back to extracting from path
    if (firstFile.path) {
      return fileNameFromPath(firstFile.path as string);
    }
  }

  // Try folder path if available
  const folder = gallery.folder as Record<string, unknown> | undefined;
  if (folder && folder.path) {
    return fileNameFromPath(folder.path as string);
  }

  return "Untitled Gallery";
}
