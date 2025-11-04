import express from "express";
import {
  authenticateToken,
  requireCacheReady,
} from "../../middleware/auth.js";
import {
  findGroups,
  findGroupsMinimal,
} from "../../controllers/library/groups.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

// All group routes require authentication
router.use(authenticateToken);

// Find groups with filters
router.post("/groups", requireCacheReady, authenticated(findGroups));

// Minimal data for filter dropdowns
router.post(
  "/groups/minimal",
  requireCacheReady,
  authenticated(findGroupsMinimal)
);

export default router;
