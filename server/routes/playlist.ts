import express from "express";
import {
  addSceneToPlaylist,
  addScenesToPlaylist,
  cleanPlaylists,
  countPlaylistSuggestions,
  createPlaylist,
  deletePlaylist,
  deletePlaylists,
  duplicatePlaylist,
  findPlaylistSuggestions,
  getPlaylist,
  getPlaylistQueue,
  getPlaylistShares,
  getPlaylistSuggestions,
  getSharedPlaylists,
  getUserPlaylists,
  movePlaylistItem,
  removePlaylistItems,
  removeSceneFromPlaylist,
  removeUnavailablePlaylistItems,
  sortPlaylist,
  updatePlaylist,
  updatePlaylistShares,
} from "../controllers/playlist.js";
import { authenticate, withAllowedInstances } from "../middleware/auth.js";
import { authenticated, libraryHandler } from "../utils/routeHelpers.js";

const router = express.Router();

// All playlist routes require authentication
router.use(authenticate);

// Get playlists shared with current user
router.get("/shared", withAllowedInstances, libraryHandler(getSharedPlaylists));

// Get all user playlists
router.get("/", withAllowedInstances, libraryHandler(getUserPlaylists));

// Clean or delete several playlists by id (the requester's own among them).
// Registered before the /:id routes
router.post("/clean", authenticated(cleanPlaylists));
router.post("/delete-many", authenticated(deletePlaylists));

// Get single playlist with a page of its items
router.get("/:id", withAllowedInstances, libraryHandler(getPlaylist));

// Get the play queue: every visible item in the shown order
router.get(
  "/:id/queue",
  withAllowedInstances,
  libraryHandler(getPlaylistQueue)
);

// Scenes like the ones the playlist holds, for the owner or a recipient:
// the scene list's request within them, and its count
router.post(
  "/:id/suggestions",
  withAllowedInstances,
  libraryHandler(findPlaylistSuggestions)
);
router.post(
  "/:id/suggestions/count",
  withAllowedInstances,
  libraryHandler(countPlaylistSuggestions)
);
// A tab on the 3.5.0-beta.3 bundle; remove in the release after 3.5.0-beta.4
router.get(
  "/:id/suggestions",
  withAllowedInstances,
  libraryHandler(getPlaylistSuggestions)
);

// Create new playlist
router.post("/", authenticated(createPlaylist));

// Update playlist
router.put("/:id", withAllowedInstances, libraryHandler(updatePlaylist));

// Delete playlist
router.delete("/:id", authenticated(deletePlaylist));

// Add scene to playlist
router.post(
  "/:id/items",
  withAllowedInstances,
  libraryHandler(addSceneToPlaylist)
);

// Add several scenes to playlist
router.post(
  "/:id/items/bulk",
  withAllowedInstances,
  libraryHandler(addScenesToPlaylist)
);

// Remove the items deleted from Stash (owner only)
router.post(
  "/:id/items/remove-unavailable",
  withAllowedInstances,
  libraryHandler(removeUnavailablePlaylistItems)
);

// Remove several items by item id (owner only)
router.post("/:id/items/remove", authenticated(removePlaylistItems));

// Move one item to an index among the items the owner sees (owner only)
router.put(
  "/:id/items/:itemId/position",
  withAllowedInstances,
  libraryHandler(movePlaylistItem)
);

// Remove scene from playlist
router.delete("/:id/items/:sceneId", authenticated(removeSceneFromPlaylist));

// Save a view sort as the playlist's order (owner only)
router.post("/:id/sort", withAllowedInstances, libraryHandler(sortPlaylist));

// Get sharing info for a playlist
router.get("/:id/shares", authenticated(getPlaylistShares));

// Update playlist sharing
router.put("/:id/shares", authenticated(updatePlaylistShares));

// Duplicate a playlist
router.post(
  "/:id/duplicate",
  withAllowedInstances,
  libraryHandler(duplicatePlaylist)
);

export default router;
