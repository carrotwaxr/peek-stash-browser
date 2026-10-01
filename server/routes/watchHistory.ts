import express from "express";
import {
  clearAllWatchHistory,
  decrementOCounter,
  getWatchHistory,
  getWatchedScenes,
  incrementOCounter,
  incrementPlayCount,
  saveActivity,
} from "../controllers/watchHistory.js";
import { authenticate, requireCacheReady } from "../middleware/auth.js";
import { authenticated, libraryHandler } from "../utils/routeHelpers.js";

const router = express.Router();

// All watch history routes require authentication
router.use(authenticate);

// Save activity (called by track-activity plugin every 10 seconds)
router.post("/save-activity", authenticated(saveActivity));

// Increment play count (called when minimum play percentage reached)
router.post("/increment-play-count", authenticated(incrementPlayCount));

// Increment O counter
router.post("/increment-o", authenticated(incrementOCounter));

// Remove the newest O ("Remove last O")
router.post("/decrement-o", authenticated(decrementOCounter));

// Clear all watch history for current user
router.delete("/", authenticated(clearAllWatchHistory));

// The viewer's watched scenes, paged, sorted and filtered in SQL (before
// /:sceneId, which would take "scenes" as an id)
router.get("/scenes", requireCacheReady, libraryHandler(getWatchedScenes));

// Get watch history for specific scene
router.get("/:sceneId", authenticated(getWatchHistory));

export default router;
