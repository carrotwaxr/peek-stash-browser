import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  pingWatchHistory,
  incrementOCounter,
  getWatchHistory,
  getAllWatchHistory,
  clearAllWatchHistory,
} from "../controllers/watchHistory.js";

const router = express.Router();

// All watch history routes require authentication
router.use(authenticateToken);

// Ping watch history (called every 30 seconds during playback)
router.post("/ping", pingWatchHistory);

// Increment O counter
router.post("/o", incrementOCounter);

// Get all watch history for current user (Continue Watching carousel)
router.get("/", getAllWatchHistory);

// Clear all watch history for current user
router.delete("/", clearAllWatchHistory);

// Get watch history for specific scene
router.get("/:sceneId", getWatchHistory);

export default router;
