import express from "express";
import {
  adminRegenerateRecoveryKey,
  adminResetPassword,
  changePassword,
  completeSetup,
  createUser,
  deleteFilterPreset,
  deleteUser,
  deleteUserRestrictions,
  getAllUsers,
  getAnyUserPermissions,
  getDefaultFilterPresets,
  getFilterPresets,
  getHiddenEntities,
  getHiddenEntityIds,
  getRecoveryKey,
  getSetupStatus,
  getUserGroupMemberships,
  getUserPermissions,
  getUserRestrictions,
  getUserSettings,
  getUserStashInstances,
  hideEntities,
  hideEntity,
  regenerateRecoveryKey,
  saveFilterPreset,
  setDefaultFilterPreset,
  syncFromStash,
  unhideAllEntities,
  unhideEntity,
  updateHideConfirmation,
  updateUserPermissionOverrides,
  updateUserRestrictions,
  updateUserRole,
  updateUserSettings,
  updateUserStashInstances,
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

// Recovery key routes
router.get("/recovery-key", authenticated(getRecoveryKey));
router.post("/recovery-key/regenerate", authenticated(regenerateRecoveryKey));

// Setup wizard routes
router.get("/setup-status", authenticated(getSetupStatus));
router.post("/complete-setup", authenticated(completeSetup));

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

// User's own permissions
router.get("/permissions", authenticated(getUserPermissions));

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

// Admin: get/update any user's permissions
router.get(
  "/:userId/permissions",
  requireAdmin,
  authenticated(getAnyUserPermissions)
);
router.put(
  "/:userId/permissions",
  requireAdmin,
  authenticated(updateUserPermissionOverrides)
);

// Admin: get user's group memberships
router.get(
  "/:userId/groups",
  requireAdmin,
  authenticated(getUserGroupMemberships)
);

// Admin: reset user password
router.post(
  "/:userId/reset-password",
  requireAdmin,
  authenticated(adminResetPassword)
);

// Admin: regenerate user recovery key
router.post(
  "/:userId/regenerate-recovery-key",
  requireAdmin,
  authenticated(adminRegenerateRecoveryKey)
);

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
router.post("/hidden-entities/bulk", authenticated(hideEntities)); // Hide multiple entities
router.delete("/hidden-entities/all", authenticated(unhideAllEntities)); // Unhide all entities (optionally filtered by type) - must be before :entityType/:entityId route
router.delete(
  "/hidden-entities/:entityType/:entityId",
  authenticated(unhideEntity)
); // Unhide an entity
router.get("/hidden-entities", authenticated(getHiddenEntities)); // Get all hidden entities (optionally filtered by type)
router.get("/hidden-entities/ids", authenticated(getHiddenEntityIds)); // Get hidden entity IDs organized by type

// Hide confirmation preference
router.put("/hide-confirmation", authenticated(updateHideConfirmation)); // Update hide confirmation preference

// Stash instance selection (for multi-instance support)
router.get("/stash-instances", authenticated(getUserStashInstances)); // Get user's selected instances
router.put("/stash-instances", authenticated(updateUserStashInstances)); // Update user's instance selection

export default router;
