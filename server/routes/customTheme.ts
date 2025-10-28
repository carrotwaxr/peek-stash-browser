import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getUserCustomThemes,
  getCustomTheme,
  createCustomTheme,
  updateCustomTheme,
  deleteCustomTheme,
  duplicateCustomTheme,
} from "../controllers/customTheme.js";

const router = express.Router();

// All custom theme routes require authentication
router.use(authenticateToken);

// Get all user custom themes
router.get("/", getUserCustomThemes);

// Get single custom theme
router.get("/:id", getCustomTheme);

// Create new custom theme
router.post("/", createCustomTheme);

// Update custom theme
router.put("/:id", updateCustomTheme);

// Delete custom theme
router.delete("/:id", deleteCustomTheme);

// Duplicate custom theme
router.post("/:id/duplicate", duplicateCustomTheme);

export default router;
