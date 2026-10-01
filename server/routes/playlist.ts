import express from "express";
import {
  addSceneToPlaylist,
  addScenesToPlaylist,
  createPlaylist,
  deletePlaylist,
  duplicatePlaylist,
  getPlaylist,
  getPlaylistQueue,
  getPlaylistShares,
  getSharedPlaylists,
  getUserPlaylists,
  removeSceneFromPlaylist,
  removeUnavailablePlaylistItems,
  reorderPlaylist,
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

// Get single playlist with a page of its items
router.get("/:id", withAllowedInstances, libraryHandler(getPlaylist));

// Get the play queue: every visible item in the shown order
router.get(
  "/:id/queue",
  withAllowedInstances,
  libraryHandler(getPlaylistQueue)
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

// Remove scene from playlist
router.delete("/:id/items/:sceneId", authenticated(removeSceneFromPlaylist));

// Reorder playlist items
router.put("/:id/reorder", authenticated(reorderPlaylist));

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
