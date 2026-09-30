import express from "express";
import {
  findGroups,
  findGroupsMinimal,
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

export default router;
