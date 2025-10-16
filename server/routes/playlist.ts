import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getUserPlaylists,
  getPlaylist,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addSceneToPlaylist,
  removeSceneFromPlaylist,
  reorderPlaylist,
} from "../controllers/playlist.js";

const router = express.Router();

// All playlist routes require authentication
router.use(authenticateToken);

// Get all user playlists
router.get("/", getUserPlaylists);

// Get single playlist with items
router.get("/:id", getPlaylist);

// Create new playlist
router.post("/", createPlaylist);

// Update playlist
router.put("/:id", updatePlaylist);

// Delete playlist
router.delete("/:id", deletePlaylist);

// Add scene to playlist
router.post("/:id/items", addSceneToPlaylist);

// Remove scene from playlist
router.delete("/:id/items/:sceneId", removeSceneFromPlaylist);

// Reorder playlist items
router.put("/:id/reorder", reorderPlaylist);

export default router;
