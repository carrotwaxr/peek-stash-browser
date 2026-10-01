import type { ImageListItem } from "@peek/shared-types";

/**
 * An image's title with fallbacks: title, then the file name from its path,
 * then "Image {id}". The list already falls back to the file name; this
 * covers a row with neither.
 */
export function getImageTitle(
  image: Pick<ImageListItem, "id" | "title" | "filePath"> | null | undefined
): string | null {
  if (image?.title) return image.title;
  if (image?.filePath) {
    // The file name, whichever separator the path uses
    const parts = image.filePath.split(/[\\/]/);
    return parts[parts.length - 1] ?? null;
  }
  return image?.id ? `Image ${image.id}` : null;
}
