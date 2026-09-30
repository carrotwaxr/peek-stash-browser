import express from "express";
import {
  findGroups,
  findGroupsMinimal,
  getGroupCounts,
} from "../../controllers/library/groups.js";
import {
  authenticate,
  requireCacheReady,
  requirePickerReady,
} from "../../middleware/auth.js";
import { libraryHandler } from "../../utils/routeHelpers.js";

const router = express.Router();

// All group routes require authentication
router.use(authenticate);

// Find groups with filters
router.post("/groups", requireCacheReady, libraryHandler(findGroups));

// Minimal data for filter dropdowns
router.post(
  "/groups/minimal",
  requirePickerReady,
  libraryHandler(findGroupsMinimal)
);

// The detail page's tab counts, as the viewer sees them
router.get(
  "/groups/:id/counts",
  requireCacheReady,
  libraryHandler(getGroupCounts)
);

export default router;
