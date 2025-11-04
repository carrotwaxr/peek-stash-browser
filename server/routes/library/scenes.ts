import express from "express";
import {
  authenticateToken,
  requireCacheReady,
} from "../../middleware/auth.js";
import {
  findScenes,
  findSimilarScenes,
  getRecommendedScenes,
  updateScene,
} from "../../controllers/library/scenes.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

// All scene routes require authentication
router.use(authenticateToken);

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
