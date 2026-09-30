import express from "express";
import {
  findScenes,
  findSimilarScenes,
  getRecommendedScenes,
} from "../../controllers/library/scenes.js";
import { authenticate, requireCacheReady } from "../../middleware/auth.js";
import { libraryHandler } from "../../utils/routeHelpers.js";

const router = express.Router();

// All scene routes require authentication
router.use(authenticate);

// Find scenes with filters
router.post("/scenes", requireCacheReady, libraryHandler(findScenes));

// Find similar scenes
router.get(
  "/scenes/:id/similar",
  requireCacheReady,
  libraryHandler(findSimilarScenes)
);

// Get recommended scenes
router.get(
  "/scenes/recommended",
  requireCacheReady,
  libraryHandler(getRecommendedScenes)
);

export default router;
