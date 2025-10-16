import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getUserSettings,
  updateUserSettings,
  changePassword,
  getAllUsers,
  createUser,
  deleteUser,
  updateUserRole
} from "../controllers/user.js";

const router = express.Router();

// All user routes require authentication
router.use(authenticateToken);

// User settings routes
router.get("/settings", getUserSettings);
router.put("/settings", updateUserSettings);
router.post("/change-password", changePassword);

// Admin-only user management routes
router.get("/all", getAllUsers);
router.post("/create", createUser);
router.delete("/:userId", deleteUser);
router.put("/:userId/role", updateUserRole);

export default router;
