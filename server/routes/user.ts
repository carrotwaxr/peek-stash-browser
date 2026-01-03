import express from "express";
import {
  changePassword,
  createUser,
  deleteFilterPreset,
  deleteUser,
  deleteUserRestrictions,
  getAllUsers,
  getDefaultFilterPresets,
  getFilterPresets,
  getHiddenEntities,
  getHiddenEntityIds,
  getUserRestrictions,
  getUserSettings,
  hideEntity,
  saveFilterPreset,
  setDefaultFilterPreset,
  syncFromStash,
  unhideAllEntities,
  unhideEntity,
  updateHideConfirmation,
  updateUserRestrictions,
  updateUserRole,
  updateUserSettings,
} from "../controllers/user.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

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

// Hidden entity routes (authenticated users only)
router.post("/hidden-entities", authenticated(hideEntity)); // Hide an entity
router.delete("/hidden-entities/all", authenticated(unhideAllEntities)); // Unhide all entities (optionally filtered by type) - must be before :entityType/:entityId route
router.delete(
  "/hidden-entities/:entityType/:entityId",
  authenticated(unhideEntity)
); // Unhide an entity
router.get("/hidden-entities", authenticated(getHiddenEntities)); // Get all hidden entities (optionally filtered by type)
router.get("/hidden-entities/ids", authenticated(getHiddenEntityIds)); // Get hidden entity IDs organized by type

// Hide confirmation preference
router.put("/hide-confirmation", authenticated(updateHideConfirmation)); // Update hide confirmation preference

export default router;
