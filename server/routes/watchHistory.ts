import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  pingWatchHistory,
  incrementOCounter,
  getWatchHistory,
  getAllWatchHistory,
} from "../controllers/watchHistory.js";

const router = express.Router();

// All watch history routes require authentication
router.use(authenticateToken);

// Ping watch history (called every 30 seconds during playback)
router.post("/ping", pingWatchHistory);

// Increment O counter
router.post("/increment-o", incrementOCounter);

// Get watch history for specific scene
router.get("/:sceneId", getWatchHistory);

// Get all watch history for current user (Continue Watching carousel)
router.get("/", getAllWatchHistory);

export default router;
