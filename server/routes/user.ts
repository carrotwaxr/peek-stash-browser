import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { getUserSettings, updateUserSettings, changePassword } from "../controllers/user.js";

const router = express.Router();

// All user routes require authentication
router.use(authenticateToken);

// Get user settings
router.get("/settings", getUserSettings);

// Update user settings
router.put("/settings", updateUserSettings);

// Change password
router.post("/change-password", changePassword);

export default router;
