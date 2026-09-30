import express from "express";
import {
  findTagTree,
  findTags,
  findTagsMinimal,
  getTagCounts,
} from "../../controllers/library/tags.js";
import {
  authenticate,
  requireCacheReady,
  requirePickerReady,
} from "../../middleware/auth.js";
import { libraryHandler } from "../../utils/routeHelpers.js";

const router = express.Router();

// All tag routes require authentication
router.use(authenticate);

// Find tags with filters
router.post("/tags", requireCacheReady, libraryHandler(findTags));

// Minimal data for filter dropdowns
router.post(
  "/tags/minimal",
  requirePickerReady,
  libraryHandler(findTagsMinimal)
);

// The compact tag tree (hierarchy and folder views), optionally scoped
router.post("/tags/tree", requireCacheReady, libraryHandler(findTagTree));

// The detail page's tab counts, as the viewer sees them
router.get("/tags/:id/counts", requireCacheReady, libraryHandler(getTagCounts));

export default router;
