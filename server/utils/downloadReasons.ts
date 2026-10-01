/**
 * The reasons a download can show as failed, all written for the user. A
 * caught error's text (an fs path, Prisma's message) is logged, never
 * stored or sent.
 */
export const DOWNLOAD_FAILED = "The download failed";
export const ZIP_FAILED = "The zip could not be created";
export const PLAYLIST_NOT_FOUND = "Playlist not found";
export const NOTHING_TO_DOWNLOAD = "No scenes you can download";
export const ZIP_TOO_LARGE = "The zip grew past the size limit";
export const NOTHING_FETCHED =
  "None of the playlist's scenes could be fetched from Stash";

const USER_FACING = new Set([
  DOWNLOAD_FAILED,
  ZIP_FAILED,
  PLAYLIST_NOT_FOUND,
  NOTHING_TO_DOWNLOAD,
  ZIP_TOO_LARGE,
  NOTHING_FETCHED,
]);

/** A stored failure reason as the requester may see it; rows written before this kept the caught text */
export function userFacingReason(error: string | null): string | null {
  if (error === null) return null;
  return USER_FACING.has(error) ? error : DOWNLOAD_FAILED;
}
