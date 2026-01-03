import express from "express";
import {
  findScenes,
  findSimilarScenes,
  getRecommendedScenes,
  updateScene,
} from "../../controllers/library/scenes.js";
import { authenticate, requireCacheReady } from "../../middleware/auth.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

// All scene routes require authentication
router.use(authenticate);

// Find scenes with filters
router.post("/scenes", requireCacheReady, authenticated(findScenes));

// Find similar scenes
router.get(
  "/scenes/:id/similar",
  requireCacheReady,
  authenticated(findSimilarScenes)
);

// Get recommended scenes
router.get(
  "/scenes/recommended",
  requireCacheReady,
  authenticated(getRecommendedScenes)
);

// Update scene
router.put("/scenes/:id", authenticated(updateScene));

export default router;
