import express from "express";
import { authenticateToken } from "../middleware/auth.js";
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
  syncFromStash,
  getUserRestrictions,
  updateUserRestrictions,
  deleteUserRestrictions
} from "../controllers/user.js";

const router = express.Router();

// All user routes require authentication
router.use(authenticateToken);

// User settings routes
router.get("/settings", getUserSettings);
router.put("/settings", updateUserSettings);
router.post("/change-password", changePassword);

// Filter preset routes
router.get("/filter-presets", getFilterPresets);
router.post("/filter-presets", saveFilterPreset);
router.delete("/filter-presets/:artifactType/:presetId", deleteFilterPreset);

// Admin-only user management routes
router.get("/all", getAllUsers);
router.post("/create", createUser);
router.delete("/:userId", deleteUser);
router.put("/:userId/role", updateUserRole);
router.put("/:userId/settings", updateUserSettings); // Admin can update any user's settings
router.post("/:userId/sync-from-stash", syncFromStash); // Admin can sync Stash data for any user

// Admin-only content restriction routes
router.get("/:userId/restrictions", getUserRestrictions); // Get user's content restrictions
router.put("/:userId/restrictions", updateUserRestrictions); // Update user's content restrictions
router.delete("/:userId/restrictions", deleteUserRestrictions); // Delete all user's content restrictions

export default router;
