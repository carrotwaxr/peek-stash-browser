import express from "express";
import {
  clearAllWatchHistory,
  getAllWatchHistory,
  getWatchHistory,
  incrementOCounter,
  incrementPlayCount,
  pingWatchHistory,
  saveActivity,
} from "../controllers/watchHistory.js";
import { authenticate } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All watch history routes require authentication
router.use(authenticate);

// Ping watch history (legacy - called every 30 seconds during playback)
router.post("/ping", authenticated(pingWatchHistory));

// Save activity (called by track-activity plugin every 10 seconds)
router.post("/save-activity", authenticated(saveActivity));

// Increment play count (called when minimum play percentage reached)
router.post("/increment-play-count", authenticated(incrementPlayCount));

// Increment O counter
router.post("/increment-o", authenticated(incrementOCounter));

// Get all watch history for current user (Continue Watching carousel)
router.get("/", authenticated(getAllWatchHistory));

// Clear all watch history for current user
router.delete("/", authenticated(clearAllWatchHistory));

// Get watch history for specific scene
router.get("/:sceneId", authenticated(getWatchHistory));

export default router;
