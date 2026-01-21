import express from "express";
import {
  addSceneToPlaylist,
  createPlaylist,
  deletePlaylist,
  duplicatePlaylist,
  getPlaylist,
  getPlaylistShares,
  getSharedPlaylists,
  getUserPlaylists,
  removeSceneFromPlaylist,
  reorderPlaylist,
  updatePlaylist,
  updatePlaylistShares,
} from "../controllers/playlist.js";
import { authenticate } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All playlist routes require authentication
router.use(authenticate);

// Get playlists shared with current user
router.get("/shared", authenticated(getSharedPlaylists));

// Get all user playlists
router.get("/", authenticated(getUserPlaylists));

// Get single playlist with items
router.get("/:id", authenticated(getPlaylist));

// Create new playlist
router.post("/", authenticated(createPlaylist));

// Update playlist
router.put("/:id", authenticated(updatePlaylist));

// Delete playlist
router.delete("/:id", authenticated(deletePlaylist));

// Add scene to playlist
router.post("/:id/items", authenticated(addSceneToPlaylist));

// Remove scene from playlist
router.delete("/:id/items/:sceneId", authenticated(removeSceneFromPlaylist));

// Reorder playlist items
router.put("/:id/reorder", authenticated(reorderPlaylist));

// Get sharing info for a playlist
router.get("/:id/shares", authenticated(getPlaylistShares));

// Update playlist sharing
router.put("/:id/shares", authenticated(updatePlaylistShares));

// Duplicate a playlist
router.post("/:id/duplicate", authenticated(duplicatePlaylist));

export default router;
