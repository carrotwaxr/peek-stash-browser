/**
 * API barrel export — backward-compatible re-exports.
 *
 * All consumers that imported from `services/api` can import from `api` instead.
 * This will be the primary import path for API functions.
 */

// Core HTTP client
export { apiFetch, apiGet, apiPost, apiPut, apiDelete, ApiError, REDIRECT_STORAGE_KEY } from "./client";

// Library (entity search)
export { libraryApi, commonFilters, filterHelpers } from "./library";
export type { LibrarySearchParams } from "./library";

// Ratings
export {
  updateSceneRating,
  updatePerformerRating,
  updateStudioRating,
  updateTagRating,
  updateGalleryRating,
  updateGroupRating,
  updateImageRating,
} from "./ratings";

// Setup
export { setupApi, userSetupApi } from "./setup";

// Playlists
export { getSharedPlaylists, getPlaylistShares, updatePlaylistShares, duplicatePlaylist } from "./playlists";

// Admin (groups, permissions, recovery)
export {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addGroupMember,
  removeGroupMember,
  getUserGroupMemberships,
  getMyGroups,
  getMyPermissions,
  getUserPermissions,
  updateUserPermissionOverrides,
  getRecoveryKey,
  regenerateRecoveryKey,
  forgotPasswordInit,
  forgotPasswordReset,
  adminResetPassword,
  adminRegenerateRecoveryKey,
} from "./admin";

// Clips
export { getClips, getClipsForScene, getClipPreviewUrl } from "./clips";
export type { GetClipsOptions } from "./clips";

// Image view history
export { imageViewHistoryApi } from "./image-view-history";

// TanStack Query infrastructure
export { queryClient } from "./queryClient";
export { queryKeys } from "./queryKeys";
