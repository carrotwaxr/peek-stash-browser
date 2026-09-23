import express from "express";
import {
  createFirstAdmin,
  createFirstStashInstance,
  createStashInstance,
  deleteStashInstance,
  // Multi-instance management
  getAllStashInstances,
  getSetupStatus,
  getStashInstance,
  testStashConnection,
  updateStashInstance,
} from "../controllers/setup.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { setupRateLimiter } from "../middleware/rateLimiter.js";
import { requireAdminOnceSetupStarted } from "../middleware/setupGuards.js";

const router = express.Router();

// Setup wizard. Status is public; create-admin is public and rate-limited
// and only works while there are no users. The Stash routes are public only
// while there is no user and no instance, and need the admin session after.
router.get("/status", getSetupStatus);
router.post("/create-admin", setupRateLimiter, createFirstAdmin);
router.post(
  "/test-stash-connection",
  requireAdminOnceSetupStarted,
  testStashConnection
);
router.post(
  "/create-stash-instance",
  requireAdminOnceSetupStarted,
  createFirstStashInstance
);

// Protected routes (require authentication)
router.get("/stash-instance", authenticate, getStashInstance);

// Multi-instance management (admin only)
router.get(
  "/stash-instances",
  authenticate,
  requireAdmin,
  getAllStashInstances
);
router.post("/stash-instance", authenticate, requireAdmin, createStashInstance);
router.put(
  "/stash-instance/:id",
  authenticate,
  requireAdmin,
  updateStashInstance
);
router.delete(
  "/stash-instance/:id",
  authenticate,
  requireAdmin,
  deleteStashInstance
);

export default router;
