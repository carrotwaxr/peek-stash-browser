import express from "express";
import {
  countRecommendedScenes,
  findRecommendedScenes,
  findScenes,
  findScenesMinimal,
  findSimilarScenes,
  getRecommendedScenes,
} from "../../controllers/library/scenes.js";
import {
  authenticate,
  requireCacheReady,
  requirePickerReady,
} from "../../middleware/auth.js";
import { libraryHandler } from "../../utils/routeHelpers.js";

const router = express.Router();

// All scene routes require authentication
router.use(authenticate);

// Find scenes with filters
router.post("/scenes", requireCacheReady, libraryHandler(findScenes));

// Minimal data for the scene picker (a clip filter's scenes)
router.post(
  "/scenes/minimal",
  requirePickerReady,
  libraryHandler(findScenesMinimal)
);

// Find similar scenes
router.get(
  "/scenes/:id/similar",
  requireCacheReady,
  libraryHandler(findSimilarScenes)
);

// Recommended: the scene list request within the user's ranked scenes
router.post(
  "/scenes/recommended",
  requireCacheReady,
  libraryHandler(findRecommendedScenes)
);

// How many scenes that request matches (the filter sheet's "Show N results")
router.post(
  "/scenes/recommended/count",
  requireCacheReady,
  libraryHandler(countRecommendedScenes)
);

// Get recommended scenes: for a tab still on the beta.8 bundle; remove in the
// release after 3.4.0-beta.9
router.get(
  "/scenes/recommended",
  requireCacheReady,
  libraryHandler(getRecommendedScenes)
);

export default router;
