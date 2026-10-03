/**
 * API barrel export — backward-compatible re-exports.
 *
 * All consumers that imported from `services/api` can import from `api` instead.
 * This will be the primary import path for API functions.
 */

// Core HTTP client
export {
  apiFetch,
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  ApiError,
  getErrorMessage,
  REDIRECT_STORAGE_KEY,
  LOGIN_MESSAGE_STORAGE_KEY,
  redirectToLogin,
} from "./client";

// Library (entity search)
export { libraryApi, commonFilters, filterHelpers } from "./library";
export type { LibrarySearchParams } from "./library";

// Setup
export { setupApi, userSetupApi } from "./setup";

// Playlists
export {
  getPlaylists,
  getSharedPlaylists,
  getPlaylist,
  getPlaylistQueue,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addSceneToPlaylist,
  addScenesToPlaylist,
  removeSceneFromPlaylist,
  movePlaylistItem,
  removePlaylistItems,
  sortPlaylist,
  removeUnavailableItems,
  getPlaylistShares,
  updatePlaylistShares,
  duplicatePlaylist,
} from "./playlists";
export type { PlaylistPageParams, PlaylistQueueParams } from "./playlists";

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
export { findClips, getClipsForScene, getClipPreviewUrl } from "./clips";

// Image view history
export { imageViewHistoryApi } from "./image-view-history";

// TanStack Query infrastructure
export { queryClient } from "./queryClient";
export { queryKeys } from "./queryKeys";
