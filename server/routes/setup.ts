import express from "express";
import {
  createFirstAdmin,
  createFirstStashInstance,
  getSetupStatus,
  getStashInstance,
  resetSetup,
  testStashConnection,
  // Multi-instance management
  getAllStashInstances,
  createStashInstance,
  updateStashInstance,
  deleteStashInstance,
} from "../controllers/setup.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// Public routes (no auth required - needed for initial setup wizard)
router.get("/status", getSetupStatus);
router.post("/create-admin", createFirstAdmin);
router.post("/test-stash-connection", testStashConnection);
router.post("/create-stash-instance", createFirstStashInstance);
router.post("/reset", resetSetup);

// Protected routes (require authentication)
router.get("/stash-instance", authenticate, getStashInstance);

// Multi-instance management (admin only)
router.get("/stash-instances", authenticate, requireAdmin, getAllStashInstances);
router.post("/stash-instance", authenticate, requireAdmin, createStashInstance);
router.put("/stash-instance/:id", authenticate, requireAdmin, updateStashInstance);
router.delete("/stash-instance/:id", authenticate, requireAdmin, deleteStashInstance);

export default router;
