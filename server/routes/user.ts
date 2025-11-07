import express from "express";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import {
  getUserSettings,
  updateUserSettings,
  changePassword,
  getAllUsers,
  createUser,
  deleteUser,
  updateUserRole,
  getFilterPresets,
  saveFilterPreset,
  deleteFilterPreset,
  getDefaultFilterPresets,
  setDefaultFilterPreset,
  syncFromStash,
  getUserRestrictions,
  updateUserRestrictions,
  deleteUserRestrictions,
} from "../controllers/user.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All user routes require authentication
router.use(authenticateToken);

// User settings routes
router.get("/settings", authenticated(getUserSettings));
router.put("/settings", authenticated(updateUserSettings));
router.post("/change-password", authenticated(changePassword));

// Filter preset routes
router.get("/filter-presets", authenticated(getFilterPresets));
router.post("/filter-presets", authenticated(saveFilterPreset));
router.delete(
  "/filter-presets/:artifactType/:presetId",
  authenticated(deleteFilterPreset)
);

// Default filter preset routes
router.get("/default-presets", authenticated(getDefaultFilterPresets));
router.put("/default-preset", authenticated(setDefaultFilterPreset));

// Admin-only user management routes
router.get("/all", requireAdmin, authenticated(getAllUsers));
router.post("/create", requireAdmin, authenticated(createUser));
router.delete("/:userId", requireAdmin, authenticated(deleteUser));
router.put("/:userId/role", requireAdmin, authenticated(updateUserRole));
router.put(
  "/:userId/settings",
  requireAdmin,
  authenticated(updateUserSettings)
); // Admin can update any user's settings
router.post(
  "/:userId/sync-from-stash",
  requireAdmin,
  authenticated(syncFromStash)
); // Admin can sync Stash data for any user

// Admin-only content restriction routes
router.get(
  "/:userId/restrictions",
  requireAdmin,
  authenticated(getUserRestrictions)
); // Get user's content restrictions
router.put(
  "/:userId/restrictions",
  requireAdmin,
  authenticated(updateUserRestrictions)
); // Update user's content restrictions
router.delete(
  "/:userId/restrictions",
  requireAdmin,
  authenticated(deleteUserRestrictions)
); // Delete all user's content restrictions

export default router;
