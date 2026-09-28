import express from "express";
import {
  findTagTree,
  findTags,
  findTagsMinimal,
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

// The compact tag tree (hierarchy and folder views), optionally scoped
router.post("/tags/tree", requireCacheReady, authenticated(findTagTree));

export default router;
