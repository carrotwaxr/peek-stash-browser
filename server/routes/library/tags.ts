import express from "express";
import {
  findTags,
  findTagsMinimal,
  findTagsForScenes,
  updateTag,
} from "../../controllers/library/tags.js";
import { authenticate, requireCacheReady } from "../../middleware/auth.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

// All tag routes require authentication
router.use(authenticate);

// Find tags with filters
router.post("/tags", requireCacheReady, authenticated(findTags));

// Minimal data for filter dropdowns
router.post("/tags/minimal", requireCacheReady, authenticated(findTagsMinimal));

// Tags filtered by scene criteria (for folder view)
router.post("/tags/for-scenes", requireCacheReady, authenticated(findTagsForScenes));

// Update tag
router.put("/tags/:id", authenticated(updateTag));

export default router;
