import express from "express";
import {
  addSceneToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  getUserPlaylists,
  removeSceneFromPlaylist,
  reorderPlaylist,
  updatePlaylist,
} from "../controllers/playlist.js";
import { authenticate } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All playlist routes require authentication
router.use(authenticate);

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

export default router;
