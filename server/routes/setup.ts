import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  createFirstAdmin,
  createFirstStashInstance,
  getSetupStatus,
  getStashInstance,
  resetSetup,
  testStashConnection,
} from "../controllers/setup.js";

const router = express.Router();

// Public routes (no auth required - needed for initial setup wizard)
router.get("/status", getSetupStatus);
router.post("/create-admin", createFirstAdmin);
router.post("/test-stash-connection", testStashConnection);
router.post("/create-stash-instance", createFirstStashInstance);
router.post("/reset", resetSetup);

// Protected routes (require authentication)
router.get("/stash-instance", authenticateToken, getStashInstance);

export default router;
