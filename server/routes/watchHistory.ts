import express from "express";
import {
  clearAllWatchHistory,
  getAllWatchHistory,
  getWatchHistory,
  incrementOCounter,
  pingWatchHistory,
} from "../controllers/watchHistory.js";
import { authenticateToken } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All watch history routes require authentication
router.use(authenticateToken);

// Ping watch history (called every 30 seconds during playback)
router.post("/ping", authenticated(pingWatchHistory));

// Increment O counter
router.post("/increment-o", authenticated(incrementOCounter));

// Get all watch history for current user (Continue Watching carousel)
router.get("/", authenticated(getAllWatchHistory));

// Clear all watch history for current user
router.delete("/", authenticated(clearAllWatchHistory));

// Get watch history for specific scene
router.get("/:sceneId", authenticated(getWatchHistory));

export default router;
