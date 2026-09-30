import express from "express";
import {
  findStudios,
  findStudiosMinimal,
  getStudioCounts,
} from "../../controllers/library/studios.js";
import {
  authenticate,
  requireCacheReady,
  requirePickerReady,
} from "../../middleware/auth.js";
import { libraryHandler } from "../../utils/routeHelpers.js";

const router = express.Router();

// All studio routes require authentication
router.use(authenticate);

// Find studios with filters
router.post("/studios", requireCacheReady, libraryHandler(findStudios));

// Minimal data for filter dropdowns
router.post(
  "/studios/minimal",
  requirePickerReady,
  libraryHandler(findStudiosMinimal)
);

// The detail page's tab counts, as the viewer sees them
router.get(
  "/studios/:id/counts",
  requireCacheReady,
  libraryHandler(getStudioCounts)
);

export default router;
