import express from "express";
import {
  createCustomTheme,
  deleteCustomTheme,
  duplicateCustomTheme,
  getCustomTheme,
  getUserCustomThemes,
  updateCustomTheme,
} from "../controllers/customTheme.js";
import { authenticate } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All custom theme routes require authentication
router.use(authenticate);

// Get all user custom themes
router.get("/", authenticated(getUserCustomThemes));

// Get single custom theme
router.get("/:id", authenticated(getCustomTheme));

// Create new custom theme
router.post("/", authenticated(createCustomTheme));

// Update custom theme
router.put("/:id", authenticated(updateCustomTheme));

// Delete custom theme
router.delete("/:id", authenticated(deleteCustomTheme));

// Duplicate custom theme
router.post("/:id/duplicate", authenticated(duplicateCustomTheme));

export default router;
